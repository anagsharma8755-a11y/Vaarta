import { Link, useLocation } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import Button from '../components/Button.jsx'
import ProgressBar from '../components/ProgressBar.jsx'
import ContextNotePanel from '../components/ContextNotePanel.jsx'
import SceneBackdrop from '../components/SceneBackdrop.jsx'
import TiltCard from '../components/TiltCard.jsx'
import { validateFeedback } from '../api/client.js'
import { QUESTION_COUNT, QUESTION_LANGUAGES, normalizeSetup } from '../data/interview.js'

export default function Feedback() {
  const { state } = useLocation()
  const setup = normalizeSetup(state?.setup)
  let valid = false
  try {
    valid = state?.mode === 'api' && Array.isArray(state?.results) &&
      state.results.length === QUESTION_COUNT &&
      state.results.every((result) => result && validateFeedback(result.feedback) &&
        (typeof result.question === 'string' && result.feedback.provider === 'nvidia' && result.feedback.analysisKind === 'transcript'))
  } catch { valid = false }

  if (!valid) {
    return (
      <div className="app-shell">
        <SceneBackdrop variant="feedback" />
        <Navbar />
        <main className="container feedback" lang="en">
          <h1>Feedback unavailable</h1>
          <p role="status">This page has no complete, valid interview result. You may have opened it directly, or the result is no longer available. No sample data has been substituted.</p>
          <p>Record a new interview to continue. Recordings from a previous page cannot be recovered here.</p>
          <div className="feedback__actions"><Button as={Link} to="/interview/setup" state={setup}>Start a new interview</Button></div>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <SceneBackdrop variant="feedback" />
      <Navbar />
      <main className="container feedback" lang="en">
        <div className="feedback__header">
          <div className="section-kicker">SESSION COMPLETE</div>
          <h1>Your answer feedback</h1>
          <p className="flow-notice" role="status">Feedback is generated from your transcribed answers. Content scores are coaching estimates. Transcription can contain errors; delivery, pace and pauses are not measured.</p>
          <p>{setup.type} · {setup.difficulty} · Question language: {QUESTION_LANGUAGES.find(({ code }) => code === setup.language)?.label}</p>
        </div>
        {state.results.map((result, index) => (
          <article className="result-card" key={index} aria-labelledby={`result-${index}`}>
            <div className="result-card__index">0{index + 1}</div>
            <h2 id={`result-${index}`} className="result-heading">{result.question}</h2>
            <FeedbackReport feedback={result.feedback} />
          </article>
        ))}
        <div className="feedback__actions">
          <Button as={Link} to="/interview/setup" state={setup}>Practice again</Button>
          <Button as={Link} to="/" variant="secondary">Back to home</Button>
        </div>
      </main>
    </div>
  )
}

function FeedbackReport({ feedback }) {
  return (
    <>
      <div className="metric-grid">
        <Metric label="Content estimate" value={feedback.contentScore} />
        <Metric label="Delivery" value={feedback.deliveryScore} />
      </div>
      <div className="feedback__section">
        <h3>Transcript</h3>
        <p className="plain-card">{feedback.transcript}</p>
      </div>
      <div className="feedback__section">
        <h3>What went well</h3>
        <p className="plain-card">{feedback.whatWentWell}</p>
      </div>
      <div className="feedback__section">
        <h3>Improve next</h3>
        <p className="plain-card">{feedback.improveNext}</p>
      </div>
      <div className="feedback__section feedback__section--context">
        <h3>Context notes</h3>
        <p className="flow-notice">Phrases that may read differently to an interviewer than intended.</p>
        <ContextNotePanel notes={feedback.contextNotes} />
      </div>
      <div className="feedback__section">
        <h3>Speaking analysis</h3>
        <div className="speaking-stats">
          <Stat value={feedback.fillerWords?.length} label="Filler words" />
          <Stat value={feedback.longPauses} label="Long pauses" />
          <Stat value={feedback.speakingPace} label="Speaking pace" />
          <Stat value={feedback.averageAnswerLength} label="Answer length" />
        </div>
      </div>
    </>
  )
}

function Metric({ label, value }) {
  return (
    <TiltCard className="metric">
      <div className="metric__label">{label}</div>
      <div className="metric__value">{value == null ? 'Not measured' : `${value}%`}</div>
      {value != null && <ProgressBar value={value} label={label} />}
    </TiltCard>
  )
}

function Stat({ value, label }) {
  return (
    <div className="speaking-stat">
      <div className="speaking-stat__value">{value ?? 'Not measured'}</div>
      <div className="speaking-stat__label">{label}</div>
    </div>
  )
}
