import { AUDIO_SAMPLE_RATE, MAX_AUDIO_SECONDS, hasAudibleAudio } from '../shared/audio.js'
import { RequestError } from './errors.js'

export function readAudio(buffer) {
  const invalid = () => { throw new RequestError('invalid_audio', 'The recording could not be read. Please record your answer again.', 422) }
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') invalid()
  let pcm, format
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const start = offset + 8
    if (start + size > buffer.length) invalid()
    if (id === 'fmt ') {
      if (size < 16) invalid()
      format = { encoding: buffer.readUInt16LE(start), channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4), bits: buffer.readUInt16LE(start + 14) }
    }
    if (id === 'data') { if (pcm) invalid(); pcm = buffer.subarray(start, start + size) }
    offset = start + size + (size % 2)
  }
  if (!pcm || pcm.length % 2 || format?.encoding !== 1 || format.channels !== 1 || format.bits !== 16 || format.sampleRate !== AUDIO_SAMPLE_RATE) invalid()
  const duration = pcm.length / (AUDIO_SAMPLE_RATE * 2)
  if (duration < 0.5 || duration > MAX_AUDIO_SECONDS) invalid()
  const samples = new Float32Array(pcm.length / 2)
  for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768
  if (!hasAudibleAudio(samples)) throw new RequestError('no_speech', 'No audible answer was detected. Please record this answer again.', 422)
  return { pcm, duration }
}
