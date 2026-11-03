import { runtimeConfig } from "./config";
import { createBackend } from "./app";
import { run } from "./media";
import { GeminiProvider } from "./provider";
const config = runtimeConfig();
const accessToken = process.env.ANALYSIS_ACCESS_TOKEN ?? "";
const origin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
const provider = process.env.GEMINI_API_KEY
  ? new GeminiProvider(
      process.env.GEMINI_API_KEY,
      process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
    )
  : undefined;
await Promise.all([run("ffmpeg", ["-version"]), run("ffprobe", ["-version"])]);
const app = await createBackend({
  accessToken,
  origin,
  provider,
  maxUploadBytes: config.maxUploadBytes,
});
const stop = async () => {
  await app.close();
  process.exit(0);
};
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
await app.listen({ port: config.port, host: config.host });
console.log(
  `Identifier Q pilot backend listening; provider ${provider ? "configured (not yet validated)" : "unavailable"}.`,
);
