export const MAX_RECORDING_SECONDS = 120

export function microphoneError(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return 'Microphone permission was denied. Allow microphone access in your browser settings, then try again.'
  }
  if (error?.name === 'NotFoundError') return 'No microphone was found. Connect a microphone and try again.'
  if (error?.name === 'NotReadableError') return 'Your microphone could not be read. Close other apps using it and try again.'
  return 'Recording failed. Check your microphone and try recording this answer again.'
}

// Owns browser resources independently of React renders. dispose() also invalidates
// permission requests that resolve after navigation or cancellation.
export function createAudioRecorder({ onStatus, onSeconds, onComplete, onError }, {
  mediaDevices = globalThis.navigator?.mediaDevices,
  Recorder = globalThis.MediaRecorder,
  maxSeconds = MAX_RECORDING_SECONDS,
} = {}) {
  let status = 'idle'
  let generation = 0
  let disposed = false
  let stream = null
  let recorder = null
  let chunks = []
  let interval, deadline, stopDeadline
  const publish = (next) => { status = next; if (!disposed) onStatus(next) }
  function cleanup() {
    clearInterval(interval)
    clearTimeout(deadline)
    clearTimeout(stopDeadline)
    if (recorder) {
      recorder.ondataavailable = recorder.onstop = recorder.onerror = null
      if (recorder.state !== 'inactive') {
        try { recorder.stop() } catch { /* Tracks are still released below. */ }
      }
    }
    stream?.getTracks().forEach((track) => { track.onended = null; track.stop() })
    recorder = stream = null
    chunks = []
  }
  function fail(message) {
    cleanup()
    publish('idle')
    if (!disposed) onError(message)
  }
  function stop() {
    if (disposed || status !== 'recording') return
    publish('stopping')
    clearInterval(interval)
    clearTimeout(deadline)
    stopDeadline = setTimeout(() => fail('The recording could not be saved. Please record this answer again.'), 5000)
    try { recorder.stop() } catch { fail('The recording could not be stopped. Please try again.') }
  }
  return {
    async start() {
      if (disposed || status !== 'idle') return
      if (!mediaDevices?.getUserMedia || typeof Recorder !== 'function') {
        onError('Audio recording is unavailable in this browser. Use a browser with microphone recording support on HTTPS or localhost.')
        return
      }
      const request = ++generation
      publish('requesting')
      try {
        const acquired = await mediaDevices.getUserMedia({ audio: true })
        if (disposed || request !== generation) {
          acquired.getTracks().forEach((track) => track.stop())
          return
        }
        stream = acquired
        const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm']
          .find((type) => Recorder.isTypeSupported?.(type))
        recorder = mimeType ? new Recorder(stream, { mimeType }) : new Recorder(stream)
        chunks = []
        recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
        recorder.onerror = () => fail('Recording was interrupted. Please record this answer again.')
        stream.getTracks().forEach((track) => {
          track.onended = () => fail('Your microphone disconnected. Reconnect it and record this answer again.')
        })
        recorder.onstop = () => {
          if (status !== 'stopping') { fail('Recording stopped unexpectedly. Please record this answer again.'); return }
          const actualType = recorder.mimeType || chunks.find((chunk) => chunk.type)?.type || ''
          const blob = new Blob(chunks, { type: actualType })
          cleanup()
          publish('idle')
          if (!blob.size) { onError('No audio was captured. Please record this answer again.'); return }
          onComplete(blob)
        }
        recorder.start(1000)
        publish('recording')
        onSeconds(0)
        const startedAt = Date.now()
        interval = setInterval(() => onSeconds(Math.min(maxSeconds, Math.floor((Date.now() - startedAt) / 1000))), 1000)
        deadline = setTimeout(stop, maxSeconds * 1000)
      } catch (error) {
        if (!disposed && request === generation) fail(microphoneError(error))
      }
    },
    stop,
    cancel() { generation++; cleanup(); publish('idle') },
    dispose() { disposed = true; generation++; cleanup() },
  }
}
