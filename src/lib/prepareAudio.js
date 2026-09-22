import { AUDIO_SAMPLE_RATE, MAX_AUDIO_SECONDS, encodeWav, hasAudibleAudio } from '../../shared/audio.js'

// Transcode the actual MediaRecorder output to NVIDIA's documented PCM format.
// No extension-only relabeling, and no FFmpeg/browser-specific encoding package.
export async function prepareAudio(blob, signal) {
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext
  const OfflineContext = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext
  if (!Context || !OfflineContext) throw new Error('This browser cannot prepare recorded audio. Please use a current browser with Web Audio support.')
  const context = new Context()
  const close = () => { if (context.state !== 'closed') context.close().catch(() => {}) }
  signal?.addEventListener('abort', close, { once: true })
  try {
    signal?.throwIfAborted()
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    signal?.throwIfAborted()
    if (decoded.duration < 0.5) throw new Error('That recording was too short. Please speak your answer and try again.')
    if (decoded.duration > MAX_AUDIO_SECONDS + 2) throw new Error('The recording exceeded two minutes. Please record a shorter answer.')
    const offline = new OfflineContext(1, Math.min(Math.ceil(decoded.duration * AUDIO_SAMPLE_RATE), MAX_AUDIO_SECONDS * AUDIO_SAMPLE_RATE), AUDIO_SAMPLE_RATE)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    signal?.throwIfAborted()
    const samples = rendered.getChannelData(0)
    if (!hasAudibleAudio(samples)) throw new Error('No audible answer was detected. Check your microphone and speak before finishing your answer.')
    return new Blob([encodeWav(samples)], { type: 'audio/wav' })
  } finally {
    signal?.removeEventListener('abort', close)
    close()
  }
}
