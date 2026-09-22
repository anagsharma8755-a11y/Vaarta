import { LANGUAGE_OPTIONS } from '../i18n/translations.js'

export const INTERVIEW_TYPES = ['HR', 'Technical', 'Behavioral', 'Mixed']
export const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced']
export const QUESTION_COUNT = 3
export const QUESTION_LANGUAGES = LANGUAGE_OPTIONS.filter(({ code }) => ['en', 'hi', 'mr', 'bn', 'ta', 'te'].includes(code))

export function isQuestionSession(value) {
  return Boolean(value && typeof value.sessionId === 'string' && value.sessionId &&
    QUESTION_LANGUAGES.some(({ code }) => code === value.language) &&
    Array.isArray(value.questions) && value.questions.length === QUESTION_COUNT &&
    value.questions.every((question) => question && typeof question[value.language] === 'string' && question[value.language].trim()))
}

export function normalizeSetup(value, preferredLanguage = 'en') {
  const supported = (code) => QUESTION_LANGUAGES.some((language) => language.code === code)
  return {
    type: INTERVIEW_TYPES.includes(value?.type) ? value.type : 'HR',
    difficulty: DIFFICULTIES.includes(value?.difficulty) ? value.difficulty : 'Beginner',
    language: supported(value?.language) ? value.language : supported(preferredLanguage) ? preferredLanguage : 'en',
  }
}
