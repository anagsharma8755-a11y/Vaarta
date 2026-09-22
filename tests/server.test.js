import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createAnalysisServer } from '../server/app.js'
import { encodeWav } from '../shared/audio.js'
import { readAudio } from '../server/audio.js'
import { generateFeedback, generateInterviewFeedback, generateQuestions } from '../server/nvidia.js'
import { RequestError } from '../server/errors.js'

const tone = () => Float32Array.from({ length: 16000 }, (_, i) => Math.sin(i / 10) * 0.1)
const coaching = { contentScore: 30, whatWentWell: 'A project was mentioned.', improveNext: 'Explain your contribution.', contextNotes: [] }

async function withServer(t, overrides = {}) {
  const server = createAnalysisServer({ getConfig: () => ({ apiKey: 'test-only', model: 'test' }),
    transcribe: async () => 'I built an application.', generate: async () => coaching,
    generateQuestionSet: async ({ language }) => [0, 1, 2].map((index) => ({ [language]: language === 'hi' ? `सवाल ${index}?` : `Question ${index}?` })), ...overrides })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  return `http://127.0.0.1:${server.address().port}`
}
function upload(samples = tone()) {
  const body = new FormData()
  body.append('audio', new Blob([encodeWav(samples)], { type: 'audio/wav' }), 'answer.wav')
  body.append('question', 'Tell me about your project.')
  body.append('language', 'en')
  return { method: 'POST', body }
}
function interviewUpload() {
  const body = new FormData()
  for (let index = 0; index < 3; index++) {
    body.append('audio', new Blob([encodeWav(tone())], { type: 'audio/wav' }), `answer-${index}.wav`)
    body.append('question', `Question ${index + 1}?`)
  }
  body.append('language', 'en')
  return { method: 'POST', body }
}

test('silent, truncated and incorrectly formatted audio cannot be analyzed', () => {
  assert.throws(() => readAudio(Buffer.from(encodeWav(new Float32Array(16000)))), { code: 'no_speech' })
  assert.throws(() => readAudio(Buffer.from('not audio')), { code: 'invalid_audio' })
  assert.throws(() => readAudio(Buffer.from(encodeWav(tone(), 48000))), { code: 'invalid_audio' })
  assert.equal(readAudio(Buffer.from(encodeWav(tone()))).duration, 1)
})

test('server rejects silence before calling NVIDIA; valid response uses measured duration and null delivery', async (t) => {
  let calls = 0
  const base = await withServer(t, { transcribe: async () => { calls++; return 'I built an application.' } })
  const silent = await fetch(`${base}/api/analyze`, upload(new Float32Array(16000)))
  assert.equal(silent.status, 422)
  assert.equal((await silent.json()).error.code, 'no_speech')
  assert.equal(calls, 0)
  const valid = await fetch(`${base}/api/analyze`, upload())
  assert.equal(valid.status, 200)
  const result = await valid.json()
  assert.equal(calls, 1)
  assert.equal(result.provider, 'nvidia')
  assert.equal(result.transcript, 'I built an application.')
  assert.equal(result.averageAnswerLength, '0:01')
  for (const key of ['deliveryScore', 'fillerWords', 'longPauses', 'speakingPace']) assert.equal(result[key], null)
})

test('missing credentials, foreign origins and provider errors never return feedback', async (t) => {
  const absent = await withServer(t, { getConfig: () => ({ apiKey: '' }) })
  assert.equal((await (await fetch(`${absent}/api/status`)).json()).ready, false)
  assert.equal((await fetch(`${absent}/api/analyze`, upload())).status, 503)
  const base = await withServer(t, { transcribe: async () => { throw new RequestError('provider_auth', 'Access denied.') } })
  assert.equal((await fetch(`${base}/api/analyze`, { ...upload(), headers: { Origin: 'https://untrusted.example' } })).status, 403)
  const failure = await fetch(`${base}/api/analyze`, upload())
  assert.equal(failure.status, 502)
  assert.deepEqual(await failure.json(), { error: { code: 'provider_auth', message: 'Access denied.' } })
})

test('NVIDIA response validation rejects invented quotes, truncated output and no-answer output', async () => {
  const run = (value, finish_reason = 'stop') => generateFeedback('I built an application.', 'Question?', {
    apiKey: 'test-only', fetchImpl: async () => Response.json({ choices: [{ finish_reason, message: { content: JSON.stringify(value) } }] }),
  })
  assert.deepEqual(await run({ hasAnswer: true, ...coaching }), coaching)
  await assert.rejects(run({ hasAnswer: true, ...coaching, contextNotes: [{ phrase: 'invented phrase', note: 'A note' }] }), { code: 'invalid_response' })
  await assert.rejects(run({ hasAnswer: true, ...coaching }, 'length'), { code: 'invalid_response' })
  await assert.rejects(run({ hasAnswer: false }), { code: 'no_speech' })
})

