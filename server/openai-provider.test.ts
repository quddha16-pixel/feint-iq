import { describe, expect, it, vi } from "vitest";
import {
  OpenAIProvider,
  DEFAULT_OPENAI_MODEL,
  BOXING_INSTRUCTIONS,
} from "./openai-provider";
import { selectProvider } from "./provider-selection";
import type { ProviderUsage } from "./provider-usage";
import { measuredUsage, priceUsage } from "./provider-usage";
import { buildReport } from "./report";
import { GeminiProvider } from "./provider";
import { makeReport } from "../tests/fixture";
import {
  preparedOpenAI,
  coachingOpenAI,
  tokensOpenAI,
  openAIResponse,
} from "../tests/openai-fixture";
const configuration = makeReport().configuration;
const key = "synthetic-openai-key-never-real";
const signal = () => new AbortController().signal;
function adapter(payload = openAIResponse()) {
  const request = vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(payload), {
        headers: {
          "content-type": "application/json",
          "x-request-id": "req_synthetic",
        },
      }),
  );
  return { request, provider: new OpenAIProvider(key, { request }) };
}
describe("OpenAI visual coaching adapter", () => {
  it("sends timestamped high-detail images and maps coaching into the existing report with measured usage", async () => {
    const { request, provider } = adapter();
    const usage: ProviderUsage[] = [];
    const result = await provider.analyze(
      preparedOpenAI,
      configuration,
      signal(),
      (u) => usage.push(u),
    );
    const [url, init] = request.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(String(url)).not.toContain(key);
    expect(init?.headers).toMatchObject({ authorization: `Bearer ${key}` });
    expect(init?.redirect).toBe("error");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: DEFAULT_OPENAI_MODEL,
      store: false,
      stream: false,
      service_tier: "default",
      tools: [],
      prompt_cache_options: { mode: "explicit" },
      reasoning: { effort: "high" },
      max_output_tokens: 16384,
    });
    expect(body.text.format).toMatchObject({
      type: "json_schema",
      strict: true,
    });
    expect(body.text.format.schema.additionalProperties).toBe(false);
    expect(body.instructions).toBe(BOXING_INSTRUCTIONS);
    expect(String(init?.body)).not.toContain(key);
    const content = body.input[0].content;
    expect(
      content.filter((c: { type: string }) => c.type === "input_image"),
    ).toHaveLength(4);
    expect(content[2]).toMatchObject({
      type: "input_image",
      detail: "high",
      image_url: expect.stringContaining("data:image/jpeg;base64,"),
    });
    expect(content.map((c: { text?: string }) => c.text).join(" ")).toContain(
      '"sourceTimeSeconds":11',
    );
    expect(content.map((c: { text?: string }) => c.text).join(" ")).toContain(
      "identity-reference-only",
    );
    const report = buildReport(
      "test",
      configuration,
      makeReport().video,
      preparedOpenAI,
      result,
      "OpenAI/test",
      new Date().toISOString(),
    );
    expect(report.observations[0].explanation).toContain("Hypothesis");
    expect(report.recommendations[0].drills[0].dosage).toBe(
      "Two technical rounds",
    );
    expect(report.recommendations[0].priority).toBe("primary");
    expect(report.recommendations[0].observationIds).toEqual([
      report.observations[0].id,
    ]);
    expect(report.evidence[0].verifiedTime).toBe(6);
    expect(report.assessment.score).toBeNull();
    expect(usage[0]).toMatchObject({
      status: "completed",
      requestId: "req_synthetic",
      responseId: "resp_synthetic",
      tokens: {
        input: 12000,
        cachedInput: 4000,
        cacheWrites: 7000,
        output: 1000,
        reasoning: 600,
        total: 13000,
      },
    });
    expect(usage[0].estimatedCostUsd).toBeCloseTo(0.2015);
  });
  it.each([
    { status: "incomplete" },
    { status: "failed" },
    { error: { message: "private provider diagnostic" } },
    {
      output: [
        {
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "refusal", refusal: "private refusal" }],
        },
      ],
    },
    { output: [] },
    {
      output: [
        {
          type: "message",
          role: "assistant",
          status: "incomplete",
          content: [{ type: "output_text", text: "{}" }],
        },
      ],
    },
  ])(
    "rejects incomplete/refused/error responses and retains reported usage %#",
    async (overrides) => {
      const { provider, request } = adapter(
        openAIResponse(coachingOpenAI, overrides),
      );
      const receipts: ProviderUsage[] = [];
      await expect(
        provider.analyze(preparedOpenAI, configuration, signal(), (u) =>
          receipts.push(u),
        ),
      ).rejects.toThrow(/OpenAI/);
      expect(request).toHaveBeenCalledTimes(1);
      expect(receipts[0].tokens?.input).toBe(12000);
      expect(receipts[0].status).not.toBe("completed");
    },
  );
  it("rejects invalid structure and unknown, identity-only, duplicate or unsupported recurring evidence", async () => {
    const cases: unknown[] = [
      {},
      { ...coachingOpenAI, identityConfirmed: false },
      ...["invented-frame", "identity-1"].map((frame) => ({
        ...coachingOpenAI,
        observations: [
          { ...coachingOpenAI.observations[0], frameIds: [frame] },
        ],
      })),
      {
        ...coachingOpenAI,
        observations: [
          {
            ...coachingOpenAI.observations[0],
            frameIds: ["frame-1", "frame-1"],
          },
        ],
      },
      {
        ...coachingOpenAI,
        observations: [{ ...coachingOpenAI.observations[0], recurring: true }],
      },
      {
        ...coachingOpenAI,
        observations: [{ ...coachingOpenAI.observations[0], diagnosis: "" }],
      },
      {
        ...coachingOpenAI,
        observations: [
          {
            ...coachingOpenAI.observations[0],
            drill: {
              ...coachingOpenAI.observations[0].drill,
              instructions: [],
            },
          },
        ],
      },
    ];
    for (const output of cases)
      await expect(
        adapter(openAIResponse(output)).provider.analyze(
          preparedOpenAI,
          configuration,
          signal(),
        ),
      ).rejects.toThrow();
    const noEvidence = {
      ...coachingOpenAI,
      identityConfirmed: false,
      observations: [],
    };
    expect(
      (
        await adapter(openAIResponse(noEvidence)).provider.analyze(
          preparedOpenAI,
          configuration,
          signal(),
        )
      ).identityConfirmed,
    ).toBe(false);
  });
  it.each([401, 403, 404, 429, 500, 503])(
    "sanitizes HTTP %i without retrying or exposing raw provider errors",
    async (status) => {
      const request = vi.fn<typeof fetch>(
        async () => new Response(JSON.stringify({ message: key }), { status }),
      );
      const receipts: ProviderUsage[] = [];
      const error = await new OpenAIProvider(key, { request })
        .analyze(preparedOpenAI, configuration, signal(), (r) =>
          receipts.push(r),
        )
        .catch((e: unknown) => e);
      expect((error as Error).message).toContain(`HTTP ${status}`);
      expect((error as Error).message).not.toContain(key);
      expect(receipts[0].tokens).toBeNull();
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  it("handles invalid/truncated/excessive JSON and network failures without disclosing raw content", async () => {
    for (const response of [
      new Response('{"status":'),
      new Response("x".repeat(2 * 1024 * 1024 + 1)),
      new Response("{}"),
    ]) {
      await expect(
        new OpenAIProvider(key, { request: async () => response }).analyze(
          preparedOpenAI,
          configuration,
          signal(),
        ),
      ).rejects.toThrow(/OpenAI/);
    }
    await expect(
      new OpenAIProvider(key, {
        request: async () => {
          throw new Error(key);
        },
      }).analyze(preparedOpenAI, configuration, signal()),
    ).rejects.toThrow("Usage is unknown");
  });
  it("blocks invalid evidence/pre-canceled work and aborts an active fetch", async () => {
    const { provider, request } = adapter();
    for (const video of [
      { ...preparedOpenAI, frames: [] },
      { ...preparedOpenAI, frames: [preparedOpenAI.frames[0]] },
      { ...preparedOpenAI, duration: 301 },
    ])
      await expect(
        provider.analyze(video, configuration, signal()),
      ).rejects.toThrow("No OpenAI request");
    await expect(
      provider.analyze(preparedOpenAI, configuration, AbortSignal.abort()),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
    const controller = new AbortController();
    const pending = new OpenAIProvider(key, {
      request: async (_url, init) => {
        controller.abort();
        init!.signal!.throwIfAborted();
        throw new Error("unreachable");
      },
    });
    await expect(
      pending.analyze(preparedOpenAI, configuration, controller.signal),
    ).rejects.toThrow("canceled");
  });
  it("bounds provider time and payload size without automatic retries", async () => {
    const request = vi.fn<typeof fetch>(
      async (_url, init) =>
        new Promise((_, reject) => {
          init!.signal!.addEventListener(
            "abort",
            () => reject(new Error("synthetic timeout")),
            { once: true },
          );
        }),
    );
    const receipts: ProviderUsage[] = [];
    await expect(
      new OpenAIProvider(key, { request, timeoutMs: 5 }).analyze(
        preparedOpenAI,
        configuration,
        signal(),
        (r) => receipts.push(r),
      ),
    ).rejects.toThrow("timed out");
    expect(receipts[0].status).toBe("timed-out");
    expect(receipts[0].estimatedCostUsd).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    request.mockClear();
    const oversized = {
      ...preparedOpenAI,
      frames: preparedOpenAI.frames.map((f, i) =>
        i ? f : { ...f, data: "A".repeat(19 * 1024 * 1024) },
      ),
    };
    await expect(
      new OpenAIProvider(key, { request }).analyze(
        oversized,
        configuration,
        signal(),
      ),
    ).rejects.toThrow("No OpenAI request");
    expect(request).not.toHaveBeenCalled();
  });
});
describe("server-only opt-in and usage accounting", () => {
  it("preserves Gemini unless OpenAI is selected and never switches provider on a missing key", () => {
    expect(selectProvider({ OPENAI_API_KEY: key })).toBeUndefined();
    expect(
      selectProvider({
        GEMINI_API_KEY: "synthetic-gemini",
        OPENAI_API_KEY: key,
      }),
    ).toBeInstanceOf(GeminiProvider);
    const openai = selectProvider({
      ANALYSIS_PROVIDER: "openai",
      OPENAI_API_KEY: key,
      OPENAI_MODEL: "gpt-6.1-sol",
    });
    expect(openai).toBeInstanceOf(OpenAIProvider);
    expect(openai?.model).toBe("gpt-6.1-sol");
    expect(() =>
      selectProvider({
        ANALYSIS_PROVIDER: "openai",
        GEMINI_API_KEY: "synthetic-gemini",
      }),
    ).toThrow("No automatic fallback");
    expect(() => selectProvider({ ANALYSIS_PROVIDER: "other" })).toThrow();
    expect(() =>
      selectProvider({
        ANALYSIS_PROVIDER: "openai",
        OPENAI_API_KEY: key,
        OPENAI_MAX_OUTPUT_TOKENS: "999999",
      }),
    ).toThrow();
    expect(() => new OpenAIProvider(" \n ")).toThrow();
  });
  it("accounts for cache reads/writes without double-counting reasoning and leaves unknown prices unknown", () => {
    const t = measuredUsage(tokensOpenAI)!;
    expect(t.output).toBe(1000);
    expect(measuredUsage({ ...tokensOpenAI, total_tokens: 1 })).toBeNull();
    const receipt: ProviderUsage = {
      provider: "OpenAI",
      requestedModel: "gpt-6-astra",
      responseModel: "gpt-6-astra",
      requestId: null,
      responseId: null,
      serviceTier: "default",
      status: "completed",
      tokens: t,
      estimatedCostUsd: null,
      pricing: null,
    };
    expect(priceUsage(receipt).estimatedCostUsd).toBeCloseTo(0.2015);
    expect(
      priceUsage({ ...receipt, responseModel: "different-model" })
        .estimatedCostUsd,
    ).toBeNull();
    expect(
      priceUsage({ ...receipt, serviceTier: "priority" }).estimatedCostUsd,
    ).toBeNull();
    expect(
      priceUsage({ ...receipt, tokens: { ...t, cacheWrites30m: null } })
        .estimatedCostUsd,
    ).toBeNull();
    expect(
      measuredUsage({
        ...tokensOpenAI,
        input_tokens_details: { cached_tokens: 13000 },
      }),
    ).toBeNull();
  });
});
