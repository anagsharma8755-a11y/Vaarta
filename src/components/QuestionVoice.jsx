import { useEffect, useRef, useState } from 'react'
import Button from './Button.jsx'
import { createQuestionSpeaker } from '../lib/questionSpeaker.js'

export default function QuestionVoice({ questionIndex, sessionId, disabled, onBusy }) {
  const speakerRef = useRef(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  useEffect(() => {
    const speaker = createQuestionSpeaker({ onStatus: (next) => {
      setStatus(next); onBusy(next === 'loading' || next === 'playing')
    }, onError: setError })
    speakerRef.current = speaker
    const stop = () => speaker.stop()
    window.addEventListener('pagehide', stop)
    return () => { window.removeEventListener('pagehide', stop); speaker.dispose(); speakerRef.current = null }
  }, [onBusy])
  useEffect(() => {
    speakerRef.current?.play(questionIndex, sessionId)
    return () => speakerRef.current?.stop()
  }, [questionIndex, sessionId])
  useEffect(() => { if (disabled) speakerRef.current?.stop() }, [disabled])
  const busy = status === 'loading' || status === 'playing'
  return (
    <div className="question-voice">
      <p role="status">{status === 'loading' ? 'Preparing interviewer voice…' : status === 'playing' ? 'Interviewer speaking. Listen, then record your answer.' : status === 'finished' ? 'Your turn. Record your answer when ready.' : 'Listen to the question, or read it and record your answer.'}</p>
      {error && <p className="flow-error" role="alert">{error}</p>}
      <Button variant="secondary" disabled={disabled} onClick={() => busy ? speakerRef.current.stop() : speakerRef.current.play(questionIndex, sessionId)}>
        {busy ? 'Stop question audio' : 'Play question'}
      </Button>
    </div>
  )
}
