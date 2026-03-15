"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSharedWorkspace } from "../../src/context/SharedWorkspaceContext";

const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000/api";

type Phase = "idle" | "uploading" | "decoding" | "ready";

const ACCEPT = ".pdf,.doc,.docx,.txt,.md,application/pdf,text/plain,text/markdown";

export default function OnboardingPage() {
  const router = useRouter();
  const { refreshFromBackend } = useSharedWorkspace();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (phase !== "decoding") return;

    setTerminalLines([]);

    const lines = [
      "Nova is parsing your document...",
      "Extracting trench topology and market signals...",
      "Mission Graph Initialized: Scoping 4,000m Depth Moat.",
    ];

    lines.forEach((line, index) => {
      setTimeout(() => {
        setTerminalLines((prev) => [...prev, line]);
      }, 600 * (index + 1));
    });

    const navigateTimeout = setTimeout(async () => {
      try {
        await refreshFromBackend();
      } catch {
        // Continue to next page even if state refresh fails
      }
      setPhase("ready");
      router.push("/mission-control");
    }, 2600);

    return () => clearTimeout(navigateTimeout);
  }, [phase, refreshFromBackend, router]);

  const uploadFile = async (file: File) => {
    if (phase !== "idle") return;
    setPhase("uploading");
    setSelectedFileName(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${BACKEND_BASE_URL}/ingest`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
    } catch {
      // Still proceed to decoding and then mission-control so flow never gets stuck
    } finally {
      setPhase("decoding");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (phase === "idle") setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleZoneClick = () => {
    if (phase !== "idle") return;
    fileInputRef.current?.click();
  };

  const isBusy = phase === "uploading" || phase === "decoding";

  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Full-screen video background - onboarding only */}
      <div className="fixed inset-0 z-0">
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          aria-hidden
        >
          <source src="/videos/sharkbg.mp4" type="video/mp4" />
        </video>
        {/* Dark overlay for readability */}
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/70 via-midnightTrench/85 to-black/80"
          aria-hidden
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleFileChange}
        className="hidden"
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-4xl flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12 px-4 py-8">
        <div className="flex-1 min-h-[180px] flex flex-col justify-center text-center md:text-left max-w-md md:max-w-none relative">
          <AnimatePresence mode="wait">
            {!isBusy ? (
              <motion.div
                key="idle"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0, x: -24, filter: "blur(4px)" }}
                transition={{ duration: 0.35, ease: "easeIn" }}
                className="space-y-4"
              >
                <motion.h1
                  className="text-3xl md:text-4xl font-semibold tracking-tight text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.5)]"
                  animate={{
                    textShadow: [
                      "0 2px 20px rgba(0,0,0,0.5), 0 0 10px rgba(0,255,229,0.3)",
                      "0 2px 20px rgba(0,0,0,0.5), 0 0 18px rgba(0,255,229,0.6)",
                      "0 2px 20px rgba(0,0,0,0.5), 0 0 10px rgba(0,255,229,0.3)",
                    ],
                  }}
                  transition={{
                    duration: 3.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  Founder&apos;s Flight Deck
                </motion.h1>
                <p className="text-lg md:text-xl font-bold text-biolumeTeal drop-shadow-[0_0_12px_rgba(0,255,229,0.5)]">
                  The 0.05% Start Here.
                </p>
                <p className="text-sm md:text-base text-white/85 drop-shadow-[0_1px_10px_rgba(0,0,0,0.4)]">
                  Dive deep into startup success. Get AI-powered market
                  intelligence, pitch deck generation, VC matching, and face the
                  virtual Shark Tank.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="analyzing"
                initial={{ opacity: 0, x: 20, filter: "blur(4px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="space-y-2"
              >
                <p className="text-2xl md:text-3xl font-semibold text-biolumeTeal tracking-tight drop-shadow-[0_0_20px_rgba(0,255,229,0.6)]">
                  Analyzing…
                </p>
                <p className="text-sm text-white/70">
                  {phase === "uploading"
                    ? "Uploading and analyzing your document…"
                    : "Nova is reading your document."}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-5 w-full max-w-md">
          {/* Event Horizon: rotating scanning ring + gravity well */}
          <motion.div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && handleZoneClick()}
            onClick={handleZoneClick}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            whileHover={!isBusy ? { scale: 1.03 } : undefined}
            whileTap={!isBusy ? { scale: 0.97 } : undefined}
            className="relative h-56 w-56 md:h-64 md:w-64 flex items-center justify-center cursor-pointer rounded-full"
            style={{
              filter: isDragOver
                ? "drop-shadow(0 0 35px rgba(0,255,229,0.7)) drop-shadow(0 0 60px rgba(0,255,229,0.4))"
                : "drop-shadow(0 0 25px rgba(0,255,229,0.35)) drop-shadow(0 0 45px rgba(0,255,229,0.2))",
            }}
          >
            {/* Rotating scanning ring (conic gradient + blur); mask cuts center so only ring rotates */}
            <motion.div
              className="absolute inset-0 rounded-full opacity-90"
              style={{
                background: "conic-gradient(from 0deg, transparent 0deg, rgba(0,255,229,0.2) 70deg, rgba(0,255,229,0.7) 140deg, transparent 210deg, transparent 280deg, rgba(0,255,229,0.25) 350deg)",
                filter: "blur(6px)",
                WebkitMaskImage: "radial-gradient(circle, transparent 52%, black 52%)",
                maskImage: "radial-gradient(circle, transparent 52%, black 52%)",
              }}
              animate={{ rotate: 360 }}
              transition={{
                repeat: Infinity,
                ease: "linear",
                duration: isDragOver ? 0.8 : 2.5,
              }}
            />
            {/* Inner ring border */}
            <div
              className="absolute inset-[6px] rounded-full border-2 border-biolumeTeal/40 bg-black/40 backdrop-blur-md"
              style={{ boxShadow: "inset 0 0 30px rgba(0,255,229,0.08)" }}
            />
            {/* Center well */}
            <motion.div
              animate={
                isBusy
                  ? { scale: [1, 1.04, 1], opacity: [0.7, 1, 0.7] }
                  : { scale: 1, opacity: 0.95 }
              }
              transition={
                isBusy
                  ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.4 }
              }
              className="relative h-32 w-32 md:h-36 md:w-36 rounded-full border border-white/25 bg-black/60 flex items-center justify-center text-sm text-center px-4 text-white"
            >
              {phase === "idle" && <span>Drop your deck</span>}
              {phase === "uploading" && (
                <span>
                  {selectedFileName
                    ? `Uploading ${selectedFileName}…`
                    : "Uploading…"}
                </span>
              )}
              {phase === "decoding" && (
                <span>Nova reading your file…</span>
              )}
              {phase === "ready" && (
                <span>Mission Graph ready. Descending…</span>
              )}
            </motion.div>
          </motion.div>
          {phase === "idle" && (
            <p className="text-xs text-white/70 text-center drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
              Click to choose a file or drag and drop (PDF, DOC, TXT, MD)
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
