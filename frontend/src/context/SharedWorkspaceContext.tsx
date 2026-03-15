"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { SharedWorkspace } from "../lib/types/sharedWorkspace";

export type MarketIntelStreamPhase = "idle" | "researching" | "synthesizing";

/** One step in the research/thinking flow (reasoning, search, citation). */
export interface MarketIntelResearchStep {
  type: "reasoning" | "search" | "citation" | "done";
  text?: string;
  url?: string;
}

interface SharedWorkspaceContextValue {
  sharedWorkspace: SharedWorkspace | null;
  loading: boolean;
  marketIntelStreamPhase: MarketIntelStreamPhase;
  marketIntelStreamedText: string;
  /** Live research steps (thinking, search, citations) during Phase 1. */
  marketIntelResearchSteps: MarketIntelResearchStep[];
  refreshFromBackend: () => Promise<void>;
  triggerMarketIntel: () => Promise<void>;
  triggerMarketIntelFollowUp: (question: string) => Promise<void>;
  clearMarketIntelFollowUps: () => Promise<void>;
  triggerAssetForge: () => Promise<void>;
  triggerAssetForgeResyncMarket: () => Promise<void>;
  triggerVCScout: () => Promise<void>;
  triggerCodeLab: () => Promise<void>;
  triggerFinanceAuditor: () => Promise<void>;
}

const SharedWorkspaceContext =
  createContext<SharedWorkspaceContextValue | null>(null);

const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000/api";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options && options.headers),
    },
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

const DEFAULT_WORKSPACE: SharedWorkspace = {
  idea_parsed: false,
  market_gap: null,
  pitch_deck_status: "NotStarted",
  fundability_score: null,
  context_inherited: false,
  market_intel: { status: "IDLE" },
  asset_forge: { status: "IDLE", context_inherited: false },
  vc_scout: { status: "IDLE", pins: [] },
  code_lab: { status: "IDLE" },
  finance_auditor: { status: "IDLE", series: [] },
  virtual_tank: { active: false, last_messages: [] },
};

