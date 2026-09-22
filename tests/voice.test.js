import test from 'node:test'
import assert from 'node:assert/strict'
import { speakQuestion } from '../server/elevenlabs.js'
import { createQuestionSpeaker } from '../src/lib/questionSpeaker.js'

test('ElevenLabs requests actual question speech and rejects missing keys and non-audio responses', async () => {
  await assert.rejects(speakQuestion('Question?', {}), { code: 'voice_not_configured' })
  const audio = await speakQuestion('Question?', { speechKey: 'test-only', fetchImpl: async (url, options) => {
    assert.match(url, /text-to-speech\/JBFqnCBsd6RMkjVDRZzb/)
    assert.equal(options.headers['xi-api-key'], 'test-only')
    assert.deepEqual(JSON.parse(options.body), { text: 'Question?', model_id: 'eleven_multilingual_v2' })
    return new Response('audio', { headers: { 'Content-Type': 'audio/mpeg' } })
  } })
  assert.equal(audio.toString(), 'audio')
  await assert.rejects(speakQuestion('Question?', { speechKey: 'test-only', fetchImpl: async () => Response.json({}) }), { code: 'voice_unavailable' })
})

function harness(fetchImpl) {
  const events = [], errors = [], instances = [], revoked = []
  class Audio {
    constructor() { instances.push(this) }
    async play() {}
    pause() { this.paused = true }
    removeAttribute() {}
    load() {}
  }
  const speaker = createQuestionSpeaker({ onStatus: (v) => events.push(v), onError: (v) => errors.push(v) }, {
    AudioClass: Audio, fetchImpl,
    urls: { createObjectURL: () => 'blob:test', revokeObjectURL: (v) => revoked.push(v) },
  })
  return { speaker, events, errors, instances, revoked }
}

test('question replay reuses audio and stop/unmount release playback URLs', async () => {
  let calls = 0
  const h = harness(async (url) => { calls++; assert.equal(url, '/api/question-audio?session=session-1&question=0'); return new Response('audio', { headers: { 'Content-Type': 'audio/mpeg' } }) })
  await h.speaker.play(0, 'session-1')
  assert.equal(h.events.at(-1), 'playing')
  h.instances[0].onended()
  assert.equal(h.events.at(-1), 'finished')
  await h.speaker.play(0, 'session-1')
  assert.equal(calls, 1)
  h.speaker.stop()
  assert.equal(h.instances[1].paused, true)
  assert.equal(h.revoked.length, 2)
  h.speaker.dispose()
  await h.speaker.play(1, 'session-1')
  assert.equal(calls, 1)
})

test('cancelled voice requests cannot play after page exit', async () => {
  let resolve
  const h = harness(() => new Promise((done) => { resolve = done }))
  const pending = h.speaker.play(0, 'session-1')
  h.speaker.dispose()
  resolve(new Response('audio', { headers: { 'Content-Type': 'audio/mpeg' } }))
  await pending
  assert.equal(h.instances.length, 0)
})
