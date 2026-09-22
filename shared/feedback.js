// The existing feedback fields, with explicit nulls for measurements that the
// selected pipeline cannot establish. Missing fields are still invalid.
export function isFeedback(value) {
  const score = (n) => Number.isFinite(n) && n >= 0 && n <= 100
  const optionalString = (n) => n === null || typeof n === 'string'
  return Boolean(value && typeof value === 'object' &&
    score(value.contentScore) && (value.deliveryScore === null || score(value.deliveryScore)) &&
    ['transcript', 'averageAnswerLength', 'whatWentWell', 'improveNext'].every((key) => typeof value[key] === 'string' && value[key].trim()) &&
    optionalString(value.speakingPace) &&
    (value.longPauses === null || (Number.isInteger(value.longPauses) && value.longPauses >= 0)) &&
    (value.fillerWords === null || (Array.isArray(value.fillerWords) && value.fillerWords.every((word) => typeof word === 'string'))) &&
    Array.isArray(value.contextNotes) && value.contextNotes.every((note) =>
      note && typeof note.phrase === 'string' && note.phrase.trim() && typeof note.note === 'string' && note.note.trim()))
}
