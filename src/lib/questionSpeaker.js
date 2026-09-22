// Owns playback, fetch cancellation and object URLs. No microphone access here.
export function createQuestionSpeaker({ onStatus, onError }, {
  AudioClass = globalThis.Audio, fetchImpl = globalThis.fetch, urls = globalThis.URL,
} = {}) {
  let audio, objectUrl, controller, generation = 0, disposed = false
  const cache = new Map()
  const publish = (status) => { if (!disposed) onStatus(status) }
  function release() {
    controller?.abort(); controller = null
    if (audio) { audio.onended = audio.onerror = null; audio.pause(); audio.removeAttribute('src'); audio.load(); audio = null }
    if (objectUrl) { urls.revokeObjectURL(objectUrl); objectUrl = null }
  }
  return {
    async play(questionIndex, sessionId) {
      if (disposed) return
      const current = ++generation
      release()
      onError('')
      publish('loading')
      const key = `${sessionId}:${questionIndex}`
      try {
        if (typeof AudioClass !== 'function') throw new Error('Audio playback is unavailable in this browser. You can read the question and record your answer.')
        let blob = cache.get(key)
        if (!blob) {
          controller = new AbortController()
          const response = await fetchImpl(`/api/question-audio?session=${encodeURIComponent(sessionId)}&question=${questionIndex}`, {
            method: 'POST', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(35000)]),
          })
          if (!response.ok) {
            let failure
            try { failure = (await response.json()).error } catch { /* Use safe connection error below. */ }
            throw new Error(['voice_not_configured', 'voice_unavailable', 'session_expired', 'busy'].includes(failure?.code) ? failure.message : 'Interviewer voice is unavailable. Please retry.')
          }
          if (!response.headers.get('content-type')?.includes('audio/mpeg')) throw new Error('The voice service returned unreadable audio. Please retry.')
          blob = await response.blob()
          if (!blob.size) throw new Error('No question audio was returned. Please retry.')
          if (disposed || current !== generation) return
          cache.set(key, blob)
        }
        if (disposed || current !== generation) return
        controller = null
        objectUrl = urls.createObjectURL(blob)
        audio = new AudioClass(objectUrl)
        audio.onended = () => { release(); publish('finished') }
        audio.onerror = () => { release(); onError('Question audio could not play. Please retry.'); publish('error') }
        await audio.play()
        if (!disposed && current === generation && audio) publish('playing')
      } catch (error) {
        if (disposed || current !== generation) return
        release()
        onError(error.name === 'NotAllowedError' ? 'Press Play question to allow interviewer audio in this browser.' : error.message || 'Interviewer voice failed. Please retry.')
        publish('error')
      }
    },
    stop() { generation++; release(); publish('stopped') },
    dispose() { disposed = true; generation++; release(); cache.clear() },
  }
}
