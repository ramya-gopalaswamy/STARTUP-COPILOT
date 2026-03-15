"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Radio, Mic, MicOff, Video, VideoOff, Monitor, MessageSquare, PhoneOff, Volume2 } from "lucide-react";
import { useVirtualTankStream } from "../../src/hooks/useVirtualTankStream";
import { useSpeechInput } from "../../src/hooks/useSpeechInput";

const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000/api";

const SHARKS = [
  { id: "hawk", name: "The Hawk", role: "CFO", image: "/images/shark1.png", background: "/images/ceo-office-1.png", text: "text-amber-300" },
  { id: "visionary", name: "The Visionary", role: "Story Architect", image: "/images/shark2.png", background: "/images/ceo-office-2.png", text: "text-[#b87aff]" },
  { id: "tech-giant", name: "The Tech Giant", role: "Scale Strategist", image: "/images/shark3.png", background: "/images/ceo-office-3.png", text: "text-biolumeTeal" },
] as const;

export default function VirtualTankPage() {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [pitchInput, setPitchInput] = useState("");
  const [sendingTurn, setSendingTurn] = useState(false);
  const [fillerCount, setFillerCount] = useState(0);
  const [utteranceCount, setUtteranceCount] = useState(0);
  const [clarityScore, setClarityScore] = useState<number | null>(null);
  const [confidenceScore, setConfidenceScore] = useState<number | null>(null);
  const [clarityNotes, setClarityNotes] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<
    { shark_id: string; display_name: string; verdict: string; detail: string; feedback?: string }[]
  >([]);
  const [readyForDecision, setReadyForDecision] = useState(false);
  const [scoringInProgress, setScoringInProgress] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const transcriptRef = useRef<HTMLElement | null>(null);
  const greetingAudioRef = useRef<HTMLAudioElement | null>(null);
  const [greetingPlaying, setGreetingPlaying] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [founderName, setFounderName] = useState("");
  const wsIntroQueue = useRef<{ shark_id: string; text: string }[]>([]);
  const wsFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushWsIntro = () => {
    if (wsIntroQueue.current.length === 0) return;
    const batch = [...wsIntroQueue.current];
    wsIntroQueue.current = [];
    void playTTSForMessages(batch);
  };

  const { messages, connected, reset, addMessages } = useVirtualTankStream(
    active,
    (msg) => {
      wsIntroQueue.current.push(msg);
      if (wsFlushTimer.current) clearTimeout(wsFlushTimer.current);
      wsFlushTimer.current = setTimeout(flushWsIntro, 300);
    },
    founderName,
  );
  const [speechPaused, setSpeechPaused] = useState(false);
  const [speakingSharkId, setSpeakingSharkId] = useState<string | null>(null);
  const playingTTSRef = useRef(false);

  const playTTSForMessages = async (msgs: { shark_id: string; text: string }[]) => {
    playingTTSRef.current = true;
    setSpeechPaused(true);
    for (const msg of msgs) {
      if (!msg?.text) continue;
      setSpeakingSharkId(msg.shark_id);
      try {
        const ttsRes = await fetch(`${BACKEND_BASE_URL}/virtual-tank-test/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: msg.text, voice_id: msg.shark_id }),
        });
        if (!ttsRes.ok) continue;
        const blob = await ttsRes.blob();
        const url = URL.createObjectURL(blob);
        await new Promise<void>((resolve) => {
          const audio = new Audio(url);
          audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
          audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
          audio.play().catch(() => resolve());
        });
      } catch { /* TTS unavailable */ }
    }
    setSpeakingSharkId(null);
    playingTTSRef.current = false;
    setSpeechPaused(false);
  };

  const sendTurnAndSpeak = async (text: string) => {
    if (!text?.trim() || sendingTurn || sessionComplete) return;
    try {
      setSendingTurn(true);
      addMessages([{
        shark_id: "founder",
        display_name: "You",
        role: "Founder",
        color: "#00FFE5",
        text: text.trim(),
        is_barge_in: false,
      }]);
      const res = await fetch(`${BACKEND_BASE_URL}/virtual-tank-test/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), founder_name: founderName.trim() || undefined }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as any;
      const m = data?.virtual_tank?.metrics;
      if (m) {
        if (typeof m.filler_count === "number") setFillerCount(m.filler_count);
        if (Array.isArray(m.user_utterances)) setUtteranceCount(m.user_utterances.length);
      }
      const newShark = data?.new_shark_messages as { shark_id: string; display_name: string; role: string; color: string; text: string; is_barge_in?: boolean }[] | undefined;
      if (Array.isArray(newShark) && newShark.length > 0) {
        addMessages(newShark.map((s) => ({
          shark_id: s.shark_id,
          display_name: s.display_name,
          role: s.role,
          color: s.color,
          text: s.text,
          is_barge_in: s.is_barge_in ?? false,
        })));
        await playTTSForMessages(newShark);
      }
      if (data?.ready_for_decision) {
        setReadyForDecision(true);
        setSendingTurn(false);
        await fetchScorecard();
        return;
      }
    } catch { /* ignore */ } finally {
      setSendingTurn(false);
    }
  };

  const fetchScorecard = async () => {
    if (scoringInProgress) return;
    setScoringInProgress(true);
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/virtual-tank-test/scorecard`, {
        method: "POST",
      });
      if (!res.ok) return;
      const data = (await res.json()) as any;
      const vt = data?.virtual_tank;
      const m = vt?.metrics;
      if (m) {
        if (typeof m.clarity_score === "number") setClarityScore(m.clarity_score);
        if (typeof m.confidence_score === "number") setConfidenceScore(m.confidence_score);
        if (typeof m.clarity_notes === "string") setClarityNotes(m.clarity_notes);
        if (typeof m.filler_count === "number") setFillerCount(m.filler_count);
        if (Array.isArray(m.user_utterances)) setUtteranceCount(m.user_utterances.length);
      }
      const vList = vt?.verdicts as { shark_id: string; display_name: string; verdict: string; detail: string; feedback?: string }[] | undefined;
      if (Array.isArray(vList) && vList.length > 0) {
        setVoiceOn(false);
        setVerdicts(vList);
        const verdictLines = vList.map((v) => ({
          shark_id: v.shark_id,
          text: `${v.verdict === "IN" ? "I'm in." : "I'm out."} ${v.detail}${v.feedback ? ` My advice: ${v.feedback}` : ""}`,
        }));
        await playTTSForMessages(verdictLines);
        setSessionComplete(true);
      }
    } catch { /* ignore */ } finally {
      setScoringInProgress(false);
    }
  };

  const speechActive = active && voiceOn && !speechPaused;
  const { listening, transcript, supported: speechSupported } = useSpeechInput(
    speechActive,
    (text: string) => {
      void sendTurnAndSpeak(text);
    },
  );


  // WS intro TTS is handled via the onWsMessage callback above.

  useEffect(() => {
    if (chatOpen && transcriptRef.current) transcriptRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [chatOpen]);

  const latestByShark = useMemo(() => {
    const grouped: Record<string, (typeof messages)[number]> = {};
    for (const msg of messages) {
      grouped[msg.shark_id] = msg;
    }
    return grouped;
  }, [messages]);

  // Attach stream to video element when it changes
  useEffect(() => {
    const video = userVideoRef.current;
    const stream = isSharingScreen ? screenStreamRef.current : localStreamRef.current;
    if (video && stream) {
      video.srcObject = stream;
    }
    if (video && !stream && (isVideoOn || isSharingScreen)) {
      video.srcObject = null;
    }
  }, [isVideoOn, isSharingScreen]);

  const toggleMute = () => {
    if (!isMuted) {
      setIsMuted(true);
      setVoiceOn(false);
    } else {
      setIsMuted(false);
      setVoiceOn(true);
    }
  };

  const toggleVideo = async () => {
    if (isVideoOn) {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      if (userVideoRef.current) userVideoRef.current.srcObject = null;
      setIsVideoOn(false);
      return;
    }
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = s;
      if (userVideoRef.current) userVideoRef.current.srcObject = s;
      setIsVideoOn(true);
      if (isMuted) s.getAudioTracks().forEach((t) => (t.enabled = false));
    } catch {
      // permission denied or no device
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
      // user cancelled or not supported
    }
  };

  const endCall = () => {
    greetingAudioRef.current?.pause();
    greetingAudioRef.current = null;
    setGreetingPlaying(false);
    setVoiceOn(false);
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
    setVoiceOn(true);
    setIsMuted(false);
    setGreetingPlaying(false);
    greetingAudioRef.current = null;
    setReadyForDecision(false);
    setSessionComplete(false);
    setVerdicts([]);
    setClarityScore(null);
    setConfidenceScore(null);
    setClarityNotes(null);
    setFillerCount(0);
    setUtteranceCount(0);
  };

  const stopSession = () => {
    greetingAudioRef.current?.pause();
    greetingAudioRef.current = null;
    setGreetingPlaying(false);
    setVoiceOn(false);
    setActive(false);
  };

  return (
    <main className="relative h-screen flex flex-col bg-[#050b14] overflow-hidden">
      {/* Background: sunbeamsea video + sea overlay (lighter so video shows) */}
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

      {/* Header: sea-themed */}
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
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-white/50">
            <Radio className="h-3.5 w-3.5" />
            Pitch simulator
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
                {sendingTurn ? "Thinking…" : speechPaused ? "Sharks speaking…" : voiceOn ? "Listening…" : "Live"}
              </span>
              <button
                onClick={stopSession}
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
        {/* Zoom-style call: ocean themed */}
        <section className="flex-1 flex flex-col min-h-0 p-4 lg:p-6">
          <div className="rounded-2xl border-2 border-biolumeTeal/25 bg-[#0a1628]/60 backdrop-blur-xl flex-1 flex flex-col min-h-0 overflow-hidden shadow-[0_0_40px_rgba(0,255,229,0.1),inset_0_1px_0_rgba(255,255,255,0.05)]">
            {/* Layout: when sharing screen = sharks top row + shared content center; else 2x2 grid */}
            <div className="flex-1 flex flex-col min-h-0 p-4">
              {isSharingScreen ? (
                <>
                  {/* Top row: 3 sharks side by side (meeting style) */}
                  <div className="flex-shrink-0 flex items-center justify-center gap-2 mb-3">
                    {SHARKS.map((shark) => (
                      <div key={shark.id} className="w-[min(28vw,180px)] flex-shrink-0">
                        <VideoTile
                          image={shark.image}
                          background={shark.background}
                          name={shark.name}
                          role={shark.role}
                          textClass={shark.text}
                          isSpeaking={speakingSharkId === shark.id}
                          isBargeIn={latestByShark[shark.id]?.is_barge_in ?? false}
                        />
                      </div>
                    ))}
                  </div>
                  {/* Center: shared screen (main content) */}
                  <div className="flex-1 min-h-0 rounded-xl overflow-hidden border-2 border-biolumeTeal/40 bg-black shadow-[0_0_30px_rgba(0,255,229,0.15)] relative">
                    <video
                      ref={userVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                    <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/60 text-biolumeTeal text-xs font-medium flex items-center gap-1.5">
                      <Monitor className="h-3.5 w-3.5" />
                      You're sharing your screen
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3 md:gap-4 flex-1 min-h-0 content-start">
                  {SHARKS.map((shark) => (
                    <VideoTile
                      key={shark.id}
                      image={shark.image}
                      background={shark.background}
                      name={shark.name}
                      role={shark.role}
                      textClass={shark.text}
                      isSpeaking={speakingSharkId === shark.id}
                      isBargeIn={latestByShark[shark.id]?.is_barge_in ?? false}
                    />
                  ))}
                  {/* User (founder) tile — shows live video when video on */}
                  <div className="relative rounded-xl overflow-hidden border-2 border-biolumeTeal/30 bg-[#051018]/90 flex flex-col aspect-video min-h-0 shadow-[0_0_20px_rgba(0,255,229,0.08)]">
                    <div className="flex-1 relative flex items-center justify-center min-h-0 bg-gradient-to-br from-biolumeTeal/20 to-[#0a1628]">
                      {isVideoOn && (
                        <video
                          ref={userVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      )}
                      {!isVideoOn && (
                        <div className="text-center">
                          <VideoOff className="h-8 w-8 mx-auto text-biolumeTeal/60 mb-2" />
                          <span className="text-xs text-white/60">Camera off</span>
                        </div>
                      )}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 py-2 px-3 bg-black/60 backdrop-blur-sm">
                      <p className="text-xs font-medium text-biolumeTeal">You — Founder</p>
                    </div>
                  </div>
                </div>
              )}

              {active && (
                <div className="text-center mb-1 space-y-1">
                  <p className="text-[0.65rem] text-white/50">
                    {voiceOn
                      ? sendingTurn
                        ? "Sharks are thinking\u2026"
                        : speechPaused
                        ? "Sharks are speaking\u2026"
                        : "Listening \u2014 speak your pitch and pause when done. Sharks will reply."
                      : "Session live. Type below or turn on voice to speak."}
                  </p>
                  {voiceOn && !speechPaused && !sendingTurn && transcript && (
                    <p className="text-[0.7rem] text-biolumeTeal/80 italic truncate max-w-md mx-auto">
                      &ldquo;{transcript}&rdquo;
                    </p>
                  )}
                  {voiceOn && !speechSupported && (
                    <p className="text-[0.65rem] text-amber-400">
                      Speech recognition not supported in this browser. Use Chrome for voice input.
                    </p>
                  )}
                </div>
              )}

              {/* Zoom-style call controls — circular buttons */}
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
                    {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </span>
                  <span className="text-[0.6rem] font-medium text-white/80">{isMuted ? "Unmute" : "Mute"}</span>
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
                    {isVideoOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                  </span>
                  <span className="text-[0.6rem] font-medium text-white/80">{isVideoOn ? "Video on" : "Video off"}</span>
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
                  <span className="text-[0.6rem] font-medium text-white/80">Share</span>
                </button>
                <button
                  onClick={() => setChatOpen((o) => !o)}
                  className="flex flex-col items-center gap-1.5"
                  title="Chat"
                >
                  <span
                    className={`flex items-center justify-center w-12 h-12 rounded-full border-2 transition ${
                      chatOpen ? "border-biolumeTeal/50 bg-biolumeTeal/20 text-biolumeTeal" : "border-white/20 bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    <MessageSquare className="h-5 w-5" />
                  </span>
                  <span className="text-[0.6rem] font-medium text-white/80">Chat</span>
                </button>
                <button
                  onClick={endCall}
                  className="flex flex-col items-center gap-1.5"
                  title="End call"
                >
                  <span className="flex items-center justify-center w-12 h-12 rounded-full border-2 border-red-500/60 bg-red-500/20 text-red-400 hover:bg-red-500/30 transition">
                    <PhoneOff className="h-5 w-5" />
                  </span>
                  <span className="text-[0.6rem] font-medium text-white/80">End call</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Transcript: modern call-style panel */}
        <aside
          ref={transcriptRef}
          className={`w-full lg:w-[22rem] flex-shrink-0 flex flex-col min-h-0 lg:overflow-y-auto scrollbar-thin px-3 lg:px-4 pb-4 pt-2 transition-all ${chatOpen ? "ring-2 ring-biolumeTeal/50 rounded-xl" : ""}`}
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
                <span className="px-2 py-0.5 rounded-md bg-white/5 text-white/70 border border-white/15">
                  Filler:{" "}
                  <span className="font-semibold text-biolumeTeal">{fillerCount}</span>{" "}
                  in{" "}
                  <span className="font-semibold text-biolumeTeal">
                    {utteranceCount}
                  </span>{" "}
                  turns
                </span>
              </div>
            </div>
            <div ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }} className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-3 min-h-0">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                  <MessageSquare className="h-10 w-10 text-white/20 mb-3" />
                  <p className="text-sm text-white/50">
                    No messages yet. Start the session and pitch—shark questions and barge-ins will appear here.
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
                      style={{ color: isFounder ? "#00FFE5" : msg.is_barge_in ? "#f59e0b" : msg.color }}
                    >
                      {msg.display_name}
                    </span>
                    <p className="text-xs mt-1 leading-relaxed text-white/85">{msg.text}</p>
                  </motion.div>
                );
              })}
            </div>
            {/* Founder text turn input */}
            <div className="border-t border-biolumeTeal/20 bg-[#051018]/90 px-3 py-2">
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = pitchInput.trim();
                  if (!text || sendingTurn) return;
                  setPitchInput("");
                  void sendTurnAndSpeak(text);
                }}
              >
                <input
                  type="text"
                  value={pitchInput}
                  onChange={(e) => setPitchInput(e.target.value)}
                  placeholder={active ? "Type a line of your pitch or answer…" : "Start session to send a line to the sharks"}
                  disabled={!active}
                  className="flex-1 bg-black/40 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-biolumeTeal/70"
                />
                <button
                  type="submit"
                  disabled={!active || !pitchInput.trim() || sendingTurn}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-biolumeTeal text-[#020617] border border-biolumeTeal/60 hover:bg-[#7bffe9] disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
          {/* Scorecard + verdicts */}
          <div className="mt-3 p-3 rounded-xl border border-white/15 bg-black/40 space-y-2 flex-shrink-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-white/80">Pitch scorecard</p>
              <button
                type="button"
                onClick={() => void fetchScorecard()}
                disabled={scoringInProgress}
                className="px-2.5 py-1 rounded-lg border border-biolumeTeal/60 text-[0.7rem] text-biolumeTeal hover:bg-biolumeTeal/15 disabled:opacity-50 transition"
              >
                {scoringInProgress ? "Scoring…" : "End pitch & score"}
              </button>
            </div>
            <div className="flex items-center gap-3 text-[0.7rem] text-white/70">
              <div className="flex-1">
                <p>
                  Clarity:{" "}
                  <span className="font-semibold text-biolumeTeal">
                    {clarityScore != null ? `${Math.round(clarityScore)} / 100` : "—"}
                  </span>
                </p>
                <p>
                  Confidence:{" "}
                  <span className="font-semibold text-biolumeTeal">
                    {confidenceScore != null
                      ? `${Math.round(confidenceScore)} / 100`
                      : "—"}
                  </span>
                </p>
              </div>
              <div className="flex-1 text-right">
                <p>
                  Filler total:{" "}
                  <span className="font-semibold text-biolumeTeal">{fillerCount}</span>
                </p>
                <p>
                  Turns:{" "}
                  <span className="font-semibold text-biolumeTeal">
                    {utteranceCount}
                  </span>
                </p>
              </div>
            </div>
            {clarityNotes && (
              <p className="text-[0.7rem] text-white/75 leading-snug border-t border-white/10 pt-2 mt-1">
                <span className="font-semibold text-biolumeTeal/90">Coach note:</span>{" "}
                {clarityNotes}
              </p>
            )}
            {verdicts.length > 0 && (
              <div className="pt-2 border-t border-white/10 space-y-2">
                <p className="text-[0.7rem] font-semibold text-white/80">
                  Shark verdicts
                </p>
                {verdicts.map((v) => (
                  <div
                    key={v.shark_id}
                    className={`rounded-lg px-3 py-2.5 border-l-2 ${
                      v.verdict === "IN"
                        ? "border-l-emerald-400 bg-emerald-500/10"
                        : "border-l-red-400 bg-red-500/10"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[0.7rem] font-semibold text-white/90">
                        {v.display_name}
                      </span>
                      <span
                        className={`text-[0.6rem] font-bold px-1.5 py-0.5 rounded ${
                          v.verdict === "IN"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                            : "bg-red-500/20 text-red-400 border border-red-500/40"
                        }`}
                      >
                        {v.verdict === "IN" ? "I'M IN" : "I'M OUT"}
                      </span>
                    </div>
                    <p className="text-[0.65rem] text-white/75 leading-relaxed">
                      {v.detail}
                    </p>
                    {v.feedback && (
                      <p className="text-[0.65rem] text-biolumeTeal/80 leading-relaxed mt-1.5 pt-1.5 border-t border-white/10">
                        <span className="font-semibold text-biolumeTeal/90">Tip:</span>{" "}
                        {v.feedback}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Results overlay */}
      {sessionComplete && verdicts.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 200 }}
            className="max-w-lg w-full mx-4 rounded-2xl border-2 border-biolumeTeal/40 bg-[#0a1628]/95 backdrop-blur-xl p-8 shadow-[0_0_60px_rgba(0,255,229,0.2)] text-center"
          >
            {(() => {
              const inCount = verdicts.filter((v) => v.verdict === "IN").length;
              const total = verdicts.length;
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

                  <div className="flex items-center justify-center gap-3 mb-6">
                    {verdicts.map((v) => (
                      <div
                        key={v.shark_id}
                        className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl border ${
                          v.verdict === "IN"
                            ? "border-emerald-500/50 bg-emerald-500/10"
                            : "border-red-500/40 bg-red-500/10"
                        }`}
                      >
                        <span className="text-sm font-semibold text-white/90">{v.display_name}</span>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded ${
                            v.verdict === "IN"
                              ? "bg-emerald-500/25 text-emerald-400"
                              : "bg-red-500/25 text-red-400"
                          }`}
                        >
                          {v.verdict === "IN" ? "I'M IN" : "I'M OUT"}
                        </span>
                      </div>
                    ))}
                  </div>

                  {(clarityScore != null || confidenceScore != null) && (
                    <div className="flex items-center justify-center gap-6 mb-6 text-sm text-white/80">
                      {clarityScore != null && (
                        <div>
                          <p className="text-white/50 text-xs">Clarity</p>
                          <p className="text-lg font-bold text-biolumeTeal">{Math.round(clarityScore)}<span className="text-sm text-white/50">/100</span></p>
                        </div>
                      )}
                      {confidenceScore != null && (
                        <div>
                          <p className="text-white/50 text-xs">Confidence</p>
                          <p className="text-lg font-bold text-biolumeTeal">{Math.round(confidenceScore)}<span className="text-sm text-white/50">/100</span></p>
                        </div>
                      )}
                      <div>
                        <p className="text-white/50 text-xs">Fillers</p>
                        <p className="text-lg font-bold text-amber-400">{fillerCount}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => {
                        setSessionComplete(false);
                        startSession();
                      }}
                      className="px-6 py-2.5 rounded-xl border-2 border-biolumeTeal bg-biolumeTeal/15 text-biolumeTeal text-sm font-medium hover:bg-biolumeTeal/25 transition shadow-[0_0_20px_rgba(0,255,229,0.15)]"
                    >
                      Start over
                    </button>
                    <button
                      onClick={() => {
                        setSessionComplete(false);
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
              boxShadow: "0 0 0 3px rgba(0,255,229,0.7), 0 0 32px rgba(0,255,229,0.35), 0 0 48px rgba(0,255,229,0.15)",
            }
          : { boxShadow: "0 0 0 1px rgba(0,255,229,0.2)" }
      }
      transition={{ duration: isBargeIn ? 0.5 : 0.25, repeat: isBargeIn ? 2 : 0 }}
      className={`relative rounded-xl overflow-hidden bg-[#051018]/90 flex flex-col aspect-video min-h-0 ${
        isSpeaking && !isBargeIn ? "ring-2 ring-biolumeTeal ring-offset-2 ring-offset-[#0a1628]" : "border-2 border-biolumeTeal/30"
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
          {isBargeIn && (
            <span className="text-[0.6rem] font-semibold px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-500/50 uppercase tracking-wider">
              Barge-in
            </span>
          )}
        </div>
        <p className="text-[0.65rem] text-white/50 truncate">{role}</p>
      </div>
    </motion.div>
  );
}
