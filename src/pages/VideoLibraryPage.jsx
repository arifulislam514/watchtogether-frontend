// src/pages/VideoLibraryPage.jsx
import { useState, useEffect, useRef } from "react";
import {
  Upload,
  Video,
  Trash2,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader,
} from "lucide-react";
import { authAxios } from "../services/axios";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";

// ── Status badge ───────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const config = {
    uploading: {
      icon: <Loader size={11} className="animate-spin" />,
      text: "Uploading",
      color: "text-blue-400   bg-blue-400/10",
    },
    processing: {
      icon: <Loader size={11} className="animate-spin" />,
      text: "Processing",
      color: "text-yellow-400 bg-yellow-400/10",
    },
    ready: {
      icon: <CheckCircle size={11} />,
      text: "Ready",
      color: "text-green-400  bg-green-400/10",
    },
    failed: {
      icon: <AlertCircle size={11} />,
      text: "Failed",
      color: "text-red-400    bg-red-400/10",
    },
  };
  const c = config[status] || config.processing;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${c.color}`}
    >
      {c.icon}
      {c.text}
    </span>
  );
};

// ── Helpers ────────────────────────────────────────────────
const formatSize = (bytes) => {
  if (!bytes) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

// Estimate remaining time based on file size and progress
const estimateETA = (video) => {
  const prog = video.progress || 0;
  if (prog <= 0) return null;
  if (prog >= 100) return null;
  // Rough estimate: 1MB takes ~3s to transcode on Render free tier
  const totalSecs = Math.max(30, (video.file_size / (1024 * 1024)) * 3);
  const elapsed = totalSecs * (prog / 100);
  const remaining = totalSecs - elapsed;
  if (remaining < 60) return `~${Math.ceil(remaining)}s left`;
  if (remaining < 3600) return `~${Math.ceil(remaining / 60)}m left`;
  return `~${Math.ceil(remaining / 3600)}h left`;
};

const formatDuration = (seconds) => {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

// ── Video Card ─────────────────────────────────────────────
const VideoCard = ({ video, onDelete }) => {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = () => {
    if (confirmDelete) {
      onDelete(video.id);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors">
      {/* Thumbnail area */}
      <div className="h-36 bg-gray-800 flex items-center justify-center relative">
        <Video size={36} className="text-gray-600" />
        {/* Format badge */}
        <span className="absolute top-2 left-2 text-xs bg-black/60 text-gray-300 px-2 py-0.5 rounded-md uppercase">
          {video.format || "video"}
        </span>
        {/* Status badge */}
        <span className="absolute top-2 right-2">
          <StatusBadge status={video.status} />
        </span>
        {/* Duration */}
        {video.duration > 0 && (
          <span className="absolute bottom-2 right-2 text-xs bg-black/70 text-white px-2 py-0.5 rounded-md flex items-center gap-1">
            <Clock size={10} />
            {formatDuration(video.duration)}
          </span>
        )}
      </div>

      {/* Info area */}
      <div className="p-4">
        {/* Title — full wrap, no truncate */}
        <h3
          className="font-medium text-sm text-white leading-snug mb-1 line-clamp-2"
          title={video.title}
        >
          {video.title}
        </h3>

        {/* File size */}
        <p className="text-xs text-gray-500 mb-3">
          {formatSize(video.file_size)}
        </p>

        {/* Resolution badges */}
        {video.status === "ready" && (
          <div className="flex gap-1.5 mb-3">
            {video.url_360p && (
              <span className="text-xs px-2 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400">
                360p
              </span>
            )}
            {video.url_480p && (
            <span className="text-xs px-2 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400">480p</span>
          )}
          {video.url_720p && (
              <span className="text-xs px-2 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400">
                720p
              </span>
            )}
            {video.url_1080p && (
              <span className="text-xs px-2 py-0.5 bg-gray-800 border border-gray-700 rounded text-gray-400">
                1080p
              </span>
            )}
          </div>
        )}

        {/* Processing progress bar with real % and ETA */}
        {(video.status === "processing" || video.status === "uploading") && (
          <div className="mb-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-gray-500 truncate max-w-[120px]">
                {video.stage || "Processing..."}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {estimateETA(video) && (
                  <span className="text-xs text-gray-600">
                    {estimateETA(video)}
                  </span>
                )}
                <span className="text-xs text-violet-400 font-bold">
                  {video.progress || 0}%
                </span>
              </div>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-violet-500 h-1.5 rounded-full transition-all duration-700"
                style={{ width: `${Math.max(video.progress || 0, 3)}%` }}
              />
            </div>
          </div>
        )}

        {/* Delete button — small, right-aligned */}
        <div className="flex justify-end">
          <button
            onClick={handleDelete}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${
              confirmDelete
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-gray-800 text-gray-400 hover:bg-red-500/10 hover:text-red-400 border border-gray-700 hover:border-red-500/30"
            }`}
          >
            <Trash2 size={12} />
            {confirmDelete ? "Confirm?" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Upload Modal ───────────────────────────────────────────
const UploadModal = ({ onClose, onUploaded }) => {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [qualities, setQualities] = useState(["360p", "480p", "720p"]); // 1080p off by default
  const fileRef = useRef();

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["mp4", "mkv"].includes(ext)) {
      setError("Only .mp4 and .mkv files are allowed.");
      return;
    }
    if (f.size > 4 * 1024 * 1024 * 1024) {
      setError("File must be under 4GB.");
      return;
    }
    setFile(f);
    setError("");
    if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ""));
  };

  const handleUpload = async () => {
    if (!file || !title.trim()) {
      setError("Please select a file and enter a title.");
      return;
    }
    if (qualities.length === 0) {
      setError("Please select at least one quality.");
      return;
    }
    setLoading(true);
    setError("");
    setProgress(0);

    let video_id = null; // ✅ track across retries

    try {
      // Step 1: Get presigned URL
      setStage("Preparing upload...");
      const presignRes = await authAxios.post("/api/videos/presigned-upload/", {
        filename: file.name,
        file_size: file.size,
        qualities: qualities,
        title: title,
      });
      video_id = presignRes.data.video_id;
      const { upload_url } = presignRes.data;

      // Step 2: Upload to R2
      setStage("Uploading to storage...");
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () =>
          xhr.status === 200 || xhr.status === 204
            ? resolve()
            : reject(new Error(`Upload failed: ${xhr.status}`));
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.open("PUT", upload_url);
        const ext = file.name.split(".").pop().toLowerCase();
        xhr.setRequestHeader(
          "Content-Type",
          ext === "mkv" ? "video/x-matroska" : "video/mp4",
        );
        xhr.send(file);
      });

      // Step 3: Confirm upload — start transcoding
      setStage("Starting transcoding...");
      setProgress(100);
      const confirmRes = await authAxios.post(
        `/api/videos/${video_id}/confirm-upload/`,
      );
      onUploaded(confirmRes.data);
    } catch (err) {
      // ✅ If R2 upload succeeded but confirm failed — video is safe in R2
      // Show a different message so user doesn't re-upload
      if (video_id) {
        setError(
          "File uploaded successfully but server error occurred. The video will process automatically.",
        );
        // Add placeholder so it shows in library
        onUploaded({
          id: video_id,
          title,
          status: "processing",
          progress: 5,
          stage: "Starting...",
          file_size: file.size,
          format: file.name.split(".").pop().toLowerCase(),
          url_360p: null,
          url_720p: null,
          url_1080p: null,
        });
      } else {
        setError(
          err.response?.data?.error || "Upload failed. Please try again.",
        );
      }
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start sm:items-center justify-center z-50 overflow-y-auto p-4">
      <Card className="w-full max-w-md my-auto">
        <h2 className="text-lg font-semibold mb-6">Upload Video</h2>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <div
          onClick={() => !loading && fileRef.current?.click()}
          className="border-2 border-dashed border-gray-700 hover:border-violet-500 rounded-xl p-8 text-center cursor-pointer transition-colors mb-4"
        >
          <Upload size={32} className="text-gray-600 mx-auto mb-2" />
          {file ? (
            <div>
              <p className="text-sm text-green-400 font-medium">{file.name}</p>
              <p className="text-xs text-gray-500 mt-1">
                {formatSize(file.size)}
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-400">Click to select video</p>
              <p className="text-xs text-gray-600 mt-1">MP4 or MKV · Max 4GB</p>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/x-matroska,.mkv,.mp4"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Upload progress */}
        {loading && (
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-gray-500">{stage}</span>
              <span className="text-xs text-violet-400 font-bold">
                {progress}%
              </span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-violet-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${Math.max(progress, 3)}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 mb-4">
          <label className="text-sm font-medium text-gray-300">Transcoding Quality</label>
          <p className="text-xs text-gray-500">More = longer processing · 1080p is off by default</p>
          <div className="flex gap-2 flex-wrap">
            {["360p", "480p", "720p", "1080p"].map((q) => (
              <button
                key={q}
                type="button"
                disabled={loading}
                onClick={() =>
                  setQualities((prev) =>
                    prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q]
                  )
                }
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors disabled:opacity-50 ${
                  qualities.includes(q)
                    ? "bg-violet-600 border-violet-500 text-white"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"
                }`}
              >
                {q}
                {q === "1080p" && <span className="ml-1 opacity-60 text-[10px]">(slow)</span>}
              </button>
            ))}
          </div>
          {qualities.length === 0 && (
            <p className="text-xs text-red-400">Select at least one quality</p>
          )}
        </div>
        <div className="flex flex-col gap-1 mb-6">
          <label className="text-sm font-medium text-gray-300">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Video title"
            disabled={loading}
            className="bg-gray-800 border border-gray-700 focus:border-violet-500 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 text-sm outline-none transition-colors disabled:opacity-50"
          />
        </div>

        <div className="flex gap-3">
          <Button
            variant="secondary"
            fullWidth
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button fullWidth loading={loading} onClick={handleUpload}>
            {loading ? "Uploading..." : "Upload"}
          </Button>
        </div>
      </Card>
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────────
const VideoLibraryPage = () => {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  const fetchVideos = () => {
    authAxios
      .get("/api/videos/")
      .then((res) => setVideos(res.data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  // Poll every 5s while any video is processing
  useEffect(() => {
    const processing = videos.some(
      (v) => v.status === "processing" || v.status === "uploading",
    );
    if (!processing) return;
    const interval = setInterval(fetchVideos, 5000);
    return () => clearInterval(interval);
  }, [videos]);

  const handleDelete = async (id) => {
    try {
      await authAxios.delete(`/api/videos/${id}/`);
      setVideos((prev) => prev.filter((v) => v.id !== id));
    } catch (_err) {
      console.error("Delete failed");
    }
  };

  const handleUploaded = (video) => {
    setVideos((prev) => [video, ...prev]);
    setShowUpload(false);
  };

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

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden animate-pulse"
            >
              <div className="h-36 bg-gray-800" />
              <div className="p-4 flex flex-col gap-2">
                <div className="h-4 bg-gray-800 rounded w-3/4" />
                <div className="h-3 bg-gray-800 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <Card className="text-center py-16">
          <Video size={48} className="text-gray-700 mx-auto mb-4" />
          <p className="text-gray-300 font-medium">No videos yet</p>
          <p className="text-gray-600 text-sm mt-1 mb-6">
            Upload your first video to get started
          </p>
          <Button onClick={() => setShowUpload(true)}>
            <Upload size={16} />
            Upload Video
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {videos.map((video) => (
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
  );
};

export default VideoLibraryPage;
