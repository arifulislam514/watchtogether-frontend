# WatchTogether — Frontend

A React-based frontend for WatchTogether, a real-time synchronized video-watching platform. Watch videos together with friends in sync — with chat, voice calls, and multi-audio/subtitle support.

**Live App:** https://watchtogether-frontend.vercel.app

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + Vite 6 |
| Styling | Tailwind CSS v4 |
| Routing | React Router DOM v7 |
| HTTP Client | Axios (two clients: public + auth) |
| Video Player | hls.js |
| Voice Calls | WebRTC (peer-to-peer, no third-party SDK) |
| Forms | react-hook-form |
| Icons | lucide-react + FontAwesome |
| Deployment | Vercel |

---

## Features

**Synchronized Playback**
- All members play, pause, and seek in sync via WebSocket events
- 300ms sync window prevents echo loops
- Periodic drift correction (every 2 seconds, corrects if >1.5s off)
- Buffering detection — shows "Waiting for [user]..." overlay when someone's network is slow

**Video Player**
- HLS adaptive streaming via hls.js
- Quality selector (360p / 480p / 720p / 1080p)
- Multi-audio track switching
- Subtitle track switching (WebVTT)
- Keyboard controls and double-tap mobile seek

**Rooms**
- Password-protected rooms
- Ready gate — playback only starts when everyone is ready
- Host can remove members, select video, close room
- Chat overlay on player + sidebar chat panel
- Member list with ready status indicators

**Voice Calls**
- Peer-to-peer audio via WebRTC (no Agora, no Twilio)
- VOICE_JOIN/LEAVE signaling through the room WebSocket
- Mute/unmute toggle
- Multiple participants supported

**Video Upload**
- Direct upload to Cloudflare R2 via presigned URLs (bypasses server)
- Supports MP4 and MKV, up to 4GB
- Real-time upload progress bar
- User selects transcoding qualities (360p/480p/720p/1080p, 1080p off by default)
- Processing progress bar with ETA estimate

---

## Project Structure

```
watchtogether-frontend/
├── src/
│   ├── pages/
│   │   ├── LoginPage.jsx
│   │   ├── RegisterPage.jsx
│   │   ├── DashboardPage.jsx
│   │   ├── RoomPage.jsx          # Main room — sync engine + WebRTC
│   │   ├── VideoLibraryPage.jsx  # Upload + manage videos
│   │   ├── ProfilePage.jsx
│   │   └── AdminPage.jsx
│   ├── components/
│   │   ├── VideoPlayer.jsx       # hls.js player + quality/audio/sub selectors
│   │   └── ui/
│   │       └── Button.jsx
│   ├── hooks/
│   │   ├── useAuth.js            # Auth context consumer
│   │   ├── useRoomSocket.js      # Stable WebSocket connection + onEventRef
│   │   └── useWebRTC.js          # Full WebRTC peer connection management
│   ├── context/
│   │   └── AuthContext.jsx       # JWT storage + token refresh
│   ├── services/
│   │   └── axios.js              # publicAxios + authAxios instances
│   ├── routes/
│   │   └── PrivateRoute.jsx
│   └── layouts/
│       └── MainLayout.jsx
├── index.html
└── vite.config.js
```

---

## Sync System

The sync engine lives in `RoomPage.jsx` and uses refs to avoid stale closure issues.

```
User presses Play
  → handlePlay() → send({ type: 'PLAY', timestamp })
  → Other users receive PLAY event
  → applyRemote(() => video.play()) sets isSyncingRef=true for 300ms
  → Video events during that window are ignored (no echo broadcast)

Every 2 seconds while playing:
  → send({ type: 'SYNC_TIME', timestamp: video.currentTime })
  → Each peer checks: |myTime - remoteTime| > 1.5s → correct drift

When member joins:
  → Playing members send SYNC_STATE after 1.5s delay
  → New member seeks + plays to match

Buffering:
  → onWaiting fires → send NETWORK_WAIT (only after manual play + 800ms debounce)
  → Other members see "Waiting for [user]..." and pause
  → iSentNetworkWaitRef prevents cross-wait deadlock
  → blockNetworkWaitUntilRef blocks for 5s after allReady auto-play
```

---

## WebRTC Voice Flow

```
User A clicks "Join Voice"
  → getUserMedia({ audio: true })
  → send({ type: 'VOICE_JOIN' })

User B receives VOICE_JOIN
  → if already in call: createPeer(userA, isInitiator=true)
  → pc.createOffer() → send WEBRTC_OFFER to User A

User A receives WEBRTC_OFFER
  → createPeer(userB, isInitiator=false)
  → pc.setRemoteDescription() → createAnswer() → send WEBRTC_ANSWER

ICE candidates exchange via WEBRTC_ICE messages
  → Audio connection established
  → Remote stream plays through hidden <audio> element
```

---

## Key Hooks

### `useRoomSocket`
Maintains a stable WebSocket connection. Uses `onEventRef` pattern to avoid reconnects when the event handler changes. Reconnects automatically on drop.

### `useWebRTC`
Manages all peer connections. Key functions:
- `startMedia()` — gets mic, broadcasts VOICE_JOIN
- `stopMedia()` — closes all peers, broadcasts VOICE_LEAVE
- `onRemoteVoiceJoin(userId)` — creates peer as initiator when someone else joins
- `onRemoteVoiceLeave(userId)` — closes peer connection when someone leaves
- `handleSignaling(event)` — handles OFFER/ANSWER/ICE events

### `useAuth`
Reads JWT from `localStorage.authTokens`, exposes `user` and `tokens`. Auth header format: `JWT {token}`.

---

## Local Development

### Requirements
- Node.js 18+
- Backend running locally (see backend README)

### Setup

```bash
git clone https://github.com/arifulislam514/watchtogether-frontend
cd watchtogether-frontend

npm install
```

Create `.env` in the project root:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_BASE_URL=ws://localhost:8000
```

Start the dev server:

```bash
npm run dev
```

App runs at `http://localhost:5173`.

---

## Deployment (Vercel)

1. Connect the GitHub repo to Vercel
2. Set environment variables:
   ```
   VITE_API_BASE_URL=https://watchtogether-backend-jw7b.onrender.com
   VITE_WS_BASE_URL=wss://watchtogether-backend-jw7b.onrender.com
   ```
3. Build command: `npm run build`
4. Output directory: `dist`

Vercel auto-deploys on every push to `main`.

---

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Backend HTTP base URL |
| `VITE_WS_BASE_URL` | Backend WebSocket base URL |

---

## Author

**Ariful Islam** — [GitHub](https://github.com/arifulislam514) · [Portfolio](https://ariful-islam-iota.vercel.app)
