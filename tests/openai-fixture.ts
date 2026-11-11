// Synthetic HTTP-contract data only; never imported by application code.
import type { PreparedVideo } from "../server/media";
import type { z } from "zod";
import type { openaiCoachingSchema } from "../server/openai-schema";
export const preparedOpenAI: PreparedVideo = {
  duration: 12,
  frames: [
    {
      id: "frame-1",
      time: 0,
      mime: "image/jpeg",
      data: Buffer.from("synthetic-image-one").toString("base64"),
    },
    {
      id: "frame-2",
      time: 6,
      mime: "image/jpeg",
      data: Buffer.from("synthetic-image-two").toString("base64"),
    },
    {
      id: "frame-3",
      time: 11,
      mime: "image/jpeg",
      data: Buffer.from("synthetic-image-three").toString("base64"),
    },
    {
      id: "identity-1",
      time: 1,
      mime: "image/jpeg",
      data: Buffer.from("synthetic-identity-image").toString("base64"),
      identityReference: { x: 0.4, y: 0.5 },
    },
  ],
};
export const coachingOpenAI: z.infer<typeof openaiCoachingSchema> = {
  identityConfirmed: true,
  identityExplanation: "Synthetic assertion for tests only.",
  summary:
    "Synthetic OpenAI test assessment, not an analysis of actual boxing.",
  limitations: ["Synthetic test; no movement was assessed."],
  observations: [
    {
      metricId: "defense",
      category: "defense",
      classification: "hypothesis",
      visibleAction: "Synthetic guard-position example",
      frameIds: ["frame-2"],
      recurring: false,
      diagnosis: "Synthetic mechanical diagnosis",
      consequence: "Synthetic tactical consequence",
      correction: "Synthetic targeted guard correction",
      priority: "high",
      polarity: "weakness",
      uncertainty: "Cannot establish a full exchange from still images.",
      drill: {
        name: "Synthetic technical drill",
        objective: "Synthetic guard recovery",
        instructions: [
          "Perform the coach-reviewed test movement at controlled speed.",
        ],
        dosage: "Two technical rounds",
        mistakes: ["Do not rush the recovery"],
        cues: ["Recover before resetting"],
      },
    },
  ],
};
export const tokensOpenAI = {
  input_tokens: 12000,
  input_tokens_details: {
    cached_tokens: 4000,
    cache_write_tokens: 7000,
    cache_write_tokens_details: { ttl_30m_tokens: 3000, ttl_12h_tokens: 4000 },
  },
  output_tokens: 1000,
  output_tokens_details: { reasoning_tokens: 600 },
  total_tokens: 13000,
};
export function openAIResponse(
  coaching: unknown = coachingOpenAI,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "resp_synthetic",
    model: "gpt-6-astra",
    service_tier: "default",
    status: "completed",
    usage: tokensOpenAI,
    output: [
      { type: "reasoning", summary: [] },
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: JSON.stringify(coaching) }],
      },
    ],
    ...overrides,
  };
}
