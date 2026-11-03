import { z } from "zod";
import {
  jobSchema,
  configSchema,
  reportSchema,
  type AnalysisSubmission,
} from "../domain/contracts";
import { engineHealthSchema, type EngineHealth } from "../domain/engine";
import type { AnalysisService } from "./analysis";
function validateURL(value: string) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash)
    throw new Error(
      "Use a backend URL without credentials, query parameters, or a fragment.",
    );
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    )
  )
    throw new Error(
      "Use HTTPS for a remote backend. HTTP is allowed only for a local test server.",
    );
  return url.href.replace(/\/$/, "");
}
export async function connectAnalysisService(
  endpoint: string,
  token: string,
  request: typeof fetch = fetch,
): Promise<{ service: AnalysisService; health: EngineHealth }> {
  const base = validateURL(endpoint);
  if (token.length < 32)
    throw new Error(
      "Enter the authorized pilot session access token (at least 32 characters), not a provider API key.",
    );
  const keys = new Map<string, string>();
  const fingerprintsByJob = new Map<string, string>();
  const call = async (
    path: string,
    init: RequestInit = {},
    signal?: AbortSignal,
  ) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, signal ? 120000 : 15000);
    try {
      let response: Response;
      try {
        response = await request(base + path, {
          ...init,
          headers: { ...init.headers, authorization: `Bearer ${token}` },
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal,
        });
      } catch {
        if (signal?.aborted)
          throw new DOMException("Analysis canceled.", "AbortError");
        throw new Error(
          "The backend request failed or timed out. Check its URL, HTTPS, session token, and allowed frontend origin.",
        );
      }
      if (!response.ok) {
        let message = "";
        try {
          const body = await response.json();
          message =
            typeof body.message === "string" ? body.message.slice(0, 1000) : "";
        } catch {
          /* Non-JSON error responses remain actionable by status. */
        }
        throw new Error(
          message || `Backend request failed (HTTP ${response.status}).`,
        );
      }
      try {
        return await response.json();
      } catch {
        throw new Error(
          "The backend returned unreadable or incomplete JSON. Retry after checking its status.",
        );
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  };
  const health = engineHealthSchema.parse(await call("/health"));
  const service: AnalysisService = {
    capabilities: {
      available: health.available,
      upload: health.available,
      cancel: true,
      tracking: false,
    },
    async submit(input, signal, onUploadStart) {
      validateSubmission(input, health);
      const fingerprint = JSON.stringify({
        video: input.video,
        configuration: input.configuration,
      });
      const key = keys.get(fingerprint) ?? crypto.randomUUID();
      keys.set(fingerprint, key);
      const form = new FormData();
      form.append(
        "metadata",
        JSON.stringify({
          video: input.video,
          configuration: input.configuration,
        }),
      );
      form.append("video", input.file, input.file.name);
      onUploadStart?.();
      const job = jobSchema.parse(
        await call(
          "/analyses",
          { method: "POST", headers: { "idempotency-key": key }, body: form },
          signal,
        ),
      );
      if (
        JSON.stringify(job.configuration) !==
          JSON.stringify(configSchema.parse(input.configuration)) ||
        job.video.id !== input.video.id
      )
        throw new Error(
          "The backend changed the submitted fighter, discipline, or video. The job was rejected.",
        );
      fingerprintsByJob.set(job.id, fingerprint);
      if (["failed", "canceled"].includes(job.status)) keys.delete(fingerprint);
      return job;
    },
    async status(id, signal) {
      const job = jobSchema.parse(
        await call(`/analyses/${encodeURIComponent(id)}/status`, {}, signal),
      );
      if (job.id !== id) throw new Error("The backend returned the wrong job.");
      if (["failed", "canceled"].includes(job.status)) {
        const fingerprint = fingerprintsByJob.get(id);
        if (fingerprint) keys.delete(fingerprint);
      }
      return job;
    },
    async report(id, signal) {
      const report = reportSchema.parse(
        await call(`/analyses/${encodeURIComponent(id)}/report`, {}, signal),
      );
      if (report.id !== id)
        throw new Error("The backend returned the wrong report.");
      return report;
    },
    async cancel(id) {
      await call(`/analyses/${encodeURIComponent(id)}`, { method: "DELETE" });
      keys.clear();
    },
    async list() {
      return z.array(reportSchema).parse(await call("/analyses"));
    },
    async get(id) {
      return this.report(id);
    },
  };
  return { service, health };
}
function validateSubmission(input: AnalysisSubmission, health: EngineHealth) {
  if (!health.available) throw new Error(health.message);
  if (input.configuration.discipline !== "boxing")
    throw new Error(
      "The live pilot supports boxing only. Kickboxing remains available for local setup and report review.",
    );
  if (input.file.size > health.limits.maxBytes)
    throw new Error(
      `The live backend allows up to ${Math.floor(health.limits.maxBytes / 1024 / 1024)} MB per clip.`,
    );
  if (
    input.video.duration < health.limits.minSeconds ||
    input.video.duration > health.limits.maxSeconds
  )
    throw new Error(
      `Choose a ${health.limits.minSeconds}–${health.limits.maxSeconds}-second clip for this backend.`,
    );
  if (
    !input.configuration.fighter.confirmationFrames?.length &&
    !input.configuration.fighter.frame
  )
    throw new Error(
      "Add at least one fighter identity confirmation frame for the live pilot.",
    );
}
