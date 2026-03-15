// src/pages/AdminPage.jsx
import { useState, useEffect } from 'react'
import { Ban, CheckCircle, Trash2, XCircle } from 'lucide-react'
import { authAxios } from '../services/axios'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card   from '../components/ui/Card'

const StatCard = ({ label, value, color = 'text-violet-400' }) => (
  <Card className="text-center">
    <p className={`text-3xl font-bold ${color}`}>{value ?? '—'}</p>
    <p className="text-sm text-gray-400 mt-1">{label}</p>
  </Card>
)

const Tab = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      active ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
    }`}
  >
    {label}
  </button>
)

const AdminPage = () => {
  const navigate = useNavigate()

  const [tab,      setTab]     = useState('users')
  const [stats,    setStats]   = useState(null)
  const [users,    setUsers]   = useState([])
  const [videos,   setVideos]  = useState([])
  const [rooms,    setRooms]   = useState([])
  const [loading,  setLoading] = useState(true)
  const [checking, setChecking]= useState(true)

  // ✅ Hook 1 — verify staff access
  useEffect(() => {
    authAxios.get('/api/users/me/')
      .then(res => {
        if (!res.data.is_staff) {
          navigate('/dashboard')
        } else {
          setChecking(false)
        }
      })
      .catch(() => navigate('/dashboard'))
  }, [])

  // ✅ Hook 2 — fetch admin data (always declared, skips when still checking)
  useEffect(() => {
    if (checking) return
    Promise.all([
      authAxios.get('/api/admin/stats/'),
      authAxios.get('/api/admin/users/'),
      authAxios.get('/api/admin/videos/'),
      authAxios.get('/api/admin/rooms/'),
    ]).then(([s, u, v, r]) => {
      setStats(s.data)
      setUsers(u.data)
      setVideos(v.data)
      setRooms(r.data)
    }).finally(() => setLoading(false))
  }, [checking])

  // ✅ All conditional returns AFTER all hooks
  if (checking || loading) return (
    <div className="flex items-center justify-center h-64 text-white">
      <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
    </div>
  )

  const banUser = async (userId, currentlyActive) => {
    const action = currentlyActive ? 'ban' : 'unban'
    await authAxios.patch(`/api/admin/users/${userId}/`, { action })
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !currentlyActive } : u))
    setStats(prev => prev ? {
      ...prev,
      active_users: prev.active_users + (currentlyActive ? -1 : 1),
      banned_users: prev.banned_users + (currentlyActive ?  1 : -1),
    } : prev)
  }

  const deleteVideo = async (videoId) => {
    if (!window.confirm('Delete this video permanently?')) return
    await authAxios.delete(`/api/admin/videos/${videoId}/`)
    setVideos(prev => prev.filter(v => v.id !== videoId))
    setStats(prev => prev ? { ...prev, total_videos: prev.total_videos - 1 } : prev)
  }

  const closeRoom = async (roomId) => {
    await authAxios.patch(`/api/admin/rooms/${roomId}/`)
    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, is_active: false } : r))
    setStats(prev => prev ? { ...prev, active_rooms: Math.max(0, prev.active_rooms - 1) } : prev)
  }

  const formatSize = (bytes) => {
    if (!bytes) return '—'
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="text-white">
      <h1 className="text-2xl font-bold mb-8">Admin Panel</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Users"  value={stats?.total_users}  />
        <StatCard label="Active Users" value={stats?.active_users} color="text-green-400" />
        <StatCard label="Banned Users" value={stats?.banned_users} color="text-red-400" />
        <StatCard label="Total Videos" value={stats?.total_videos} />
        <StatCard label="Ready Videos" value={stats?.ready_videos} color="text-green-400" />
        <StatCard label="Total Rooms"  value={stats?.total_rooms}  />
        <StatCard label="Active Rooms" value={stats?.active_rooms} color="text-green-400" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <Tab label={`Users (${users.length})`}   active={tab === 'users'}  onClick={() => setTab('users')}  />
        <Tab label={`Videos (${videos.length})`} active={tab === 'videos'} onClick={() => setTab('videos')} />
        <Tab label={`Rooms (${rooms.length})`}   active={tab === 'rooms'}  onClick={() => setTab('rooms')}  />
      </div>

      {/* Users tab */}
      {tab === 'users' && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800">
              <tr className="text-left text-gray-400 text-xs uppercase">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-gray-400">{u.email}</td>
                  <td className="px-4 py-3">
                    {u.is_active
                      ? <span className="text-green-400 flex items-center gap-1"><CheckCircle size={12} /> Active</span>
                      : <span className="text-red-400 flex items-center gap-1"><XCircle size={12} /> Banned</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {!u.is_staff && (
                      <Button
                        size="sm"
                        variant={u.is_active ? 'danger' : 'secondary'}
                        onClick={() => banUser(u.id, u.is_active)}
                      >
                        <Ban size={12} />
                        {u.is_active ? 'Ban' : 'Unban'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Videos tab */}
      {tab === 'videos' && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800">
              <tr className="text-left text-gray-400 text-xs uppercase">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Uploaded</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {videos.map(v => (
                <tr key={v.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-3 font-medium max-w-[200px] truncate">{v.title}</td>
                  <td className="px-4 py-3 text-gray-400">{v.owner_name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      v.status === 'ready'      ? 'bg-green-500/10  text-green-400'  :
                      v.status === 'processing' ? 'bg-yellow-500/10 text-yellow-400' :
                      v.status === 'failed'     ? 'bg-red-500/10    text-red-400'    :
                      'bg-gray-700 text-gray-400'
                    }`}>{v.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{formatSize(v.file_size)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(v.uploaded_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="danger" onClick={() => deleteVideo(v.id)}>
                      <Trash2 size={12} /> Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Rooms tab */}
      {tab === 'rooms' && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800">
              <tr className="text-left text-gray-400 text-xs uppercase">
                <th className="px-4 py-3">Room Name</th>
                <th className="px-4 py-3">Host</th>
                <th className="px-4 py-3">Members</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map(r => (
                <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-gray-400">{r.host_name}</td>
                  <td className="px-4 py-3 text-gray-400">{r.member_count}/{r.max_members}</td>
                  <td className="px-4 py-3">
                    {r.is_active
                      ? <span className="text-green-400 text-xs">Active</span>
                      : <span className="text-gray-500 text-xs">Closed</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {r.is_active && (
                      <Button size="sm" variant="danger" onClick={() => closeRoom(r.id)}>
                        <XCircle size={12} /> Close
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

export default AdminPage
