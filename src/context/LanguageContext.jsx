import { createContext, useContext, useEffect, useState } from 'react'
import { LANGUAGE_OPTIONS } from '../i18n/translations.js'

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      const saved = localStorage.getItem('varta-lang')
      return LANGUAGE_OPTIONS.some(({ code }) => code === saved) ? saved : 'en'
    } catch {
      return 'en'
    }
  })

  useEffect(() => {
    document.documentElement.lang = lang
    try {
      localStorage.setItem('varta-lang', lang)
    } catch {
      // localStorage unavailable (private browsing etc.) — selection just
      // won't persist across reloads, which is fine to fail silently on.
    }
  }, [lang])

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider')
  return ctx
}
