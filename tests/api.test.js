import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeAnswer, generateQuestionSession, validateFeedback, audioFilename } from '../src/api/client.js'
import { mockFeedback } from './fixtures/feedback.js'

test('accepts documented feedback; rejects malformed scores and nested data', () => {
  assert.equal(validateFeedback(mockFeedback), mockFeedback)
  for (const value of [null, {}, { ...mockFeedback, contentScore: 101 }, { ...mockFeedback, deliveryScore: NaN },
    { ...mockFeedback, fillerWords: 'um' }, { ...mockFeedback, longPauses: -1 },
    { ...mockFeedback, contextNotes: [null] }, { ...mockFeedback, transcript: null }]) {
    assert.throws(() => validateFeedback(value), { code: 'invalid_response' })
  }
})

test('preserves actual upload type and sends the selected transcription language', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/analyze')
    assert.equal(options.method, 'POST')
    assert.deepEqual([...options.body.keys()], ['audio', 'question', 'language'])
    assert.equal(options.body.get('audio').name, 'answer.m4a')
    assert.equal(options.body.get('audio').type, 'audio/mp4')
    assert.equal(options.body.get('question'), 'Question?')
    assert.equal(options.body.get('language'), 'mr')
    return Response.json(mockFeedback)
  })
  assert.deepEqual(await analyzeAnswer(new Blob(['audio'], { type: 'audio/mp4' }), 'Question?', { language: 'mr' }), mockFeedback)
  assert.equal(audioFilename('audio/webm;codecs=opus'), 'answer.webm')
  assert.equal(audioFilename('audio/ogg'), 'answer.ogg')
  assert.equal(audioFilename(''), 'answer.bin')
})

test('classifies HTTP, malformed JSON, invalid schema and network errors', async (t) => {
  const audio = new Blob(['audio'])
  for (const [response, code] of [[() => new Response('', { status: 503 }), 'http'],
    [() => new Response('not json'), 'invalid_response'], [() => Response.json({}), 'invalid_response'],
    [() => { throw new TypeError('offline') }, 'network']]) {
    const stub = t.mock.method(globalThis, 'fetch', async () => response())
    await assert.rejects(analyzeAnswer(audio, 'Question?'), { code })
    stub.mock.restore()
  }
})

test('rejects empty audio without a request', async (t) => {
  const stub = t.mock.method(globalThis, 'fetch', () => assert.fail('unexpected request'))
  await assert.rejects(analyzeAnswer(new Blob(), 'Question?'), { code: 'invalid_request' })
  assert.equal(stub.mock.callCount(), 0)
})

test('handles pre-cancellation, active cancellation and timeout', async (t) => {
  const audio = new Blob(['audio'])
  const stub = t.mock.method(globalThis, 'fetch', async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  }))
  const cancelled = new AbortController()
  cancelled.abort()
  await assert.rejects(analyzeAnswer(audio, 'Question?', { signal: cancelled.signal }), { code: 'cancelled' })
  assert.equal(stub.mock.callCount(), 0)
  const active = new AbortController()
  const pending = analyzeAnswer(audio, 'Question?', { signal: active.signal })
  active.abort()
  await assert.rejects(pending, { code: 'cancelled' })
  await assert.rejects(analyzeAnswer(audio, 'Question?', { timeoutMs: 5 }), { code: 'timeout' })
})

test('question session generation sends only normalized setup and validates selected-language output', async (t) => {
  const setup = { type: 'Technical', difficulty: 'Advanced', language: 'hi' }
  const questions = [0, 1, 2].map((index) => ({ hi: `सवाल ${index}?` }))
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/questions')
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), setup)
    return Response.json({ sessionId: 'session-1', questions })
  })
  assert.deepEqual(await generateQuestionSession(setup), { sessionId: 'session-1', questions })
})
