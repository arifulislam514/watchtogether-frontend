// src/components/VideoPlayer.jsx
import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'
import { ChevronRight, ChevronLeft, ChevronDown, Check, Maximize, Minimize, RotateCw } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE_URL

// ── Small dropdown used for Quality / Audio / Subtitle ────
const TrackMenu = ({ label, icon, items, activeIndex, onChange, accentWhenActive = false, onToggle }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { 
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
        onToggle?.(false)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler) // Added for mobile
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [onToggle])

  const handleToggle = (e) => {
    e.stopPropagation()
    const newState = !open
    setOpen(newState)
    onToggle?.(newState)
  }

  const isActive = accentWhenActive && activeIndex >= 0

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleToggle}
        className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-full font-medium transition-all duration-200 backdrop-blur-md ${
          isActive
            ? 'bg-violet-600/90 text-white shadow-lg shadow-violet-900/20'
            : 'bg-black/40 text-white/90 hover:bg-black/60 hover:text-white'
        }`}
      >
        <span className="opacity-80">{icon}</span>
        <span className="max-w-[64px] truncate">{label}</span>
        <ChevronDown size={12} className={`transition-transform duration-300 opacity-70 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 bottom-[calc(100%+8px)] bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden z-50 min-w-[140px] shadow-2xl py-1 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={(e) => { 
                e.stopPropagation()
                onChange(item.value)
                setOpen(false)
                onToggle?.(false)
              }}
              className={`w-full text-left px-4 py-3 text-xs flex items-center justify-between hover:bg-white/10 transition-colors ${
                item.value === activeIndex ? 'text-violet-400 font-medium' : 'text-gray-300'
              }`}
            >
              <span>{item.label}</span>
              {item.value === activeIndex && <Check size={14} className="text-violet-400 shrink-0" />}
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

  // ✅ New UI States
  const [isIdle, setIsIdle] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const idleTimeout = useRef(null)

  // ── Idle/Auto-hide logic ──────────────────────────────────
  const resetIdleTimer = useCallback(() => {
    setIsIdle(false)
    if (idleTimeout.current) clearTimeout(idleTimeout.current)
    
    // Don't auto-hide if a menu is open or video is paused
    if (!isMenuOpen && !videoRef.current?.paused) {
      idleTimeout.current = setTimeout(() => setIsIdle(true), 3000)
    }
  }, [isMenuOpen])

  useEffect(() => {
    resetIdleTimer()
    return () => { if (idleTimeout.current) clearTimeout(idleTimeout.current) }
  }, [resetIdleTimer])

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

  // ── Fullscreen & Rotation ──────────────────────────────────
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

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current
    if (!container) return

    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen()
        else if (document.webkitExitFullscreen) await document.webkitExitFullscreen()
        
        // Optional: Unlock orientation when exiting fullscreen
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock()
        }
      } else {
        if (container.requestFullscreen) await container.requestFullscreen()
        else if (container.webkitRequestFullscreen) await container.webkitRequestFullscreen()
      }
    } catch (err) {
      console.warn("Fullscreen error:", err)
    }
  }, [])

  // ✅ Force landscape rotation (Mobile)
  const handleRotate = async (e) => {
    e.stopPropagation()
    try {
      // Browsers usually require fullscreen to lock orientation
      if (!document.fullscreenElement) {
        await toggleFullscreen()
      }
      
      if (screen.orientation && screen.orientation.lock) {
        const currentType = screen.orientation.type
        if (currentType.startsWith('portrait')) {
          await screen.orientation.lock('landscape')
        } else {
          await screen.orientation.lock('portrait')
        }
      } else {
        console.warn("Screen orientation API not supported by this browser.")
      }
    } catch (err) {
      console.warn("Could not lock screen orientation. The browser might be blocking it.", err)
    }
  }

  // ── Keyboard controls ──────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      resetIdleTimer() // Wake up UI on keypress
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
          toggleFullscreen()
          break
        case 'm': case 'M':
          e.preventDefault()
          videoRef.current.muted = !videoRef.current.muted
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleFullscreen, resetIdleTimer])

  const flash = (side) => {
    setSeekIndicator(side)
    if (seekTimer.current) clearTimeout(seekTimer.current)
    seekTimer.current = setTimeout(() => setSeekIndicator(null), 700)
  }

  // ── Double-tap seek (mobile) ───────────────────────────────
  const handleTouchEnd = useCallback((e) => {
    resetIdleTimer() // Wake up UI on touch
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
  }, [resetIdleTimer])

  // ── Video event handlers ───────────────────────────────────
  const handlePause  = () => { 
    resetIdleTimer() // Keep UI visible when paused
    if (!isSyncingRef?.current) onPause?.(videoRef.current?.currentTime  || 0) 
  }
  const handlePlay   = () => {
    resetIdleTimer()
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
      className="relative w-full h-full bg-black select-none overflow-hidden group"
      onMouseMove={resetIdleTimer}
      onTouchStart={resetIdleTimer}
      onClick={resetIdleTimer}
      onTouchEnd={handleTouchEnd}
    >
      <style>{`
        video::-webkit-media-controls-fullscreen-button { display: none !important; }
      `}</style>

      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        controls
        controlsList="nofullscreen"
        playsInline
        onPause={handlePause}
        onPlay={handlePlay}
        onSeeked={handleSeeked}
        onWaiting={onBuffer}
        onCanPlay={onBufferEnd}
      />

      {/* Overlays Container */}
      <div className="absolute inset-0 z-[60] pointer-events-none">
        {children}
      </div>

      {/* ✅ Subdued Bottom Gradient (Vignette) for UI contrast */}
      <div 
        className={`absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 to-transparent pointer-events-none transition-opacity duration-500 ${
          isIdle ? 'opacity-0' : 'opacity-100'
        }`} 
      />

      {/* Double-tap indicators */}
      {seekIndicator === 'left' && (
        <div className="absolute left-6 top-1/2 -translate-y-1/2 bg-black/40 backdrop-blur-md rounded-full px-5 py-4 flex items-center gap-0.5 pointer-events-none animate-in fade-in zoom-in-90 duration-200">
          <ChevronLeft size={24} className="text-white" />
          <ChevronLeft size={24} className="text-white -ml-3" />
          <span className="text-white text-sm font-semibold ml-2">5s</span>
        </div>
      )}
      {seekIndicator === 'right' && (
        <div className="absolute right-6 top-1/2 -translate-y-1/2 bg-black/40 backdrop-blur-md rounded-full px-5 py-4 flex items-center gap-0.5 pointer-events-none animate-in fade-in zoom-in-90 duration-200">
          <span className="text-white text-sm font-semibold mr-2">5s</span>
          <ChevronRight size={24} className="text-white" />
          <ChevronRight size={24} className="text-white -ml-3" />
        </div>
      )}

      {/* ── Controls overlay — bottom-right ── */}
      <div 
        className={`absolute ${isFullscreen ? "bottom-16" : "bottom-14"} right-4 flex items-center gap-2 z-[60] transition-all duration-500 ease-out ${
          isIdle ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0 pointer-events-auto'
        }`}
        onMouseEnter={() => { if (idleTimeout.current) clearTimeout(idleTimeout.current) }} // Keep alive while hovering controls
        onMouseLeave={resetIdleTimer}
      >
        
        {levels.length > 0 && (
          <TrackMenu label={qualityLabel()} icon="⚙" items={qualityItems} activeIndex={currentLevel} onChange={switchQuality} onToggle={setIsMenuOpen} />
        )}

        {audioTracks.length > 1 && (
          <TrackMenu label={audioLabel()} icon="♪" items={audioItems} activeIndex={currentAudio} onChange={switchAudio} onToggle={setIsMenuOpen} />
        )}

        {subtitleTracks.length > 0 && (
          <TrackMenu label={subtitleLabel()} icon="CC" items={subtitleItems} activeIndex={currentSubtitle} onChange={switchSubtitle} accentWhenActive={true} onToggle={setIsMenuOpen} />
        )}

        {/* Action Buttons Group */}
        <div className="flex items-center bg-black/40 backdrop-blur-md rounded-full p-1 ml-1">
          
          {/* ✅ Rotate Button (Shows predominantly on touch/mobile logic, but safe to keep visible or hide via CSS) */}
          <button
            onClick={handleRotate}
            className="p-1.5 rounded-full text-white/90 hover:bg-white/20 hover:text-white transition-colors md:hidden" // Hide on md+ screens
            title="Rotate Screen"
          >
            <RotateCw size={16} />
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
            className="p-1.5 rounded-full text-white/90 hover:bg-white/20 hover:text-white transition-colors"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>

      </div>
    </div>
  )
}

export default VideoPlayer