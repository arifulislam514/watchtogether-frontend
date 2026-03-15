// src/components/VideoPlayer.jsx
import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { Settings, Music, Subtitles } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE_URL

const VideoPlayer = ({
  masterUrl,
  onPause,
  onPlay,
  onSeeked,
  onBuffer,
  onBufferEnd,
  videoRef: externalRef,
  isSyncingRef,   // when true, video events are ignored (remote command in progress)
}) => {
  const internalRef = useRef(null)
  const videoRef    = externalRef || internalRef
  const hlsRef      = useRef(null)

  const [levels,          setLevels]          = useState([])
  const [currentLevel,    setCurrentLevel]    = useState(-1)
  const [audioTracks,     setAudioTracks]     = useState([])
  const [currentAudio,    setCurrentAudio]    = useState(0)
  const [subtitleTracks,  setSubtitleTracks]  = useState([])
  const [currentSubtitle, setCurrentSubtitle] = useState(-1)
  const [showMenu,        setShowMenu]        = useState(null)

  useEffect(() => {
    if (!masterUrl || !videoRef.current) return

    const fullUrl = masterUrl.startsWith('http')
      ? masterUrl
      : `${API_BASE}${masterUrl}`

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, startLevel: -1 })
      hlsRef.current = hls
      hls.loadSource(fullUrl)
      hls.attachMedia(videoRef.current)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLevels(hls.levels || [])
        setAudioTracks(hls.audioTracks || [])
        setSubtitleTracks(hls.subtitleTracks || [])
        // BUG FIX 2: init from hls.audioTrack, not hardcoded 0
        setCurrentAudio(hls.audioTrack ?? 0)
      })

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => setCurrentLevel(data.level))

      // BUG FIX 3: keep currentAudio in sync if hls switches automatically
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, data) => setCurrentAudio(data.id))

      // BUG FIX 5: keep currentSubtitle in sync if hls switches automatically
      hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (_, data) =>
        setCurrentSubtitle(data.id ?? -1)
      )
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS — no hls.js events, native controls handle tracks
      videoRef.current.src = fullUrl
    }

    return () => { hlsRef.current?.destroy(); hlsRef.current = null }
  }, [masterUrl])

  // Only fire callbacks when NOT syncing from remote command
  const handlePause  = () => { if (!isSyncingRef?.current) onPause?.(videoRef.current?.currentTime  || 0) }
  const handlePlay   = () => { if (!isSyncingRef?.current) onPlay?.(videoRef.current?.currentTime   || 0) }
  const handleSeeked = () => { if (!isSyncingRef?.current) onSeeked?.(videoRef.current?.currentTime || 0) }

  const switchQuality = (i) => {
    if (hlsRef.current) { hlsRef.current.currentLevel = i; setCurrentLevel(i) }
    setShowMenu(null)
  }

  const switchAudio = (i) => {
    if (hlsRef.current) {
      hlsRef.current.audioTrack = i
      setCurrentAudio(i)
    }
    setShowMenu(null)
  }

  // BUG FIX 4: toggle subtitleDisplay alongside subtitleTrack
  const switchSubtitle = (i) => {
    if (hlsRef.current) {
      hlsRef.current.subtitleTrack   = i
      hlsRef.current.subtitleDisplay = i !== -1
      setCurrentSubtitle(i)
    }
    setShowMenu(null)
  }

  const qualityLabel = (i) => i === -1 ? 'Auto' : (levels[i] ? `${levels[i].height}p` : 'Auto')

  return (
    <div className="relative w-full h-full bg-black" onClick={() => showMenu && setShowMenu(null)}>
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        controls
        onPause={handlePause}
        onPlay={handlePlay}
        onSeeked={handleSeeked}
        onWaiting={onBuffer}
        onCanPlay={onBufferEnd}
      />

      <div className="absolute top-3 right-3 flex gap-2" onClick={e => e.stopPropagation()}>

        {/* Quality selector */}
        {levels.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(showMenu === 'quality' ? null : 'quality')}
              className="bg-black/70 hover:bg-black/90 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1 backdrop-blur-sm"
            >
              <Settings size={11} />{qualityLabel(currentLevel)}
            </button>
            {showMenu === 'quality' && (
              <div className="absolute right-0 top-8 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden z-20 min-w-[80px] shadow-xl">
                <button
                  onClick={() => switchQuality(-1)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-800 ${currentLevel === -1 ? 'text-violet-400' : 'text-white'}`}
                >
                  Auto
                </button>
                {[...levels].reverse().map((level, i) => {
                  const ri = levels.length - 1 - i
                  return (
                    <button
                      key={ri}
                      onClick={() => switchQuality(ri)}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-800 ${currentLevel === ri ? 'text-violet-400' : 'text-white'}`}
                    >
                      {level.height}p
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* BUG FIX 1: > 0 instead of > 1 — show for any named audio track */}
        {audioTracks.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(showMenu === 'audio' ? null : 'audio')}
              className="bg-black/70 hover:bg-black/90 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1 backdrop-blur-sm"
            >
              <Music size={11} />
              {audioTracks[currentAudio]?.name || audioTracks[currentAudio]?.lang || 'Audio'}
            </button>
            {showMenu === 'audio' && (
              <div className="absolute right-0 top-8 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden z-20 min-w-[110px] shadow-xl">
                {audioTracks.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => switchAudio(i)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-800 ${currentAudio === i ? 'text-violet-400' : 'text-white'}`}
                  >
                    {t.name || t.lang || `Track ${i + 1}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Subtitle selector */}
        {subtitleTracks.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(showMenu === 'subtitle' ? null : 'subtitle')}
              className="bg-black/70 hover:bg-black/90 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1 backdrop-blur-sm"
            >
              <Subtitles size={11} />
              {currentSubtitle === -1
                ? 'CC'
                : (subtitleTracks[currentSubtitle]?.name || subtitleTracks[currentSubtitle]?.lang || 'CC')}
            </button>
            {showMenu === 'subtitle' && (
              <div className="absolute right-0 top-8 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden z-20 min-w-[110px] shadow-xl">
                <button
                  onClick={() => switchSubtitle(-1)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-800 ${currentSubtitle === -1 ? 'text-violet-400' : 'text-white'}`}
                >
                  Off
                </button>
                {subtitleTracks.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => switchSubtitle(i)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-800 ${currentSubtitle === i ? 'text-violet-400' : 'text-white'}`}
                  >
                    {t.name || t.lang || `Sub ${i + 1}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

export default VideoPlayer
