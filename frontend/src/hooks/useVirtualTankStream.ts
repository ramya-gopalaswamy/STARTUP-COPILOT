"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SharkPersonaMessage } from "../lib/types/sharedWorkspace";

function getVirtualTankTestWsUrl(): string {
  if (typeof window === "undefined") return "";
  const explicit =
    process.env.NEXT_PUBLIC_VIRTUAL_TANK_WS_URL ??
    process.env.NEXT_PUBLIC_BACKEND_URL;
  if (explicit) {
    const base = explicit.replace(/\/$/, "");
    const wsProtocol = base.startsWith("https") ? "wss" : "ws";
    const wsBase = base.replace(/^https?:\/\//, `${wsProtocol}://`);
    return `${wsBase}/virtual-tank-test/ws`;
  }
  return "ws://localhost:8000/api/virtual-tank-test/ws";
}

const DEFAULT_WS_URL =
  typeof window !== "undefined" ? getVirtualTankTestWsUrl() : "";

export function useVirtualTankStream(
  active: boolean,
  onWsMessage?: (msg: SharkPersonaMessage) => void,
  founderName?: string,
) {
  const [messages, setMessages] = useState<SharkPersonaMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const onWsMessageRef = useRef(onWsMessage);
  onWsMessageRef.current = onWsMessage;
  const founderNameRef = useRef(founderName);
  founderNameRef.current = founderName;

  useEffect(() => {
    if (!active) return;
    if (socketRef.current) return;

    let url =
      (typeof window !== "undefined" &&
        (process.env.NEXT_PUBLIC_VIRTUAL_TANK_WS_URL ?? DEFAULT_WS_URL)) ||
      DEFAULT_WS_URL;

    if (founderNameRef.current) {
      url += `?founder_name=${encodeURIComponent(founderNameRef.current)}`;
    }

    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onclose = () => {
      setConnected(false);
      socketRef.current = null;
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as SharkPersonaMessage;
        setMessages((prev) => [...prev, parsed]);
        onWsMessageRef.current?.(parsed);
      } catch {
        // ignore malformed frames
      }
    };

    return () => {
      ws.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [active]);

  return {
    messages,
    connected,
    reset: () => setMessages([]),
    addMessages: (msgs: SharkPersonaMessage[]) =>
      setMessages((prev) => [...prev, ...msgs]),
  };
}
