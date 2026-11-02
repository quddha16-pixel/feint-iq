import type { VideoAsset } from "./contracts";
export interface LocalVideo {
  file: File;
  url: string;
  asset: VideoAsset;
  ready: boolean;
}
export const supportedExtensions = ["mp4", "mov", "webm"];
export function validateVideoFile(
  file: Pick<File, "name" | "size" | "type">,
  maxMB: number,
): string | undefined {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !supportedExtensions.includes(ext))
    return "Choose an MP4, MOV, or WebM video. Other formats are not supported.";
  if (
    file.type &&
    ![
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "application/octet-stream",
    ].includes(file.type)
  )
    return "The file type does not match a supported video. Choose an MP4, MOV, or WebM file.";
  if (!file.size) return "This file is empty. Choose a video with footage.";
  if (file.size > maxMB * 1024 * 1024)
    return `This video exceeds your ${maxMB} MB limit. Choose a smaller clip or update Settings.`;
}
export function formatTime(time: number) {
  const s = Math.max(0, Math.floor(time));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export function safeSeek(
  video: HTMLVideoElement | null,
  time: number,
): string | undefined {
  if (!video || video.readyState < 1 || !Number.isFinite(video.duration))
    return "Load the original video before opening this timestamp.";
  if (!Number.isFinite(time) || time < 0 || time > video.duration)
    return "This timestamp is outside the loaded video. Reattach the original footage.";
  video.currentTime = time;
}
