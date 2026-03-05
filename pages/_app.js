// pages/_app.js
import '../styles/globals.css'
import Link from 'next/link'
import { useRouter } from 'next/router'

export default function App({ Component, pageProps }) {
  const router = useRouter()

  const links = [
    { href: '/setup',       label: 'Team Setup' },
    { href: '/start',       label: 'Start Line' },
    { href: '/finish',      label: 'Finish Line' },
    { href: '/leaderboard', label: 'Leaderboard' },
  ]

  return (
    <>
      <nav className="nav">
        <span className="nav-title">⏱ Race Timer</span>
        {links.map(l => (
          <Link
            key={l.href}
            href={l.href}
            className={router.pathname === l.href ? 'active' : ''}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <Component {...pageProps} />
    </>
  )
}
