"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SONIC_WS_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_VIRTUAL_TANK_WS_URL ?? "ws://localhost:8000/api/virtual-tank-test/ws").replace(
        "/ws",
        "/sonic-ws"
      )
    : "";

const OUTPUT_SAMPLE_RATE = 24000;

// VAD: silence (ms) after speech to auto end turn. Chunk ~43ms at 2048 samples @ 48kHz.
const SILENCE_MS = 1200;
const CHUNK_MS = (2048 / 48000) * 1000;
const SILENT_CHUNKS = Math.max(1, Math.round(SILENCE_MS / CHUNK_MS));
const SPEECH_THRESHOLD = 0.02;  // RMS above = speech
const SILENCE_THRESHOLD = 0.012; // RMS below = silence
const VAD_COOLDOWN_MS = 2500;    // after auto endTurn, ignore VAD briefly

function rms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function useSonicVoice(active: boolean, voiceOn: boolean) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const playbackRef = useRef<AudioContext | null>(null);
  const nextStartRef = useRef(0);
  const onUserTranscriptRef = useRef<((text: string) => void) | null>(null);
  const sendEndTurnRef = useRef<() => void>(() => {});
  const vadSilentCountRef = useRef(0);
  const vadHasSpokenRef = useRef(false);
  const vadCooldownUntilRef = useRef(0);

  const pushUserTranscript = useCallback((text: string) => {
    onUserTranscriptRef.current?.(text);
  }, []);

  useEffect(() => {
    if (!active || !voiceOn || typeof window === "undefined" || !SONIC_WS_URL) return;

    setError(null);
    const ws = new WebSocket(SONIC_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
    };
    ws.onerror = () => setError("WebSocket error");

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          type?: string;
          audio?: string;
          text?: string;
        };
        const type = data.type;
        if (type === "error") {
          setError(data.text ?? "Sonic error");
          return;
        }
        if (type === "_done") return;

        if (type === "audio" && data.audio) {
          const buf = base64ToArrayBuffer(data.audio);
          const view = new Int16Array(buf);
          const float = new Float32Array(view.length);
          for (let i = 0; i < view.length; i++) float[i] = view[i] / 32768;
          const ctx = playbackRef.current;
          if (!ctx) return;
          if (ctx.state === "suspended") ctx.resume();
          const audioBuffer = ctx.createBuffer(1, float.length, OUTPUT_SAMPLE_RATE);
          audioBuffer.getChannelData(0).set(float);
          const start = Math.max(nextStartRef.current, ctx.currentTime);
          nextStartRef.current = start + audioBuffer.duration;
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          source.start(start);
        }

        if ((type === "transcript_user" || type === "transcript_assistant") && data.text) {
          setLiveTranscript((prev) => [...prev, { role: type === "transcript_user" ? "user" : "assistant", text: data.text! }]);
          if (type === "transcript_user") pushUserTranscript(data.text);
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [active, voiceOn, pushUserTranscript]);

  // Playback AudioContext (24 kHz for Sonic output). Create and resume on voice-on (user gesture).
  useEffect(() => {
    if (!active || !voiceOn || typeof window === "undefined") return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    playbackRef.current = ctx;
    nextStartRef.current = 0;
    void ctx.resume();
    return () => {
      ctx.close();
      playbackRef.current = null;
    };
  }, [active, voiceOn]);

  // Mic capture: send PCM chunks to Sonic WS
  useEffect(() => {
    if (!active || !voiceOn || !connected || !wsRef.current) return;

    let cancelled = false;
    const run = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        contextRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        sourceRef.current = src;
        const processor = ctx.createScriptProcessor(2048, 1, 1);
        processorRef.current = processor;
        processor.onaudioprocess = (e) => {
          const ws = wsRef.current;
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          const input = e.inputBuffer.getChannelData(0);
          const level = rms(input);
          const now = Date.now();
          if (now < vadCooldownUntilRef.current) {
            // still send audio during cooldown, just don't trigger VAD
          } else if (level > SPEECH_THRESHOLD) {
            vadHasSpokenRef.current = true;
            vadSilentCountRef.current = 0;
          } else if (level < SILENCE_THRESHOLD && vadHasSpokenRef.current) {
            vadSilentCountRef.current += 1;
            if (vadSilentCountRef.current >= SILENT_CHUNKS) {
              sendEndTurnRef.current();
            }
          }
          const i16 = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          const base64 = btoa(String.fromCharCode(...new Uint8Array(i16.buffer)));
          ws.send(JSON.stringify({ audio: base64, sampleRate: ctx.sampleRate }));
        };
        src.connect(processor);
        const gain = ctx.createGain();
        gain.gain.value = 0;
        processor.connect(gain);
        gain.connect(ctx.destination);
      } catch (err) {
        if (!cancelled) setError("Microphone access denied");
      }
    };
    run();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      processorRef.current?.disconnect();
      processorRef.current = null;
      sourceRef.current?.disconnect();
      sourceRef.current = null;
      contextRef.current?.close();
      contextRef.current = null;
    };
  }, [active, voiceOn, connected]);

  const sendEndTurn = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ endTurn: true }));
      vadHasSpokenRef.current = false;
      vadSilentCountRef.current = 0;
      vadCooldownUntilRef.current = Date.now() + VAD_COOLDOWN_MS;
    }
  }, []);
  sendEndTurnRef.current = sendEndTurn;

  const setOnUserTranscript = useCallback((fn: ((text: string) => void) | null) => {
    onUserTranscriptRef.current = fn;
  }, []);

  const resetTranscript = useCallback(() => setLiveTranscript([]), []);

  return {
    connected,
    error,
    liveTranscript,
    sendEndTurn,
    setOnUserTranscript,
    resetTranscript,
  };
}
