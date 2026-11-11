import { z } from "zod";
import { boxingMetrics } from "../src/domain/metrics";
import { drillSchema } from "../src/domain/contracts";
import { findingSchema } from "./provider";
const bounded = z.string().trim().min(1).max(2000);
export const openaiCoachingSchema = z
  .object({
    identityConfirmed: z.boolean(),
    identityExplanation: bounded,
    summary: bounded,
    limitations: z.array(bounded.max(300)).max(6),
    observations: z
      .array(
        z
          .object({
            metricId: findingSchema.shape.metricId,
            category: z.enum(["offense", "defense", "movement", "fight-iq"]),
            classification: z.enum(["observation", "hypothesis"]),
            visibleAction: bounded.max(500),
            frameIds: z.array(z.string().min(1).max(100)).min(1).max(8),
            recurring: z.boolean(),
            diagnosis: bounded.max(800),
            consequence: bounded.max(800),
            correction: bounded.max(1000),
            drill: drillSchema.strict(),
            priority: z.enum(["high", "medium", "low"]),
            polarity: z.enum(["strength", "weakness", "neutral"]),
            uncertainty: bounded.max(600),
          })
          .strict(),
      )
      .max(12),
  })
  .strict()
  .refine(
    (v) => v.identityConfirmed || !v.observations.length,
    "Unconfirmed identity cannot support personalized findings.",
  );

// Responses Structured Outputs requires all properties required and every
// object to disallow additional properties. Runtime Zod applies tighter bounds.
const string = { type: "string" };
const strings = { type: "array", items: string };
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export const OPENAI_COACHING_JSON_SCHEMA = object({
  identityConfirmed: { type: "boolean" },
  identityExplanation: string,
  summary: string,
  limitations: strings,
  observations: {
    type: "array",
    items: object({
      metricId: { type: "string", enum: boxingMetrics },
      category: {
        type: "string",
        enum: ["offense", "defense", "movement", "fight-iq"],
      },
      classification: { type: "string", enum: ["observation", "hypothesis"] },
      visibleAction: string,
      frameIds: strings,
      recurring: { type: "boolean" },
      diagnosis: string,
      consequence: string,
      correction: string,
      drill: object({
        name: string,
        objective: string,
        instructions: strings,
        dosage: string,
        mistakes: strings,
        cues: strings,
      }),
      priority: { type: "string", enum: ["high", "medium", "low"] },
      polarity: { type: "string", enum: ["strength", "weakness", "neutral"] },
      uncertainty: string,
    }),
  },
});