test('interview analysis transcribes three answers concurrently and generates feedback once', async (t) => {
  let active = 0
  let peak = 0
  let batchCalls = 0
  const transcriptionLanguages = []
  const base = await withServer(t, {
    transcribe: async (_pcm, options) => {
      transcriptionLanguages.push(options.language)
      active++; peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active--
      return 'I built an application.'
    },
    generateBatch: async (answers) => { batchCalls++; assert.equal(answers.length, 3); return answers.map(() => coaching) },
  })
  const response = await fetch(`${base}/api/analyze-interview`, interviewUpload())
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.results.length, 3)
  assert.equal(peak, 3)
  assert.equal(batchCalls, 1)
  assert.deepEqual(transcriptionLanguages, ['en', 'en', 'en'])
  assert.ok(payload.results.every((result) => result.transcript === 'I built an application.'))
})

test('batch feedback validates order and transcript-grounded notes', async () => {
  const answers = [0, 1, 2].map((index) => ({ question: `Question ${index}?`, transcript: `Answer ${index} evidence.` }))
  const values = answers.map((answer, index) => ({ index, hasAnswer: true, ...coaching,
    contextNotes: [{ phrase: answer.transcript, note: 'Specific evidence.' }] }))
  const result = await generateInterviewFeedback(answers, { apiKey: 'test-only',
    fetchImpl: async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ answers: values }) } }] }) })
  assert.equal(result.length, 3)
  await assert.rejects(generateInterviewFeedback(answers, { apiKey: 'test-only',
    fetchImpl: async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ answers: values.slice(0, 2) }) } }] }) }),
  { code: 'invalid_response' })
})

test('generated question output requires three distinct questions in the selected language', async () => {
  const questions = [0, 1, 2].map((index) => `English question ${index}?`)
  const run = (value) => generateQuestions({ type: 'Technical', difficulty: 'Advanced', language: 'en' }, { apiKey: 'test-only',
    fetchImpl: async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] }) })
  assert.deepEqual(await run({ questions }), questions.map((en) => ({ en })))
  await assert.rejects(run({ questions: [questions[0], questions[0], questions[2]] }), { code: 'invalid_response' })
  await assert.rejects(run({ questions: questions.slice(0, 2) }), { code: 'invalid_response' })
})

test('unrecognized speech does not run feedback generation', async (t) => {
  let generated = false
  const base = await withServer(t, {
    transcribe: async () => { throw new RequestError('no_speech', 'Record again.', 422) },
    generate: async () => { generated = true; return coaching },
  })
  const response = await fetch(`${base}/api/analyze`, upload())
  assert.equal(response.status, 422)
  assert.equal(generated, false)
})

test('voice endpoint uses generated session questions and rejects arbitrary text', async (t) => {
  const spoken = []
  const base = await withServer(t, { speak: async (text) => { spoken.push(text); return Buffer.from('audio') } })
  const generated = await fetch(`${base}/api/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'Technical', difficulty: 'Advanced', language: 'hi' }) })
  const session = await generated.json()
  const r = await fetch(`${base}/api/question-audio?session=${session.sessionId}&question=1`, { method: 'POST' })
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('content-type'), 'audio/mpeg')
  assert.equal(spoken[0], 'सवाल 1?')
  for (const query of [`session=${session.sessionId}&question=3`, `session=${session.sessionId}&question=0&text=arbitrary`]) {
    assert.equal((await fetch(`${base}/api/question-audio?${query}`, { method: 'POST' })).status, 400)
  }
  assert.equal((await fetch(`${base}/api/question-audio?session=missing&question=0`, { method: 'POST' })).status, 410)
  assert.equal(spoken.length, 1)
})

test('question sessions use setup inputs and regenerate on every request', async (t) => {
  const received = []
  let generation = 0
  const base = await withServer(t, { generateQuestionSet: async (setup) => {
    received.push(setup); generation++
    return [0, 1, 2].map((index) => ({ [setup.language]: `Session ${generation} question ${index}` }))
  } })
  const setup = { type: 'Behavioral', difficulty: 'Intermediate', language: 'en' }
  const create = () => fetch(`${base}/api/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(setup) })
  const first = await (await create()).json()
  const second = await (await create()).json()
  assert.notEqual(first.sessionId, second.sessionId)
  assert.notDeepEqual(first.questions, second.questions)
  assert.deepEqual(received, [setup, setup])
  assert.equal((await fetch(`${base}/api/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...setup, language: 'fr' }) })).status, 400)
})
