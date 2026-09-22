import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Logo from '../components/Logo.jsx'
import Button from '../components/Button.jsx'
import QuestionVoice from '../components/QuestionVoice.jsx'
import SceneBackdrop from '../components/SceneBackdrop.jsx'
import { analyzeInterview, getAnalysisStatus } from '../api/client.js'
import { isQuestionSession, QUESTION_LANGUAGES, normalizeSetup } from '../data/interview.js'
import { prepareAudio } from '../lib/prepareAudio.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { createAudioRecorder, MAX_RECORDING_SECONDS } from '../lib/audioRecorder.js'

export default function MockInterview() {
  const location = useLocation()
  const { lang } = useLanguage()
  const setup = normalizeSetup(location.state, lang)
  if (!isQuestionSession(location.state)) return <Navigate to="/interview/setup" replace state={setup} />
  return <InterviewSession setup={setup} questionSession={{ sessionId: location.state.sessionId, questions: location.state.questions }} />
}

function InterviewSession({ setup, questionSession }) {
  const navigate = useNavigate()
  const questions = questionSession.questions
  const [questionIndex, setQuestionIndex] = useState(0)
  const [showTranslation, setShowTranslation] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [completedCount, setCompletedCount] = useState(0)
  const [connection, setConnection] = useState(null)
  const [failedIndex, setFailedIndex] = useState(null)
  const [voiceBusy, setVoiceBusy] = useState(true)
  const indexRef = useRef(0)
  const preparationRef = useRef(null)
  const recorderRef = useRef(null)
  const answersRef = useRef([])
  const requestRef = useRef(null)
  const questionRef = useRef(null)
  const processingRef = useRef(null)
  const isRecording = status === 'recording'
  const question = questions[questionIndex]
  const languageLabel = QUESTION_LANGUAGES.find(({ code }) => code === setup.language)?.label
  const translationLanguage = setup.language === 'en' ? 'hi' : 'en'
  const hasTranslation = typeof question[translationLanguage] === 'string'

  useEffect(() => {
    const controller = new AbortController()
    getAnalysisStatus({ signal: controller.signal }).then(setConnection).catch(() => {})
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const recorder = createAudioRecorder({
      onStatus: setStatus,
      onSeconds: setSeconds,
      onError: setError,
      onComplete: async (blob) => {
        const controller = new AbortController()
        preparationRef.current = controller
        setStatus('checking')
        try {
          const audio = await prepareAudio(blob, controller.signal)
          if (controller.signal.aborted) return
          const index = indexRef.current
          answersRef.current[index] = { blob: audio, question: questions[index][setup.language] }
          const count = answersRef.current.filter(Boolean).length
          setCompletedCount(count)
          setSeconds(0)
          setShowTranslation(false)
          const next = questions.findIndex((_, i) => !answersRef.current[i])
          if (next !== -1) {
            indexRef.current = next
            setQuestionIndex(next)
            setStatus('idle')
          } else setStatus('ready')
        } catch (failure) {
          if (!controller.signal.aborted) {
            setError(failure.message || 'Audio could not be prepared. Record this answer again.')
            setStatus('idle')
          }
        } finally {
          if (preparationRef.current === controller) preparationRef.current = null
        }
      },
    })
    recorderRef.current = recorder
    const leavePage = () => {
      recorder.cancel()
      preparationRef.current?.abort()
      requestRef.current?.abort()
      requestRef.current = null
      if (answersRef.current.filter(Boolean).length === questions.length) {
        setError('Processing was interrupted when you left the page. You can retry your recorded answers.')
        setStatus('analysis-error')
      }
    }
    window.addEventListener('pagehide', leavePage)
    return () => {
      window.removeEventListener('pagehide', leavePage)
      recorder.dispose()
      preparationRef.current?.abort()
      recorderRef.current = null
      requestRef.current?.abort()
      requestRef.current = null
      answersRef.current = []
    }
  }, [questions, setup.language])

  useEffect(() => { if (status === 'idle') questionRef.current?.focus() }, [questionIndex, status])

  const processAnswers = useCallback(async () => {
    if (requestRef.current || answersRef.current.filter(Boolean).length !== questions.length) return
    const controller = new AbortController()
    requestRef.current = controller
    setError('')
    setStatus('processing')
    try {
      const feedback = await analyzeInterview(answersRef.current, { language: setup.language, signal: controller.signal })
      const results = answersRef.current.map((answer, index) => {
        answer.feedback = feedback[index]
        return { question: answer.question, feedback: answer.feedback }
      })
      if (!controller.signal.aborted) {
        navigate('/feedback', { state: { results, setup, mode: 'api' } })
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure.message || 'Analysis failed. Retry your recorded answers.')
        setFailedIndex(['no_speech', 'invalid_audio'].includes(failure.code) ? failure.answerIndex : null)
        setStatus('analysis-error')
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null
    }
  }, [navigate, setup])

  // Processing starts only after all three successful, nonempty recordings.
  useEffect(() => {
    if (status === 'ready') processAnswers()
    if (status === 'processing' || status === 'analysis-error') processingRef.current?.focus()
  }, [status, processAnswers])

  function cancelAnalysis() {
    requestRef.current?.abort()
    requestRef.current = null
    setError('Analysis cancelled. Your recordings remain available here for retry until you leave this page.')
    setStatus('analysis-error')
  }

  if (status === 'processing' || status === 'analysis-error' || status === 'ready') {
    return (
      <main className="processing" lang="en">
        <SceneBackdrop variant="processing" />
        <div className="processing__eyebrow">ANSWER ANALYSIS</div>
        <h1 ref={processingRef} tabIndex={-1}>
          {status === 'analysis-error' ? 'Analysis unavailable' : 'Analyzing your three answers'}
        </h1>
        {status !== 'analysis-error' && <p role="status">Transcribing and reviewing all three answers together. This may take up to a minute.</p>}
        {status !== 'analysis-error' && <div className="spinner" aria-hidden="true" />}
        {error && <p role="alert" className="flow-error">{error}</p>}
        <div className="interview__controls">
          {status === 'analysis-error' ? failedIndex !== null ? <Button onClick={() => {
            answersRef.current[failedIndex] = undefined
            indexRef.current = failedIndex
            setQuestionIndex(failedIndex)
            setCompletedCount(answersRef.current.filter(Boolean).length)
            setFailedIndex(null); setError(''); setSeconds(0); setStatus('idle')
          }}>Record question {failedIndex + 1} again</Button> : <Button onClick={processAnswers}>Retry analysis</Button> :
            <Button variant="secondary" onClick={cancelAnalysis}>Cancel analysis</Button>}
          <Button as={Link} to="/interview/setup" state={setup} variant="secondary">Back to setup</Button>
        </div>
      </main>
    )
  }

  return (
    <main className="interview" lang="en">
      <SceneBackdrop variant="interview" />
      <div className="interview__top">
        <nav className="container interview__top-nav" aria-label="Interview navigation"><Logo /></nav>
        <div className="container interview__top-row">
          <span>{setup.type} interview · Question {questionIndex + 1} of {questions.length}</span>
          <span>{setup.difficulty} · {languageLabel}</span>
        </div>
        <div className="container">
          <div className="progress-track" role="progressbar" aria-label="Interview questions" aria-valuemin={0}
            aria-valuemax={questions.length} aria-valuenow={completedCount}
            aria-valuetext={`${completedCount} answers completed; question ${questionIndex + 1} of ${questions.length}`}>
            <div className="progress-fill" style={{ width: `${(completedCount / questions.length) * 100}%` }} />
          </div>
        </div>
      </div>
      <div className="interview__center">
        <div className="interview-stage">
        <div className="interview-stage__eyebrow"><span /> LIVE PRACTICE ROOM</div>
        {!connection?.ready && <div role="status"><p>{connection?.message || 'Checking analysis connection…'}</p>{connection && <Button variant="secondary" onClick={async () => { setConnection(null); setConnection(await getAnalysisStatus()) }}>Retry connection</Button>}</div>}
        <p className="interview-stage__meta">Question {questionIndex + 1} · {setup.type} · {setup.difficulty}</p>
        <h1 ref={questionRef} tabIndex={-1} className="interview__question" lang={setup.language}>{question[setup.language]}</h1>
        {hasTranslation && <button type="button" className="interview__helper" aria-expanded={showTranslation} aria-controls="question-translation"
          onClick={() => setShowTranslation((value) => !value)}>
          {showTranslation ? 'Hide translation' : setup.language === 'en' ? 'Show Hindi translation' : 'Show English translation'}
        </button>}
        {hasTranslation && showTranslation && <p id="question-translation" className="interview__translation" lang={translationLanguage}>{question[translationLanguage]}</p>}
        <QuestionVoice questionIndex={questionIndex} sessionId={questionSession.sessionId} disabled={status !== 'idle'} onBusy={setVoiceBusy} />
        {error && <p className="flow-error" role="alert">{error}</p>}
        <div className={`mic-orbit ${isRecording ? 'mic-orbit--recording' : ''}`}>
        <span className="mic-orbit__ring mic-orbit__ring--one" aria-hidden="true" /><span className="mic-orbit__ring mic-orbit__ring--two" aria-hidden="true" />
        <button type="button" className={`mic ${isRecording ? 'mic--recording' : ''}`}
          disabled={!connection?.ready || voiceBusy || (status !== 'idle' && !isRecording)}
          onClick={() => { if (isRecording) recorderRef.current.stop(); else { setError(''); recorderRef.current.start() } }}
          aria-label={isRecording ? 'Finish answer' : 'Start recording'}>
          <span aria-hidden="true">{isRecording ? '■' : '●'}</span>
        </button>
        </div>
        <p className="mic-status" role="status">{voiceBusy ? 'Listen to the interviewer, or stop question audio before recording.' : status === 'checking' ? 'Checking and preparing your audio…' : status === 'requesting' ? 'Waiting for microphone permission. Allow access in your browser, or cancel.' : status === 'stopping' ? 'Saving your answer…' : isRecording ? 'Recording. Finish your answer to continue.' : `Question ${questionIndex + 1} of ${questions.length}. ${connection?.ready ? 'Ready to record.' : 'Waiting for analysis connection.'}`}</p>
        <p>Maximum {MAX_RECORDING_SECONDS / 60} minutes per answer; recording ends automatically at the limit.</p>
        {isRecording && <p className="timer" aria-label={`Recording duration ${seconds} seconds`}>{formatTime(seconds)}</p>}
        <div className="interview__controls">
          {isRecording && <Button variant="secondary" onClick={() => recorderRef.current.stop()}>{questionIndex === questions.length - 1 ? 'Finish final answer' : 'Finish answer and continue'}</Button>}
          {status === 'requesting' && <Button variant="secondary" onClick={() => recorderRef.current.cancel()}>Cancel microphone request</Button>}
          <Button as={Link} to="/interview/setup" state={setup} variant="secondary">Exit to setup</Button>
        </div>
        </div>
      </div>
    </main>
  )
}

function formatTime(totalSeconds) {
  return `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, '0')}`
}
