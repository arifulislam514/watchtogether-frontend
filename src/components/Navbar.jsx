// src/components/Navbar.jsx
import { Link, useNavigate } from 'react-router-dom'
import { LogOut, Video, LayoutDashboard, User, ShieldAlert } from 'lucide-react'
import useAuth from '../hooks/useAuth'
import useProfile from '../hooks/useProfile'

const Navbar = () => {
  const { logout }    = useAuth()
  const { profile }   = useProfile()
  const navigate      = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">

        {/* Logo */}
        <Link to="/dashboard" className="text-xl font-bold text-violet-400">
          WatchTogether
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-6">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <LayoutDashboard size={16} />
            Dashboard
          </Link>

          <Link
            to="/videos"
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <Video size={16} />
            My Videos
          </Link>

          <Link
            to="/profile"
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <User size={16} />
            Profile
          </Link>

          {/* Only visible to staff/admin users */}
          {profile?.is_staff && (
            <Link
              to="/admin"
              className="flex items-center gap-2 text-sm text-yellow-400 hover:text-yellow-300 transition-colors"
            >
              <ShieldAlert size={16} />
              Admin
            </Link>
          )}

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-red-400 transition-colors"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>

      </div>
    </nav>
  )
}

export default Navbar
