import { GeminiProvider, type VideoAnalysisProvider } from "./provider";
import { OpenAIProvider } from "./openai-provider";
/** Explicit server-side provider choice. Gemini remains the legacy default;
 * merely adding an OpenAI key does not activate a paid analysis path. */
export function selectProvider(
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
): VideoAnalysisProvider | undefined {
  const selected = env.ANALYSIS_PROVIDER || "gemini";
  if (selected === "none") return undefined;
  if (selected === "gemini") {
    if (!env.GEMINI_API_KEY) {
      if (env.ANALYSIS_PROVIDER === "gemini")
        throw new Error(
          "GEMINI_API_KEY is required for the selected provider.",
        );
      return undefined;
    }
    return new GeminiProvider(
      env.GEMINI_API_KEY,
      env.GEMINI_MODEL || undefined,
      request,
    );
  }
  if (selected !== "openai")
    throw new Error("ANALYSIS_PROVIDER must be openai, gemini, or none.");
  if (!env.OPENAI_API_KEY)
    throw new Error(
      "OPENAI_API_KEY is required for the selected provider. No automatic fallback was made.",
    );
  const effort = env.OPENAI_REASONING_EFFORT || "high";
  if (!["low", "medium", "high", "xhigh", "max"].includes(effort))
    throw new Error("Invalid OPENAI_REASONING_EFFORT.");
  return new OpenAIProvider(env.OPENAI_API_KEY, {
    model: env.OPENAI_MODEL || undefined,
    reasoningEffort: effort as "low" | "medium" | "high" | "xhigh" | "max",
    maxOutputTokens: env.OPENAI_MAX_OUTPUT_TOKENS
      ? Number(env.OPENAI_MAX_OUTPUT_TOKENS)
      : undefined,
    maxRequestUsd: env.OPENAI_MAX_REQUEST_USD
      ? Number(env.OPENAI_MAX_REQUEST_USD)
      : undefined,
    request,
  });
}
