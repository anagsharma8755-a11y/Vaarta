import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSetup, QUESTION_COUNT, QUESTION_LANGUAGES } from '../src/data/interview.js'

test('only AI question languages supported by the interview flow are selectable', () => {
  assert.equal(QUESTION_COUNT, 3)
  assert.deepEqual(QUESTION_LANGUAGES.map(({ code }) => code), ['en', 'hi', 'mr', 'ta', 'te', 'bn'])
  assert.equal(normalizeSetup(null, 'hi').language, 'hi')
  assert.equal(normalizeSetup(null, 'mr').language, 'mr')
})

test('preserves all valid selections and rejects invalid navigation state', () => {
  const setup = { type: 'Technical', difficulty: 'Advanced', language: 'hi' }
  assert.deepEqual(normalizeSetup(setup), setup)
  assert.deepEqual(normalizeSetup({ type: 'unknown', difficulty: null, language: 'Other' }),
    { type: 'HR', difficulty: 'Beginner', language: 'en' })
})
