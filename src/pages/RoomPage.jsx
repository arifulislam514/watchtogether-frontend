// src/pages/RoomPage.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  Mic,
  MicOff,
  Video,
  Phone,
  PhoneOff,
  Send,
  CheckCircle,
  Circle,
  LogOut,
  Settings,
} from "lucide-react";
import { authAxios } from "../services/axios";
import useAuth from "../hooks/useAuth";
import useRoomSocket from "../hooks/useRoomSocket";
import useWebRTC from "../hooks/useWebRTC";
import VideoPlayer from "../components/VideoPlayer";
import Button from "../components/ui/Button";

const ChatOverlay = ({ messages }) => (
  <div className="absolute bottom-16 left-4 flex flex-col gap-1 pointer-events-none z-10">
    {messages.slice(-4).map((msg, i) => (
      <div
        key={i}
        className="bg-black/60 text-white text-sm px-3 py-1 rounded-lg backdrop-blur-sm"
      >
        <span className="text-violet-400 font-medium">{msg.user_name}: </span>
        {msg.text}
      </div>
    ))}
  </div>
);

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

  const videoRef = useRef(null);
  const chatEndRef = useRef(null);

  // ── Core sync refs ─────────────────────────────────────────
  const iSentNetworkWaitRef = useRef(false);
  // ✅ Blocks NETWORK_WAIT for 5s after allReady auto-play
  // Prevents false "Waiting for You..." during initial HLS buffering
  const blockNetworkWaitUntilRef = useRef(0);
  // When true, video event handlers (onPause/onPlay/onSeeked) are ignored
  const isSyncingRef = useRef(false);
  // Track if video is currently playing (our local state)
  const isPlayingRef = useRef(false);
  // Has the user ever pressed play (prevents false NETWORK_WAIT on initial load)
  const hasPlayedRef = useRef(false);
  // Network wait debounce timer
  const networkWaitTimer = useRef(null);
  // ✅ True when someone else paused — blocks local play
  const blockedRef = useRef(false);
  // Periodic sync interval (broadcasts current time every 2s when playing)
  const syncIntervalRef = useRef(null);
  // handleSignaling ref to avoid stale closure
  const handleSignalingRef    = useRef(null);
  const onRemoteVoiceJoinRef  = useRef(null);
  const onRemoteVoiceLeaveRef = useRef(null);

  const isHost = room?.host === user?.id;

  // ── Apply a remote command to the video ───────────────────
  // Sets isSyncingRef so video events don't re-broadcast
  const applyRemote = useCallback((fn) => {
    isSyncingRef.current = true;
    fn();
    // Reset after a short delay — long enough for all events to fire
    setTimeout(() => {
      isSyncingRef.current = false;
    }, 300);
  }, []);

  const refreshRoom = useCallback(
    () =>
      authAxios
        .get(`/api/rooms/${id}/`)
        .then((res) => {
          setRoom(res.data);
          return res.data;
        })
        .catch(() => {}),
    [id],
  );

  // ── Periodic sync: broadcast current time every 2s when playing ──
  // All members check if they're out of sync and correct themselves
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
            // ✅ Block NETWORK_WAIT for 5s — HLS needs time to buffer on auto-play
            blockNetworkWaitUntilRef.current = Date.now() + 5000;
          }
          break;

        case "VIDEO_SELECTED":
          refreshRoom();
          break;

        case "PLAY":
          if (event.sender_id === myId) break;
          // ✅ Unblock so local play attempts work again
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
          // ✅ Block local play until this person resumes
          blockedRef.current = true;
          applyRemote(() => {
            if (videoRef.current) {
              videoRef.current.currentTime = event.timestamp;
              videoRef.current.pause();
            }
          });
          isPlayingRef.current = false;
          // ✅ Cancel any pending NETWORK_WAIT — don't send it when paused
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
          // Periodic sync — correct drift if > 1.5s off
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

        // ✅ Disconnect = pause for everyone, anyone can resume
        case "MEMBER_DISCONNECTED":
          blockedRef.current = false;
          if (videoRef.current && !videoRef.current.paused) {
            applyRemote(() => videoRef.current.pause());
            isPlayingRef.current = false;
          }
          stopSyncBroadcast();
          setPausedBy(`${event.user_name} left`);
          setPausedById(null);
          // ✅ Clear any stuck waiting state from the disconnected member
          setWaiting(false);
          setWaitingFor("");
          if (networkWaitTimer.current) {
            clearTimeout(networkWaitTimer.current);
            networkWaitTimer.current = null;
          }
          setRoom((prev) => {
            if (!prev) return prev;
            const newMembers = prev.members.filter((m) => m.user !== event.user_id);
            // ✅ Recalculate allReady after disconnect
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
            // ✅ Recalculate allReady — if only 1 member left, unblock immediately
            const nowReady = newMembers.length <= 1 || newMembers.every((m) => m.is_ready);
            setAllReady(nowReady);
            return { ...prev, members: newMembers };
          });
          break;

        case "MEMBER_JOINED":
          refreshRoom();
          // ✅ If I'm playing, send my current state so new member syncs
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
          // ✅ New member receives full playback state on join
          if (event.sender_id === myId) break;
          applyRemote(() => {
            if (videoRef.current) {
              videoRef.current.currentTime = event.timestamp;
              if (event.is_playing) {
                videoRef.current.play().catch(() => {});
                isPlayingRef.current = true;
                hasPlayedRef.current = true;
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
    [id, user?.id, refreshRoom, applyRemote],
  );

  // ── sendRef so handleEvent can call send without stale closure ──
  const sendRef = useRef(null);

  const { send } = useRoomSocket({
    roomId: isMember ? id : null,
    token: tokens?.access,
    onEvent: handleEvent,
  });

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const {
    isMuted,
    callActive,
    startMedia,
    stopMedia,
    toggleMute,
    remoteStreams,
    onRemoteVoiceJoin,
    onRemoteVoiceLeave,
    handleSignaling,
  } = useWebRTC({ send, currentUserId: user?.id });

  useEffect(() => { handleSignalingRef.current    = handleSignaling;    }, [handleSignaling]);
  useEffect(() => { onRemoteVoiceJoinRef.current  = onRemoteVoiceJoin;  }, [onRemoteVoiceJoin]);
  useEffect(() => { onRemoteVoiceLeaveRef.current = onRemoteVoiceLeave; }, [onRemoteVoiceLeave]);

  // ── Join ───────────────────────────────────────────────────
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
    try {
      await authAxios.post(`/api/rooms/${id}/leave/`);
    } catch (_err) {}
    // ✅ Notify others before WS closes
    send({ type: "LEAVE_ROOM" });
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

  // ── Video player event handlers (user-initiated only) ──────
  const handlePause = (timestamp) => {
    isPlayingRef.current = false;
    blockedRef.current = false;  // I paused — I can resume
    stopSyncBroadcast();
    // Cancel any pending NETWORK_WAIT
    if (networkWaitTimer.current) {
      clearTimeout(networkWaitTimer.current);
      networkWaitTimer.current = null;
    }
    send({ type: "PAUSE", timestamp });
    setPausedBy("You");
    setPausedById(String(user?.id));
  };

  const handlePlay = (timestamp) => {
    // If someone else paused, block and re-pause immediately
    if (pausedById && pausedById !== String(user?.id)) {
      isSyncingRef.current = true;
      videoRef.current?.pause();
      setTimeout(() => {
        isSyncingRef.current = false;
      }, 300);
      return;
    }
    isPlayingRef.current = true;
    hasPlayedRef.current = true;
    send({ type: "PLAY", timestamp });
    setPausedBy("");
    setPausedById(null);
    startSyncBroadcast(send);
  };

  const handleSeeked = (timestamp) => {
    send({ type: "SEEK", timestamp });
  };

  const handleBuffer = () => {
    // ✅ Never send NETWORK_WAIT when paused — check actual DOM state + refs
    if (!hasPlayedRef.current || !isPlayingRef.current) return;
    if (videoRef.current?.paused) return;   // DOM truth check
    if (blockedRef.current) return;         // someone else paused us
    // ✅ Block during initial HLS buffering after auto-play
    if (Date.now() < blockNetworkWaitUntilRef.current) return;
    if (networkWaitTimer.current) clearTimeout(networkWaitTimer.current);
    networkWaitTimer.current = setTimeout(() => {
      if (videoRef.current?.readyState < 3) {
        // ✅ Track that WE sent this — so we know to send NETWORK_RESUME when done
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
    // ✅ Only send NETWORK_RESUME if WE were the one who sent NETWORK_WAIT
    // Fixes cross-wait: both members buffering simultaneously
    if (iSentNetworkWaitRef.current) {
      iSentNetworkWaitRef.current = false;
      setWaiting(false);
      setWaitingFor("");
      send({ type: "NETWORK_RESUME" });
    }
  };

  // Cleanup on unmount
  useEffect(() => () => stopSyncBroadcast(), []);

  if (loading)
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
        <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
      </div>
    );

  if (!isMember)
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 w-full max-w-sm text-center">
          <h2 className="text-xl font-bold mb-2">{room?.name}</h2>
          <p className="text-gray-400 text-sm mb-6">
            Enter the room password to join
          </p>
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
            <Button
              variant="secondary"
              fullWidth
              onClick={() => navigate("/dashboard")}
            >
              Cancel
            </Button>
            <Button fullWidth loading={joining} onClick={handleJoin}>
              Join Room
            </Button>
          </div>
        </div>
      </div>
    );

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      {/* Video area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="font-semibold shrink-0">{room?.name}</h1>
            {room?.video_detail && (
              <span className="text-sm text-gray-400 truncate">
                — {room.video_detail.title}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isHost && (
              <Button size="sm" variant="secondary" onClick={loadMyVideos}>
                <Settings size={14} /> Select Video
              </Button>
            )}
            <Button
              size="sm"
              variant={isReady ? "secondary" : "primary"}
              onClick={toggleReady}
            >
              {isReady ? <CheckCircle size={14} /> : <Circle size={14} />}
              {isReady ? "Ready!" : "Ready?"}
            </Button>
            <Button size="sm" variant="danger" onClick={handleLeave}>
              <LogOut size={14} /> Leave
            </Button>
          </div>
        </div>

        {/* Player */}
        <div className="flex-1 relative bg-black overflow-hidden">
          {room?.video_detail?.master_url ? (
            <>
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
              />

              <ChatOverlay messages={overlayMsgs} />

              {pausedBy && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 text-white text-sm px-4 py-2 rounded-full z-10 whitespace-nowrap">
                  ⏸ {pausedBy}
                  {pausedById && pausedById !== String(user?.id)
                    ? " — waiting for them to resume"
                    : ""}
                </div>
              )}

              {waiting && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
                  <div className="bg-gray-900 rounded-xl px-6 py-4 text-center">
                    <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full mx-auto mb-3" />
                    <p className="text-sm">Waiting for {waitingFor}...</p>
                  </div>
                </div>
              )}

              {!allReady && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20">
                  <div className="bg-gray-900 rounded-xl px-8 py-6 text-center">
                    <h2 className="text-lg font-semibold mb-2">
                      Waiting for everyone
                    </h2>
                    <p className="text-gray-400 text-sm mb-4">
                      All members must be ready before playback starts
                    </p>
                    <Button
                      onClick={toggleReady}
                      variant={isReady ? "secondary" : "primary"}
                    >
                      {isReady ? "✓ You are ready" : "I am Ready"}
                    </Button>
                  </div>
                </div>
              )}
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

        {/* Voice controls */}
        <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 border-t border-gray-800 shrink-0 flex-wrap">
          {callActive ? (
            <>
              <button
                onClick={toggleMute}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isMuted ? "bg-gray-800 text-gray-400 hover:bg-gray-700" : "bg-violet-600 text-white hover:bg-violet-700"}`}
              >
                {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
                {isMuted ? "Unmute" : "Mute"}
              </button>

              <Button size="sm" variant="danger" onClick={stopMedia}>
                <PhoneOff size={14} /> Leave Call
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={startMedia}>
              <Phone size={14} /> Join Voice
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
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-72 flex flex-col bg-gray-900 border-l border-gray-800 shrink-0">
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
          <div className="px-4 py-3 border-b border-gray-800">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Chat
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {chatMessages.map((msg, i) => (
              <div key={i}>
                <span className="text-violet-400 text-xs font-medium">
                  {msg.user_name}
                </span>
                <p className="text-sm text-gray-300 break-words">{msg.text}</p>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="p-3 border-t border-gray-800 flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
              placeholder="Say something..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-violet-500"
            />
            <button
              onClick={sendChat}
              className="p-2 bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors shrink-0"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>

      {selectingVideo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
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
                    <p className="text-xs text-gray-500 mt-0.5">
                      {video.url_360p && "360p "}
                      {video.url_720p && "720p "}
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
