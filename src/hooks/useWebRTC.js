// src/hooks/useWebRTC.js
// Audio-only WebRTC — video call removed
import { useRef, useState, useCallback } from 'react'

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
}

const useWebRTC = ({ send, currentUserId }) => {
  const [remoteStreams, setRemoteStreams] = useState({})
  const [isMuted,      setIsMuted]       = useState(false)
  const [callActive,   setCallActive]    = useState(false)

  const peersRef       = useRef({})
  const localStreamRef = useRef(null)
  const sendRef        = useRef(send)

  // Keep sendRef current — avoids stale closure in createPeer
  sendRef.current = send

  // ── Create peer connection to one user ─────────────────────
  const createPeer = useCallback((targetUserId, isInitiator) => {
    // Don't create duplicate peers
    if (peersRef.current[targetUserId]) {
      peersRef.current[targetUserId].close()
      delete peersRef.current[targetUserId]
    }

    const pc = new RTCPeerConnection(ICE_SERVERS)

    // Add local audio tracks
    localStreamRef.current?.getTracks().forEach(track => {
      pc.addTrack(track, localStreamRef.current)
    })

    // When remote audio arrives — store the stream
    pc.ontrack = (event) => {
      const stream = event.streams[0]
      if (stream) {
        setRemoteStreams(prev => ({ ...prev, [targetUserId]: stream }))
      }
    }

    // Send ICE candidates through the room WebSocket
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendRef.current({
          type:      'WEBRTC_ICE',
          target:    targetUserId,
          candidate: event.candidate,
        })
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        delete peersRef.current[targetUserId]
        setRemoteStreams(prev => {
          const next = { ...prev }
          delete next[targetUserId]
          return next
        })
      }
    }

    peersRef.current[targetUserId] = pc

    // ✅ Initiator creates and sends offer
    if (isInitiator) {
      pc.createOffer({ offerToReceiveAudio: true })
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          sendRef.current({
            type:   'WEBRTC_OFFER',
            target: targetUserId,
            sdp:    pc.localDescription,
          })
        })
        .catch(err => console.error('[WebRTC] createOffer failed:', err))
    }

    return pc
  }, [])

  // ── Join voice call ────────────────────────────────────────
  const startMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      stream.getAudioTracks().forEach(t => { t.enabled = true })
      localStreamRef.current = stream
      setCallActive(true)
      setIsMuted(false)

      // ✅ Tell everyone I joined — they will initiate peer connections to me
      sendRef.current({ type: 'VOICE_JOIN' })

      return stream
    } catch (err) {
      console.error('[WebRTC] Microphone access denied:', err)
      return null
    }
  }, [])

  // ── Leave voice call ───────────────────────────────────────
  const stopMedia = useCallback(() => {
    // Stop all local tracks
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null

    // Close all peer connections
    Object.values(peersRef.current).forEach(pc => pc.close())
    peersRef.current = {}

    setCallActive(false)
    setIsMuted(false)
    setRemoteStreams({})

    // ✅ Tell everyone I left
    sendRef.current({ type: 'VOICE_LEAVE' })
  }, [])

  // ── Mute / Unmute ──────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks()
    if (!tracks?.length) return
    const newMuted = !isMuted
    tracks.forEach(t => { t.enabled = !newMuted })
    setIsMuted(newMuted)
  }, [isMuted])

  // ── Called from RoomPage when VOICE_JOIN received ──────────
  // If I'm already in the call, I initiate a peer connection to the new user
  const onRemoteVoiceJoin = useCallback((userId) => {
    if (!localStreamRef.current) return  // I'm not in the call
    if (userId === String(currentUserId)) return  // ignore my own echo
    createPeer(userId, true)  // ✅ I am the initiator
  }, [createPeer, currentUserId])

  // ── Called from RoomPage when VOICE_LEAVE received ─────────
  const onRemoteVoiceLeave = useCallback((userId) => {
    if (peersRef.current[userId]) {
      peersRef.current[userId].close()
      delete peersRef.current[userId]
    }
    setRemoteStreams(prev => {
      const next = { ...prev }
      delete next[userId]
      return next
    })
  }, [])

  // ── Handle incoming WebRTC signaling ───────────────────────
  const handleSignaling = useCallback(async (event) => {
    const { type, sender, sdp, candidate, target } = event
    const myId = String(currentUserId)

    // Ignore messages not targeted at me
    if (target && String(target) !== myId) return

    try {
      if (type === 'WEBRTC_OFFER') {
        // Someone sent me an offer — create peer as non-initiator and answer
        const pc = createPeer(sender, false)
        await pc.setRemoteDescription(new RTCSessionDescription(sdp))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        sendRef.current({
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
    } catch (err) {
      console.error('[WebRTC] Signaling error:', type, err)
    }
  }, [createPeer, currentUserId])

  return {
    remoteStreams,
    isMuted,
    callActive,
    startMedia,
    stopMedia,
    toggleMute,
    onRemoteVoiceJoin,
    onRemoteVoiceLeave,
    handleSignaling,
  }
}

export default useWebRTC
