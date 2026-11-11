import { expect, it, vi } from "vitest";
import {
  IntelligenceRegistry,
  type EvidenceManifest,
  type IntelligenceProvider,
} from "./contracts";
const evidence: EvidenceManifest = {
  id: "manifest-test",
  sourceHash: "synthetic-hash",
  extractionVersion: "test-only",
  frames: [
    {
      id: "source-frame",
      round: "1",
      time: 12,
      cutId: "cut-1",
      replay: false,
      mime: "image/jpeg",
      data: "test-only",
    },
    {
      id: "replay-frame",
      round: "1",
      time: 14,
      cutId: "cut-2",
      replay: true,
      mime: "image/jpeg",
      data: "test-only",
    },
  ],
};
const finding = {
  kind: "hypothesis",
  observation: "Synthetic example only",
  evidenceIds: ["source-frame"],
  diagnosis: "Test diagnosis",
  consequence: "Test consequence",
  correction: "Test correction",
  drill: "Test drill",
  priority: "high",
  uncertainty: "Not a real assessment",
};
it("makes no request for unconfigured providers, missing evidence or pre-canceled work", async () => {
  await expect(
    new IntelligenceRegistry().analyze(
      "openai",
      evidence,
      new AbortController().signal,
    ),
  ).rejects.toThrow("not configured");
  const analyze = vi.fn();
  const registry = new IntelligenceRegistry([
    { id: "openai", model: "synthetic", analyze },
  ]);
  await expect(
    registry.analyze(
      "openai",
      { ...evidence, sourceHash: "" },
      new AbortController().signal,
    ),
  ).rejects.toThrow("provenance");
  await expect(
    registry.analyze("openai", evidence, AbortSignal.abort()),
  ).rejects.toThrow("canceled");
  expect(analyze).not.toHaveBeenCalled();
});
it("validates canonical findings, strips known replays from provider input, and preserves unknown cost", async () => {
  const analyze: IntelligenceProvider["analyze"] = vi.fn(async () => ({
    report: { findings: [finding], limitations: ["Synthetic test"] },
    usage: { inputTokens: null, outputTokens: null, costUsd: null },
  }));
  const registry = new IntelligenceRegistry([
    { id: "gemini", model: "synthetic", analyze },
  ]);
  const result = await registry.analyze(
    "gemini",
    evidence,
    new AbortController().signal,
  );
  expect(result.report.findings[0].kind).toBe("hypothesis");
  expect(result.usage.costUsd).toBeNull();
  expect(analyze).toHaveBeenCalledWith(
    { ...evidence, frames: [evidence.frames[0]] },
    expect.any(AbortSignal),
  );
  for (const evidenceId of ["replay-frame", "missing-frame"]) {
    const bad: IntelligenceProvider = {
      id: "gemini",
      model: "synthetic",
      analyze: async () => ({
        report: {
          findings: [{ ...finding, evidenceIds: [evidenceId] }],
          limitations: [],
        },
        usage: result.usage,
      }),
    };
    await expect(
      new IntelligenceRegistry([bad]).analyze(
        "gemini",
        evidence,
        new AbortController().signal,
      ),
    ).rejects.toThrow("unknown or replay");
  }
});
