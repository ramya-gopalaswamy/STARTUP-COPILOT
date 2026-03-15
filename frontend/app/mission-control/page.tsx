"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Cpu, Globe2, LibraryBig, LineChart, Network, PhoneOff } from "lucide-react";
import { useSharedWorkspace } from "../../src/context/SharedWorkspaceContext";
import { EnterTankButton } from "../../src/components/EnterTankButton";

const SONAR_INTERVAL_MS = 5000;
const SONAR_TRAVEL_MS = 2500;
const SONAR_HIT_DURATION_MS = 400;

/** Floating keyframes: slight drift so each bubble moves independently (phase via delay) */
const FLOAT_OFFSETS = [
  { x: [0, 8, -5, 0], y: [0, -6, 4, 0], duration: 6 },
  { x: [0, -6, 7, 0], y: [0, 5, -4, 0], duration: 7 },
  { x: [0, 5, -7, 0], y: [0, -4, 6, 0], duration: 6.5 },
  { x: [0, -7, 6, 0], y: [0, 4, -5, 0], duration: 7.5 },
  { x: [0, 6, -6, 0], y: [0, -5, 5, 0], duration: 6.8 },
];

type AgentId =
  | "market_intel"
  | "asset_forge"
  | "vc_scout"
  | "code_lab"
  | "finance_auditor";

const ORB_CONFIG: {
  id: AgentId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  depth: "epipelagic" | "mesopelagic" | "abyssal";
  position: { top: string; left: string };
}[] = [
  {
    id: "market_intel",
    label: "Market Intelligence",
    description:
      "An AI analyst that scans current market data to find hidden opportunities your competitors missed and identifies exactly how you can protect your business from being copied.",
    icon: Network,
    href: "/mission-control/market-intelligence",
    depth: "epipelagic",
    position: { top: "20%", left: "8%" },
  },
  {
    id: "asset_forge",
    label: "Asset Forge",
    description:
      "A creative suite that automatically builds your pitch deck, combining professional graphic design with a compelling story designed to grab an investor's attention.",
    icon: LibraryBig,
    href: "/asset-forge",
    depth: "mesopelagic",
    position: { top: "28%", left: "26%" },
  },
  {
    id: "vc_scout",
    label: "VC Scout",
    description:
      "An automated scout that searches global databases to find investors and partners who actually care about your specific industry.",
    icon: Globe2,
    href: "/mission-control/vc-scout",
    depth: "mesopelagic",
    position: { top: "16%", left: "44%" },
  },
  {
    id: "code_lab",
    label: "Code Lab",
    description:
      "A technical architect that generates the foundational code and system structures for your app, giving you a working prototype in minutes instead of weeks.",
    icon: Cpu,
    href: "/mission-control/code-lab",
    depth: "abyssal",
    position: { top: "30%", left: "62%" },
  },
  {
    id: "finance_auditor",
    label: "Finance Auditor",
    description:
      "A financial strategist that calculates how much money you're spending, how long your cash will last, and how your company will survive under different investment outcomes.",
    icon: LineChart,
    href: "/mission-control/finance-auditor",
    depth: "abyssal",
    position: { top: "22%", left: "80%" },
  },
];

const CORE_GLOW_COLORS: Record<string, string> = {
  market_intel: "rgba(0, 255, 229, 0.6)",
  asset_forge: "rgba(117, 35, 255, 0.5)",
  vc_scout: "rgba(117, 35, 255, 0.5)",
  code_lab: "rgba(0, 255, 229, 0.4)",
  finance_auditor: "rgba(255, 129, 0, 0.4)",
};

