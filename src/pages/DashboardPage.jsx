// src/pages/DashboardPage.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Plus, Users, Video, Copy, Check, Trash2 } from 'lucide-react'
import { authAxios } from '../services/axios'
import useProfile from '../hooks/useProfile'
import Button from '../components/ui/Button'
import Input  from '../components/ui/Input'
import Card   from '../components/ui/Card'

const CreateRoomModal = ({ onClose, onCreated }) => {
  const [error, setError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm()

  const onSubmit = async (data) => {
    setError('')
    try {
      const res = await authAxios.post('/api/rooms/', {
        name:        data.name,
        password:    data.password,
        max_members: parseInt(data.max_members) || 10,
      })
      onCreated(res.data)
    } catch (_err) {
      setError('Failed to create room. Try again.')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <Card className="w-full max-w-md">
        <h2 className="text-lg font-semibold mb-6">Create Watch Party Room</h2>
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Input
            label="Room Name"
            placeholder="Movie Night"
            error={errors.name?.message}
            {...register('name', { required: 'Room name is required' })}
          />
          <Input
            label="Password"
            type="password"
            placeholder="Min 4 characters"
            error={errors.password?.message}
            {...register('password', {
              required: 'Password is required',
              minLength: { value: 4, message: 'Minimum 4 characters' }
            })}
          />
          <Input
            label="Max Members (2–15)"
            type="number"
            placeholder="10"
            error={errors.max_members?.message}
            {...register('max_members', {
              min: { value: 2,  message: 'Minimum 2' },
              max: { value: 15, message: 'Maximum 15' }
            })}
          />
          <div className="flex gap-3 mt-2">
            <Button type="button" variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
            <Button type="submit" fullWidth loading={isSubmitting}>Create Room</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

const RoomCard = ({ room, onDelete }) => {
  const navigate      = useNavigate()
  const [copied, setCopied] = useState(false)

  const copyInviteLink = () => {
    const link = `${window.location.origin}/rooms/${room.id}?token=${room.invite_token}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-white">{room.name}</h3>
          <p className="text-sm text-gray-500 mt-1">{room.member_count}/{room.max_members} members</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${
          room.is_active ? 'bg-green-500/10 text-green-400' : 'bg-gray-700 text-gray-400'
        }`}>
          {room.is_active ? 'Active' : 'Closed'}
        </span>
      </div>

      {room.video_detail && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Video size={14} />
          <span className="truncate">{room.video_detail.title}</span>
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" fullWidth onClick={() => navigate(`/rooms/${room.id}`)}>
          Enter Room
        </Button>
        <Button size="sm" variant="secondary" onClick={copyInviteLink} className="shrink-0">
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </Button>
        {/* ✅ Delete room button */}
        <Button size="sm" variant="danger" onClick={() => onDelete(room.id)} className="shrink-0">
          <Trash2 size={14} />
        </Button>
      </div>
    </Card>
  )
}

const DashboardPage = () => {
  const { profile }           = useProfile()
  const [rooms, setRooms]     = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    authAxios.get('/api/rooms/')
      .then(res => setRooms(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  const handleRoomCreated = (room) => {
    setRooms(prev => [room, ...prev])
    setShowModal(false)
  }

  // ✅ Delete room
  const handleDeleteRoom = async (roomId) => {
    if (!window.confirm('Delete this room? All members will be removed.')) return
    try {
      await authAxios.delete(`/api/rooms/${roomId}/`)
      setRooms(prev => prev.filter(r => r.id !== roomId))
    } catch (_err) {
      console.error('Failed to delete room')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome back{profile ? `, ${profile.name}` : ''}! 👋
          </h1>
          <p className="text-gray-400 text-sm mt-1">Ready to watch something together?</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus size={16} /> Create Room
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8 max-w-sm">
        <Card className="text-center">
          <p className="text-2xl font-bold text-violet-400">{rooms.length}</p>
          <p className="text-sm text-gray-400">Your Rooms</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-bold text-violet-400">{profile?.friends_count ?? 0}</p>
          <p className="text-sm text-gray-400">Friends</p>
        </Card>
      </div>

      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Users size={18} className="text-violet-400" /> Your Rooms
      </h2>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading rooms...</p>
      ) : rooms.length === 0 ? (
        <Card className="text-center py-12">
          <Users size={40} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400">No rooms yet</p>
          <p className="text-gray-600 text-sm mt-1">Create a room and invite your friends</p>
          <Button onClick={() => setShowModal(true)} className="mt-4">
            <Plus size={16} /> Create Your First Room
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map(room => (
            <RoomCard key={room.id} room={room} onDelete={handleDeleteRoom} />
          ))}
        </div>
      )}

      {showModal && (
        <CreateRoomModal onClose={() => setShowModal(false)} onCreated={handleRoomCreated} />
      )}
    </div>
  )
}

export default DashboardPage
