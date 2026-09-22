import { Link, useLocation } from 'react-router-dom'
import Logo from './Logo.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { t } from '../i18n/translations.js'

export default function Navbar() {
  const location = useLocation()
  const { lang } = useLanguage()
  const onLanding = location.pathname === '/'

  return (
    <header className="navbar">
      <nav className="navbar__inner" aria-label="Primary navigation">
        <Logo />
        <ul className="navbar__links">
          {onLanding && (
            <>
              <li>
                <a href="#how-it-works">{t(lang, 'nav_how')}</a>
              </li>
              <li>
                <a href="#languages">{t(lang, 'nav_languages')}</a>
              </li>
            </>
          )}
          <li>
            <Link to="/interview/setup">{t(lang, 'nav_practice')}</Link>
          </li>
        </ul>
      </nav>
    </header>
  )
}
