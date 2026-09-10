import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, BookOpen, ChevronDown, Info, LayoutDashboard, LogOut, Settings, Sparkles, Zap } from 'lucide-react'
import { api, clearToken } from '../api/client'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/questions', label: 'My Desk', icon: BookOpen },
  { to: '/topic-setup', label: 'Class Library', icon: BookOpen },
  { to: '/quizzes', label: 'Quick Checks', icon: Zap },
  { to: '/progress', label: 'Report Card', icon: BarChart3 },
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

  return <div className="relative" ref={ref}>
    <button className="profile-pill" onClick={() => setOpen((o) => !o)}><span className="profile-avatar">K</span><span className="profile-copy"><b>Kasak</b><small>Student</small></span>{points !== null && <span className="profile-points"><Sparkles size={12} /> {points}</span>}<ChevronDown size={14} /></button>
    {open && <div className="user-menu"><button onClick={() => go('/settings')}><Settings size={15} /> Settings</button><button onClick={() => go('/about')}><Info size={15} /> About</button><div /><button className="logout" onClick={logout}><LogOut size={15} /> Log out</button></div>}
  </div>
}

export default function NavShell({ title, children }: { title: string; children: React.ReactNode }) {
  const location = useLocation()
  const [points, setPoints] = useState<number | null>(null)

  useEffect(() => { api.getMe().then((me) => setPoints(me.total_points ?? 0)).catch(() => {}) }, [location.pathname])

  return <div className="kyro-app-shell">
    <aside className="kyro-sidebar">
      <Link to="/dashboard" className="kyro-brand"><span className="brand-sun">☼</span><span><strong>AI KYRO</strong><small>Learn <i>·</i> Think <i>·</i> Grow</small></span></Link>
      <nav className="kyro-nav">{NAV_ITEMS.map(({ to, label, icon: Icon }) => { const active = location.pathname === to; return <Link key={`${to}-${label}`} to={to} className={active ? 'active' : ''}><Icon size={19} strokeWidth={1.8} /><span>{label}</span></Link> })}</nav>
      <div className="sidebar-divider" />
      <div className="sidebar-note"><span>☘</span><p>Small<br />steps build<br /><b>big progress.</b></p><em>☺</em></div>
      <div className="sidebar-spacer" />
      <UserMenu points={points} />
      <Link to="/settings" className="sidebar-settings"><Settings size={16} /> Settings</Link>
    </aside>
    <div className="kyro-content-shell">
      <header className="kyro-header"><div className="header-title"><span className="header-spark">✦</span><div><small>AI KYRO / LEARNING ROOM</small><h1>{title}</h1></div></div><div className="header-status"><span className="header-sun">☼</span><span>Good morning, Kasak!</span></div></header>
      <main className="kyro-main">{children}</main>
    </div>
  </div>
}
