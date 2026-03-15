// src/hooks/useWebRTC.js
import { useRef, useState, useCallback } from 'react'

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
}

const useWebRTC = ({ send, currentUserId }) => {
  const [localStream,  setLocalStream]  = useState(null)
  const [remoteStreams, setRemoteStreams] = useState({})
  const [isMuted,      setIsMuted]      = useState(false)
  const [isVideoOn,    setIsVideoOn]    = useState(false)
  const [callActive,   setCallActive]   = useState(false)

  const peersRef      = useRef({})
  const localStreamRef = useRef(null)

  // ── Start local media ──────────────────────────────────────
  const startMedia = useCallback(async (withVideo = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: withVideo,
      })

      // Start unmuted
      stream.getAudioTracks().forEach(t => t.enabled = true)

      localStreamRef.current = stream
      setLocalStream(stream)
      setCallActive(true)
      setIsMuted(false)
      setIsVideoOn(withVideo)
      return stream
    } catch (_err) {
      console.error('Media access denied')
      return null
    }
  }, [])

  // ── Stop all media ─────────────────────────────────────────
  const stopMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    setLocalStream(null)
    setCallActive(false)
    setIsMuted(false)
    setIsVideoOn(false)

    Object.values(peersRef.current).forEach(pc => pc.close())
    peersRef.current = {}
    setRemoteStreams({})
  }, [])

  // ── Mute / Unmute toggle ───────────────────────────────────
  const toggleMute = useCallback(() => {
    const audioTracks = localStreamRef.current?.getAudioTracks()
    if (!audioTracks) return
    const newMuted = !isMuted
    audioTracks.forEach(t => t.enabled = !newMuted)
    setIsMuted(newMuted)
  }, [isMuted])

  // ── Toggle video only — keep audio running ─────────────────
  const toggleVideo = useCallback(() => {
    if (isVideoOn) {
      // Stop only video tracks — audio keeps running
      localStreamRef.current?.getVideoTracks().forEach(t => {
        t.enabled = false
        t.stop()
      })
      setIsVideoOn(false)
    } else {
      // Add video to existing stream
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(videoStream => {
          const videoTrack = videoStream.getVideoTracks()[0]
          if (!videoTrack) return

          // Add to local stream
          localStreamRef.current?.addTrack(videoTrack)

          // Add to all peer connections
          Object.values(peersRef.current).forEach(pc => {
            pc.addTrack(videoTrack, localStreamRef.current)
          })

          setIsVideoOn(true)
        })
        .catch(() => console.error('Camera access denied'))
    }
  }, [isVideoOn])

  // ── Create peer connection ─────────────────────────────────
  const createPeer = useCallback((targetUserId, isInitiator) => {
    const pc = new RTCPeerConnection(ICE_SERVERS)

    // Add local tracks
    localStreamRef.current?.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current)
    })

    // When remote track arrives
    pc.ontrack = (event) => {
      setRemoteStreams(prev => ({
        ...prev,
        [targetUserId]: event.streams[0]
      }))
    }

    // Send ICE candidates via WebSocket
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        send({
          type:      'WEBRTC_ICE',
          target:    targetUserId,
          candidate: event.candidate,
        })
      }
    }

    peersRef.current[targetUserId] = pc

    // Initiator sends offer
    if (isInitiator) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          send({
            type:   'WEBRTC_OFFER',
            target: targetUserId,
            sdp:    pc.localDescription,
          })
        })
    }

    return pc
  }, [send])

  // ── Handle incoming WebRTC signaling ───────────────────────
  const handleSignaling = useCallback(async (event) => {
    const { type, sender, sdp, candidate, target } = event

    if (target && target !== currentUserId) return

    if (type === 'WEBRTC_OFFER') {
      const pc = createPeer(sender, false)
      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      send({
        type:   'WEBRTC_ANSWER',
        target: sender,
        sdp:    pc.localDescription,
      })
    }

    else if (type === 'WEBRTC_ANSWER') {
      const pc = peersRef.current[sender]
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp))
    }

    else if (type === 'WEBRTC_ICE') {
      const pc = peersRef.current[sender]
      if (pc && candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      }
    }
  }, [createPeer, currentUserId, send])

  return {
    localStream,
    remoteStreams,
    isMuted,
    isVideoOn,
    callActive,
    startMedia,
    stopMedia,
    toggleMute,
    toggleVideo,
    createPeer,
    handleSignaling,
  }
}

export default useWebRTC