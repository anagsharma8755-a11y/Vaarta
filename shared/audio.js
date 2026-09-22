export const AUDIO_SAMPLE_RATE = 16000
export const MAX_AUDIO_SECONDS = 120

// An amplitude gate, not a speech recognizer: reject silence/very quiet input
// before any paid request. NVIDIA transcription provides the next speech check.
export function hasAudibleAudio(samples, sampleRate = AUDIO_SAMPLE_RATE) {
  const frameSize = Math.round(sampleRate * 0.02)
  let audibleSamples = 0
  for (let start = 0; start < samples.length; start += frameSize) {
    const end = Math.min(start + frameSize, samples.length)
    let sum = 0
    for (let i = start; i < end; i++) sum += samples[i] * samples[i]
    if (Math.sqrt(sum / (end - start)) >= 0.005) audibleSamples += end - start
  }
  return audibleSamples >= sampleRate * 0.5
}

export function encodeWav(samples, sampleRate = AUDIO_SAMPLE_RATE) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (offset, text) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
  write(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); write(8, 'WAVE')
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  write(36, 'data'); view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, index) => {
    const clipped = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + index * 2, clipped * (clipped < 0 ? 32768 : 32767), true)
  })
  return buffer
}
