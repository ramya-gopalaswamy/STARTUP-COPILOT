"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useSharedWorkspace } from "../context/SharedWorkspaceContext";

const TEAL = "#00FFE5";
const AMBER = "#FF8100";
const NAVY = "#001a1a";

const AGENT_IDS = [
  "market_intel",
  "asset_forge",
  "vc_scout",
  "code_lab",
  "finance_auditor",
] as const;

interface OysterPitchButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  /** Optional completion count 0–5; if not provided, uses SharedWorkspace */
  completionCount?: number;
}

function useCompletionCount(overrideCount?: number): number {
  const { sharedWorkspace } = useSharedWorkspace();
  if (overrideCount !== undefined) return overrideCount;
  let count = 0;
  for (const id of AGENT_IDS) {
    const agent = sharedWorkspace?.[id as keyof typeof sharedWorkspace];
    if (agent && typeof agent === "object" && "status" in agent && agent.status === "COMPLETE")
      count++;
  }
  return count;
}

export function OysterPitchButton({
  onClick,
  disabled,
  className = "",
  completionCount: completionCountProp,
}: OysterPitchButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [ripple, setRipple] = useState(false);
  const completionCount = useCompletionCount(completionCountProp);
  const totalModules = 5;
  const completionPercent = totalModules ? (completionCount / totalModules) * 100 : 0;
  const allComplete = completionCount >= totalModules;
  const audioContextRef = useRef<AudioContext | null>(null);

  const playSonarPing = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const ctx = audioContextRef.current ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      if (!audioContextRef.current) audioContextRef.current = ctx;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(80, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    return () => {
      try {
        audioContextRef.current?.close();
      } catch {
        // ignore
      }
    };
  }, []);

  const handleClick = () => {
    if (disabled) return;
    setRipple(true);
    onClick();
    setTimeout(() => setRipple(false), 1200);
  };

  const handleHoverStart = () => {
    if (!disabled) setHovered(true);
    playSonarPing();
  };

  const handleHoverEnd = () => setHovered(false);

  const pearlSpinDuration = allComplete ? 2.5 : Math.max(4 - completionCount * 0.5, 2.5);
  const pearlGlow = allComplete
    ? { teal: 0.25, amber: 0.5, halo: true }
    : completionPercent > 0
      ? { teal: 0.2 + completionPercent / 500, amber: 0, halo: false }
      : { teal: 0.1, amber: 0, halo: false };

  return (
    <div className={`relative flex flex-col items-center justify-end ${className}`}>
      {/* Click: bright teal flash rippling out from pearl across the dashboard */}
      {ripple && (
        <motion.div
          className="absolute pointer-events-none rounded-full"
          style={{ width: 200, height: 200 }}
          initial={{ scale: 0.2, opacity: 1 }}
          animate={{ scale: 25, opacity: 0 }}
          transition={{ duration: 1.4, ease: "easeOut" }}
          aria-hidden
        >
          <div
            className="w-full h-full rounded-full"
            style={{
              boxShadow: `0 0 120px 60px ${TEAL}, 0 0 240px 100px rgba(0,255,229,0.4)`,
            }}
          />
        </motion.div>
      )}

      {/* Oyster image + pearl on top — fixed layout so button never shifts */}
      <div
        className="relative flex flex-col items-center justify-end w-[480px] md:w-[560px] mt-28 md:mt-36 min-h-[200px] md:min-h-[220px]"
        onMouseEnter={handleHoverStart}
        onMouseLeave={handleHoverEnd}
      >
        <img
          src="/images/oyster.png"
          alt=""
          className="relative z-0 w-full h-auto object-contain max-h-[280px] md:max-h-[320px]"
          aria-hidden
        />

        {/* Pearl: solid golden bubble — no hover scale so position stays fixed */}
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          className="oyster-pearl absolute top-[58%] left-[50%] w-[100px] h-[100px] md:w-[112px] md:h-[112px] rounded-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 overflow-hidden flex items-center justify-center z-10"
          style={{
            transform: "translate(-50%, -50%)",
            background:
              "radial-gradient(circle at 35% 35%, #fffef0 0%, #ffd700 30%, #daa520 65%, #b8860b 100%)",
            boxShadow: hovered && !disabled
              ? "0 0 50px rgba(255, 215, 0, 0.8), 0 0 90px rgba(218, 165, 32, 0.4), inset -5px -5px 14px rgba(0,0,0,0.35), inset 3px 3px 10px rgba(255,255,255,0.3)"
              : "0 0 35px rgba(255, 215, 0, 0.6), 0 0 70px rgba(218, 165, 32, 0.25), inset -5px -5px 14px rgba(0,0,0,0.35), inset 3px 3px 10px rgba(255,255,255,0.25)",
            transition: "box-shadow 0.3s ease, filter 0.3s ease",
            filter: hovered && !disabled ? "brightness(1.1)" : "brightness(1)",
          }}
        >
          {/* Subtle highlight overlay (solid, no transparency) */}
          <span
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: "radial-gradient(circle at 32% 32%, rgba(255,255,255,0.4) 0%, transparent 50%)",
            }}
          />
          {pearlGlow.halo && (
            <motion.span
              className="absolute inset-0 rounded-full pointer-events-none border-2 border-amber-300/60"
              initial={{ scale: 1, opacity: 0 }}
              animate={{ scale: 1.2, opacity: 0.6 }}
              transition={{ duration: 0.6 }}
              style={{ boxShadow: "0 0 24px rgba(255, 215, 0, 0.5)" }}
            />
          )}
          <span
            className="relative z-10 font-bold uppercase tracking-[0.15em] text-[0.7rem] md:text-[0.8rem] text-white text-center leading-tight px-2 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
            style={{ textShadow: "0 0 12px rgba(0,0,0,0.7), 0 1px 2px rgba(255,215,0,0.3)" }}
          >
            LET&apos;S PITCH
          </span>
        </button>
      </div>
    </div>
  );
}
