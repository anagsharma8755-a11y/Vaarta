import { Link } from 'react-router-dom'

export default function Logo({ className = '' }) {
  return (
    <Link to="/" className={`logo ${className}`.trim()} aria-label="VAARTA — home">
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect x="9" y="2" width="6" height="12" rx="3" fill="var(--marigold)" />
        <path
          d="M5 11a7 7 0 0 0 14 0"
          stroke="var(--marigold)"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <path d="M12 18v3" stroke="var(--marigold)" strokeWidth="2" strokeLinecap="round" />
        <path d="M8 21h8" stroke="var(--marigold)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="logo__text">VAARTA</span>
    </Link>
  )
}
