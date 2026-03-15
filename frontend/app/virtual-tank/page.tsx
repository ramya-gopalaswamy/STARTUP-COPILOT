"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Radio,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MessageSquare,
  PhoneOff,
} from "lucide-react";
import { useNovaSonicStream } from "../../src/hooks/useNovaSonicStream";

const SHARKS = [
  {
    id: "hawk",
    name: "The Hawk",
    role: "CFO",
    image: "/images/shark1.png",
    background: "/images/ceo-office-1.png",
    text: "text-amber-300",
  },
  {
    id: "visionary",
    name: "The Visionary",
    role: "Story Architect",
    image: "/images/shark2.png",
    background: "/images/ceo-office-2.png",
    text: "text-[#b87aff]",
  },
  {
    id: "tech-giant",
    name: "The Tech Giant",
    role: "Scale Strategist",
    image: "/images/shark3.png",
    background: "/images/ceo-office-3.png",
    text: "text-biolumeTeal",
  },
] as const;

export default function VirtualTankTestPage() {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [pitchInput, setPitchInput] = useState("");
  const [founderName, setFounderName] = useState(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem("founderName") || "";
    }
    return "";
  });
  const [showResults, setShowResults] = useState(false);
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const transcriptRef = useRef<HTMLElement | null>(null);

  const {
    messages,
    connected,
    speakingSharkId,
    userTranscript,
    sessionEnded,
    reset,
    sendText,
    stopSession,
  } = useNovaSonicStream(active, founderName);

  useEffect(() => {
    if (chatOpen && transcriptRef.current)
      transcriptRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
  }, [chatOpen]);

  const latestByShark = useMemo(() => {
    const grouped: Record<string, (typeof messages)[number]> = {};
    for (const msg of messages) {
      grouped[msg.shark_id] = msg;
    }
    return grouped;
  }, [messages]);

  interface VerdictResult {
    sharkId: string;
    displayName: string;
    verdict: "IN" | "OUT";
    text: string;
  }

  const verdictResults = useMemo(() => {
    const results: VerdictResult[] = [];
    const sharkIds = ["hawk", "visionary", "tech-giant"];
    const sharkNames: Record<string, string> = {
      hawk: "The Hawk",
      visionary: "The Visionary",
      "tech-giant": "The Tech Giant",
    };

    // Find the wrap-up message index ("heard enough" / "verdict")
    let wrapUpIdx = -1;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.shark_id === "founder") continue;
      const lo = m.text.toLowerCase();
      if ((lo.includes("verdict") || lo.includes("heard enough")) && !lo.includes("i'm in") && !lo.includes("i'm out")) {
        wrapUpIdx = i;
        break;
      }
    }

    // Look for verdicts after the wrap-up (or in all messages if no wrap-up found)
    const startIdx = wrapUpIdx >= 0 ? wrapUpIdx + 1 : 0;
    for (let i = startIdx; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.shark_id === "founder") continue;
      if (!sharkIds.includes(msg.shark_id)) continue;
      if (results.some((r) => r.sharkId === msg.shark_id)) continue;
      const lower = msg.text.toLowerCase().replace(/’/g, "'");
      const isIn = lower.includes("i'm in") || lower.includes("im in") || lower.includes("i am in") || lower.includes("count me in");
      const isOut = lower.includes("i'm out") || lower.includes("im out") || lower.includes("i am out") || lower.includes("i'll pass") || lower.includes("count me out");
      if (isIn) {
        results.push({ sharkId: msg.shark_id, displayName: sharkNames[msg.shark_id] || msg.display_name, verdict: "IN", text: msg.text });
      } else if (isOut) {
        results.push({ sharkId: msg.shark_id, displayName: sharkNames[msg.shark_id] || msg.display_name, verdict: "OUT", text: msg.text });
      }
    }

    // If wrap-up happened and 3 shark messages came after it but didn't match
    // verdict keywords, treat them as verdicts anyway (assume IN by default)
    if (wrapUpIdx >= 0 && results.length < 3) {
      for (let i = startIdx; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.shark_id === "founder") continue;
        if (!sharkIds.includes(msg.shark_id)) continue;
        if (results.some((r) => r.sharkId === msg.shark_id)) continue;
        results.push({ sharkId: msg.shark_id, displayName: sharkNames[msg.shark_id] || msg.display_name, verdict: "IN", text: msg.text });
      }
    }
    return results;
  }, [messages]);

  useEffect(() => {
    if (verdictResults.length >= 3 && !showResults && !speakingSharkId) {
      const timer = setTimeout(() => setShowResults(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [verdictResults, showResults, speakingSharkId]);

  useEffect(() => {
    const video = userVideoRef.current;
    const stream = isSharingScreen
      ? screenStreamRef.current
      : localStreamRef.current;
    if (video && stream) {
      video.srcObject = stream;
    }
    if (video && !stream && (isVideoOn || isSharingScreen)) {
      video.srcObject = null;
    }
  }, [isVideoOn, isSharingScreen]);

  const toggleMute = () => {
    setIsMuted((m) => !m);
  };

  const toggleVideo = async () => {
    if (isVideoOn) {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      if (userVideoRef.current) userVideoRef.current.srcObject = null;
      setIsVideoOn(false);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      localStreamRef.current = s;
      if (userVideoRef.current) userVideoRef.current.srcObject = s;
      setIsVideoOn(true);
    } catch {
      /* permission denied */
    }
  };

  const toggleShareScreen = async () => {
    if (isSharingScreen) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setIsSharingScreen(false);
      if (userVideoRef.current)
        userVideoRef.current.srcObject = localStreamRef.current ?? null;
      return;
    }
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = s;
      if (userVideoRef.current) userVideoRef.current.srcObject = s;
      setIsSharingScreen(true);
      s.getVideoTracks()[0].onended = () => {
        setIsSharingScreen(false);
        screenStreamRef.current = null;
        if (userVideoRef.current)
          userVideoRef.current.srcObject = localStreamRef.current ?? null;
      };
    } catch {
      /* cancelled */
    }
  };

  const endCall = () => {
    stopSession();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    if (userVideoRef.current) userVideoRef.current.srcObject = null;
    setIsVideoOn(false);
    setIsSharingScreen(false);
    setActive(false);
    reset();
    router.push("/mission-control?callEnded=1");
  };

  const startSession = () => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    reset();
    setActive(true);
    setIsMuted(false);
  };

  const handleStopSession = () => {
    stopSession();
    setActive(false);
  };

  const isSpeaking = !!speakingSharkId;

  return (
    <main className="relative h-screen flex flex-col bg-[#050b14] overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 z-0">
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          aria-hidden
        >
          <source src="/videos/sunbeamsea.mp4" type="video/mp4" />
        </video>
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/40 via-[#0a1628]/60 to-black/65"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_100%,rgba(0,255,229,0.15),transparent_50%)]"
          aria-hidden
        />
      </div>

      {/* Header */}
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-b border-biolumeTeal/20 bg-[#051018]/80 backdrop-blur-xl shadow-[0_0_20px_rgba(0,255,229,0.08)]">
        <div className="flex items-center gap-4">
          <Link
            href="/mission-control"
            className="flex items-center gap-2 text-sm text-white/80 hover:text-biolumeTeal transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Mission Control
          </Link>
          <span className="text-white/40">›</span>
          <span className="text-sm font-medium text-white">Virtual Tank</span>
          <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/40 font-semibold">
            SONIC TEST
          </span>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-white/50">
            <Radio className="h-3.5 w-3.5" />
            Nova Sonic S2S
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!active ? (
            <>
              <input
                type="text"
                value={founderName}
                onChange={(e) => setFounderName(e.target.value)}
                placeholder="Your name"
                className="w-32 bg-black/40 border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-biolumeTeal/70"
              />
              <button
                onClick={startSession}
                className="px-4 py-2 rounded-xl border-2 border-biolumeTeal bg-biolumeTeal/10 text-biolumeTeal text-sm font-medium hover:bg-biolumeTeal/20 transition shadow-[0_0_20px_rgba(0,255,229,0.15)] flex items-center gap-2"
              >
                <Mic className="h-4 w-4" />
                Start session
              </button>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-biolumeTeal/15 border border-biolumeTeal/40 text-biolumeTeal text-xs font-medium">
                <Radio className="h-3 w-3 animate-pulse" />
                {isSpeaking
                  ? "Sharks speaking…"
                  : connected
                  ? "Listening…"
                  : "Connecting…"}
              </span>
              <button
                onClick={handleStopSession}
                className="px-4 py-2 rounded-xl border border-white/20 bg-white/5 text-white/80 text-sm hover:bg-white/10 transition"
              >
                Stop
              </button>
            </>
          )}
          <button
            onClick={() => {
              reset();
              setActive(false);
            }}
            className="px-3 py-2 rounded-xl border border-white/15 bg-white/5 text-white/60 text-xs hover:bg-white/10 transition"
          >
            Reset log
          </button>
          <button
            onClick={() => router.push("/mission-control")}
            className="px-3 py-2 rounded-xl border border-white/15 bg-white/5 text-white/60 text-xs hover:bg-white/10 transition flex items-center gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
        </div>
      </header>

      {/* Stage + Transcript */}
      <div className="relative z-10 flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        <section className="flex-1 flex flex-col min-h-0 p-4 lg:p-6">
          <div className="rounded-2xl border-2 border-biolumeTeal/25 bg-[#0a1628]/60 backdrop-blur-xl flex-1 flex flex-col min-h-0 overflow-hidden shadow-[0_0_40px_rgba(0,255,229,0.1),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="flex-1 flex flex-col min-h-0 p-4">
              {isSharingScreen ? (
                <>
                  <div className="flex-shrink-0 flex items-center justify-center gap-2 mb-3">
                    {SHARKS.map((shark) => (
                      <div
                        key={shark.id}
                        className="w-[min(28vw,180px)] flex-shrink-0"
                      >
                        <VideoTile
                          image={shark.image}
                          background={shark.background}
                          name={shark.name}
                          role={shark.role}
                          textClass={shark.text}
                          isSpeaking={speakingSharkId === shark.id}
                          isBargeIn={false}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 min-h-0 rounded-xl overflow-hidden border-2 border-biolumeTeal/40 bg-black shadow-[0_0_30px_rgba(0,255,229,0.15)] relative">
                    <video
                      ref={userVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="absolute inset-0 w-full h-full object-contain"
                      style={isSharingScreen ? undefined : { transform: "scaleX(-1)" }}
                    />
                    <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/60 text-biolumeTeal text-xs font-medium flex items-center gap-1.5">
                      <Monitor className="h-3.5 w-3.5" />
                      You&apos;re sharing your screen
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 grid-rows-2 gap-3 md:gap-4 flex-1 min-h-0">
                  {SHARKS.map((shark) => (
                    <VideoTile
                      key={shark.id}
                      image={shark.image}
                      background={shark.background}
                      name={shark.name}
                      role={shark.role}
                      textClass={shark.text}
                      isSpeaking={speakingSharkId === shark.id}
                      isBargeIn={false}
                    />
                  ))}
                  {/* User tile */}
                  <div className="relative rounded-xl overflow-hidden border-2 border-biolumeTeal/30 bg-[#051018]/90 flex flex-col min-h-0 h-full shadow-[0_0_20px_rgba(0,255,229,0.08)]">
                    <div className="flex-1 relative flex items-center justify-center min-h-0 bg-gradient-to-br from-biolumeTeal/20 to-[#0a1628]">
                      {isVideoOn && (
                        <video
                          ref={userVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className="absolute inset-0 w-full h-full object-cover"
                          style={{ transform: "scaleX(-1)" }}
                        />
                      )}
                      {!isVideoOn && (
                        <div className="text-center">
                          <VideoOff className="h-8 w-8 mx-auto text-biolumeTeal/60 mb-2" />
                          <span className="text-xs text-white/60">
                            Camera off
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 py-2 px-3 bg-black/60 backdrop-blur-sm">
                      <p className="text-xs font-medium text-biolumeTeal">
                        You — Founder
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {active && (
                <div className="text-center mb-1 space-y-1">
                  <p className="text-[0.65rem] text-white/50">
                    {isSpeaking
                      ? "Sharks are speaking\u2026"
                      : connected
                      ? "Listening \u2014 speak your pitch. Nova Sonic is processing in real-time."
                      : "Connecting to Nova Sonic\u2026"}
                  </p>
                  {!isSpeaking && userTranscript && (
                    <p className="text-[0.7rem] text-biolumeTeal/80 italic truncate max-w-md mx-auto">
                      &ldquo;{userTranscript}&rdquo;
                    </p>
                  )}
                </div>
              )}

              {/* Call controls */}
              <div className="flex items-center justify-center gap-4 py-4 flex-wrap">
                <button
                  onClick={toggleMute}
                  className="flex flex-col items-center gap-1.5"
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  <span
                    className={`flex items-center justify-center w-12 h-12 rounded-full border-2 transition ${
                      isMuted
                        ? "border-red-500/60 bg-red-500/20 text-red-400 hover:bg-red-500/30"
                        : "border-biolumeTeal/50 bg-biolumeTeal/10 text-biolumeTeal hover:bg-biolumeTeal/20"
                    }`}
                  >
                    {isMuted ? (
                      <MicOff className="h-5 w-5" />
                    ) : (
                      <Mic className="h-5 w-5" />
                    )}
                  </span>
                  <span className="text-[0.6rem] font-medium text-white/80">
                    {isMuted ? "Unmute" : "Mute"}
                  </span>
                </button>
                <button
                  onClick={toggleVideo}
                  className="flex flex-col items-center gap-1.5"
                  title={isVideoOn ? "Turn off camera" : "Start video"}
                >
                  <span
                    className={`flex items-center justify-center w-12 h-12 rounded-full border-2 transition ${
                      !isVideoOn
                        ? "border-red-500/60 bg-red-500/20 text-red-400 hover:bg-red-500/30"
                        : "border-biolumeTeal/50 bg-biolumeTeal/10 text-biolumeTeal hover:bg-biolumeTeal/20"
                    }`}
                  >
                    {isVideoOn ? (
                      <Video className="h-5 w-5" />
                    ) : (
                      <VideoOff className="h-5 w-5" />
                    )}
                  </span>
                  <span className="text-[0.6rem] font-medium text-white/80">
                    {isVideoOn ? "Video on" : "Video off"}
                  </span>
                </button>
                <button
                  onClick={toggleShareScreen}
                  className="flex flex-col items-center gap-1.5"
                  title="Share screen"
                >
                  <span
                    className={`flex items-center justify-center w-12 h-12 rounded-full border-2 transition ${
                      isSharingScreen
                        ? "border-amber-500/60 bg-amber-500/20 text-amber-400"
                        : "border-white/20 bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    <Monitor className="h-5 w-5" />
                  </span>
                  <span className="text-[0.6rem] font-medium text-white/80">
                    Share
                  </span>
                </button>
                <button
                  onClick={() => setChatOpen((o) => !o)}
                  className="flex flex-col items-center gap-1.5"
                  title="Chat"
                >
                  <span
                    className={`flex items-center justify-center w-12 h-12 rounded-full border-2 transition ${
                      chatOpen
                        ? "border-biolumeTeal/50 bg-biolumeTeal/20 text-biolumeTeal"
                        : "border-white/20 bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    <MessageSquare className="h-5 w-5" />
                  </span>
                  <span className="text-[0.6rem] font-medium text-white/80">
                    Chat
                  </span>
                </button>
                <button
                  onClick={endCall}
                  className="flex flex-col items-center gap-1.5"
                  title="End call"
                >
                  <span className="flex items-center justify-center w-12 h-12 rounded-full border-2 border-red-500/60 bg-red-500/20 text-red-400 hover:bg-red-500/30 transition">
                    <PhoneOff className="h-5 w-5" />
                  </span>
                  <span className="text-[0.6rem] font-medium text-white/80">
                    End call
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Transcript panel */}
        <aside
          ref={transcriptRef}
          className={`w-full lg:w-[22rem] flex-shrink-0 flex flex-col min-h-0 lg:overflow-y-auto scrollbar-thin px-3 lg:px-4 pb-4 pt-2 transition-all ${
            chatOpen ? "ring-2 ring-biolumeTeal/50 rounded-xl" : ""
          }`}
        >
          <div className="flex-1 flex flex-col min-h-0 rounded-xl overflow-hidden border border-biolumeTeal/25 bg-[#0a1628]/70 backdrop-blur-xl shadow-[0_0_24px_rgba(0,255,229,0.06)]">
            <div className="flex-shrink-0 px-4 py-3 flex items-center justify-between border-b border-biolumeTeal/20 bg-[#051018]/80">
              <h2 className="text-sm font-semibold text-white/90 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-biolumeTeal" />
                Live transcript
              </h2>
              <div className="flex items-center gap-2 text-[0.65rem] tabular-nums">
                <span className="font-medium px-2 py-0.5 rounded-md bg-biolumeTeal/20 text-biolumeTeal border border-biolumeTeal/30">
                  {messages.length} {messages.length === 1 ? "msg" : "msgs"}
                </span>
                {connected && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Sonic
                  </span>
                )}
              </div>
            </div>
            <div
              ref={(el) => {
                if (el) el.scrollTop = el.scrollHeight;
              }}
              className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-3 min-h-0"
            >
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                  <MessageSquare className="h-10 w-10 text-white/20 mb-3" />
                  <p className="text-sm text-white/50">
                    No messages yet. Start the session and pitch — Nova Sonic
                    handles speech in real-time.
                  </p>
                </div>
              )}
              {messages.map((msg, idx) => {
                const isFounder = msg.shark_id === "founder";
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`rounded-lg px-3 py-2.5 border-l-2 ${
                      isFounder
                        ? "bg-biolumeTeal/5 ml-4"
                        : msg.is_barge_in
                        ? "bg-amber-500/10"
                        : "bg-white/5"
                    }`}
                    style={{
                      borderLeftColor: isFounder
                        ? "#00FFE5"
                        : msg.is_barge_in
                        ? "#f59e0b"
                        : msg.color,
                    }}
                  >
                    <span
                      className="text-xs font-semibold"
                      style={{
                        color: isFounder
                          ? "#00FFE5"
                          : msg.is_barge_in
                          ? "#f59e0b"
                          : msg.color,
                      }}
                    >
                      {msg.display_name}
                    </span>
                    <p className="text-xs mt-1 leading-relaxed text-white/85">
                      {msg.text}
                    </p>
                  </motion.div>
                );
              })}
            </div>
            {/* Text input fallback */}
            <div className="border-t border-biolumeTeal/20 bg-[#051018]/90 px-3 py-2">
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = pitchInput.trim();
                  if (!text) return;
                  setPitchInput("");
                  sendText(text);
                }}
              >
                <input
                  type="text"
                  value={pitchInput}
                  onChange={(e) => setPitchInput(e.target.value)}
                  placeholder={
                    active
                      ? "Type a message (cross-modal input)…"
                      : "Start session first"
                  }
                  disabled={!active}
                  className="flex-1 bg-black/40 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-biolumeTeal/70"
                />
                <button
                  type="submit"
                  disabled={!active || !pitchInput.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-biolumeTeal text-[#020617] border border-biolumeTeal/60 hover:bg-[#7bffe9] disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        </aside>
      </div>

      {/* Results overlay — shown after all verdicts are delivered */}
      {showResults && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 200 }}
            className="max-w-lg w-full mx-4 rounded-2xl border-2 border-biolumeTeal/40 bg-[#0a1628]/95 backdrop-blur-xl p-8 shadow-[0_0_60px_rgba(0,255,229,0.2)] text-center max-h-[90vh] overflow-y-auto"
          >
            {(() => {
              const inCount = verdictResults.filter((v) => v.verdict === "IN").length;
              const total = verdictResults.length;
              const allIn = inCount === total;
              const noneIn = inCount === 0;
              return (
                <>
                  <div className="text-4xl mb-3">
                    {allIn ? "🎉" : noneIn ? "💪" : "👏"}
                  </div>
                  <h2 className="text-xl font-bold text-white mb-2">
                    {allIn
                      ? "Congratulations!"
                      : noneIn
                      ? "Keep Going!"
                      : "Great Effort!"}
                  </h2>
                  <p className="text-lg text-white/90 mb-1">
                    <span className="font-bold text-biolumeTeal">{inCount}</span> out of{" "}
                    <span className="font-bold text-biolumeTeal">{total}</span> shark
                    {total !== 1 ? "s" : ""}{" "}
                    {inCount === 1 ? "likes" : "like"} your proposal
                  </p>
                  <p className="text-sm text-white/60 mb-6">
                    {allIn
                      ? "All sharks want to follow up with you!"
                      : noneIn
                      ? "Use the feedback to refine your pitch and try again."
                      : `${inCount} shark${inCount !== 1 ? "s" : ""} want${inCount === 1 ? "s" : ""} to follow up. Review the feedback to win the rest.`}
                  </p>

                  <div className="space-y-3 mb-6 text-left">
                    {verdictResults.map((v) => (
                      <div
                        key={v.sharkId}
                        className={`rounded-lg px-4 py-3 border-l-2 ${
                          v.verdict === "IN"
                            ? "border-l-emerald-400 bg-emerald-500/10"
                            : "border-l-red-400 bg-red-500/10"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-white/90">
                            {v.displayName}
                          </span>
                          <span
                            className={`text-[0.65rem] font-bold px-1.5 py-0.5 rounded ${
                              v.verdict === "IN"
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                                : "bg-red-500/20 text-red-400 border border-red-500/40"
                            }`}
                          >
                            {v.verdict === "IN" ? "I'M IN" : "I'M OUT"}
                          </span>
                        </div>
                        <p className="text-[0.75rem] text-white/75 leading-relaxed">
                          {v.text}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => {
                        setShowResults(false);
                        reset();
                        startSession();
                      }}
                      className="px-6 py-2.5 rounded-xl border-2 border-biolumeTeal bg-biolumeTeal/15 text-biolumeTeal text-sm font-medium hover:bg-biolumeTeal/25 transition shadow-[0_0_20px_rgba(0,255,229,0.15)]"
                    >
                      Start over
                    </button>
                    <button
                      onClick={() => {
                        setShowResults(false);
                        endCall();
                      }}
                      className="px-6 py-2.5 rounded-xl border border-white/20 bg-white/5 text-white/80 text-sm font-medium hover:bg-white/10 transition"
                    >
                      End pitch
                    </button>
                  </div>
                </>
              );
            })()}
          </motion.div>
        </motion.div>
      )}


    </main>
  );
}

interface VideoTileProps {
  image: string;
  background: string;
  name: string;
  role: string;
  textClass: string;
  isSpeaking: boolean;
  isBargeIn: boolean;
}

function VideoTile({
  image,
  background,
  name,
  role,
  textClass,
  isSpeaking,
  isBargeIn,
}: VideoTileProps) {
  return (
    <motion.div
      animate={
        isBargeIn
          ? {
              scale: [1, 1.02, 1],
              boxShadow: [
                "0 0 0 3px rgba(255,129,0,0.6), 0 0 30px rgba(255,129,0,0.4)",
                "0 0 0 3px rgba(255,129,0,0.8), 0 0 40px rgba(255,129,0,0.5)",
                "0 0 0 3px rgba(255,129,0,0.6), 0 0 30px rgba(255,129,0,0.4)",
              ],
            }
          : isSpeaking
          ? {
              boxShadow:
                "0 0 0 3px rgba(0,255,229,0.7), 0 0 32px rgba(0,255,229,0.35), 0 0 48px rgba(0,255,229,0.15)",
            }
          : { boxShadow: "0 0 0 1px rgba(0,255,229,0.2)" }
      }
      transition={{
        duration: isBargeIn ? 0.5 : 0.25,
        repeat: isBargeIn ? 2 : 0,
      }}
      className={`relative rounded-xl overflow-hidden bg-[#051018]/90 flex flex-col min-h-0 h-full ${
        isSpeaking && !isBargeIn
          ? "ring-2 ring-biolumeTeal ring-offset-2 ring-offset-[#0a1628]"
          : "border-2 border-biolumeTeal/30"
      }`}
    >
      <div className="flex-1 relative overflow-hidden min-h-0">
        <div
          className="absolute inset-0 w-full h-full bg-cover bg-center"
          style={{ backgroundImage: `url(${background})` }}
        />
        <img
          src={image}
          alt={name}
          className={`absolute inset-0 w-full h-full object-contain object-bottom ${
            isSpeaking ? "animate-speaking" : ""
          }`}
        />
        {isSpeaking && (
          <div className="absolute inset-0 pointer-events-none animate-speaking-pulse" />
        )}
        <div className="absolute top-2 left-2 z-10 flex items-center gap-2 rounded-lg bg-black/70 backdrop-blur-sm px-2.5 py-1.5 border border-white/20 shadow-lg">
          {isSpeaking ? (
            <span className="text-biolumeTeal" title="Unmuted">
              <Mic className="h-4 w-4" />
            </span>
          ) : (
            <span className="text-red-400" title="Muted">
              <MicOff className="h-4 w-4" />
            </span>
          )}
          <span className="text-white/80" title="Video off">
            <VideoOff className="h-4 w-4" />
          </span>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 py-2 px-3 bg-black/60 backdrop-blur-sm border-t border-biolumeTeal/20">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-xs font-medium ${textClass}`}>{name}</p>
          {isSpeaking && (
            <span className="text-[0.6rem] font-semibold px-1.5 py-0.5 rounded bg-biolumeTeal/30 text-biolumeTeal border border-biolumeTeal/50 uppercase tracking-wider">
              Speaking
            </span>
          )}
        </div>
        <p className="text-[0.65rem] text-white/50 truncate">{role}</p>
      </div>
    </motion.div>
  );
}
