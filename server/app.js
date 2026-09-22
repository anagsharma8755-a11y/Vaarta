import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readAudio } from './audio.js'
import { RequestError } from './errors.js'
import { transcribeAudio, generateFeedback, generateInterviewFeedback, generateQuestions } from './nvidia.js'
import { readConfig } from './config.js'
import { isFeedback } from '../shared/feedback.js'
import { speakQuestion } from './elevenlabs.js'
import { DIFFICULTIES, INTERVIEW_TYPES, QUESTION_LANGUAGES } from '../src/data/interview.js'

const MAX_BODY_BYTES = 4 * 1024 * 1024
const MAX_INTERVIEW_BYTES = MAX_BODY_BYTES * 3
const allowedOrigins = new Set(['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173'])
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

function send(res, status, value) {
  if (!res.destroyed && !res.writableEnded) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    res.end(JSON.stringify(value))
  }
}

export function createAnalysisServer({ getConfig = readConfig, transcribe = transcribeAudio, generate = generateFeedback,
  generateBatch = generateInterviewFeedback, generateQuestionSet = generateQuestions, speak = speakQuestion } = {}) {
  let activeRequests = 0
  let requestSequence = 0
  const questionSessions = new Map()
  const server = createServer(async (req, res) => {
    const controller = new AbortController()
    let admitted = false
    let timedOut = false
    let requestId = null
    let operation = 'request'
    const abort = () => { if (!res.writableEnded) controller.abort() }
    req.on('aborted', abort)
    res.on('close', abort)
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, 110000)
    try {
      const host = new URL(`http://${req.headers.host || 'invalid'}`).hostname
      if (!localHosts.has(host) || (req.headers.origin && !allowedOrigins.has(req.headers.origin))) {
        throw new RequestError('forbidden', 'This local analysis service only accepts local application requests.', 403)
      }
      const config = getConfig()
      const url = new URL(req.url, 'http://localhost')
      if (url.pathname === '/api/questions') {
        if (req.method !== 'POST') throw new RequestError('method_not_allowed', 'Use POST to create an interview session.', 405)
        if (!config.apiKey) throw new RequestError('not_configured', 'Question generation is not configured. Add the server-side API key and retry.', 503)
        if (!req.headers['content-type']?.startsWith('application/json')) throw new RequestError('invalid_request', 'Interview setup is required.', 400)
        if (activeRequests >= 2) throw new RequestError('busy', 'Question generation is busy. Please retry.', 429)
        const chunks = []
        let bytes = 0
        for await (const chunk of req) {
          bytes += chunk.length
          if (bytes > 4096) throw new RequestError('too_large', 'Interview setup is too large.', 413)
          chunks.push(chunk)
        }
        let setup
        try { setup = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
        catch { throw new RequestError('invalid_request', 'Interview setup could not be read.', 400) }
        const languageCodes = QUESTION_LANGUAGES.map(({ code }) => code)
        if (!setup || !INTERVIEW_TYPES.includes(setup.type) || !DIFFICULTIES.includes(setup.difficulty) ||
          !languageCodes.includes(setup.language) || Object.keys(setup).some((key) => !['type', 'difficulty', 'language'].includes(key))) {
          throw new RequestError('invalid_request', 'Choose a supported interview type, difficulty, and language.', 400)
        }
        activeRequests++; admitted = true
        operation = 'questions'
        requestId = ++requestSequence
        const startedAt = Date.now()
        console.info(JSON.stringify({ event: 'questions_started', requestId, type: setup.type, difficulty: setup.difficulty }))
        const questions = await generateQuestionSet(setup, { ...config, signal: controller.signal })
        controller.signal.throwIfAborted()
        const sessionId = randomUUID()
        const now = Date.now()
        for (const [id, session] of questionSessions) if (session.expiresAt <= now) questionSessions.delete(id)
        if (questionSessions.size >= 50) questionSessions.delete(questionSessions.keys().next().value)
        questionSessions.set(sessionId, { questions, language: setup.language, expiresAt: now + 60 * 60 * 1000 })
        send(res, 200, { sessionId, questions })
        console.info(JSON.stringify({ event: 'questions_completed', requestId, elapsedMs: Date.now() - startedAt }))
        return
      }
      if (url.pathname === '/api/question-audio') {
        if (req.method !== 'POST') throw new RequestError('method_not_allowed', 'Use POST for question audio.', 405)
        const index = url.searchParams.get('question')
        const sessionId = url.searchParams.get('session')
        const session = questionSessions.get(sessionId)
        if (!/^[0-2]$/.test(index || '') || typeof sessionId !== 'string' || [...url.searchParams.keys()].length !== 2) {
          throw new RequestError('invalid_request', 'Select a generated interview question.', 400)
        }
        if (!session || session.expiresAt <= Date.now()) {
          questionSessions.delete(sessionId)
          throw new RequestError('session_expired', 'This interview session expired. Return to setup and create a new session.', 410)
        }
        if (activeRequests >= 2) throw new RequestError('busy', 'Voice processing is busy. Please retry.', 429)
        activeRequests++; admitted = true
        // Only server-generated session questions can be sent to the paid speech endpoint.
        const audio = await speak(session.questions[Number(index)][session.language], { ...config, signal: controller.signal })
        controller.signal.throwIfAborted()
        if (!res.destroyed && !res.writableEnded) {
          res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
          res.end(audio)
        }
        return
      }
      if (req.method === 'GET' && req.url === '/api/status') {
        send(res, 200, { ready: Boolean(config.apiKey), provider: 'nvidia',
          message: config.apiKey ? 'Answer analysis is ready.' : 'Answer analysis is not configured. Add the server-side API key before recording.' })
        return
      }
      const isBatch = url.pathname === '/api/analyze-interview'
      if (!isBatch && url.pathname !== '/api/analyze') throw new RequestError('not_found', 'Endpoint not found.', 404)
      if (req.method !== 'POST') throw new RequestError('method_not_allowed', 'Use POST to submit an answer.', 405)
      if (!config.apiKey) throw new RequestError('not_configured', 'Answer analysis is not configured. Add the server-side API key and retry.', 503)
      if (activeRequests >= 2) throw new RequestError('busy', 'Analysis is busy. Please wait and retry.', 429)
      activeRequests++; admitted = true
      operation = 'analysis'
      requestId = ++requestSequence
      const startedAt = Date.now()
      console.info(JSON.stringify({ event: 'analysis_started', requestId, mode: isBatch ? 'interview' : 'answer', activeRequests }))
      if (!req.headers['content-type']?.startsWith('multipart/form-data;')) throw new RequestError('invalid_request', 'A recorded audio file is required.', 400)
      const bodyLimit = isBatch ? MAX_INTERVIEW_BYTES : MAX_BODY_BYTES
      if (Number(req.headers['content-length'] || 0) > bodyLimit) throw new RequestError('too_large', 'The recording is too large. Please record a shorter answer.', 413)
      const chunks = []
      let bytes = 0
      for await (const chunk of req) {
        bytes += chunk.length
        if (bytes > bodyLimit) throw new RequestError('too_large', 'The recording is too large. Please record a shorter answer.', 413)
        chunks.push(chunk)
      }
      let form
      try {
        form = await new Request('http://localhost/api/analyze', { method: 'POST',
          headers: { 'Content-Type': req.headers['content-type'] }, body: Buffer.concat(chunks) }).formData()
      } catch { throw new RequestError('invalid_request', 'The recording upload could not be read. Please retry.', 400) }
      const files = form.getAll('audio')
      const questions = form.getAll('question')
      const languages = form.getAll('language')
      const languageCodes = QUESTION_LANGUAGES.map(({ code }) => code)
      const expected = isBatch ? 3 : 1
      if (files.length !== expected || questions.length !== expected ||
          languages.length !== 1 || !languageCodes.includes(languages[0]) ||
          !files.every((file) => file instanceof Blob && file.size <= MAX_BODY_BYTES) ||
          !questions.every((question) => typeof question === 'string' && question.trim() && question.length <= 2000) ||
          [...form.keys()].some((key) => !['audio', 'question', 'language'].includes(key))) {
        throw new RequestError('invalid_request', isBatch ? 'Exactly three recordings and questions are required.' : 'A single recording and interview question are required.', 400)
      }
      const audios = await Promise.all(files.map(async (file) => readAudio(Buffer.from(await file.arrayBuffer()))))
      controller.signal.throwIfAborted()
      const transcriptionStartedAt = Date.now()
      const transcripts = isBatch
        ? await Promise.all(audios.map(async (audio, index) => {
          try { return await transcribe(audio.pcm, { ...config, language: languages[0], signal: controller.signal }) }
          catch (failure) { failure.answerIndex = index; throw failure }
        }))
        : [await transcribe(audios[0].pcm, { ...config, language: languages[0], signal: controller.signal })]
      console.info(JSON.stringify({ event: 'transcription_completed', requestId, elapsedMs: Date.now() - transcriptionStartedAt }))
      controller.signal.throwIfAborted()
      const feedbackStartedAt = Date.now()
      const feedbacks = isBatch
        ? await generateBatch(transcripts.map((transcript, index) => ({ transcript, question: questions[index] })), { ...config, signal: controller.signal })
        : [await generate(transcripts[0], questions[0], { ...config, signal: controller.signal })]
      console.info(JSON.stringify({ event: 'feedback_completed', requestId, elapsedMs: Date.now() - feedbackStartedAt }))
      controller.signal.throwIfAborted()
      const results = feedbacks.map((feedback, index) => {
        const seconds = Math.round(audios[index].duration)
        return { ...feedback, transcript: transcripts[index], deliveryScore: null, fillerWords: null, longPauses: null, speakingPace: null,
          averageAnswerLength: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
          provider: 'nvidia', analysisKind: 'transcript', model: config.model }
      })
      if (!results.every(isFeedback)) throw new RequestError('invalid_response', 'Analysis returned incomplete feedback. Please retry.')
      send(res, 200, isBatch ? { results } : results[0])
      console.info(JSON.stringify({ event: 'analysis_completed', requestId, elapsedMs: Date.now() - startedAt }))
    } catch (error) {
      const failure = timedOut ? new RequestError('timeout', 'Answer analysis took too long. Please retry.', 504)
        : error instanceof RequestError ? error : new RequestError('internal', 'Analysis could not be completed. Please retry.', 500)
      send(res, failure.status, { error: { code: failure.code, message: failure.message,
        ...(Number.isInteger(failure.answerIndex) ? { answerIndex: failure.answerIndex } : {}) } })
      if (admitted) console.warn(JSON.stringify({ event: `${operation}_failed`, requestId, code: failure.code, message: failure.message }))
    } finally {
      clearTimeout(timer)
      req.removeListener('aborted', abort)
      res.removeListener('close', abort)
      if (admitted) activeRequests--
    }
  })
  server.requestTimeout = 30000
  server.headersTimeout = 10000
  return server
}
