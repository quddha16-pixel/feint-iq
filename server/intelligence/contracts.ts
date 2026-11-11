import { z } from "zod";
export const coachingResultSchema = z
  .object({
    findings: z
      .array(
        z
          .object({
            kind: z.enum(["observation", "hypothesis"]),
            observation: z.string().min(1),
            evidenceIds: z.array(z.string().min(1)).min(1),
            diagnosis: z.string().min(1),
            consequence: z.string().min(1),
            correction: z.string().min(1),
            drill: z.string().min(1),
            priority: z.enum(["high", "medium", "low"]),
            uncertainty: z.string(),
          })
          .strict(),
      )
      .max(30),
    limitations: z.array(z.string()),
  })
  .strict();
export interface EvidenceManifest {
  id: string;
  sourceHash: string;
  extractionVersion: string;
  frames: {
    id: string;
    round: string;
    time: number;
    cutId: string;
    replay: boolean;
    mime: "image/jpeg";
    data: string;
  }[];
}
export interface IntelligenceProvider {
  readonly id: "openai" | "anthropic" | "xai" | "gemini";
  readonly model: string;
  analyze(
    evidence: EvidenceManifest,
    signal: AbortSignal,
  ): Promise<{
    report: unknown;
    usage: {
      inputTokens: number | null;
      outputTokens: number | null;
      costUsd: number | null;
    };
  }>;
}
/** Opt-in registry for future adapters; empty by default. No API keys or provider calls here. */
export class IntelligenceRegistry {
  constructor(private readonly adapters: IntelligenceProvider[] = []) {}
  async analyze(
    provider: IntelligenceProvider["id"],
    evidence: EvidenceManifest,
    signal: AbortSignal,
  ) {
    const adapter = this.adapters.find((p) => p.id === provider);
    if (!adapter)
      throw new Error(
        "Provider is not configured or benchmarked. No request was made.",
      );
    const ids = new Set(
      evidence.frames.filter((f) => !f.replay).map((f) => f.id),
    );
    if (
      !evidence.sourceHash ||
      !evidence.extractionVersion ||
      !ids.size ||
      evidence.frames.some((f) => !Number.isFinite(f.time) || f.time < 0) ||
      ids.size !== evidence.frames.filter((f) => !f.replay).length
    )
      throw new Error("Evidence provenance is incomplete.");
    if (signal.aborted)
      throw new Error("Analysis canceled before provider submission.");
    const result = await adapter.analyze(
      { ...evidence, frames: evidence.frames.filter((f) => !f.replay) },
      signal,
    );
    if (signal.aborted)
      throw new Error("Analysis canceled. No report accepted.");
    const report = coachingResultSchema.parse(result.report);
    if (report.findings.some((f) => f.evidenceIds.some((id) => !ids.has(id))))
      throw new Error(
        "Provider cited unknown or replay evidence. Findings were rejected.",
      );
    return {
      report,
      usage: z
        .object({
          inputTokens: z.number().int().nonnegative().nullable(),
          outputTokens: z.number().int().nonnegative().nullable(),
          costUsd: z.number().finite().nonnegative().nullable(),
        })
        .parse(result.usage),
      provider: adapter.id,
      model: adapter.model,
      manifestId: evidence.id,
    };
  }
}
