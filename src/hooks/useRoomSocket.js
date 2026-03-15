// src/hooks/useRoomSocket.js
import { useEffect, useRef, useCallback } from 'react'

const useRoomSocket = ({ roomId, token, onEvent }) => {
  const socketRef  = useRef(null)
  const onEventRef = useRef(onEvent)

  // ✅ Always keep the latest onEvent without reconnecting the WebSocket
  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (!roomId || !token) return

    const WS_BASE = import.meta.env.VITE_WS_BASE_URL
    const url     = `${WS_BASE}/ws/rooms/${roomId}/?token=${token}`

    socketRef.current = new WebSocket(url)

    socketRef.current.onopen = () => {
      console.log('WebSocket connected')
    }

    socketRef.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        // ✅ Always call the LATEST version of onEvent via ref — no stale closure
        onEventRef.current(data)
      } catch (_err) {
        console.error('WS parse error', _err)
      }
    }

    socketRef.current.onclose = (e) => {
      console.log('WebSocket closed:', e.code)
    }

    socketRef.current.onerror = (e) => {
      console.error('WebSocket error:', e)
    }

    return () => {
      socketRef.current?.close()
    }
  }, [roomId, token]) // ✅ Only reconnect when roomId or token changes, NOT on every render

  const send = useCallback((data) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data))
    }
  }, [])

  return { send }
}

export default useRoomSocket
