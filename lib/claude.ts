import Anthropic from "@anthropic-ai/sdk";

// One place to change the model.
export const MODEL = "claude-opus-5";

let client: Anthropic | null = null;
export function claude() {
  // Reads ANTHROPIC_API_KEY from the environment (.env.local for Next, dotenv for scripts).
  client ??= new Anthropic();
  return client;
}

// Server-side refusal fallback: if the primary model declines, the API retries on a fallback model in the same call.
export const FALLBACK_OPTS = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};
