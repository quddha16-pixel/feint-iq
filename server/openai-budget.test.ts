import { describe, expect, it, vi } from "vitest";
import { OpenAIProvider } from "./openai-provider";
import {
  maximumGenerationCost,
  priceUsage,
  type ProviderUsage,
} from "./provider-usage";
import { makeReport } from "../tests/fixture";
import { preparedOpenAI, openAIResponse } from "../tests/openai-fixture";
const key = "synthetic-budget-test-key-never-real";
const signal = () => new AbortController().signal;
const config = makeReport().configuration;
describe("verified Astra pricing and the single-request test budget", () => {
  it("charges the full request at long-context rates above 272K, including output", () => {
    expect(maximumGenerationCost("gpt-6-astra", 272000, 16384)).toBeCloseTo(
      3.5392,
    );
    expect(maximumGenerationCost("gpt-6-astra", 272001, 16384)).toBeCloseTo(
      6.66882,
    );
    expect(maximumGenerationCost("gpt-6-astra", 272000, 32768)).toBeCloseTo(
      4.3584,
    );
    expect(maximumGenerationCost("unverified-model", 1, 1)).toBeNull();
    const receipt: ProviderUsage = {
      provider: "OpenAI",
      requestedModel: "gpt-6-astra",
      responseModel: "gpt-6-astra",
      requestId: null,
      responseId: null,
      serviceTier: "default",
      status: "completed",
      tokens: {
        input: 300000,
        cachedInput: 0,
        cacheWrites: 0,
        cacheWrites30m: 0,
        cacheWrites12h: 0,
        output: 1000,
        reasoning: 500,
        total: 301000,
      },
      estimatedCostUsd: null,
      pricing: null,
    };
    expect(priceUsage(receipt)).toMatchObject({
      estimatedCostUsd: 6.075,
      pricing: { context: "long", inputPerMillion: 20, outputPerMillion: 75 },
    });
  });
  it("counts the exact multimodal/schema input before permitting one bounded generation", async () => {
    const request = vi.fn<typeof fetch>(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).endsWith("/input_tokens")
              ? { object: "response.input_tokens", input_tokens: 12000 }
              : openAIResponse(),
          ),
        ),
    );
    const receipts: ProviderUsage[] = [];
    await new OpenAIProvider(key, { request, maxRequestUsd: 4.5 }).analyze(
      preparedOpenAI,
      config,
      signal(),
      (r) => receipts.push(r),
    );
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "https://api.openai.com/v1/responses/input_tokens",
      "https://api.openai.com/v1/responses",
    ]);
    const countBody = JSON.parse(String(request.mock.calls[0][1]?.body));
    const generationBody = JSON.parse(String(request.mock.calls[1][1]?.body));
    for (const field of [
      "model",
      "input",
      "instructions",
      "text",
      "reasoning",
      "tools",
    ])
      expect(countBody[field]).toEqual(generationBody[field]);
    expect(generationBody.prompt_cache_options).toEqual({ mode: "explicit" });
    expect(receipts[0].preflight).toEqual({
      inputTokens: 12000,
      maxOutputTokens: 16384,
      worstCaseCostUsd: 0.9392,
      limitUsd: 4.5,
    });
  });
  it("rejects an over-budget generation before submission and records the reason", async () => {
    const request = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            object: "response.input_tokens",
            input_tokens: 272001,
          }),
        ),
    );
    const receipts: ProviderUsage[] = [];
    await expect(
      new OpenAIProvider(key, { request, maxRequestUsd: 4.5 }).analyze(
        preparedOpenAI,
        config,
        signal(),
        (r) => receipts.push(r),
      ),
    ).rejects.toThrow("exceeds");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toContain("/input_tokens");
    expect(receipts[0].status).toBe("budget-rejected");
    expect(receipts[0].tokens).toBeNull();
  });
  it("fails closed on unavailable counts, bad pricing or invalid limits without disclosing secrets", async () => {
    for (const request of [
      vi.fn<typeof fetch>(async () => new Response(key, { status: 503 })),
      vi.fn<typeof fetch>(async () => new Response("{}")),
      vi.fn<typeof fetch>(async () => {
        throw new Error(key);
      }),
    ]) {
      const error = await new OpenAIProvider(key, {
        request,
        maxRequestUsd: 4.5,
      })
        .analyze(preparedOpenAI, config, signal())
        .catch((e: unknown) => e);
      expect((error as Error).message).toContain("No generation request");
      expect((error as Error).message).not.toContain(key);
      expect(request).toHaveBeenCalledTimes(1);
    }
    const request = vi.fn<typeof fetch>();
    await expect(
      new OpenAIProvider(key, {
        model: "unverified-model",
        request,
        maxRequestUsd: 4.5,
      }).analyze(preparedOpenAI, config, signal()),
    ).rejects.toThrow("No verified budget pricing");
    expect(request).not.toHaveBeenCalled();
    for (const maxRequestUsd of [0, -1, NaN, Infinity])
      expect(() => new OpenAIProvider(key, { maxRequestUsd })).toThrow();
  });
});
