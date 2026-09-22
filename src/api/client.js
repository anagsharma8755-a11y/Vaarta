import { isFeedback } from '../../shared/feedback.js'

// The endpoint accepts one audio answer and its question.
export class AnalysisError extends Error {
  constructor(code, message, status) {
    super(message)
    this.name = 'AnalysisError'
    this.code = code
    this.status = status
  }
}

// Unavailable measurements must be explicit nulls, never synthetic values.
export function validateFeedback(value) {
  if (!isFeedback(value)) {
    throw new AnalysisError('invalid_response', 'The analysis response was incomplete or invalid. Please retry.')
  }
  return value
}

export function audioFilename(mimeType) {
  const extensions = { 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/mpeg': 'mp3' }
  return `answer.${extensions[mimeType.split(';')[0].trim().toLowerCase()] ?? 'bin'}`
}

export async function generateQuestionSession(setup, { signal, timeoutMs = 60000 } = {}) {
  const controller = new AbortController()
  let timedOut = false
  const cancel = () => controller.abort()
  if (signal?.aborted) cancel()
  signal?.addEventListener('abort', cancel, { once: true })
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  try {
    const response = await fetch('/api/questions', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(setup),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const failure = payload?.error
      throw new AnalysisError(typeof failure?.code === 'string' ? failure.code : 'http',
        typeof failure?.message === 'string' ? failure.message : 'Questions could not be generated. Please retry.', response.status)
    }
    if (typeof payload?.sessionId !== 'string' || !payload.sessionId || !Array.isArray(payload.questions) || payload.questions.length !== 3 ||
      !payload.questions.every((question) => question && typeof question[setup.language] === 'string' && question[setup.language].trim())) {
      throw new AnalysisError('invalid_response', 'Question generation returned an incomplete response. Please retry.')
    }
    return payload
  } catch (error) {
    if (controller.signal.aborted) throw new AnalysisError(timedOut ? 'timeout' : 'cancelled', timedOut
      ? 'Question generation took too long. Please retry.' : 'Question generation was cancelled.')
    if (error instanceof AnalysisError) throw error
    throw new AnalysisError('network', 'Unable to reach question generation. Check your connection and retry.')
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
  }
}

export async function analyzeAnswer(audioBlob, question, { language = 'en', signal, timeoutMs = 120000 } = {}) {
  if (!(audioBlob instanceof Blob) || audioBlob.size === 0 || typeof question !== 'string' || !question.trim()) {
    throw new AnalysisError('invalid_request', 'Record an answer before requesting analysis.')
  }
  const controller = new AbortController()
  let timedOut = false
  const cancel = () => controller.abort()
  if (signal?.aborted) cancel()
  signal?.addEventListener('abort', cancel, { once: true })
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  try {
    if (controller.signal.aborted) throw new AnalysisError('cancelled', 'Analysis cancelled. You can retry your recorded answers.')
    const body = new FormData()
    body.append('audio', audioBlob, audioFilename(audioBlob.type))
    body.append('question', question)
    body.append('language', language)
    const response = await fetch('/api/analyze', { method: 'POST', body, signal: controller.signal })
    if (!response.ok) {
      let failure
      try { failure = (await response.json()).error } catch { /* Non-JSON proxy failures use the safe default below. */ }
      const knownCodes = ['no_speech', 'invalid_audio', 'not_configured', 'provider_auth', 'rate_limited', 'busy', 'timeout', 'transcription_failed', 'provider_unavailable', 'invalid_response', 'too_large', 'invalid_request']
      throw new AnalysisError(knownCodes.includes(failure?.code) ? failure.code : 'http',
        knownCodes.includes(failure?.code) && typeof failure.message === 'string' ? failure.message : 'Analysis could not be completed. Please retry.', response.status)
    }
    let feedback
    try { feedback = await response.json() } catch {
      throw new AnalysisError('invalid_response', 'The analysis service returned an unreadable response. Please retry.')
    }
    return validateFeedback(feedback)
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AnalysisError(timedOut ? 'timeout' : 'cancelled', timedOut
        ? 'Analysis took too long. Check your connection and retry.'
        : 'Analysis cancelled. You can retry your recorded answers.')
    }
    if (error instanceof AnalysisError) throw error
    throw new AnalysisError('network', 'Unable to reach the analysis service. Check your connection and retry.')
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
  }
}

export async function analyzeInterview(answers, { language = 'en', signal, timeoutMs = 120000 } = {}) {
  if (!Array.isArray(answers) || answers.length !== 3 ||
      !answers.every(({ blob, question }) => blob instanceof Blob && blob.size > 0 && typeof question === 'string' && question.trim())) {
    throw new AnalysisError('invalid_request', 'Record all three answers before requesting analysis.')
  }
  const controller = new AbortController()
  let timedOut = false
  const cancel = () => controller.abort()
  if (signal?.aborted) cancel()
  signal?.addEventListener('abort', cancel, { once: true })
  const timeout = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  try {
    if (controller.signal.aborted) throw new AnalysisError('cancelled', 'Analysis cancelled. You can retry your recorded answers.')
    const body = new FormData()
    answers.forEach(({ blob, question }, index) => {
      body.append('audio', blob, `${index + 1}-${audioFilename(blob.type)}`)
      body.append('question', question)
    })
    body.append('language', language)
    const response = await fetch('/api/analyze-interview', { method: 'POST', body, signal: controller.signal })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const knownCodes = ['no_speech', 'invalid_audio', 'not_configured', 'provider_auth', 'rate_limited', 'busy', 'timeout', 'transcription_failed', 'provider_unavailable', 'invalid_response', 'too_large', 'invalid_request']
      const failure = payload?.error
      const error = new AnalysisError(knownCodes.includes(failure?.code) ? failure.code : 'http',
        knownCodes.includes(failure?.code) && typeof failure.message === 'string' ? failure.message : 'Analysis could not be completed. Please retry.', response.status)
      if (Number.isInteger(failure?.answerIndex)) error.answerIndex = failure.answerIndex
      throw error
    }
    if (!Array.isArray(payload?.results) || payload.results.length !== answers.length) {
      throw new AnalysisError('invalid_response', 'The analysis response was incomplete or invalid. Please retry.')
    }
    return payload.results.map(validateFeedback)
  } catch (error) {
    if (controller.signal.aborted) throw new AnalysisError(timedOut ? 'timeout' : 'cancelled', timedOut
      ? 'Analysis took too long. Check your connection and retry.' : 'Analysis cancelled. You can retry your recorded answers.')
    if (error instanceof AnalysisError) throw error
    throw new AnalysisError('network', 'Unable to reach the analysis service. Check your connection and retry.')
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
  }
}

export async function getAnalysisStatus({ signal } = {}) {
  try {
    const response = await fetch('/api/status', { signal: AbortSignal.any([AbortSignal.timeout(5000), ...(signal ? [signal] : [])]) })
    const status = await response.json()
    if (!response.ok || typeof status.ready !== 'boolean' || status.provider !== 'nvidia') throw new Error('Invalid status')
    return status
  } catch (error) {
    if (signal?.aborted) throw error
    return { ready: false, message: 'The analysis server is unavailable. Start it and check the connection before recording.' }
  }
}
