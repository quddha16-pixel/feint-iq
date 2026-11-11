import { z } from "zod";
const count = z.number().int().nonnegative();
const usageSchema = z.object({
  input_tokens: count,
  output_tokens: count,
  total_tokens: count,
  input_tokens_details: z
    .object({
      cached_tokens: count,
      cache_write_tokens: count.optional(),
      cache_write_tokens_details: z
        .object({ ttl_30m_tokens: count, ttl_12h_tokens: count })
        .optional(),
    })
    .optional(),
  output_tokens_details: z.object({ reasoning_tokens: count }).optional(),
});
export interface ProviderUsage {
  provider: "OpenAI";
  requestedModel: string;
  responseModel: string | null;
  requestId: string | null;
  responseId: string | null;
  serviceTier: string | null;
  status: string;
  tokens: {
    input: number;
    cachedInput: number | null;
    cacheWrites: number | null;
    cacheWrites30m: number | null;
    cacheWrites12h: number | null;
    output: number;
    reasoning: number | null;
    total: number;
  } | null;
  estimatedCostUsd: number | null;
  pricing: {
    source: string;
    checked: string;
    inputPerMillion: number;
    cachedInputPerMillion: number;
    outputPerMillion: number;
    cacheWrite30mPerMillion: number;
    cacheWrite12hPerMillion: number;
  } | null;
}
// Standard public list prices, NOT an invoice. Other models/tiers stay unknown.
const ASTRA_PRICING = {
  source: "https://developers.openai.com/api/docs/models/gpt-6-astra",
  checked: "2026-11-10",
  inputPerMillion: 10,
  cachedInputPerMillion: 1,
  outputPerMillion: 50,
  cacheWrite30mPerMillion: 12.5,
  cacheWrite12hPerMillion: 25,
};
export function measuredUsage(value: unknown): ProviderUsage["tokens"] {
  const parsed = usageSchema.safeParse(value);
  if (!parsed.success) return null;
  const v = parsed.data;
  const details = v.input_tokens_details;
  const cached = details?.cached_tokens ?? null;
  const writes = details?.cache_write_tokens ?? null;
  const ttl = details?.cache_write_tokens_details;
  if (
    v.total_tokens !== v.input_tokens + v.output_tokens ||
    (cached !== null && cached > v.input_tokens) ||
    (cached !== null && writes !== null && cached + writes > v.input_tokens) ||
    (ttl && ttl.ttl_30m_tokens + ttl.ttl_12h_tokens !== writes) ||
    (v.output_tokens_details?.reasoning_tokens ?? 0) > v.output_tokens
  )
    return null;
  return {
    input: v.input_tokens,
    cachedInput: cached,
    cacheWrites: writes,
    cacheWrites30m: ttl?.ttl_30m_tokens ?? null,
    cacheWrites12h: ttl?.ttl_12h_tokens ?? null,
    output: v.output_tokens,
    reasoning: v.output_tokens_details?.reasoning_tokens ?? null,
    total: v.total_tokens,
  };
}
export function priceUsage(
  receipt: ProviderUsage,
): Pick<ProviderUsage, "estimatedCostUsd" | "pricing"> {
  const t = receipt.tokens;
  if (
    receipt.responseModel !== "gpt-6-astra" ||
    receipt.serviceTier !== "default" ||
    !t ||
    t.cachedInput === null ||
    t.cacheWrites === null
  )
    return { estimatedCostUsd: null, pricing: null };
  if (
    t.cacheWrites > 0 &&
    (t.cacheWrites30m === null || t.cacheWrites12h === null)
  )
    return { estimatedCostUsd: null, pricing: null };
  const ordinary = t.input - t.cachedInput - t.cacheWrites;
  const p = ASTRA_PRICING;
  const cost =
    (ordinary * p.inputPerMillion +
      t.cachedInput * p.cachedInputPerMillion +
      (t.cacheWrites30m ?? 0) * p.cacheWrite30mPerMillion +
      (t.cacheWrites12h ?? 0) * p.cacheWrite12hPerMillion +
      t.output * p.outputPerMillion) /
    1_000_000;
  return { estimatedCostUsd: cost, pricing: { ...p } };
}
