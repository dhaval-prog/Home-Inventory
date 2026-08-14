import { parseVoiceTranscript } from "@/lib/voice/nlu-rules";
import { parseWithGemini } from "@/lib/voice/nlu-gemini";
import type { NluResult } from "@/lib/voice/types";

/**
 * Single entry point for turning a transcript into a structured NluResult.
 * Prefers Gemini (if GEMINI_API_KEY is configured) for richer understanding
 * of free-form phrasing, and transparently falls back to the rule-based
 * engine otherwise or on any failure.
 */
export async function parseTranscript(transcript: string): Promise<NluResult> {
  const gemini = await parseWithGemini(transcript);
  if (gemini) return gemini;
  return parseVoiceTranscript(transcript);
}
