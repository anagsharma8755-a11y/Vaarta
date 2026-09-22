export default function ProgressBar({ value, max = 100, label = 'Score' }) {
  const pct = max > 0 && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0
  return (
    <div className="bar-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className="bar-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}