export function SharedWorkspaceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sharedWorkspace, setSharedWorkspace] =
    useState<SharedWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [marketIntelStreamPhase, setMarketIntelStreamPhase] =
    useState<MarketIntelStreamPhase>("idle");
  const [marketIntelStreamedText, setMarketIntelStreamedText] = useState("");
  const [marketIntelResearchSteps, setMarketIntelResearchSteps] = useState<
    MarketIntelResearchStep[]
  >([]);

  const refreshFromBackend = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<SharedWorkspace>(
        `${BACKEND_BASE_URL}/state`,
      );
      setSharedWorkspace(data);
    } catch {
      setSharedWorkspace(DEFAULT_WORKSPACE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshFromBackend();
  }, [refreshFromBackend]);

  const callAgent = useCallback(
    async (path: string) => {
      setLoading(true);
      const url = `${BACKEND_BASE_URL}${path}`;
      // #region agent log
      if (path.includes("asset-forge")) {
        fetch("http://127.0.0.1:7829/ingest/6dd020a8-50ec-4fd9-9fdf-6a9e6e6337d3", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "02f6f0" },
          body: JSON.stringify({
            sessionId: "02f6f0",
            location: "SharedWorkspaceContext.tsx:callAgent",
            message: "before fetch asset-forge",
            data: { path, url },
            timestamp: Date.now(),
            hypothesisId: "H1",
          }),
        }).catch(() => {});
      }
      // #endregion
      try {
        const data = await fetchJson<SharedWorkspace>(url, { method: "POST" });
        setSharedWorkspace(data);
        // #region agent log
        if (path.includes("asset-forge")) {
          fetch("http://127.0.0.1:7829/ingest/6dd020a8-50ec-4fd9-9fdf-6a9e6e6337d3", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "02f6f0" },
            body: JSON.stringify({
              sessionId: "02f6f0",
              location: "SharedWorkspaceContext.tsx:callAgent",
              message: "after fetch success",
              data: { asset_forge_status: (data as SharedWorkspace)?.asset_forge?.status },
              timestamp: Date.now(),
              hypothesisId: "H4",
            }),
          }).catch(() => {});
        }
        // #endregion
      } catch (e) {
        // #region agent log
        if (path.includes("asset-forge")) {
          fetch("http://127.0.0.1:7829/ingest/6dd020a8-50ec-4fd9-9fdf-6a9e6e6337d3", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "02f6f0" },
            body: JSON.stringify({
              sessionId: "02f6f0",
              location: "SharedWorkspaceContext.tsx:callAgent",
              message: "fetch failed",
              data: { error: String(e) },
              timestamp: Date.now(),
              hypothesisId: "H1",
            }),
          }).catch(() => {});
        }
        // #endregion
        setSharedWorkspace((prev) => prev ?? DEFAULT_WORKSPACE);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const triggerMarketIntelFollowUp = useCallback(
    async (question: string) => {
      const q = (question || "").trim();
      if (!q) return;
      setLoading(true);
      try {
        const data = await fetchJson<SharedWorkspace>(
          `${BACKEND_BASE_URL}/agents/market-intel/follow-up`,
          { method: "POST", body: JSON.stringify({ question: q }) },
        );
        setSharedWorkspace(data);
      } catch {
        setSharedWorkspace((prev) => prev ?? DEFAULT_WORKSPACE);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const triggerMarketIntel = useCallback(async () => {
    setLoading(true);
    setMarketIntelStreamPhase("researching");
    setMarketIntelStreamedText("");
    setMarketIntelResearchSteps([]);
    const streamStart = Date.now();
    const MIN_RESEARCH_MS = 3000; // Show "Still researching…" at least 3s so user sees deep research is running
    const applyPhase = (phase: "researching" | "synthesizing" | "idle") => {
      const elapsed = Date.now() - streamStart;
      const delay = Math.max(0, MIN_RESEARCH_MS - elapsed);
      if (delay > 0) {
        setTimeout(() => setMarketIntelStreamPhase(phase), delay);
      } else {
        setMarketIntelStreamPhase(phase);
      }
    };
    const applyDone = (state: SharedWorkspace) => {
      const elapsed = Date.now() - streamStart;
      const delay = Math.max(0, MIN_RESEARCH_MS - elapsed);
      if (delay > 0) {
        setTimeout(() => {
          setSharedWorkspace(state);
          setMarketIntelStreamPhase("idle");
          setMarketIntelStreamedText("");
          setMarketIntelResearchSteps([]);
        }, delay);
      } else {
        setSharedWorkspace(state);
        setMarketIntelStreamPhase("idle");
        setMarketIntelStreamedText("");
        setMarketIntelResearchSteps([]);
      }
    };
    const url = `${BACKEND_BASE_URL}/agents/market-intel/run-stream`;
    try {
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) {
        throw new Error("No response body");
      }
      let buffer = "";
      let currentEvent = "";
      let currentData: string[] = [];
      const flushMessage = () => {
        if (currentEvent && currentData.length > 0) {
          const data = currentData.join("\n");
          if (currentEvent === "phase") {
            if (data === "researching" || data === "synthesizing") {
              applyPhase(data);
            } else {
              setMarketIntelStreamPhase("idle");
            }
          } else if (currentEvent === "token") {
            setMarketIntelStreamedText((prev) => prev + data);
          } else if (currentEvent === "done") {
            try {
              const state = JSON.parse(data) as SharedWorkspace;
              applyDone(state);
            } catch {
              // ignore parse error
            }
          } else if (currentEvent === "error") {
            setMarketIntelStreamPhase("idle");
            setMarketIntelStreamedText("");
            setMarketIntelResearchSteps([]);
          } else if (currentEvent === "research_step") {
            try {
              const step = JSON.parse(data) as MarketIntelResearchStep;
              if (step.type !== "done") {
                setMarketIntelResearchSteps((prev) => [...prev, step]);
              }
            } catch {
              // ignore parse error
            }
          }
        }
        currentEvent = "";
        currentData = [];
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("event:")) {
            flushMessage();
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            currentData.push(line.slice(5).trim());
          } else if (line === "") {
            flushMessage();
          }
        }
      }
      const lines = buffer.split("\n");
      for (const line of lines) {
        if (line.startsWith("event:")) {
          flushMessage();
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          currentData.push(line.slice(5).trim());
        } else if (line === "") {
          flushMessage();
        }
      }
      flushMessage();
    } catch (e) {
      setMarketIntelStreamPhase("idle");
      setMarketIntelStreamedText("");
      setMarketIntelResearchSteps([]);
      setSharedWorkspace((prev) => prev ?? DEFAULT_WORKSPACE);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearMarketIntelFollowUps = useCallback(async () => {
    try {
      const data = await fetchJson<SharedWorkspace>(
        `${BACKEND_BASE_URL}/agents/market-intel/clear-follow-ups`,
        { method: "POST" },
      );
      setSharedWorkspace(data);
    } catch {
      // ignore; user left the page
    }
  }, []);

  const triggerAssetForge = useCallback(
    () => callAgent("/agents/asset-forge/run"),
    [callAgent],
  );
  const triggerAssetForgeResyncMarket = useCallback(
    () => callAgent("/agents/asset-forge/resync-market"),
    [callAgent],
  );
  const triggerVCScout = useCallback(
    () => callAgent("/agents/vc-scout/run"),
    [callAgent],
  );
  const triggerCodeLab = useCallback(
    () => callAgent("/agents/code-lab/run"),
    [callAgent],
  );
  const triggerFinanceAuditor = useCallback(
    () => callAgent("/agents/finance-auditor/run"),
    [callAgent],
  );

  const value: SharedWorkspaceContextValue = {
    sharedWorkspace,
    loading,
    marketIntelStreamPhase,
    marketIntelStreamedText,
    marketIntelResearchSteps,
    refreshFromBackend,
    triggerMarketIntel,
    triggerMarketIntelFollowUp,
    clearMarketIntelFollowUps,
    triggerAssetForge,
    triggerAssetForgeResyncMarket,
    triggerVCScout,
    triggerCodeLab,
    triggerFinanceAuditor,
  };

  return (
    <SharedWorkspaceContext.Provider value={value}>
      {children}
    </SharedWorkspaceContext.Provider>
  );
}

export function useSharedWorkspace(): SharedWorkspaceContextValue {
  const ctx = useContext(SharedWorkspaceContext);
  if (!ctx) {
    throw new Error(
      "useSharedWorkspace must be used within a SharedWorkspaceProvider",
    );
  }
  return ctx;
}

