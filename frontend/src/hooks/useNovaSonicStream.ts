"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SonicMessage {
  shark_id: string;
  display_name: string;
  role: string;
  color: string;
  text: string;
  is_barge_in: boolean;
}

const SHARK_META: Record<
  string,
  { display_name: string; role: string; color: string }
> = {
  hawk: { display_name: "The Hawk", role: "CFO", color: "#FF8100" },
  visionary: {
    display_name: "The Visionary",
    role: "Story Architect",
    color: "#b87aff",
  },
  "tech-giant": {
    display_name: "The Tech Giant",
    role: "Scale Strategist",
    color: "#00FFE5",
  },
  founder: { display_name: "You", role: "Founder", color: "#00FFE5" },
};

function getVirtualTankWsUrl(): string {
  if (typeof window === "undefined") return "";
  const base =
    process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000/api";
  const trimmed = base.replace(/\/$/, "");
  const wsProtocol = trimmed.startsWith("https") ? "wss" : "ws";
  const wsBase = trimmed.replace(/^https?:\/\//, `${wsProtocol}://`);
  return `${wsBase}/virtual-tank/ws-sonic`;
}
const WS_BASE = typeof window !== "undefined" ? getVirtualTankWsUrl() : "";

type PlaybackItem =
  | { kind: "shark_start"; sharkId: string; text: string }
  | { kind: "audio"; data: ArrayBuffer }
  | { kind: "shark_end" };

export function useNovaSonicStream(active: boolean, founderName?: string) {
  const [messages, setMessages] = useState<SonicMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [speakingSharkId, setSpeakingSharkId] = useState<string | null>(null);
  const [userTranscript, setUserTranscript] = useState("");
  const [sessionEnded, setSessionEnded] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const founderNameRef = useRef(founderName);
  founderNameRef.current = founderName;

  // Serialized playback queue
  const playbackQueueRef = useRef<PlaybackItem[]>([]);
  const processingQueueRef = useRef(false);

  const reset = useCallback(() => {
    setMessages([]);
    setSpeakingSharkId(null);
    setUserTranscript("");
    setSessionEnded(false);
    playbackQueueRef.current = [];
    processingQueueRef.current = false;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
  }, []);

  const addMessages = useCallback((msgs: SonicMessage[]) => {
    setMessages((prev) => [...prev, ...msgs]);
  }, []);

  const playMp3 = useCallback((mp3Bytes: ArrayBuffer): Promise<void> => {
    return new Promise((resolve) => {
      const blob = new Blob([mp3Bytes], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        currentAudioRef.current = null;
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        currentAudioRef.current = null;
        resolve();
      };
      audio.play().catch(() => resolve());
    });
  }, []);

  const processPlaybackQueue = useCallback(async () => {
    if (processingQueueRef.current) return;
    processingQueueRef.current = true;

    while (playbackQueueRef.current.length > 0) {
      const item = playbackQueueRef.current.shift()!;
      switch (item.kind) {
        case "shark_start": {
          setSpeakingSharkId(item.sharkId);
          const meta = SHARK_META[item.sharkId] || SHARK_META.hawk;
          if (item.text) {
            setMessages((prev) => [
              ...prev,
              {
                shark_id: item.sharkId,
                display_name: meta.display_name,
                role: meta.role,
                color: meta.color,
                text: item.text,
                is_barge_in: false,
              },
            ]);
          }
          break;
        }
        case "audio":
          await playMp3(item.data);
          break;
        case "shark_end":
          setSpeakingSharkId(null);
          break;
      }
    }

    processingQueueRef.current = false;
  }, [playMp3]);

  useEffect(() => {
    if (!active) {
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch {
          /* ok */
        }
        socketRef.current = null;
      }
      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (captureCtxRef.current) {
        captureCtxRef.current.close().catch(() => {});
        captureCtxRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      playbackQueueRef.current = [];
      processingQueueRef.current = false;
      setConnected(false);
      setSpeakingSharkId(null);
      return;
    }

    if (socketRef.current) return;

    let url = WS_BASE;
    if (founderNameRef.current) {
      url += `?founder_name=${encodeURIComponent(founderNameRef.current)}`;
    }

    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    socketRef.current = ws;

    ws.onopen = async () => {
      setConnected(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        mediaStreamRef.current = stream;

        const audioCtx = new AudioContext({ sampleRate: 16000 });
        captureCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        sourceRef.current = source;

        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          if (!activeRef.current || ws.readyState !== WebSocket.OPEN) return;
          const input = e.inputBuffer.getChannelData(0);
          const pcm = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          ws.send(pcm.buffer);
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
        processorRef.current = processor;
      } catch (err) {
        console.error("Mic access failed:", err);
      }
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        playbackQueueRef.current.push({ kind: "audio", data: event.data });
        processPlaybackQueue();
      } else {
        try {
          const msg = JSON.parse(event.data) as {
            type: string;
            role?: string;
            text?: string;
            shark_id?: string;
          };

          if (msg.type === "transcript" && msg.text) {
            const text = msg.text;
            setUserTranscript(text);
            setMessages((prev) => [
              ...prev,
              {
                shark_id: "founder",
                display_name: "You",
                role: "Founder",
                color: "#00FFE5",
                text,
                is_barge_in: false,
              },
            ]);
          } else if (msg.type === "shark_speaking" && msg.shark_id) {
            playbackQueueRef.current.push({
              kind: "shark_start",
              sharkId: msg.shark_id,
              text: msg.text || "",
            });
            processPlaybackQueue();
          } else if (msg.type === "shark_done") {
            playbackQueueRef.current.push({ kind: "shark_end" });
            processPlaybackQueue();
          } else if (msg.type === "session_end") {
            setSessionEnded(true);
            setSpeakingSharkId(null);
          }
        } catch {
          // ignore
        }
      }
    };

    ws.onclose = () => {
      setConnected(false);
      socketRef.current = null;
    };

    ws.onerror = () => {};

    return () => {
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
      socketRef.current = null;
      setConnected(false);
    };
  }, [active, playMp3, processPlaybackQueue]);

  const sendText = useCallback((text: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "text_input", text }));
    }
  }, []);

  const stopSession = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "stop" }));
    }
  }, []);

  return {
    messages,
    connected,
    speakingSharkId,
    userTranscript,
    sessionEnded,
    reset,
    addMessages,
    sendText,
    stopSession,
  };
}
