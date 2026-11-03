import { useRef, useState } from "react";
import { FileVideo, Upload, X } from "lucide-react";
import type { LocalVideo } from "../domain/video";
import { formatSize, formatTime } from "../domain/video";
import { Notice } from "./ui";
export function VideoPicker({
  video,
  maxMB,
  error,
  onSelect,
  onReady,
  onError,
  onRemove,
}: {
  video: LocalVideo | null;
  maxMB: number;
  error: string;
  onSelect: (file: File) => void;
  onReady: (duration: number) => void;
  onError: (message: string) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div>
      {error && <Notice tone="error">{error}</Notice>}
      {!video ? (
        <div
          className={`dropzone ${drag ? "drag" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) onSelect(f);
          }}
        >
          <div className="upload-symbol">
            <Upload size={28} />
          </div>
          <h3>Your footage. A new perspective.</h3>
          <p>Drop your video here, or choose a file.</p>
          <button className="button" onClick={() => input.current?.click()}>
            Choose footage <FileVideo size={17} />
          </button>
          <small>
            MP4, MOV, WebM · 10 seconds–5 minutes · Up to {maxMB} MB
            <br />
            Codec compatibility depends on your browser.
          </small>
        </div>
      ) : (
        <div className="selected-video">
          <video
            key={video.url}
            controls
            playsInline
            preload="metadata"
            src={video.url}
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) onReady(d);
              else
                onError(
                  "This video has no usable duration. Try exporting it as H.264 MP4.",
                );
            }}
            onError={() =>
              onError(
                "Your browser could not decode this footage. Try an H.264 MP4 export or choose another video.",
              )
            }
            aria-label="Selected footage preview"
          />
          <div className="video-file-info">
            <FileVideo size={22} />
            <div>
              <strong>{video.file.name}</strong>
              <small>
                {formatSize(video.file.size)} ·{" "}
                {video.ready
                  ? `${formatTime(video.asset.duration)} · Local preview ready`
                  : "Checking video metadata…"}
              </small>
            </div>
            <button
              className="icon-button"
              onClick={onRemove}
              aria-label="Remove video"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
        className="visually-hidden"
        aria-label="Choose video file"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) onSelect(file);
          e.currentTarget.value = "";
        }}
      />
      <p className="subtle-note">
        Local preview only. Selecting footage does not upload it. A connected
        backend receives it only after explicit submission. Video files stay in
        this tab and must be selected again after a reload.
      </p>
    </div>
  );
}
