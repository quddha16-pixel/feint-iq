import { readAnalysisStream, AnalysisJobFailure } from "./analysisStream";
import { REQUEST_PROTOCOL, REQUEST_TIMEOUT_MS } from "../domain/transport";
import type { CompletedAnalysisReport } from "../domain/contracts";
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
  const completed = new Map<string, CompletedAnalysisReport>();
  const open = async (
    path: string,
    init: RequestInit = {},
    signal?: AbortSignal,
    timeout = 15000,
  ) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, timeout);
    const dispose = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
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
          /* Error status remains actionable without JSON. */
        }
        throw new Error(
          message || `Backend request failed (HTTP ${response.status}).`,
        );
      }
      return { response, dispose, controller };
    } catch (error) {
      dispose();
      if (signal?.aborted)
        throw new DOMException("Analysis canceled.", "AbortError");
      throw error;
    }
  };
  const call = async (
    path: string,
    init: RequestInit = {},
    signal?: AbortSignal,
  ) => {
    const opened = await open(path, init, signal);
    try {
      return await opened.response.json();
    } catch {
      throw new Error(
        "The backend returned unreadable or incomplete JSON. Check its status before explicitly retrying.",
      );
    } finally {
      opened.dispose();
    }
  };
  const health = engineHealthSchema.parse(await call("/health"));
  if (health.available && health.protocol !== REQUEST_PROTOCOL)
    throw new Error(
      "This backend uses an unsupported processing protocol. Update it to request-bound processing before connecting.",
    );
  const service: AnalysisService = {
    capabilities: {
      available: health.available,
      upload: health.available,
      cancel: true,
      tracking: false,
    },
    async submit(input, signal, onUploadStart, onJobUpdate) {
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
      const opened = await open(
        "/analyses",
        { method: "POST", headers: { "idempotency-key": key }, body: form },
        signal,
        REQUEST_TIMEOUT_MS,
      );
      try {
        const { job, report } = await readAnalysisStream(
          opened.response,
          (update) => {
            if (
              update.id !== key ||
              update.video.id !== input.video.id ||
              JSON.stringify(update.configuration) !==
                JSON.stringify(configSchema.parse(input.configuration))
            )
              throw new Error(
                "The backend changed the submitted fighter, discipline, or video.",
              );
            fingerprintsByJob.set(update.id, fingerprint);
            onJobUpdate?.(update);
          },
        );
        if (
          job.id !== key ||
          job.video.id !== input.video.id ||
          JSON.stringify(job.configuration) !==
            JSON.stringify(configSchema.parse(input.configuration))
        )
          throw new Error(
            "The completed report does not match the submitted footage and configuration.",
          );
        completed.set(job.id, report);
        while (completed.size > 20)
          completed.delete(completed.keys().next().value!);
        fingerprintsByJob.set(job.id, fingerprint);
        return job;
      } catch (error) {
        if (
          error instanceof AnalysisJobFailure &&
          keys.get(fingerprint) === key
        )
          keys.delete(fingerprint);
        if (signal?.aborted)
          throw new DOMException("Analysis canceled.", "AbortError");
        if (opened.controller.signal.aborted)
          throw new Error(
            "Analysis request timed out. No partial report was saved; check provider usage before explicitly retrying.",
          );
        throw error;
      } finally {
        opened.dispose();
      }
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
      const saved = completed.get(id);
      if (saved) return saved;
      const report = reportSchema.parse(
        await call(`/analyses/${encodeURIComponent(id)}/report`, {}, signal),
      );
      if (report.id !== id)
        throw new Error("The backend returned the wrong report.");
      return report;
    },
    async cancel(id) {
      await call(`/analyses/${encodeURIComponent(id)}`, { method: "DELETE" });
      const fingerprint = fingerprintsByJob.get(id);
      if (fingerprint && keys.get(fingerprint) === id) keys.delete(fingerprint);
      fingerprintsByJob.delete(id);
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
