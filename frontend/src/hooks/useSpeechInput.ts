"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechInputResult {
  listening: boolean;
  transcript: string;
  supported: boolean;
  start: () => void;
  stop: () => void;
}

const SILENCE_TIMEOUT_MS = 2500;

let globalGeneration = 0;

export function useSpeechInput(
  active: boolean,
  onResult: (text: string) => void,
): SpeechInputResult {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  // SpeechRecognition is a browser API not in TypeScript's default DOM lib
  const recRef = useRef<{ abort: () => void; start: () => void; stop: () => void } | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const activeRef = useRef(active);
  activeRef.current = active;
  const genRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedRef = useRef("");

  const supported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const clearTimers = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const submitAccumulated = useCallback(() => {
    const text = accumulatedRef.current.trim();
    if (text) {
      onResultRef.current(text);
    }
    accumulatedRef.current = "";
    setTranscript("");
  }, []);

  const stopListening = useCallback(() => {
    clearTimers();
    genRef.current = 0;
    const rec = recRef.current;
    if (rec) {
      try { rec.abort(); } catch { /* already stopped */ }
      recRef.current = null;
    }
    accumulatedRef.current = "";
    setListening(false);
    setTranscript("");
  }, [clearTimers]);

  const startListening = useCallback(() => {
    if (!supported) return;
    clearTimers();
    if (recRef.current) {
      try { recRef.current.abort(); } catch { /* ok */ }
      recRef.current = null;
    }

    const gen = ++globalGeneration;
    genRef.current = gen;

    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.maxAlternatives = 1;
    recRef.current = rec;
    accumulatedRef.current = "";

    rec.onstart = () => {
      if (globalGeneration !== gen) return;
      setListening(true);
    };

    rec.onresult = (event: { results: Array<{ isFinal: boolean; 0: { transcript: string }; length: number }> }) => {
      if (globalGeneration !== gen) return;
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) {
          finalText += r[0].transcript;
        } else {
          interimText += r[0].transcript;
        }
      }

      if (finalText) {
        accumulatedRef.current = finalText;
      }
      const display = (finalText + " " + interimText).trim() || interimText;
      setTranscript(display);

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        if (globalGeneration !== gen) return;
        submitAccumulated();
        if (recRef.current === rec) {
          try { rec.stop(); } catch { /* ok */ }
        }
      }, SILENCE_TIMEOUT_MS);
    };

    rec.onerror = () => {};

    rec.onend = () => {
      if (globalGeneration !== gen) return;
      recRef.current = null;
      setListening(false);
      if (activeRef.current) {
        restartTimerRef.current = setTimeout(() => {
          if (activeRef.current && globalGeneration === gen) startListening();
        }, 500);
      }
    };

    try {
      rec.start();
    } catch {
      recRef.current = null;
    }
  }, [supported, clearTimers, submitAccumulated]);

  useEffect(() => {
    if (active && supported) {
      startListening();
    }
    return () => stopListening();
  }, [active, supported, startListening, stopListening]);

  return { listening, transcript, supported, start: startListening, stop: stopListening };
}
