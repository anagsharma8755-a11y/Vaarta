export default function ScoreRing({ score, max = 100, size = 140 }) {
  const radius = (size - 14) / 2
  const circumference = 2 * Math.PI * radius
  const filled = (score / max) * circumference

  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-raised)"
          strokeWidth="10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--marigold)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="score-ring__label">
        <span className="score-ring__number">{score}</span>
        <span className="score-ring__of">/ {max}</span>
      </div>
    </div>
  )
}
