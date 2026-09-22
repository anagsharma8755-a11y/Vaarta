import { RequestError } from './errors.js'

export async function speakQuestion(text, { speechKey, voiceId = 'JBFqnCBsd6RMkjVDRZzb', signal, fetchImpl = fetch }) {
  if (!speechKey) throw new RequestError('voice_not_configured', 'Interviewer voice is not configured. Add the ElevenLabs key on the server, then retry.', 503)
  const timeout = AbortSignal.timeout(30000)
  try {
    const response = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: 'POST', signal: AbortSignal.any([timeout, ...(signal ? [signal] : [])]),
      headers: { 'xi-api-key': speechKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
    })
    if (!response.ok) {
      let code
      try { code = (await response.json()).detail?.status } catch { /* Do not expose provider response bodies. */ }
      if (code === 'api_key_id_used_as_api_key') throw new RequestError('voice_unavailable', 'The ElevenLabs key ID was entered instead of the secret API key. Update the server key and retry.')
      if (code === 'quota_exceeded') throw new RequestError('voice_unavailable', 'The ElevenLabs voice quota is exhausted. Check your account credits and retry.')
      throw new RequestError('voice_unavailable',
      [401, 403].includes(response.status) ? 'ElevenLabs rejected the key or voice access. Check server configuration and retry.'
        : response.status === 429 ? 'ElevenLabs is busy or the voice quota is exhausted. Please retry later.' : 'ElevenLabs could not generate the question. Please retry.', 502)
    }
    if (!response.headers.get('content-type')?.includes('audio/mpeg')) throw new RequestError('voice_unavailable', 'The voice service returned an invalid audio response. Please retry.')
    const audio = Buffer.from(await response.arrayBuffer())
    if (!audio.length || audio.length > 2 * 1024 * 1024) throw new RequestError('voice_unavailable', 'The voice response was empty or too large. Please retry.')
    return audio
  } catch (error) {
    if (error instanceof RequestError) throw error
    throw new RequestError('voice_unavailable', timeout.aborted ? 'Interviewer voice took too long. Please retry.' : 'Interviewer voice was interrupted or could not connect. Please retry.')
  }
}
