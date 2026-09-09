import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clearToken } from '../api/client'

function DotsMenu() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function go(path: string) {
    setOpen(false)
    navigate(path)
  }

  function logout() {
    setOpen(false)
    clearToken()
    navigate('/login')
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        onClick={() => setOpen((o) => !o)}
        aria-label="More options"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <circle cx="10" cy="4" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="10" cy="16" r="1.6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-10">
          <button
            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => go('/topic-setup')}
          >
            Modules
          </button>
          <button
            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => go('/progress')}
          >
            Progress
          </button>
          <button
            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => go('/settings')}
          >
            Settings
          </button>
          <button
            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => go('/about')}
          >
            About
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            onClick={logout}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  )
}

export default function NavShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/dashboard" className="font-semibold text-slate-900">AI KYRO</Link>
          <nav className="text-sm text-slate-500 flex gap-4">
            <Link to="/dashboard" className="hover:text-slate-900">Dashboard</Link>
            <Link to="/topic-setup" className="hover:text-slate-900">Modules</Link>
            <Link to="/progress" className="hover:text-slate-900">Progress</Link>
          </nav>
        </div>
        <DotsMenu />
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-lg font-semibold text-slate-900 mb-6">{title}</h1>
        {children}
      </main>
    </div>
  )
}
