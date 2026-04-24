// src/components/Navbar.jsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogOut, Video, LayoutDashboard, User, ShieldAlert, Menu, X } from 'lucide-react'
import useAuth from '../hooks/useAuth'
import useProfile from '../hooks/useProfile'

const Navbar = () => {
  const { logout }  = useAuth()
  const { profile } = useProfile()
  const navigate    = useNavigate()
  const [open, setOpen] = useState(false)

  const handleLogout = () => { logout(); navigate('/login') }

  const links = [
    { to: '/dashboard', icon: <LayoutDashboard size={16} />, label: 'Dashboard' },
    { to: '/videos',    icon: <Video size={16} />,           label: 'My Videos' },
    { to: '/profile',   icon: <User size={16} />,            label: 'Profile' },
    ...(profile?.is_staff
      ? [{ to: '/admin', icon: <ShieldAlert size={16} />, label: 'Admin', yellow: true }]
      : []),
  ]

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-4 py-3 md:px-6 md:py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">

        {/* Logo */}
        <Link to="/dashboard" className="text-lg md:text-xl font-bold text-violet-400">
          WatchTogether
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          {links.map(l => (
            <Link key={l.to} to={l.to}
              className={`flex items-center gap-2 text-sm transition-colors ${
                l.yellow ? 'text-yellow-400 hover:text-yellow-300' : 'text-gray-400 hover:text-white'
              }`}
            >
              {l.icon}{l.label}
            </Link>
          ))}
          <button onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-red-400 transition-colors">
            <LogOut size={16} />Logout
          </button>
        </div>

        {/* Mobile hamburger */}
        <button className="md:hidden p-2 text-gray-400 hover:text-white"
          onClick={() => setOpen(o => !o)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden mt-2 flex flex-col gap-1 border-t border-gray-800 pt-3">
          {links.map(l => (
            <Link key={l.to} to={l.to}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm transition-colors ${
                l.yellow
                  ? 'text-yellow-400 hover:bg-yellow-400/10'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              {l.icon}{l.label}
            </Link>
          ))}
          <button onClick={handleLogout}
            className="flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm text-gray-300 hover:bg-gray-800 text-left">
            <LogOut size={16} />Logout
          </button>
        </div>
      )}
    </nav>
  )
}

export default Navbar
