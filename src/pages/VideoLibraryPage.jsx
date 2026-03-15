// src/pages/VideoLibraryPage.jsx
import { useState, useEffect, useRef } from 'react'
import { Upload, Video, Trash2, Clock, CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { authAxios } from '../services/axios'
import Button from '../components/ui/Button'
import Card   from '../components/ui/Card'

// Status badge
const StatusBadge = ({ status }) => {
  const config = {
    uploading:  { icon: <Loader size={12} className="animate-spin" />,      text: 'Uploading',   color: 'text-blue-400   bg-blue-400/10'   },
    processing: { icon: <Loader size={12} className="animate-spin" />,      text: 'Processing',  color: 'text-yellow-400 bg-yellow-400/10' },
    ready:      { icon: <CheckCircle size={12} />,                           text: 'Ready',       color: 'text-green-400  bg-green-400/10'  },
    failed:     { icon: <AlertCircle size={12} />,                           text: 'Failed',      color: 'text-red-400    bg-red-400/10'    },
  }
  const c = config[status] || config.processing
  return (
    <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${c.color}`}>
      {c.icon} {c.text}
    </span>
  )
}

// Format bytes
const formatSize = (bytes) => {
  if (!bytes) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
}

// Format duration
const formatDuration = (seconds) => {
  if (!seconds) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Video Card
const VideoCard = ({ video, onDelete }) => {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center shrink-0">
            <Video size={18} className="text-violet-400" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-sm truncate">{video.title}</h3>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
              <span>{formatSize(video.file_size)}</span>
              {video.duration > 0 && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {formatDuration(video.duration)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <StatusBadge status={video.status} />
      </div>

      {/* HLS resolutions — shown when ready */}
      {video.status === 'ready' && (
        <div className="flex gap-2 text-xs">
          {video.url_360p  && <span className="px-2 py-0.5 bg-gray-800 rounded text-gray-400">360p</span>}
          {video.url_720p  && <span className="px-2 py-0.5 bg-gray-800 rounded text-gray-400">720p</span>}
          {video.url_1080p && <span className="px-2 py-0.5 bg-gray-800 rounded text-gray-400">1080p</span>}
        </div>
      )}

      <Button
        variant="danger"
        size="sm"
        onClick={() => onDelete(video.id)}
        className="mt-auto"
      >
        <Trash2 size={14} />
        Delete
      </Button>
    </Card>
  )
}

// Upload Modal
const UploadModal = ({ onClose, onUploaded }) => {
  const [file, setFile]       = useState(null)
  const [title, setTitle]     = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const fileRef               = useRef()

  const handleFileChange = (e) => {
    const f = e.target.files[0]
    if (!f) return
    const allowed = ['video/mp4', 'video/x-matroska']
    if (!allowed.includes(f.type)) {
      setError('Only mp4 and mkv files are allowed.')
      return
    }
    if (f.size > 4 * 1024 * 1024 * 1024) {
      setError('File must be under 4GB.')
      return
    }
    setFile(f)
    setError('')
    if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ''))
  }

  const handleUpload = async () => {
    if (!file || !title.trim()) {
      setError('Please select a file and enter a title.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('title', title)
      formData.append('file', file)
      const res = await authAxios.post('/api/videos/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      onUploaded(res.data)
    } catch (_err) {
      setError('Upload failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <Card className="w-full max-w-md">
        <h2 className="text-lg font-semibold mb-6">Upload Video</h2>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {/* File drop zone */}
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-700 hover:border-violet-500 rounded-xl p-8 text-center cursor-pointer transition-colors mb-4"
        >
          <Upload size={32} className="text-gray-600 mx-auto mb-2" />
          {file ? (
            <p className="text-sm text-green-400">{file.name}</p>
          ) : (
            <>
              <p className="text-sm text-gray-400">Click to select video</p>
              <p className="text-xs text-gray-600 mt-1">MP4 or MKV, max 4GB</p>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/x-matroska,.mkv"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Title input */}
        <div className="flex flex-col gap-1 mb-6">
          <label className="text-sm font-medium text-gray-300">Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Video title"
            className="bg-gray-800 border border-gray-700 focus:border-violet-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 text-sm outline-none"
          />
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button fullWidth loading={loading} onClick={handleUpload}>
            Upload
          </Button>
        </div>
      </Card>
    </div>
  )
}

// Main Page
const VideoLibraryPage = () => {
  const [videos, setVideos]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [showUpload, setShowUpload] = useState(false)

  const fetchVideos = () => {
    authAxios.get('/api/videos/')
      .then(res => setVideos(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchVideos()
  }, [])

  // Poll processing videos every 5 seconds
  useEffect(() => {
    const processing = videos.some(v => v.status === 'processing' || v.status === 'uploading')
    if (!processing) return
    const interval = setInterval(fetchVideos, 5000)
    return () => clearInterval(interval)
  }, [videos])

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this video?')) return
    try {
      await authAxios.delete(`/api/videos/${id}/`)
      setVideos(prev => prev.filter(v => v.id !== id))
    } catch (err) {
      console.error(err)
    }
  }

  const handleUploaded = (video) => {
    setVideos(prev => [video, ...prev])
    setShowUpload(false)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">My Videos</h1>
          <p className="text-gray-400 text-sm mt-1">
            Upload and manage your video library
          </p>
        </div>
        <Button onClick={() => setShowUpload(true)}>
          <Upload size={16} />
          Upload Video
        </Button>
      </div>

      {/* Videos grid */}
      {loading ? (
        <p className="text-gray-500 text-sm">Loading videos...</p>
      ) : videos.length === 0 ? (
        <Card className="text-center py-12">
          <Video size={40} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400">No videos yet</p>
          <p className="text-gray-600 text-sm mt-1">
            Upload a video to get started
          </p>
          <Button onClick={() => setShowUpload(true)} className="mt-4">
            <Upload size={16} />
            Upload Your First Video
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map(video => (
            <VideoCard key={video.id} video={video} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={handleUploaded}
        />
      )}
    </div>
  )
}

export default VideoLibraryPage
