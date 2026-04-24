// src/components/VideoPlayer.jsx
import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'
// ✅ Added Maximize and Minimize icons
import { ChevronRight, ChevronLeft, ChevronDown, Check, Maximize, Minimize } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE_URL

// ── Small dropdown used for Quality / Audio / Subtitle ────
const TrackMenu = ({ label, icon, items, activeIndex, onChange, accentWhenActive = false }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isActive = accentWhenActive && activeIndex >= 0

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors border backdrop-blur-sm ${
          isActive
            ? 'bg-violet-600 border-violet-500 text-white'
            : 'bg-black/75 border-white/15 text-white hover:bg-black/90'
        }`}
      >
        <span>{icon}</span>
        <span className="max-w-[56px] truncate">{label}</span>
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 bottom-[calc(100%+6px)] bg-gray-950 border border-gray-700 rounded-xl overflow-hidden z-40 min-w-[130px] shadow-2xl">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); onChange(item.value); setOpen(false) }}
              className={`w-full text-left px-3 py-2.5 text-xs flex items-center justify-between hover:bg-gray-800 transition-colors ${
                item.value === activeIndex ? 'text-violet-400 font-semibold' : 'text-gray-200'
              }`}
            >
              <span>{item.label}</span>
              {item.value === activeIndex && <Check size={11} className="text-violet-400 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const VideoPlayer = ({
  masterUrl,
  onPause,
  onPlay,
  onSeeked,
  onBuffer,
  onBufferEnd,
  videoRef: externalRef,
  isSyncingRef,
  blockedRef,
  children,
}) => {
  const internalRef  = useRef(null)
  const videoRef     = externalRef || internalRef
  const hlsRef       = useRef(null)
  const containerRef = useRef(null)

  const [levels,         setLevels]         = useState([])
  const [currentLevel,   setCurrentLevel]   = useState(-1)
  const [audioTracks,    setAudioTracks]    = useState([])
  const [currentAudio,   setCurrentAudio]   = useState(0)
  const [subtitleTracks, setSubtitleTracks] = useState([])
  const [currentSubtitle,setCurrentSubtitle]= useState(-1)

  const [seekIndicator,  setSeekIndicator]  = useState(null)
  const seekTimer  = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const lastTapRef = useRef({ side: null, time: 0 })

  // ── Load HLS ───────────────────────────────────────────────
  useEffect(() => {
    if (!masterUrl || !videoRef.current) return
    const fullUrl = masterUrl.startsWith('http') ? masterUrl : `${API_BASE}${masterUrl}`

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker:   true,
        startLevel:     -1,
        renderTextTracksNatively: true,
      })
      hlsRef.current = hls
      hls.loadSource(fullUrl)
      hls.attachMedia(videoRef.current)

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => { setLevels(data.levels || []) })
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => { setAudioTracks(data.audioTracks || []) })
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_, data) => { setSubtitleTracks(data.subtitleTracks || []) })

      hls.on(Hls.Events.LEVEL_SWITCHED,        (_, d) => setCurrentLevel(d.level))
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED,  (_, d) => setCurrentAudio(d.id))
      hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (_, d) => setCurrentSubtitle(d.id))

    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = fullUrl
    }

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
      if (seekTimer.current) clearTimeout(seekTimer.current)
    }
  }, [masterUrl])

  // ── Fullscreen handling ───────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    const container = containerRef.current
    if (!video || !container) return

    const originalRequestFullscreen = video.requestFullscreen?.bind(video)
    video.requestFullscreen = () => container.requestFullscreen()

    if (video.webkitRequestFullscreen) {
      video.webkitRequestFullscreen = () =>
        container.webkitRequestFullscreen?.() || container.requestFullscreen()
    }

    const onChange = () => setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)

    return () => {
      if (originalRequestFullscreen) video.requestFullscreen = originalRequestFullscreen
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [])

  // ✅ Robust manual fullscreen toggle logic
  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen()
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen()
    } else {
      if (container.requestFullscreen) container.requestFullscreen()
      else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen()
    }
  }, [])

  // ── Keyboard controls ──────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!videoRef.current) return
      switch (e.key) {
        case ' ': case 'k':
          e.preventDefault()
          videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause()
          break
        case 'ArrowRight':
          e.preventDefault()
          videoRef.current.currentTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + 5)
          flash('right')
          break
        case 'ArrowLeft':
          e.preventDefault()
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5)
          flash('left')
          break
        case 'ArrowUp':   e.preventDefault(); videoRef.current.volume = Math.min(1, videoRef.current.volume + 0.1); break
        case 'ArrowDown': e.preventDefault(); videoRef.current.volume = Math.max(0, videoRef.current.volume - 0.1); break
        case 'f': case 'F':
          e.preventDefault()
          toggleFullscreen() // ✅ Centralized
          break
        case 'm': case 'M':
          e.preventDefault()
          videoRef.current.muted = !videoRef.current.muted
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleFullscreen])

  const flash = (side) => {
    setSeekIndicator(side)
    if (seekTimer.current) clearTimeout(seekTimer.current)
    seekTimer.current = setTimeout(() => setSeekIndicator(null), 700)
  }

  // ── Double-tap seek (mobile) ───────────────────────────────
  const handleTouchEnd = useCallback((e) => {
    if (!videoRef.current) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const tapX  = e.changedTouches[0].clientX
    const side  = tapX < rect.left + rect.width / 2 ? 'left' : 'right'
    const now   = Date.now()
    const last  = lastTapRef.current

    if (last.side === side && now - last.time < 300) {
      if (side === 'left') {
        videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5)
      } else {
        videoRef.current.currentTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + 5)
      }
      flash(side)
      lastTapRef.current = { side: null, time: 0 }
    } else {
      lastTapRef.current = { side, time: now }
    }
  }, [])

  // ── Video event handlers ───────────────────────────────────
  const handlePause  = () => { if (!isSyncingRef?.current) onPause?.(videoRef.current?.currentTime  || 0) }
  const handlePlay   = () => {
    if (isSyncingRef?.current) return
    if (blockedRef?.current) {
      isSyncingRef.current = true
      videoRef.current?.pause()
      setTimeout(() => { isSyncingRef.current = false }, 300)
      return
    }
    onPlay?.(videoRef.current?.currentTime || 0)
  }
  const handleSeeked = () => { if (!isSyncingRef?.current) onSeeked?.(videoRef.current?.currentTime || 0) }

  // ── Track switch helpers ───────────────────────────────────
  const switchQuality  = (v) => { if (hlsRef.current) { hlsRef.current.currentLevel  = v; setCurrentLevel(v)   } }
  const switchAudio    = (v) => { if (hlsRef.current) { hlsRef.current.audioTrack    = v; setCurrentAudio(v)   } }
  const switchSubtitle = (v) => {
    if (hlsRef.current) {
      hlsRef.current.subtitleTrack = v
      if (videoRef.current?.textTracks) {
        Array.from(videoRef.current.textTracks).forEach((track, i) => {
          track.mode = (v >= 0 && i === v) ? 'showing' : 'hidden'
        })
      }
      setCurrentSubtitle(v)
    }
  }

  // ── Menu items ─────────────────────────────────────────────
  const qualityItems = [
    { label: 'Auto', value: -1 },
    ...[...levels].reverse().map((l, i) => ({ label: `${l.height}p`, value: levels.length - 1 - i }))
  ]
  const audioItems = audioTracks.map((t, i) => ({ label: t.name || t.lang || `Track ${i + 1}`, value: i }))
  const subtitleItems = [
    { label: 'Off', value: -1 },
    ...subtitleTracks.map((t, i) => ({ label: t.name || t.lang || `Sub ${i + 1}`, value: i }))
  ]

  const qualityLabel = () => {
    if (currentLevel === -1) return 'Auto'
    return levels[currentLevel] ? `${levels[currentLevel].height}p` : 'Auto'
  }
  const audioLabel = () => {
    if (!audioTracks[currentAudio]) return 'Audio'
    return audioTracks[currentAudio].name || audioTracks[currentAudio].lang || 'Audio'
  }
  const subtitleLabel = () => {
    if (currentSubtitle === -1) return 'CC'
    const t = subtitleTracks[currentSubtitle]
    return t ? (t.name || t.lang || 'CC') : 'CC'
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black select-none"
      onClick={() => {}}
      onTouchEnd={handleTouchEnd}
    >
      {/* ✅ Forces the native fullscreen button to hide in Safari/Chrome */}
      <style>{`
        video::-webkit-media-controls-fullscreen-button {
          display: none !important;
        }
      `}</style>

      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        controls
        controlsList="nofullscreen" // ✅ Hides native fullscreen button in Chrome/Edge
        playsInline                 // ✅ Stops iOS from hijacking to native player
        onPause={handlePause}
        onPlay={handlePlay}
        onSeeked={handleSeeked}
        onWaiting={onBuffer}
        onCanPlay={onBufferEnd}
      />

      {/* ✅ Forces children to stay ON TOP. 
          pointer-events-none lets users click the video behind it. 
          If your messages need to be clickable, add 'pointer-events-auto' to the message component itself. */}
      <div className="absolute inset-0 z-[60] pointer-events-none">
        {children}
      </div>

      {/* ── Double-tap indicators ──────────────────────────── */}
      {seekIndicator === 'left' && (
        <div className="absolute left-6 top-1/2 -translate-y-1/2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-3 flex items-center gap-0.5 pointer-events-none">
          <ChevronLeft size={18} className="text-white" />
          <ChevronLeft size={18} className="text-white -ml-2.5" />
          <span className="text-white text-xs font-semibold ml-1.5">5s</span>
        </div>
      )}
      {seekIndicator === 'right' && (
        <div className="absolute right-6 top-1/2 -translate-y-1/2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-3 flex items-center gap-0.5 pointer-events-none">
          <span className="text-white text-xs font-semibold mr-1.5">5s</span>
          <ChevronRight size={18} className="text-white" />
          <ChevronRight size={18} className="text-white -ml-2.5" />
        </div>
      )}

      {/* ── Controls overlay — bottom-right above native controls ── */}
      <div className={`absolute ${isFullscreen ? "bottom-16" : "bottom-14"} right-3 flex items-center gap-1.5 z-[60]`}>
        
        {levels.length > 0 && (
          <TrackMenu label={qualityLabel()} icon="⚙" items={qualityItems} activeIndex={currentLevel} onChange={switchQuality} />
        )}

        {audioTracks.length > 1 && (
          <TrackMenu label={audioLabel()} icon="♪" items={audioItems} activeIndex={currentAudio} onChange={switchAudio} />
        )}

        {subtitleTracks.length > 0 && (
          <TrackMenu label={subtitleLabel()} icon="CC" items={subtitleItems} activeIndex={currentSubtitle} onChange={switchSubtitle} accentWhenActive={true} />
        )}

        {/* ✅ Custom Fullscreen Toggle Button added to your bottom-right overlay */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
          className="flex items-center justify-center p-1.5 ml-1 rounded-lg bg-black/75 border border-white/15 text-white hover:bg-black/90 transition-colors backdrop-blur-sm"
          title="Toggle Fullscreen"
        >
          {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
        </button>

      </div>
    </div>
  )
}

export default VideoPlayer
