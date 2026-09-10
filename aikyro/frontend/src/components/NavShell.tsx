import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, BookOpen, TrendingUp, Settings, Info, LogOut, Sparkles, ChevronDown, ClipboardCheck, Sun } from 'lucide-react'
import { api, clearToken } from '../api/client'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'My Desk', icon: LayoutDashboard },
  { to: '/topic-setup', label: 'Class Library', icon: BookOpen },
  { to: '/quizzes', label: 'Quick Checks', icon: ClipboardCheck },
  { to: '/progress', label: 'Report Card', icon: TrendingUp },
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

  function go(path: string) { setOpen(false); navigate(path) }
  function logout() { setOpen(false); clearToken(); navigate('/login') }

  return (
    <div className="relative" ref={ref}>
      <button className="top-user" onClick={() => setOpen((o) => !o)}>
        <span className="top-avatar">K</span>
        <span className="hidden sm:block text-left"><strong>Student</strong><small>{points ?? 0} points</small></span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-cream border border-line rounded-xl shadow-lg py-1 z-30">
          <button className="menu-item" onClick={() => go('/settings')}><Settings size={15} /> Settings</button>
          <button className="menu-item" onClick={() => go('/about')}><Info size={15} /> About</button>
          <div className="my-1 border-t border-line/60" />
          <button className="menu-item danger" onClick={logout}><LogOut size={15} /> Log out</button>
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
      <aside className="kyro-sidebar">
        <div className="sidebar-brand">
          <Link to="/dashboard" className="block">
            <div className="brand-mark"><Sun size={21} /></div>
            <span className="brand-name">AI KYRO</span>
            <span className="brand-tag">Learn · Think · Grow</span>
          </Link>
        </div>

        <div className="room-card">
          <span className="room-icon"><BookOpen size={17} /></span>
          <div><strong>Room 617</strong><small>Your learning space</small></div>
          <span>›</span>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to || (to === '/topic-setup' && location.pathname.startsWith('/classroom'))
            return (
              <Link key={to} to={to} className={`sidebar-link ${active ? 'active' : ''}`}>
                <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />{label}
              </Link>
            )
          })}
        </nav>

        <div className="sidebar-note">
          <span className="note-pin" />
          <PencilLine />
          <p>Small steps<br />build big ideas.</p>
          <span className="note-spark">✦</span>
        </div>

        <div className="sidebar-profile">
          <div className="profile-avatar">K</div>
          <div><strong>Student</strong><small>Keep exploring</small></div>
          <Link to="/settings"><Settings size={16} /></Link>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="kyro-header">
          <div className="header-title"><span className="header-sun"><Sun size={15} /></span>{title}</div>
          <div className="header-right"><span className="header-message hidden sm:flex"><Sparkles size={14} /> Keep going!</span><UserMenu points={points} /></div>
        </header>
        <main className="flex-1 px-4 sm:px-6 lg:px-8 pb-10 max-w-[1500px] w-full mx-auto">{children}</main>
      </div>
    </div>
  )
}

function PencilLine() { return <svg className="sidebar-note-pencil" viewBox="0 0 24 24" fill="none"><path d="M4 20l4.5-1L19 8.5 15.5 5 5 16.5 4 20Z" stroke="currentColor" strokeWidth="1.6"/><path d="M13.8 6.7l3.5 3.5" stroke="currentColor" strokeWidth="1.6"/></svg> }
