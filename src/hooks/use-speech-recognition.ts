"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal ambient typing for the Web Speech API (no official TS lib types
 * exist for it, and browser support is prefixed on WebKit/Blink). Only the
 * members this hook actually uses are declared.
 */
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type VoiceErrorKind = "permission-denied" | "no-speech" | "no-mic" | "network" | "unknown";

export interface UseSpeechRecognitionResult {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  error: VoiceErrorKind | null;
  /** Starts listening. onFinalTranscript fires once with the accumulated
   * transcript when the recognizer naturally ends (silence/pause) — the
   * reliable way to know "the user is done talking" without racing setState. */
  start: (onFinalTranscript?: (transcript: string) => void) => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Thin wrapper around the browser's native SpeechRecognition. Recording only
 * ever starts from an explicit start() call (a user tapping the mic) and a
 * fresh recognizer instance is created per session — there is no continuous
 * background listening. Falls back gracefully (isSupported=false) on
 * browsers without the API so text search keeps working unaffected.
 */
export function useSpeechRecognition(): UseSpeechRecognitionResult {
  const [isSupported] = useState(() => getSpeechRecognitionConstructor() !== null);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<VoiceErrorKind | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const start = useCallback((onFinalTranscript?: (transcript: string) => void) => {
    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) {
      setError("unknown");
      return;
    }

    setTranscript("");
    setError(null);
    let latest = "";
    let hadError = false;

    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";

    recognition.onresult = (event) => {
      let combined = "";
      for (let i = 0; i < event.results.length; i++) {
        combined += event.results[i][0].transcript;
      }
      latest = combined;
      setTranscript(combined);
    };

    recognition.onerror = (event) => {
      hadError = true;
      if (event.error === "not-allowed" || event.error === "permission-denied") setError("permission-denied");
      else if (event.error === "no-speech") setError("no-speech");
      else if (event.error === "audio-capture") setError("no-mic");
      else if (event.error === "network") setError("network");
      else setError("unknown");
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      if (!hadError && latest.trim()) onFinalTranscript?.(latest.trim());
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    setError(null);
  }, []);

  return { isSupported, isListening, transcript, error, start, stop, reset };
}
