// Renders the "why this might have landed a certain way" notes — the
// bias-aware context interpretation layer described in the team's
// problem statement. Kept as its own component (not folded into the
// generic feedback list) since it's meant to visually stand apart.
export default function ContextNotePanel({ notes }) {
  if (!notes || notes.length === 0) {
    return (
      <p className="plain-card">
        No context notes were provided for this answer.
      </p>
    )
  }

  return (
    <div>
      {notes.map((note, i) => (
        <div className="context-note" key={i}>
          <p className="context-note__phrase">&ldquo;{note.phrase}&rdquo;</p>
          <p className="context-note__note">{note.note}</p>
        </div>
      ))}
    </div>
  )
}
