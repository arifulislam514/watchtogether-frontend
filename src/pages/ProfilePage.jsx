// src/pages/ProfilePage.jsx
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { User, Mail, Users, Search } from 'lucide-react'
import { authAxios } from '../services/axios'
import useProfile from '../hooks/useProfile'
import Button from '../components/ui/Button'
import Input  from '../components/ui/Input'
import Card   from '../components/ui/Card'

const ProfilePage = () => {
  const { profile, updateProfile } = useProfile()
  const [success, setSuccess]      = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [sentRequests, setSentRequests]   = useState([])

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm()

  const onSaveProfile = async (data) => {
    setSuccess('')
    try {
      const formData = new FormData()
      formData.append('name', data.name)
      if (data.avatar?.[0]) formData.append('avatar', data.avatar[0])
      await updateProfile(formData)
      setSuccess('Profile updated successfully!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      console.error(err)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    try {
      const res = await authAxios.get(`/api/users/search/?q=${searchQuery}`)
      setSearchResults(res.data)
    } catch (err) {
      console.error(err)
    }
  }

  const sendFriendRequest = async (userId) => {
    try {
      await authAxios.post('/api/friend-requests/', { receiver: userId })
      setSentRequests(prev => [...prev, userId])
    } catch (err) {
      console.error(err)
    }
  }

  if (!profile) return <p className="text-gray-500">Loading profile...</p>

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-8">Profile</h1>

      {/* Profile Card */}
      <Card className="mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-violet-600 rounded-full flex items-center justify-center text-2xl font-bold">
            {profile.avatar
              ? <img src={`http://localhost:8000${profile.avatar}`} className="w-full h-full rounded-full object-cover" alt="avatar" />
              : profile.name?.[0]?.toUpperCase()
            }
          </div>
          <div>
            <h2 className="font-semibold text-lg">{profile.name}</h2>
            <p className="text-gray-400 text-sm flex items-center gap-1">
              <Mail size={12} /> {profile.email}
            </p>
            <p className="text-gray-500 text-xs mt-1 flex items-center gap-1">
              <Users size={12} /> {profile.friends_count} friends
            </p>
          </div>
        </div>

        {success && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-lg px-4 py-3 mb-4">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit(onSaveProfile)} className="flex flex-col gap-4">
          <Input
            label="Display Name"
            defaultValue={profile.name}
            error={errors.name?.message}
            {...register('name', { required: 'Name is required' })}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-300">Avatar</label>
            <input
              type="file"
              accept="image/*"
              className="text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-violet-600 file:text-white hover:file:bg-violet-700 file:cursor-pointer"
              {...register('avatar')}
            />
          </div>
          <Button type="submit" loading={isSubmitting} className="w-fit">
            Save Changes
          </Button>
        </form>
      </Card>

      {/* Find Friends */}
      <Card>
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Search size={16} className="text-violet-400" />
          Find Friends
        </h2>

        <div className="flex gap-3 mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search by name or email"
            className="flex-1 bg-gray-800 border border-gray-700 focus:border-violet-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 text-sm outline-none"
          />
          <Button onClick={handleSearch} variant="secondary">
            Search
          </Button>
        </div>

        {searchResults.length > 0 && (
          <div className="flex flex-col gap-3">
            {searchResults.map(user => (
              <div key={user.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-violet-700 rounded-full flex items-center justify-center text-sm font-bold">
                    {user.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={sentRequests.includes(user.id) ? 'secondary' : 'primary'}
                  disabled={sentRequests.includes(user.id)}
                  onClick={() => sendFriendRequest(user.id)}
                >
                  {sentRequests.includes(user.id) ? 'Sent' : 'Add Friend'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

export default ProfilePage
