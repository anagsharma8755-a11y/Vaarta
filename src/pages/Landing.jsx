import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'
import Button from '../components/Button.jsx'
import SceneBackdrop from '../components/SceneBackdrop.jsx'
import TiltCard from '../components/TiltCard.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { t, LANGUAGE_OPTIONS } from '../i18n/translations.js'

const challenges = [
  ['01', 'Ideas deserve a clear voice', 'Turn knowledge into answers that feel structured, specific and easy to follow.'],
  ['02', 'Practice without an audience', 'Step into a focused interview space whenever you need another attempt.'],
  ['03', 'Feedback with evidence', 'Review the transcript and see where your answer was strong and where it can become sharper.'],
]

const capabilities = [
  ['Voice-led questions', 'Hear each prompt spoken aloud before recording your response.'],
  ['Grounded coaching', 'Feedback is tied to the words recognized in your answer.'],
  ['Six interview languages', 'Practice with spoken questions in English, Hindi, Marathi, Tamil, Telugu or Bengali.'],
  ['Private session flow', 'Recordings remain session-based and are not presented as saved history.'],
]

export default function Landing() {
  const { lang, setLang } = useLanguage()
  return (
    <div className="app-shell">
      <SceneBackdrop variant="landing" />
      <Navbar />
      <main>
        <section className="hero">
          <div className="container hero__grid">
            <div className="hero__copy">
              <div className="status-pill"><span /> Live interview practice</div>
              <p className="hero__eyebrow">{t(lang, 'hero_eyebrow')}</p>
              <h1>{t(lang, 'hero_title')}</h1>
              <p className="lede">Step into an immersive practice room, answer out loud and turn every attempt into a clearer story.</p>
              <div className="hero__actions">
                <Button as={Link} to="/interview/setup">Enter the practice room <span aria-hidden="true">↗</span></Button>
                <Button as="a" href="#how-it-works" variant="secondary">See the experience</Button>
              </div>
              <div className="hero__proof" aria-label="Experience highlights">
                <span>3 focused questions</span><span>Spoken interviewer</span><span>Transcript coaching</span>
              </div>
            </div>
            <TiltCard className="interview-console">
              <div className="interview-console__top"><span className="console-label">INTERVIEW ROOM / 01</span><span className="console-live"><i /> READY</span></div>
              <div className="voice-orbit" aria-hidden="true">
                <div className="voice-orbit__ring voice-orbit__ring--outer" /><div className="voice-orbit__ring voice-orbit__ring--inner" />
                <div className="voice-orbit__core"><span>●</span></div><MiniWaveform />
              </div>
              <p className="interview-console__question">“Tell me about a project you recently worked on.”</p>
              <div className="interview-console__footer"><span>Listening mode</span><span>02:00 max</span></div>
            </TiltCard>
          </div>
        </section>

        <section className="signal-strip" aria-label="Product principles"><div className="container signal-strip__inner"><span>Speak</span><i /><span>Reflect</span><i /><span>Refine</span><i /><span>Repeat</span></div></section>

        <section className="story-section" id="problem"><div className="container">
          <div className="section-kicker">THE PRACTICE GAP</div>
          <div className="section-heading-row"><h2>Knowing the answer is only half the interview.</h2><p>Real confidence comes from hearing yourself explain the work, then knowing exactly what to sharpen.</p></div>
          <div className="depth-grid">{challenges.map(([number, title, body]) => <TiltCard className="depth-card" key={number}><div className="depth-card__number">{number}</div><h3>{title}</h3><p>{body}</p><div className="depth-card__line" /></TiltCard>)}</div>
        </div></section>

        <section className="journey" id="how-it-works"><div className="container journey__grid">
          <div className="journey__sticky"><div className="section-kicker">YOUR PRACTICE LOOP</div><h2>One focused room.<br />Three honest answers.</h2><p>No dashboards to configure. Choose a session, listen to the prompt and respond like you would in the real conversation.</p></div>
          <ol className="journey__steps">{[
            ['01', 'Set the scene', 'Choose the interview type, difficulty and question language.'],
            ['02', 'Hear the interviewer', 'Each question is spoken before the recording control becomes available.'],
            ['03', 'Answer in your own words', 'Record up to two minutes. Empty or unusable audio will not move you forward.'],
            ['04', 'Review and retry', 'Read the transcript, inspect content coaching and practice the answer again.'],
          ].map(([number, title, body]) => <li key={number}><span>{number}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol>
        </div></section>

        <section className="capabilities" id="features"><div className="container"><div className="section-kicker">BUILT FOR THE NEXT ATTEMPT</div><h2 className="section__heading">A calmer, more useful way to rehearse.</h2>
          <div className="capability-grid">{capabilities.map(([title, body], index) => <TiltCard className="capability-card" key={title}><span className="capability-card__icon" aria-hidden="true">{['◉', '◇', '文', '⌁'][index]}</span><h3>{title}</h3><p>{body}</p></TiltCard>)}</div>
        </div></section>

        <section className="language-section" id="languages"><div className="container language-panel"><div><div className="section-kicker">LANDING LANGUAGE</div><h2>Make the first step feel familiar.</h2><p>These choices translate selected landing content. AI interview questions and voice are available in English, Hindi, Marathi, Tamil, Telugu and Bengali.</p></div>
          <div className="language-chips" role="group" aria-label="Choose a landing-page language">{LANGUAGE_OPTIONS.map((option) => <button key={option.code} type="button" className="chip" aria-pressed={lang === option.code} lang={option.code} onClick={() => setLang(option.code)}>{option.label}</button>)}</div>
        </div></section>

        <section className="closing"><div className="container closing__inner"><div className="closing__orb" aria-hidden="true"><span /></div><div><div className="section-kicker">READY WHEN YOU ARE</div><h2>{t(lang, 'final_cta_heading')}</h2><p>Your next answer can be clearer than your last.</p><Button as={Link} to="/interview/setup">Start a practice round <span aria-hidden="true">→</span></Button></div></div></section>
      </main>
      <footer><div className="container footer__inner"><span>VAARTA / Interview practice</span><span>Designed for deliberate repetition.</span></div></footer>
    </div>
  )
}

function MiniWaveform() {
  return <div className="mini-waveform">{[10, 22, 34, 18, 44, 27, 52, 20, 38, 24, 46, 15, 30].map((height, index) => <i key={index} style={{ '--bar-height': `${height}px`, '--delay': `${index * -0.08}s` }} />)}</div>
}
