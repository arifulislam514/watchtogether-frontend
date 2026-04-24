// src/pages/RoomPage.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  Mic, MicOff, Phone, PhoneOff,
  Send, CheckCircle, Circle, LogOut, Settings, Video,
  Users, MessageSquare,
} from "lucide-react";
import { authAxios } from "../services/axios";
import useAuth from "../hooks/useAuth";
import useRoomSocket from "../hooks/useRoomSocket";
import useWebRTC from "../hooks/useWebRTC";
import VideoPlayer from "../components/VideoPlayer";
import Button from "../components/ui/Button";

// ── Chat overlay — rendered inside VideoPlayer container (visible in fullscreen) ──
// Shows last 4 persistent chat messages so they're always visible in fullscreen
const ChatOverlay = ({ messages }) => {
  if (!messages.length) return null
  return (
    <div className="absolute bottom-20 left-3 flex flex-col gap-1.5 pointer-events-none z-20 max-w-[260px]">
      {messages.map((msg, i) => (
        <div
          key={i}
          style={{ animation: "fadeInOut 4s ease forwards" }}
          className="bg-black/75 text-white px-3 py-1.5 rounded-lg backdrop-blur-sm shadow-lg"
        >
          <span className="text-violet-400 font-semibold text-xs">{msg.user_name}: </span>
          <span className="text-xs break-words">{msg.text}</span>
        </div>
      ))}
      <style>{`
        @keyframes fadeInOut {
          0%   { opacity: 0; transform: translateY(6px); }
          10%  { opacity: 1; transform: translateY(0); }
          70%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}

// ── Chat panel (messages list + input) — defined at MODULE level to prevent remount ──
// ⚠️ MUST be outside RoomPage — if defined inside, React remounts on every render
// causing the input to lose focus after every single character typed.
const ChatPanel = ({ messages, chatInput, setChatInput, onSend, endRef }) => (
  <>
    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 min-h-0">
      {messages.map((msg, i) => (
        <div key={i}>
          <span className="text-violet-400 text-xs font-medium">{msg.user_name}</span>
          <p className="text-sm text-gray-300 break-words">{msg.text}</p>
        </div>
      ))}
      <div ref={endRef} />
    </div>
    <div className="p-3 border-t border-gray-800 flex gap-2 shrink-0">
      <input
        type="text"
        value={chatInput}
        onChange={(e) => setChatInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSend()}
        placeholder="Say something..."
        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-violet-500"
      />
      <button
        onClick={onSend}
        className="p-2 bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors shrink-0"
      >
        <Send size={14} />
      </button>
    </div>
  </>
)

const MemberItem = ({ member, isHost, onRemove, currentUserId }) => (
  <div className="flex items-center justify-between py-2">
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 bg-violet-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
        {member.user_name?.[0]?.toUpperCase()}
      </div>
      <span className="text-sm truncate">
        {member.user_name}
        {member.user === currentUserId && (
          <span className="text-gray-500 text-xs ml-1">(you)</span>
        )}
      </span>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      {member.is_ready ? (
        <CheckCircle size={14} className="text-green-400" />
      ) : (
        <Circle size={14} className="text-gray-600" />
      )}
      {isHost && member.user !== currentUserId && (
        <button
          onClick={() => onRemove(member.user)}
          className="text-red-400 hover:text-red-300 text-xs"
        >
          Remove
        </button>
      )}
    </div>
  </div>
);

const RoomPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, tokens } = useAuth();

  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [joinPassword, setJoinPassword] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [allReady, setAllReady] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [overlayMsgs, setOverlayMsgs] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [pausedBy, setPausedBy] = useState("");
  const [pausedById, setPausedById] = useState(null);
  const [waiting, setWaiting] = useState(false);
  const [waitingFor, setWaitingFor] = useState("");
  const [selectingVideo, setSelectingVideo] = useState(false);
  const [myVideos, setMyVideos] = useState([]);

  // ── Mobile tab state ───────────────────────────────────────
  const [mobileTab, setMobileTab] = useState("chat"); // "chat" | "members"

  const videoRef = useRef(null);
  const chatEndRef = useRef(null);
  const chatEndMobileRef = useRef(null);

  // ── Core sync refs ─────────────────────────────────────────
  const iSentNetworkWaitRef = useRef(false);
  const blockNetworkWaitUntilRef = useRef(0);
  const isSyncingRef = useRef(false);
  const isPlayingRef = useRef(false);
  const hasPlayedRef = useRef(false);
  const networkWaitTimer = useRef(null);
  const blockedRef = useRef(false);
  const syncIntervalRef = useRef(null);
  const handleSignalingRef = useRef(null);
  const onRemoteVoiceJoinRef = useRef(null);
  const onRemoteVoiceLeaveRef = useRef(null);

  const isHost = room?.host === user?.id;

  const applyRemote = useCallback((fn) => {
    isSyncingRef.current = true;
    fn();
    setTimeout(() => { isSyncingRef.current = false; }, 300);
  }, []);

  const refreshRoom = useCallback(
    () =>
      authAxios
        .get(`/api/rooms/${id}/`)
        .then((res) => { setRoom(res.data); return res.data; })
        .catch(() => {}),
    [id],
  );

  const startSyncBroadcast = useCallback((send) => {
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    syncIntervalRef.current = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        send({ type: "SYNC_TIME", timestamp: videoRef.current.currentTime });
      }
    }, 2000);
  }, []);

  const stopSyncBroadcast = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
  }, []);

  // ── Fetch room ─────────────────────────────────────────────
  useEffect(() => {
    authAxios
      .get(`/api/rooms/${id}/`)
      .then((res) => {
        setRoom(res.data);
        const alreadyMember = res.data.members.some((m) => m.user === user?.id);
        setIsMember(alreadyMember);
        const myMember = res.data.members.find((m) => m.user === user?.id);
        if (myMember) setIsReady(myMember.is_ready);
        const everyoneReady =
          res.data.members.length > 0 &&
          res.data.members.every((m) => m.is_ready);
        setAllReady(everyoneReady || res.data.members.length <= 1);
      })
      .catch(() => navigate("/dashboard"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    chatEndMobileRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ── WebSocket event handler ────────────────────────────────
  const handleEvent = useCallback(
    (event) => {
      const myId = String(user?.id);

      switch (event.type) {
        case "CHAT":
          setChatMessages((prev) => [...prev, event]);
          setOverlayMsgs((prev) => {
            const next = [...prev, event];
            setTimeout(() => setOverlayMsgs((p) => p.slice(1)), 4000);
            return next;
          });
          break;

        case "READY":
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  members: prev.members.map((m) =>
                    m.user === event.user_id
                      ? { ...m, is_ready: event.is_ready }
                      : m,
                  ),
                }
              : prev,
          );
          setAllReady(event.all_ready);
          if (event.all_ready && videoRef.current?.paused) {
            applyRemote(() => videoRef.current.play().catch(() => {}));
            isPlayingRef.current = true;
            hasPlayedRef.current = true;
            blockNetworkWaitUntilRef.current = Date.now() + 5000;
            // ✅ Bug 5 fix: start SYNC_TIME broadcast after allReady auto-play
            startSyncBroadcast(sendRef.current);
          }
          break;

        case "VIDEO_SELECTED":
          refreshRoom();
          break;

        case "PLAY":
          if (event.sender_id === myId) break;
          blockedRef.current = false;
          applyRemote(() => {
            if (videoRef.current) {
              videoRef.current.currentTime = event.timestamp;
              videoRef.current.play().catch(() => {});
            }
          });
          isPlayingRef.current = true;
          hasPlayedRef.current = true;
          setPausedBy("");
          setPausedById(null);
          break;

        case "PAUSE":
          if (event.sender_id === myId) break;
          blockedRef.current = true;
          applyRemote(() => {
            if (videoRef.current) {
              videoRef.current.currentTime = event.timestamp;
              videoRef.current.pause();
            }
          });
          isPlayingRef.current = false;
          if (networkWaitTimer.current) {
            clearTimeout(networkWaitTimer.current);
            networkWaitTimer.current = null;
          }
          iSentNetworkWaitRef.current = false;
          setPausedBy(event.user_name);
          setPausedById(event.sender_id);
          break;

        case "SEEK":
          if (event.sender_id === myId) break;
          applyRemote(() => {
            if (videoRef.current)
              videoRef.current.currentTime = event.timestamp;
          });
          break;

        case "SYNC_TIME":
          if (event.sender_id === myId) break;
          if (videoRef.current && !videoRef.current.paused) {
            const diff = Math.abs(
              videoRef.current.currentTime - event.timestamp,
            );
            if (diff > 1.5) {
              applyRemote(() => {
                videoRef.current.currentTime = event.timestamp;
              });
            }
          }
          break;

        case "NETWORK_WAIT":
          if (event.sender_id === myId) break;
          setWaiting(true);
          setWaitingFor(event.user_name);
          applyRemote(() => {
            if (videoRef.current && !videoRef.current.paused)
              videoRef.current.pause();
          });
          break;

        case "NETWORK_RESUME":
          if (event.sender_id === myId) break;
          setWaiting(false);
          setWaitingFor("");
          if (isPlayingRef.current) {
            applyRemote(() => videoRef.current?.play().catch(() => {}));
          }
          break;

        case "MEMBER_DISCONNECTED":
          blockedRef.current = false;
          if (videoRef.current && !videoRef.current.paused) {
            applyRemote(() => videoRef.current.pause());
            isPlayingRef.current = false;
          }
          stopSyncBroadcast();
          setPausedBy(`${event.user_name} left`);
          setPausedById(null);
          setWaiting(false);
          setWaitingFor("");
          if (networkWaitTimer.current) {
            clearTimeout(networkWaitTimer.current);
            networkWaitTimer.current = null;
          }
          setRoom((prev) => {
            if (!prev) return prev;
            const newMembers = prev.members.filter((m) => m.user !== event.user_id);
            const nowReady = newMembers.length <= 1 || newMembers.every((m) => m.is_ready);
            setAllReady(nowReady);
            return { ...prev, members: newMembers };
          });
          break;

        case "MEMBER_LEFT":
          setWaiting(false);
          setWaitingFor("");
          iSentNetworkWaitRef.current = false;
          setRoom((prev) => {
            if (!prev) return prev;
            const newMembers = prev.members.filter((m) => m.user !== event.user_id);
            const nowReady = newMembers.length <= 1 || newMembers.every((m) => m.is_ready);
            setAllReady(nowReady);
            return { ...prev, members: newMembers };
          });
          break;

        case "MEMBER_JOINED":
          refreshRoom();
          if (hasPlayedRef.current && videoRef.current) {
            setTimeout(() => {
              sendRef.current?.({
                type: "SYNC_STATE",
                timestamp: videoRef.current?.currentTime || 0,
                is_playing: !videoRef.current?.paused,
              });
            }, 1500);
          }
          break;

        case "SYNC_STATE":
          if (event.sender_id === myId) break;
          applyRemote(() => {
            if (videoRef.current) {
              videoRef.current.currentTime = event.timestamp;
              if (event.is_playing) {
                videoRef.current.play().catch(() => {});
                isPlayingRef.current = true;
                hasPlayedRef.current = true;
                // ✅ Bug 6 fix: new joiner starts broadcasting SYNC_TIME
                startSyncBroadcast(sendRef.current);
              }
            }
          });
          break;

        case "VOICE_JOIN":
          if (event.user_id !== String(user?.id)) {
            onRemoteVoiceJoinRef.current?.(event.user_id);
          }
          break;

        case "VOICE_LEAVE":
          onRemoteVoiceLeaveRef.current?.(event.user_id);
          break;

        default:
          if (event.type?.startsWith("WEBRTC_"))
            handleSignalingRef.current?.(event);
      }
    },
    [id, user?.id, refreshRoom, applyRemote, startSyncBroadcast],
  );

  const sendRef = useRef(null);

  const { send } = useRoomSocket({
    roomId: isMember ? id : null,
    token: tokens?.access,
    onEvent: handleEvent,
  });

  useEffect(() => { sendRef.current = send; }, [send]);

  const {
    isMuted, callActive, startMedia, stopMedia,
    toggleMute, remoteStreams,
    onRemoteVoiceJoin, onRemoteVoiceLeave, handleSignaling,
  } = useWebRTC({ send, currentUserId: user?.id });

  useEffect(() => { handleSignalingRef.current    = handleSignaling;    }, [handleSignaling]);
  useEffect(() => { onRemoteVoiceJoinRef.current  = onRemoteVoiceJoin;  }, [onRemoteVoiceJoin]);
  useEffect(() => { onRemoteVoiceLeaveRef.current = onRemoteVoiceLeave; }, [onRemoteVoiceLeave]);

  const handleJoin = async () => {
    setJoining(true);
    setJoinError("");
    const inviteToken = searchParams.get("token");
    try {
      await authAxios.post(`/api/rooms/${id}/join/`, {
        ...(inviteToken
          ? { invite_token: inviteToken }
          : { password: joinPassword }),
      });
      const res = await authAxios.get(`/api/rooms/${id}/`);
      setRoom(res.data);
      setIsMember(true);
    } catch (_err) {
      setJoinError("Invalid password or invite token.");
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    stopSyncBroadcast();
    // ✅ Bug 4 fix: send LEAVE_ROOM BEFORE REST call so
    // check_membership sees removal → disconnect won't broadcast MEMBER_DISCONNECTED
    send({ type: "LEAVE_ROOM" });
    try { await authAxios.post(`/api/rooms/${id}/leave/`); } catch (_err) {}
    navigate("/dashboard");
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    send({ type: "CHAT", text: chatInput });
    setChatInput("");
  };

  const toggleReady = () => {
    send({ type: "READY" });
    setIsReady((prev) => !prev);
  };

  const loadMyVideos = async () => {
    const res = await authAxios.get("/api/videos/");
    setMyVideos(res.data.filter((v) => v.status === "ready"));
    setSelectingVideo(true);
  };

  const selectVideo = async (videoId) => {
    try {
      await authAxios.patch(`/api/rooms/${id}/`, { video: videoId });
      send({ type: "VIDEO_SELECTED" });
      await refreshRoom();
      setSelectingVideo(false);
    } catch (_err) {}
  };

  const removeMember = async (userId) => {
    try {
      await authAxios.delete(`/api/rooms/${id}/members/${userId}/`);
      setRoom((prev) =>
        prev
          ? { ...prev, members: prev.members.filter((m) => m.user !== userId) }
          : prev,
      );
    } catch (_err) {}
  };

  const handlePause = (timestamp) => {
    isPlayingRef.current = false;
    blockedRef.current = false;
    stopSyncBroadcast();
    if (networkWaitTimer.current) {
      clearTimeout(networkWaitTimer.current);
      networkWaitTimer.current = null;
    }
    send({ type: "PAUSE", timestamp });
    setPausedBy("You");
    setPausedById(String(user?.id));
  };

  const handlePlay = (timestamp) => {
    if (pausedById && pausedById !== String(user?.id)) {
      isSyncingRef.current = true;
      videoRef.current?.pause();
      setTimeout(() => { isSyncingRef.current = false; }, 300);
      return;
    }
    isPlayingRef.current = true;
    hasPlayedRef.current = true;
    send({ type: "PLAY", timestamp });
    setPausedBy("");
    setPausedById(null);
    startSyncBroadcast(send);
  };

  const handleSeeked = (timestamp) => { send({ type: "SEEK", timestamp }); };

  const handleBuffer = () => {
    if (!hasPlayedRef.current || !isPlayingRef.current) return;
    if (videoRef.current?.paused) return;
    if (blockedRef.current) return;
    if (Date.now() < blockNetworkWaitUntilRef.current) return;
    if (networkWaitTimer.current) clearTimeout(networkWaitTimer.current);
    networkWaitTimer.current = setTimeout(() => {
      if (videoRef.current?.readyState < 3) {
        iSentNetworkWaitRef.current = true;
        send({ type: "NETWORK_WAIT" });
        setWaiting(true);
        setWaitingFor("You");
      }
    }, 500);
  };

  const handleBufferEnd = () => {
    if (networkWaitTimer.current) {
      clearTimeout(networkWaitTimer.current);
      networkWaitTimer.current = null;
    }
    if (iSentNetworkWaitRef.current) {
      iSentNetworkWaitRef.current = false;
      setWaiting(false);
      setWaitingFor("");
      send({ type: "NETWORK_RESUME" });
    }
  };

  useEffect(() => () => stopSyncBroadcast(), []);

  // ChatInput is defined at module level — see top of file

  // ── Voice controls component ───────────────────────────────
  const VoiceControls = () => (
    <>
      {callActive ? (
        <>
          <button
            onClick={toggleMute}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isMuted
                ? "bg-gray-800 text-gray-400 hover:bg-gray-700"
                : "bg-violet-600 text-white hover:bg-violet-700"
            }`}
          >
            {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
            <span className="hidden sm:inline">{isMuted ? "Unmute" : "Mute"}</span>
          </button>
          <Button size="sm" variant="danger" onClick={stopMedia}>
            <PhoneOff size={14} />
            <span className="hidden sm:inline ml-1">Leave Call</span>
          </Button>
          {Object.keys(remoteStreams).length > 0 && (
            <span className="text-xs text-gray-500">
              🎙 {Object.keys(remoteStreams).length} connected
            </span>
          )}
        </>
      ) : (
        <Button size="sm" onClick={startMedia}>
          <Phone size={14} />
          <span className="ml-1 hidden sm:inline">Join Voice</span>
          <span className="ml-1 sm:hidden">Voice</span>
        </Button>
      )}
      {Object.entries(remoteStreams).map(([userId, stream]) => (
        <audio
          key={userId}
          autoPlay
          playsInline
          ref={(el) => { if (el && el.srcObject !== stream) el.srcObject = stream; }}
        />
      ))}
    </>
  );

  if (loading)
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
        <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
      </div>
    );

  if (!isMember)
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white px-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 w-full max-w-sm text-center">
          <h2 className="text-xl font-bold mb-2">{room?.name}</h2>
          <p className="text-gray-400 text-sm mb-6">Enter the room password to join</p>
          {joinError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
              {joinError}
            </div>
          )}
          <input
            type="password"
            value={joinPassword}
            onChange={(e) => setJoinPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            placeholder="Room password"
            className="w-full bg-gray-800 border border-gray-700 focus:border-violet-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 text-sm outline-none mb-4"
          />
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => navigate("/dashboard")}>Cancel</Button>
            <Button fullWidth loading={joining} onClick={handleJoin}>Join Room</Button>
          </div>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col md:flex-row h-screen bg-gray-950 text-white overflow-hidden">

      {/* ── Video area ─────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">

        {/* Top bar */}
        <div className="flex items-center justify-between px-3 py-2 md:px-4 md:py-3 bg-gray-900 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="font-semibold text-sm md:text-base shrink-0 truncate max-w-[120px] md:max-w-none">
              {room?.name}
            </h1>
            {room?.video_detail && (
              <span className="text-xs md:text-sm text-gray-400 truncate hidden sm:block">
                — {room.video_detail.title}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
            {isHost && (
              <Button size="sm" variant="secondary" onClick={loadMyVideos}>
                <Settings size={13} />
                <span className="hidden sm:inline ml-1">Select Video</span>
              </Button>
            )}
            <Button
              size="sm"
              variant={isReady ? "secondary" : "primary"}
              onClick={toggleReady}
            >
              {isReady ? <CheckCircle size={13} /> : <Circle size={13} />}
              <span className="ml-1 text-xs md:text-sm">{isReady ? "Ready!" : "Ready?"}</span>
            </Button>
            <Button size="sm" variant="danger" onClick={handleLeave}>
              <LogOut size={13} />
              <span className="hidden sm:inline ml-1">Leave</span>
            </Button>
          </div>
        </div>

        {/* Player — takes all remaining vertical space */}
        <div className="relative bg-black overflow-hidden" style={{ flex: "1 1 0", minHeight: 0 }}>
          {room?.video_detail?.master_url ? (
            <>
              {/* ✅ Chat overlay + status overlays passed as children → visible in fullscreen */}
              <VideoPlayer
                masterUrl={room.video_detail.master_url}
                videoRef={videoRef}
                isSyncingRef={isSyncingRef}
                blockedRef={blockedRef}
                onPause={handlePause}
                onPlay={handlePlay}
                onSeeked={handleSeeked}
                onBuffer={handleBuffer}
                onBufferEnd={handleBufferEnd}
              >
                {/* Chat overlay — temporary flash when someone sends a message, visible in fullscreen */}
                <ChatOverlay messages={overlayMsgs} />

                {/* Paused-by banner */}
                {pausedBy && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 text-white text-sm px-4 py-2 rounded-full z-10 whitespace-nowrap pointer-events-none">
                    ⏸ {pausedBy}
                    {pausedById && pausedById !== String(user?.id)
                      ? " — waiting for them to resume"
                      : ""}
                  </div>
                )}

                {/* Network wait overlay */}
                {waiting && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20 pointer-events-none">
                    <div className="bg-gray-900 rounded-xl px-6 py-4 text-center">
                      <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full mx-auto mb-3" />
                      <p className="text-sm">Waiting for {waitingFor}...</p>
                    </div>
                  </div>
                )}

                {/* Ready gate overlay */}
                {!allReady && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20">
                    <div className="bg-gray-900 rounded-xl px-6 md:px-8 py-6 text-center mx-4">
                      <h2 className="text-base md:text-lg font-semibold mb-2">
                        Waiting for everyone
                      </h2>
                      <p className="text-gray-400 text-sm mb-4">
                        All members must be ready before playback starts
                      </p>
                      <Button onClick={toggleReady} variant={isReady ? "secondary" : "primary"}>
                        {isReady ? "✓ You are ready" : "I am Ready"}
                      </Button>
                    </div>
                  </div>
                )}
              </VideoPlayer>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-600">
              <div className="text-center">
                <Video size={48} className="mx-auto mb-3 opacity-30" />
                <p>No video selected</p>
                {isHost && (
                  <Button size="sm" className="mt-3" onClick={loadMyVideos}>
                    Select a Video
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Voice controls bar */}
        <div className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-3 bg-gray-900 border-t border-gray-800 shrink-0 flex-wrap">
          <VoiceControls />
        </div>
      </div>

      {/* ── Sidebar — desktop only ─────────────────────────── */}
      <div className="hidden md:flex w-72 flex-col bg-gray-900 border-l border-gray-800 shrink-0">
        <div className="p-4 border-b border-gray-800">
          <h3 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">
            Members ({room?.members?.length || 0}/{room?.max_members})
          </h3>
          {room?.members?.map((member) => (
            <MemberItem
              key={member.id}
              member={member}
              isHost={isHost}
              onRemove={removeMember}
              currentUserId={user?.id}
            />
          ))}
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-gray-800 shrink-0">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Chat</h3>
          </div>
          <ChatPanel
            messages={chatMessages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            onSend={sendChat}
            endRef={chatEndRef}
          />
        </div>
      </div>

      {/* ── Mobile bottom panel ────────────────────────────── */}
      <div className="md:hidden flex flex-col bg-gray-900 border-t border-gray-800 shrink-0" style={{ height: "45vw", maxHeight: "300px" }}>
        {/* Tabs */}
        <div className="flex border-b border-gray-800 shrink-0">
          <button
            onClick={() => setMobileTab("chat")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
              mobileTab === "chat"
                ? "text-violet-400 border-b-2 border-violet-500"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <MessageSquare size={13} /> Chat
            {chatMessages.length > 0 && (
              <span className="bg-violet-600 text-white text-[10px] rounded-full px-1.5 py-0.5 ml-0.5">
                {chatMessages.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setMobileTab("members")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
              mobileTab === "members"
                ? "text-violet-400 border-b-2 border-violet-500"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <Users size={13} />
            Members ({room?.members?.length || 0})
          </button>
        </div>

        {/* Tab content */}
        {mobileTab === "chat" ? (
          <div className="flex flex-col flex-1 min-h-0">
            <ChatPanel
              messages={chatMessages}
              chatInput={chatInput}
              setChatInput={setChatInput}
              onSend={sendChat}
              endRef={chatEndMobileRef}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-3">
            {room?.members?.map((member) => (
              <MemberItem
                key={member.id}
                member={member}
                isHost={isHost}
                onRemove={removeMember}
                currentUserId={user?.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Select Video Modal ─────────────────────────────── */}
      {selectingVideo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="font-semibold mb-4">Select Video</h2>
            {myVideos.length === 0 ? (
              <p className="text-gray-500 text-sm">No ready videos found.</p>
            ) : (
              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                {myVideos.map((video) => (
                  <button
                    key={video.id}
                    onClick={() => selectVideo(video.id)}
                    className="text-left px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <p className="text-sm font-medium">{video.title}</p>
                    {/* Bug 9 fix: show all available resolutions including 480p */}
                    <p className="text-xs text-gray-500 mt-0.5">
                      {video.url_360p  && "360p "}
                      {video.url_480p  && "480p "}
                      {video.url_720p  && "720p "}
                      {video.url_1080p && "1080p"}
                    </p>
                  </button>
                ))}
              </div>
            )}
            <Button
              variant="secondary"
              fullWidth
              className="mt-4"
              onClick={() => setSelectingVideo(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomPage;
