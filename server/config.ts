import { PILOT_LIMITS } from "../src/domain/engine";
/** Non-secret runtime settings. Never log or serialize the process environment. */
export function runtimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be an integer from 1 to 65535.");
  const cloudRun = !!env.K_SERVICE;
  const host = env.HOST ?? (cloudRun || env.PORT ? "0.0.0.0" : "127.0.0.1");
  if (cloudRun && host !== "0.0.0.0")
    throw new Error("Cloud Run requires HOST=0.0.0.0.");
  const maxUploadMB = Number(
    env.MAX_UPLOAD_MB ?? (cloudRun ? 25 : PILOT_LIMITS.maxBytes / 1024 / 1024),
  );
  if (!Number.isInteger(maxUploadMB) || maxUploadMB < 1 || maxUploadMB > 100)
    throw new Error("MAX_UPLOAD_MB must be a whole number from 1 to 100.");
  if (cloudRun && maxUploadMB > 30)
    throw new Error(
      "This HTTP/1 Cloud Run pilot requires MAX_UPLOAD_MB <= 30; use the recommended 25 MiB setting.",
    );
  return { port, host, maxUploadBytes: maxUploadMB * 1024 * 1024 };
}