function OrbBubble({
  config,
  status,
  isHovered,
  sonarLit,
  onHoverStart,
  onHoverEnd,
}: {
  config: (typeof ORB_CONFIG)[number];
  status: string;
  isHovered: boolean;
  sonarLit: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}) {
  const Icon = config.icon;
  const isComplete = status === "COMPLETE";
  const coreGlow = CORE_GLOW_COLORS[config.id] ?? "rgba(0, 255, 229, 0.4)";

  return (
    <motion.div
      className="relative z-10"
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
    >
      {/* Realistic soap bubble: thin film, main reflection, secondary highlights, dark base, rim light */}
      <motion.div
        className="relative rounded-full flex flex-col items-center justify-center overflow-hidden cursor-pointer"
        animate={{
          scale: isHovered ? 1.1 : 1,
          width: isHovered ? 220 : 148,
          height: isHovered ? 220 : 148,
          boxShadow: isHovered
            ? "0 0 30px rgba(255,255,255,0.12), 0 0 50px rgba(0,255,229,0.1), inset -18px -18px 40px rgba(0,0,0,0.25), inset 14px 14px 32px rgba(255,255,255,0.4), -1px -1px 0 1px rgba(255,255,255,0.4)"
            : sonarLit
              ? "0 0 28px rgba(0,255,229,0.2), inset -14px -14px 32px rgba(0,0,0,0.2), inset 12px 12px 28px rgba(255,255,255,0.35), -1px -1px 0 1px rgba(255,255,255,0.35)"
              : "inset -14px -14px 32px rgba(0,0,0,0.28), inset 12px 12px 26px rgba(255,255,255,0.32), -1px -1px 0 1px rgba(255,255,255,0.3), 1px 1px 0 0 rgba(0,0,0,0.15)",
        }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        style={{
          minWidth: 148,
          minHeight: 148,
          background:
            "radial-gradient(ellipse 80% 80% at 50% 50%, rgba(255,255,255,0.03) 0%, transparent 60%), radial-gradient(ellipse 70% 55% at 28% 22%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 45%, transparent 75%)",
          backdropFilter: "blur(5px)",
          WebkitBackdropFilter: "blur(5px)",
          border: "1px solid rgba(255,255,255,0.28)",
        }}
      >
        {/* Main top-left reflection (large, soft – key light) */}
        <div
          className="absolute rounded-full pointer-events-none overflow-hidden"
          style={{
            top: "-8%",
            left: "-12%",
            width: "75%",
            height: "55%",
            background:
              "radial-gradient(ellipse 90% 90% at 55% 45%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.35) 25%, rgba(255,255,255,0.08) 55%, transparent 75%)",
          }}
          aria-hidden
        />
        {/* Secondary smaller highlight (fill light) */}
        <div
          className="absolute rounded-full pointer-events-none overflow-hidden opacity-70"
          style={{
            bottom: "15%",
            right: "10%",
            width: "35%",
            height: "30%",
            background:
              "radial-gradient(circle at 40% 40%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.1) 50%, transparent 75%)",
          }}
          aria-hidden
        />
        {/* Dark base (bottom-right curvature and thickness) */}
        <div
          className="absolute rounded-full pointer-events-none overflow-hidden"
          style={{
            bottom: "-20%",
            right: "-18%",
            width: "65%",
            height: "65%",
            background:
              "radial-gradient(ellipse 80% 80% at 35% 35%, transparent 25%, rgba(0,0,0,0.08) 50%, rgba(0,0,0,0.22) 75%, rgba(0,0,0,0.35) 100%)",
          }}
          aria-hidden
        />
        {/* Subtle iridescent edge (soap-film hint) */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none overflow-hidden opacity-30"
          style={{
            background:
              "linear-gradient(135deg, transparent 40%, rgba(0,255,229,0.06) 55%, rgba(255,255,255,0.04) 70%, transparent 85%)",
          }}
          aria-hidden
        />

        {/* Core glow when COMPLETE */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          aria-hidden
        >
          <motion.span
            className="absolute w-8 h-8 rounded-full"
            style={{
              background: `radial-gradient(circle, ${coreGlow} 0%, transparent 70%)`,
              boxShadow: `0 0 16px ${coreGlow}`,
            }}
            animate={
              isComplete
                ? { scale: [1, 1.35, 1], opacity: [0.5, 0.9, 0.5] }
                : { scale: 1, opacity: 0.25 }
            }
            transition={{
              duration: 2,
              repeat: isComplete ? Infinity : 0,
              ease: "easeInOut",
            }}
          />
          {isComplete && (
            <motion.span
              className="absolute w-10 h-10 rounded-full border border-white/25"
              style={{ borderColor: coreGlow }}
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            />
          )}
        </div>

        {/* Content + liquid wobble: icon/title visible only when not hovered; description only on hover */}
        <motion.div
          className="absolute inset-0 rounded-full flex flex-col items-center justify-center"
          animate={{
            y: [0, -2, 1.5, 0],
            scale: [1, 1.015, 1.008, 1],
          }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        >
          <AnimatePresence mode="wait">
            {!isHovered ? (
              <motion.div
                key="icon-label"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="relative z-10 flex flex-col items-center justify-center p-3 text-center"
              >
                <Icon className="h-6 w-6 md:h-7 md:w-7 text-white/95 mb-1 flex-shrink-0 drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]" />
                <span className="text-xs font-semibold text-white/95 leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                  {config.label}
                </span>
                {status === "SYNCING" && (
                  <motion.span
                    className="absolute inset-0 flex items-center justify-center rounded-full"
                    animate={{ opacity: [0.3, 0.7, 0.3] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <span className="w-2 h-2 rounded-full bg-biolumeTeal shadow-[0_0_10px_rgba(0,255,229,0.8)]" />
                  </motion.span>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="description"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 flex flex-col items-center justify-center p-4 rounded-full z-10"
                style={{
                  background:
                    "radial-gradient(ellipse 80% 80% at 50% 50%, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.08) 60%, transparent 100%)",
                }}
              >
                <p className="text-[0.7rem] text-white leading-snug line-clamp-5 text-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)] px-1">
                  {config.description}
                </p>
                {config.href && (
                  <span className="mt-2 text-[0.65rem] text-biolumeTeal font-medium">
                    Open →
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function MissionControlContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callEnded = searchParams.get("callEnded") === "1";
  const [showCallEndedBanner, setShowCallEndedBanner] = useState(false);

  const {
    sharedWorkspace,
    loading,
    triggerVCScout,
    triggerCodeLab,
    triggerFinanceAuditor,
  } = useSharedWorkspace();

  const [founderName, setFounderName] = useState("");
  const [hoveredOrb, setHoveredOrb] = useState<AgentId | null>(null);
  const [sonarLitOrbs, setSonarLitOrbs] = useState<Set<AgentId>>(new Set());
  const sonarProgressRef = useRef(0);
  const sonarHitRef = useRef<Set<AgentId>>(new Set());

  useEffect(() => {
    if (typeof window !== "undefined") {
      setFounderName(window.localStorage.getItem("founderName") || "");
    }
  }, []);

  useEffect(() => {
    if (callEnded) {
      setShowCallEndedBanner(true);
      router.replace("/mission-control");
      const t = setTimeout(() => setShowCallEndedBanner(false), 5000);
      return () => clearTimeout(t);
    }
  }, [callEnded, router]);

  // Sonar: every 5s a wave travels down over 2.5s; orbs light up when wave passes their y%
  useEffect(() => {
    const orbThresholds: { y: number; ids: AgentId[] }[] = [
      { y: 16, ids: ["vc_scout"] },
      { y: 20, ids: ["market_intel"] },
      { y: 22, ids: ["finance_auditor"] },
      { y: 28, ids: ["asset_forge"] },
      { y: 30, ids: ["code_lab"] },
    ];
    let startTime = 0;
    let rafId: number;

    const runSonar = () => {
      startTime = performance.now();
      sonarHitRef.current = new Set();

      const tick = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(100, (elapsed / SONAR_TRAVEL_MS) * 100);
        sonarProgressRef.current = progress;

        const toLight = new Set<AgentId>();
        orbThresholds.forEach(({ y, ids }) => {
          if (progress >= y && ids.some((id) => !sonarHitRef.current.has(id))) {
            ids.forEach((id) => {
              sonarHitRef.current.add(id);
              toLight.add(id);
            });
          }
        });
        if (toLight.size > 0) {
          setSonarLitOrbs((prev) => new Set([...prev, ...toLight]));
          toLight.forEach((id) => {
            setTimeout(() => {
              setSonarLitOrbs((p) => {
                const next = new Set(p);
                next.delete(id);
                return next;
              });
            }, SONAR_HIT_DURATION_MS);
          });
        }

        if (progress < 100) rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    };

    runSonar();
    const interval = setInterval(runSonar, SONAR_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      cancelAnimationFrame(rafId);
    };
  }, []);

  const getStatus = (id: AgentId) => {
    switch (id) {
      case "market_intel":
        return sharedWorkspace?.market_intel?.status ?? "IDLE";
      case "asset_forge":
        return sharedWorkspace?.asset_forge?.status ?? "IDLE";
      case "vc_scout":
        return sharedWorkspace?.vc_scout?.status ?? "IDLE";
      case "code_lab":
        return sharedWorkspace?.code_lab?.status ?? "IDLE";
      case "finance_auditor":
        return sharedWorkspace?.finance_auditor?.status ?? "IDLE";
      default:
        return "IDLE";
    }
  };

  const hoveredConfig = hoveredOrb ? ORB_CONFIG.find((c) => c.id === hoveredOrb) : null;
  const hoveredStatus = hoveredConfig ? getStatus(hoveredConfig.id as AgentId) : null;

  return (
    <main
      className="relative min-h-screen flex flex-col overflow-hidden rounded-2xl m-3 border-[10px] border-white/90 bg-[#020617]"
      style={{
        boxShadow:
          "inset 0 0 100px rgba(0,0,0,0.2), 0 0 0 2px rgba(255,255,255,0.4), 0 16px 48px rgba(0,0,0,0.5)",
      }}
    >
      {/* Base: sea gradient (Epipelagic → Abyssal) */}
      <div
        className="fixed inset-0 z-0"
        style={{
          background:
            "linear-gradient(to bottom, #0d9488 0%, #0e7490 14%, #155e75 28%, #1e3a5f 52%, #0f172a 78%, #020617 100%)",
        }}
      />

      {/* Caustic light masks: subtle moving water-light overlay */}
      <div
        className="fixed inset-0 z-0 pointer-events-none opacity-[0.14]"
        aria-hidden
        style={{
          backgroundImage: `
            radial-gradient(ellipse 80% 50% at 20% 30%, rgba(255,255,255,0.35) 0%, transparent 50%),
            radial-gradient(ellipse 60% 40% at 80% 20%, rgba(0,255,229,0.2) 0%, transparent 45%),
            radial-gradient(ellipse 70% 60% at 50% 60%, rgba(255,255,255,0.15) 0%, transparent 55%),
            radial-gradient(ellipse 50% 80% at 70% 80%, rgba(0,255,229,0.12) 0%, transparent 50%)
          `,
          backgroundSize: "200% 200%, 180% 180%, 220% 220%, 190% 190%",
          animation: "caustic-drift 18s ease-in-out infinite",
        }}
      />
      <div
        className="fixed inset-0 z-0 pointer-events-none opacity-[0.1]"
        aria-hidden
        style={{
          backgroundImage: `
            radial-gradient(ellipse 90% 40% at 60% 40%, rgba(255,255,255,0.3) 0%, transparent 45%),
            radial-gradient(ellipse 50% 70% at 30% 70%, rgba(0,255,229,0.18) 0%, transparent 50%)
          `,
          backgroundSize: "250% 250%, 200% 200%",
          animation: "caustic-drift 22s ease-in-out infinite reverse",
        }}
      />

      {/* Depth fog: heavier at bottom so Tank area feels high-pressure */}
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        aria-hidden
        style={{
          background:
            "linear-gradient(to bottom, transparent 0%, transparent 40%, rgba(2,6,23,0.2) 70%, rgba(1,2,6,0.5) 100%)",
        }}
      />

      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes caustic-drift {
            0%, 100% { background-position: 0% 0%, 10% 20%, 5% 10%, 15% 5%; }
            25% { background-position: 100% 20%, 90% 0%, 95% 30%, 85% 15%; }
            50% { background-position: 50% 50%, 30% 80%, 60% 40%, 40% 60%; }
            75% { background-position: 20% 100%, 70% 90%, 25% 70%, 75% 85%; }
          }
        `,
      }} />

      {/* Sunlight zone header */}
      <header className="relative z-20 pt-9 pb-4 px-6 text-center">
        <h1
          className="text-3xl md:text-5xl font-semibold tracking-tight md:tracking-[-0.04em] drop-shadow-[0_0_28px_rgba(0,255,229,0.25)]"
          style={{
            background:
              "linear-gradient(120deg, #f9fafb 0%, #e5f9ff 30%, #f9fafb 100%)",
            WebkitBackgroundClip: "text",
            color: "transparent",
          }}
        >
          Welcome{founderName ? ` ${founderName}` : ""}.
        </h1>
        <p
          className="text-sm md:text-lg max-w-2xl mx-auto mt-3 drop-shadow-[0_1px_10px_rgba(0,0,0,0.35)]"
          style={{ color: "rgba(204,251,241,0.98)" }}
        >
          Your startup&apos;s &quot;Mission Control&quot; is active. Your
          specialized AI workforce is synced and ready to transform your vision
          into a venture-ready reality.
        </p>
        <AnimatePresence>
          {showCallEndedBanner && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="mt-4 mx-auto max-w-md flex items-center justify-center gap-2 rounded-xl border border-biolumeTeal/40 bg-[#0a1628]/90 backdrop-blur-sm px-4 py-3 shadow-[0_0_20px_rgba(0,255,229,0.15)]"
            >
              <PhoneOff className="h-5 w-5 text-biolumeTeal flex-shrink-0" />
              <span className="text-sm font-medium text-white/95">Call ended</span>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Orbit area: floating orbs + status HUD */}
      <div className="relative flex-1 min-h-[55vh] w-full">
        {ORB_CONFIG.map((config, index) => {
          const status = getStatus(config.id);
          const isHovered = hoveredOrb === config.id;
          const sonarLit = sonarLitOrbs.has(config.id);
          const float = FLOAT_OFFSETS[index % FLOAT_OFFSETS.length];
          const orb = (
            <OrbBubble
              config={config}
              status={status}
              isHovered={isHovered}
              sonarLit={sonarLit}
              onHoverStart={() => setHoveredOrb(config.id)}
              onHoverEnd={() => setHoveredOrb(null)}
            />
          );

          return (
            <motion.div
              key={config.id}
              className="absolute z-10"
              style={{
                top: config.position.top,
                left: config.position.left,
                transform: "translate(-50%, -50%)",
              }}
              animate={{
                x: float.x,
                y: float.y,
              }}
              transition={{
                duration: float.duration,
                repeat: Infinity,
                ease: "easeInOut",
                repeatType: "reverse",
              }}
              onMouseEnter={() => setHoveredOrb(config.id)}
              onMouseLeave={() => setHoveredOrb(null)}
            >
              {config.href ? (
                <Link href={config.href} className="block">
                  {orb}
                </Link>
              ) : (
                <>
                  {orb}
                  <button
                    type="button"
                    onClick={() => {
                      if (config.id === "vc_scout") void triggerVCScout();
                      if (config.id === "code_lab") void triggerCodeLab();
                      if (config.id === "finance_auditor")
                        void triggerFinanceAuditor();
                    }}
                    disabled={loading}
                    className="absolute inset-0 z-20 cursor-pointer"
                    aria-label={config.label}
                  />
                </>
              )}
            </motion.div>
          );
        })}

        {/* HUD: hovered orb details / legend */}
        <div className="pointer-events-none absolute left-4 right-4 bottom-4 md:left-6 md:right-auto md:max-w-sm z-20">
          <AnimatePresence mode="wait">
            {hoveredConfig ? (
              <motion.div
                key={hoveredConfig.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.2 }}
                className="pointer-events-auto rounded-2xl border border-white/15 bg-black/55 backdrop-blur-xl px-4 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.6)]"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 border border-white/20">
                    <hoveredConfig.icon className="h-4 w-4 text-white/90" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold tracking-[0.14em] text-white/80 uppercase">
                        {hoveredConfig.label}
                      </p>
                      {hoveredStatus && (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] ${
                            hoveredStatus === "COMPLETE"
                              ? "bg-emerald-400/15 text-emerald-300 border border-emerald-300/40"
                              : hoveredStatus === "SYNCING"
                                ? "bg-biolumeTeal/15 text-biolumeTeal border border-biolumeTeal/40"
                                : "bg-white/5 text-white/70 border border-white/20"
                          }`}
                        >
                          {hoveredStatus === "SYNCING"
                            ? "Running"
                            : hoveredStatus === "COMPLETE"
                              ? "Complete"
                              : "Idle"}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[0.7rem] text-white/70 leading-snug line-clamp-3">
                      {hoveredConfig.description}
                    </p>
                    {hoveredConfig.href && (
                      <div className="mt-2 flex items-center gap-2 text-[0.7rem] text-biolumeTeal/90">
                        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-biolumeTeal shadow-[0_0_8px_rgba(0,255,229,0.8)]" />
                        <span>Click the orb to open</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* The Trench: Enter the Tank button at bottom center */}
      <div className="relative z-20 pb-8 flex justify-center">
        <EnterTankButton />
      </div>
    </main>
  );
}

export default function MissionControlPage() {
  return (
    <Suspense
      fallback={
        <main className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden rounded-2xl m-3 border-[10px] border-white/90 bg-[#020617]">
          <div
            className="fixed inset-0 z-0"
            style={{
              background:
                "linear-gradient(to bottom, #0d9488 0%, #0e7490 14%, #155e75 28%, #1e3a5f 52%, #0f172a 78%, #020617 100%)",
            }}
          />
          <p className="relative z-10 text-white/80">Loading Mission Control…</p>
        </main>
      }
    >
      <MissionControlContent />
    </Suspense>
  );
}
