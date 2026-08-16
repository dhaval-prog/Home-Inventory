import { parseVoiceTranscript } from "@/lib/voice/nlu-rules";
import { parseWithGemini, type VaultNluContext } from "@/lib/voice/nlu-gemini";
import type { NluResult } from "@/lib/voice/types";

/**
 * Single entry point for turning a transcript into a structured NluResult.
 * Prefers Gemini (if GEMINI_API_KEY is configured) for richer understanding
 * of free-form phrasing — including multi-turn vault conversations, via the
 * optional `context` — and transparently falls back to the rule-based
 * engine otherwise or on any failure. The rule-based fallback ignores
 * `context` entirely (no multi-turn support without Gemini).
 */
export async function parseTranscript(transcript: string, context?: VaultNluContext): Promise<NluResult> {
  const gemini = await parseWithGemini(transcript, context);
  if (gemini) return gemini;
  return parseVoiceTranscript(transcript);
}
