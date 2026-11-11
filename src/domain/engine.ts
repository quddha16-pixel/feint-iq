import { z } from "zod";
export const PILOT_LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  minSeconds: 10,
  maxSeconds: 300,
  maxFrames: 125,
  fps: 2,
  maxIdentityFrames: 5,
} as const;
export const engineHealthSchema = z.object({
  schemaVersion: z.literal(1),
  protocol: z.literal("request-stream-v1").optional(),
  available: z.boolean(),
  provider: z.string(),
  model: z.string(),
  tracking: z.literal(false),
  qualitativeOnly: z.literal(true),
  momentDetection: z.boolean().optional(),
  limits: z.object({
    maxBytes: z.number().positive(),
    minSeconds: z.number().positive(),
    maxSeconds: z.number().positive(),
  }),
  message: z.string(),
});
export type EngineHealth = z.infer<typeof engineHealthSchema>;
