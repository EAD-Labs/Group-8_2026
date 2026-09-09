import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, BookOpen, TrendingUp, Settings, Info, LogOut, Sparkles, ChevronDown, ClipboardCheck } from 'lucide-react'
import { api, clearToken } from '../api/client'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/topic-setup', label: 'Modules', icon: BookOpen },
  { to: '/quizzes', label: 'Quizzes', icon: ClipboardCheck },
  { to: '/progress', label: 'Progress', icon: TrendingUp },
]

function UserMenu({ points }: { points: number | null }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
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
    <div className="relative" ref={ref}>
      <button
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white pl-3 pr-2 py-1.5 hover:border-slate-300 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        {points !== null && (
          <span className="flex items-center gap-1 text-xs font-semibold text-amber">
            <Sparkles size={14} strokeWidth={2.5} />
            {points}
          </span>
        )}
        <ChevronDown size={14} className="text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-20">
          <button className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2" onClick={() => go('/settings')}>
            <Settings size={15} /> Settings
          </button>
          <button className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2" onClick={() => go('/about')}>
            <Info size={15} /> About
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button className="w-full text-left px-4 py-2 text-sm text-learner hover:bg-red-50 flex items-center gap-2" onClick={logout}>
            <LogOut size={15} /> Log out
          </button>
        </div>
      )}
    </div>
  )
}

export default function NavShell({ title, children }: { title: string; children: React.ReactNode }) {
  const location = useLocation()
  const [points, setPoints] = useState<number | null>(null)

  useEffect(() => {
    api.getMe().then((me) => setPoints(me.total_points ?? 0)).catch(() => {})
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-paper flex">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="px-5 py-5 border-b border-slate-100">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cobalt flex items-center justify-center text-white text-xs font-bold font-display">
              AK
            </div>
            <span className="font-display font-semibold text-ink text-[15px]">AI KYRO</span>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active ? 'bg-cobalt-light text-cobalt-dark' : 'text-slate-500 hover:bg-slate-50 hover:text-ink'
                }`}
              >
                <Icon size={17} strokeWidth={2} />
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="px-3 pb-4">
          <Link
            to="/settings"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-50 hover:text-ink"
          >
            <Settings size={17} strokeWidth={2} />
            Settings
          </Link>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 shrink-0 border-b border-slate-200 bg-white px-8 flex items-center justify-between">
          <h1 className="font-display text-xl font-semibold text-ink">{title}</h1>
          <UserMenu points={points} />
        </header>
        <main className="flex-1 px-8 py-8 max-w-4xl w-full mx-auto">{children}</main>
      </div>
    </div>
  )
}
