import test from 'node:test'
import assert from 'node:assert/strict'
import { createAudioRecorder } from '../src/lib/audioRecorder.js'

function harness(t, overrides = {}) {
  const statuses = [], errors = [], completed = []
  const track = { stopped: false, stop() { this.stopped = true } }
  const stream = { getTracks: () => [track] }
  const instances = []
  class Recorder {
    static isTypeSupported(type) { return type === 'audio/mp4' }
    constructor(acquired, options) { this.stream = acquired; this.mimeType = options?.mimeType || 'audio/ogg'; this.state = 'inactive'; instances.push(this) }
    start() { this.state = 'recording' }
    stop() {
      this.state = 'inactive'
      queueMicrotask(() => {
        this.ondataavailable?.({ data: new Blob(['recorded bytes'], { type: this.mimeType }) })
        this.onstop?.()
      })
    }
  }
  const controller = createAudioRecorder({ onStatus: (s) => statuses.push(s), onSeconds() {},
    onError: (e) => errors.push(e), onComplete: (b) => completed.push(b) },
  { mediaDevices: { getUserMedia: async () => stream }, Recorder, ...overrides })
  t.after(() => controller.dispose())
  return { controller, track, stream, instances, statuses, errors, completed }
}
const flush = () => new Promise((resolve) => setImmediate(resolve))

test('blocks duplicate starts while permission is pending and releases late streams after disposal', async (t) => {
  let grant, requests = 0
  const h = harness(t, { mediaDevices: { getUserMedia: () => { requests++; return new Promise((r) => { grant = r }) } } })
  const pending = h.controller.start()
  await h.controller.start()
  assert.equal(requests, 1)
  h.controller.dispose()
  grant(h.stream)
  await pending
  assert.equal(h.track.stopped, true)
  assert.equal(h.instances.length, 0)
  assert.deepEqual(h.statuses, ['requesting'])
})

test('finishes once, keeps actual MP4 MIME and stops every track', async (t) => {
  const h = harness(t)
  const secondTrack = { stopped: false, stop() { this.stopped = true } }
  h.stream.getTracks = () => [h.track, secondTrack]
  await h.controller.start()
  await h.controller.start()
  assert.equal(h.instances.length, 1)
  h.controller.stop()
  h.controller.stop()
  await flush()
  assert.equal(h.completed.length, 1)
  assert.equal(h.completed[0].type, 'audio/mp4')
  assert.equal(h.track.stopped, true)
  assert.equal(secondTrack.stopped, true)
  assert.deepEqual(h.statuses, ['requesting', 'recording', 'stopping', 'idle'])
})

test('unmount stops recording and suppresses completion callbacks', async (t) => {
  const h = harness(t)
  await h.controller.start()
  h.controller.dispose()
  await flush()
  assert.equal(h.track.stopped, true)
  assert.equal(h.instances[0].state, 'inactive')
  assert.equal(h.instances[0].onstop, null)
  assert.equal(h.completed.length, 0)
})

test('permission denial and unsupported browsers produce actionable errors', async (t) => {
  const h = harness(t, { mediaDevices: { getUserMedia: async () => { throw new DOMException('Denied', 'NotAllowedError') } } })
  await h.controller.start()
  assert.match(h.errors[0], /permission was denied/)
  assert.equal(h.statuses.at(-1), 'idle')
  const unsupported = harness(t, { Recorder: null })
  await unsupported.controller.start()
  assert.match(unsupported.errors[0], /unavailable in this browser/)
})

test('maximum recording duration automatically finishes the answer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const h = harness(t, { maxSeconds: 2 })
  await h.controller.start()
  t.mock.timers.tick(2000)
  await flush()
  assert.equal(h.completed.length, 1)
  assert.equal(h.track.stopped, true)
})

test('microphone disconnection fails without completing a question', async (t) => {
  const h = harness(t)
  await h.controller.start()
  h.track.onended()
  await flush()
  assert.equal(h.completed.length, 0)
  assert.match(h.errors[0], /disconnected/)
  assert.equal(h.track.stopped, true)
})

test('cancelled permission requests cannot replace a newer recording', async (t) => {
  const grants = []
  const h = harness(t, { mediaDevices: { getUserMedia: () => new Promise((resolve) => grants.push(resolve)) } })
  const first = h.controller.start()
  h.controller.cancel()
  const second = h.controller.start()
  grants[1](h.stream)
  await second
  const lateTrack = { stopped: false, stop() { this.stopped = true } }
  grants[0]({ getTracks: () => [lateTrack] })
  await first
  assert.equal(lateTrack.stopped, true)
  assert.equal(h.track.stopped, false)
  assert.equal(h.instances.length, 1)
})

test('empty recording does not complete a question', async (t) => {
  const h = harness(t)
  await h.controller.start()
  h.instances[0].stop = function () { this.state = 'inactive'; queueMicrotask(() => this.onstop?.()) }
  h.controller.stop()
  await flush()
  assert.equal(h.completed.length, 0)
  assert.match(h.errors[0], /No audio/)
})

test('recorder construction failure releases the acquired stream', async (t) => {
  class BrokenRecorder { constructor() { throw new Error('unsupported encoding') } }
  const h = harness(t, { Recorder: BrokenRecorder })
  await h.controller.start()
  assert.equal(h.track.stopped, true)
  assert.equal(h.completed.length, 0)
  assert.match(h.errors[0], /Recording failed/)
})

test('missing stop event times out and releases resources without advancing', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const h = harness(t)
  await h.controller.start()
  h.instances[0].stop = function () { this.state = 'inactive' }
  h.controller.stop()
  t.mock.timers.tick(5000)
  assert.equal(h.track.stopped, true)
  assert.equal(h.completed.length, 0)
  assert.match(h.errors[0], /could not be saved/)
})

test('falls back to the actual chunk MIME when recorder metadata is empty', async (t) => {
  const h = harness(t)
  await h.controller.start()
  h.instances[0].mimeType = ''
  h.instances[0].stop = function () {
    this.state = 'inactive'
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/ogg' }) })
      this.onstop?.()
    })
  }
  h.controller.stop()
  await flush()
  assert.equal(h.completed[0].type, 'audio/ogg')
})
