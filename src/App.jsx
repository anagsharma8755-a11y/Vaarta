import { useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Landing from './pages/Landing.jsx'
import InterviewSetup from './pages/InterviewSetup.jsx'
import MockInterview from './pages/MockInterview.jsx'
import Feedback from './pages/Feedback.jsx'

export default function App() {
  const location = useLocation()
  useEffect(() => {
    const heading = document.querySelector('main h1')
    if (heading) {
      heading.setAttribute('tabindex', '-1')
      heading.focus()
    }
  }, [location.key])
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/interview/setup" element={<InterviewSetup />} />
      <Route path="/interview" element={<MockInterview />} />
      <Route path="/feedback" element={<Feedback />} />
    </Routes>
  )
}
