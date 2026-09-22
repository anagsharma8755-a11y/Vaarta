import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import Button from '../components/Button.jsx'
import SceneBackdrop from '../components/SceneBackdrop.jsx'
import TiltCard from '../components/TiltCard.jsx'

import { INTERVIEW_TYPES, DIFFICULTIES, QUESTION_LANGUAGES, normalizeSetup } from '../data/interview.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { generateQuestionSession } from '../api/client.js'

export default function InterviewSetup() {
  const navigate = useNavigate()
  const location = useLocation()
  const { lang } = useLanguage()
  const [initial] = useState(() => normalizeSetup(location.state, lang))
  const [type, setType] = useState(initial.type)
  const [difficulty, setDifficulty] = useState(initial.difficulty)
  const [language, setLanguage] = useState(initial.language)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef(null)

  useEffect(() => () => requestRef.current?.abort(), [])

  async function handleStart() {
    if (requestRef.current) return
    const controller = new AbortController()
    requestRef.current = controller
    setGenerating(true)
    setError('')
    const setup = { type, difficulty, language }
    try {
      const session = await generateQuestionSession(setup, { signal: controller.signal })
      navigate('/interview', { state: { ...setup, ...session } })
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message || 'Questions could not be generated. Please retry.')
    } finally {
      if (requestRef.current === controller) requestRef.current = null
      if (!controller.signal.aborted) setGenerating(false)
    }
  }

  return (
    <div className="app-shell setup-page">
      <SceneBackdrop variant="setup" />
      <Navbar />
      <main className="container setup" lang="en">
        <div className="setup__intro"><div className="section-kicker">SESSION CONFIGURATION / 01</div><h1>Build your practice room.</h1><p>Choose the shape of this session. Your selections stay with you through the interview and feedback.</p></div>
        <div className="setup__layout">
          <div className="setup__fields">
            <OptionField disabled={generating} label="Interview type" hint="Choose the context you want to rehearse." options={INTERVIEW_TYPES} value={type} onChange={setType} />
            <OptionField disabled={generating} label="Difficulty" hint="Set the pressure level for this attempt." options={DIFFICULTIES} value={difficulty} onChange={setDifficulty} />
            <OptionField disabled={generating} label="Question language" hint="Choose the language the AI interviewer will use." options={QUESTION_LANGUAGES.map(({ code }) => code)} optionLabel={(code) => QUESTION_LANGUAGES.find((option) => option.code === code).label} value={language} onChange={setLanguage} />
          </div>
          <TiltCard as="aside" className="setup-preview" aria-label="Session summary">
            <div className="setup-preview__top"><span>SESSION PREVIEW</span><i /></div>
            <div className="setup-preview__orb"><span>01</span></div>
            <dl><div><dt>Track</dt><dd>{type}</dd></div><div><dt>Level</dt><dd>{difficulty}</dd></div><div><dt>Questions</dt><dd>{QUESTION_LANGUAGES.find((option) => option.code === language)?.label}</dd></div></dl>
            <p>Three fresh questions in your selected language · Up to two minutes each</p>
            {generating && <p className="setup-generation-status" role="status">Creating a new {difficulty.toLowerCase()} {type.toLowerCase()} interview…</p>}
            {error && <p className="flow-error" role="alert">{error}</p>}
            <Button disabled={generating} onClick={handleStart}>{generating ? 'Creating your questions…' : 'Enter interview room'} {!generating && <span aria-hidden="true">→</span>}</Button>
          </TiltCard>
        </div>
      </main>
    </div>
  )
}

function OptionField({ label, hint, options, value, onChange, optionLabel = (value) => value, disabled = false }) {
  return (
    <div className="setup__field">
      <div className="field-heading"><p className="field-label">{label}</p><span>{hint}</span></div>
      <div className="option-grid" role="group" aria-label={label}>
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className="option"
            disabled={disabled}
            aria-pressed={value === opt}
            onClick={() => onChange(opt)}
          >
            {optionLabel(opt)}
          </button>
        ))}
      </div>
    </div>
  )
}
