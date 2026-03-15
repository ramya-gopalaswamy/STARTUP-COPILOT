"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Radio, X, Mail } from "lucide-react";
import { useSharedWorkspace } from "../../../src/context/SharedWorkspaceContext";

export default function VCScoutPage() {
  const { sharedWorkspace, triggerVCScout, loading } = useSharedWorkspace();
  const status = sharedWorkspace?.vc_scout?.status ?? "COMPLETE";
  const [founderName, setFounderName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [filters, setFilters] = useState({
    stage: "All" as "All" | "Pre-seed/Seed" | "Series A/B+",
    geography: "All" as "All" | "Americas" | "Europe" | "APAC/Rest",
    minMatch: 80,
  });

  const investors = useMemo(() => {
    const pins = sharedWorkspace?.vc_scout?.pins ?? [];
    if (!pins.length) return [];
    return pins.map((pin, idx) => {
      const tags: string[] = [];
      if (pin.stage_focus) tags.push(pin.stage_focus);
      if (pin.sector_focus) tags.push(pin.sector_focus);
      if (pin.check_size) tags.push(pin.check_size);
      return {
        id: `${idx}`,
        name: pin.name,
        match: typeof pin.match_score === "number" ? Math.round(pin.match_score) : Math.max(60, 90 - idx * 3),
        tags,
        thesis: pin.compatibility_summary ?? "",
        initial: pin.name?.[0]?.toUpperCase() ?? "?",
        website: pin.website ?? null,
        contactUrl: pin.contact_url ?? pin.website ?? null,
        region: pin.region,
      };
    });
  }, [sharedWorkspace]);

  const investorCount = investors.length || 0;

  const filteredInvestors = useMemo(() => {
    return investors.filter((inv) => {
      const stageTag =
        inv.tags.find((t) =>
          t.toLowerCase().includes("seed") || t.toLowerCase().includes("series"),
        ) ?? "";
      const stageOk =
        filters.stage === "All" ||
        (filters.stage === "Pre-seed/Seed" &&
          stageTag.toLowerCase().includes("seed")) ||
        (filters.stage === "Series A/B+" &&
          stageTag.toLowerCase().includes("series"));

      const regionLower = (inv.region || "").toLowerCase();
      const geoOk =
        filters.geography === "All" ||
        (filters.geography === "Americas" &&
          (regionLower.includes("united states") ||
            regionLower.includes("usa") ||
            regionLower.includes("canada") ||
            regionLower.includes("san francisco") ||
            regionLower.includes("new york"))) ||
        (filters.geography === "Europe" &&
          (regionLower.includes("europe") ||
            regionLower.includes("london") ||
            regionLower.includes("berlin") ||
            regionLower.includes("paris"))) ||
        (filters.geography === "APAC/Rest" &&
          !regionLower.includes("united states") &&
          !regionLower.includes("usa") &&
          !regionLower.includes("canada") &&
          !regionLower.includes("europe") &&
          !regionLower.includes("london") &&
          !regionLower.includes("berlin") &&
          !regionLower.includes("paris"));

      const matchOk = typeof inv.match === "number" ? inv.match >= filters.minMatch : true;

      return stageOk && geoOk && matchOk;
    });
  }, [investors, filters]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setFounderName(window.localStorage.getItem("founderName") || "");
    }
  }, []);

  const selectedInvestor = selectedId ? investors.find((i) => i.id === selectedId) : null;

  return (
    <main className="relative min-h-screen flex flex-col bg-[#050b14] overflow-hidden">
      {/* Background: jellyfish video + gradient overlay + sonar pulse */}
      <div className="fixed inset-0 z-0">
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          aria-hidden
        >
          <source src="/videos/jellyfish.mp4" type="video/mp4" />
        </video>
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/60 via-[#0a1628]/85 to-black/80"
          aria-hidden
        />
      </div>
      <div className="fixed inset-0 z-0 flex items-center justify-center pointer-events-none">
        <div className="w-[400px] h-[400px] rounded-full border border-[rgba(0,255,229,0.12)] animate-[sonar-pulse_3s_ease-out_infinite]" />
        <div className="absolute w-[400px] h-[400px] rounded-full border border-[rgba(0,255,229,0.08)] animate-[sonar-pulse_3s_ease-out_0.5s_infinite]" />
        <div className="absolute w-[400px] h-[400px] rounded-full border border-[rgba(0,255,229,0.06)] animate-[sonar-pulse_3s_ease-out_1s_infinite]" />
      </div>

      {/* Header: Breadcrumb + Status */}
      <header className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/30 backdrop-blur-xl">
        <div className="flex items-center gap-4 flex-wrap">
          <Link
            href="/mission-control"
            className="flex items-center gap-2 text-sm text-white/80 hover:text-biolumeTeal transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Mission Control
          </Link>
          <span className="text-white/40">›</span>
          <span className="text-sm font-medium text-white">VC Scout</span>
          <span className="text-white/40 hidden sm:inline">|</span>
          <span className="text-xs text-biolumeTeal flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5 animate-pulse" />
            {status === "SYNCING" ? "Scanning live VC data…" : "VC scout ready"}
          </span>
          {founderName && (
            <>
              <span className="text-white/40 hidden md:inline">|</span>
              <span className="text-xs text-white/70 hidden md:inline">
                Welcome, {founderName}.
              </span>
            </>
          )}
        </div>
      </header>

      {/* Sonar Sweep (Hero) */}
      <section className="relative z-10 px-4 py-6 border-b border-white/10">
        <div className="max-w-4xl mx-auto text-center">
          {investorCount > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-white/90">
                Nova has identified{" "}
                <span className="text-biolumeTeal font-semibold">
                  {investorCount.toLocaleString()}+
                </span>{" "}
                high-fit investors for your startup.
              </p>
              <button
                type="button"
                onClick={() => triggerVCScout()}
                disabled={status === "SYNCING" || loading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-transparent border border-biolumeTeal/60 text-biolumeTeal hover:bg-biolumeTeal/15 hover:border-biolumeTeal transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Radio className="h-4 w-4" />
                {status === "SYNCING" || loading ? "Scouting again…" : "Scout again"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-white/85">
                Kick off a VC scout run tailored to the startup you&apos;ve uploaded. Nova will use web
                search to find real funds that match your stage, sector, geography, and check size.
              </p>
              <button
                type="button"
                onClick={() => triggerVCScout()}
                disabled={status === "SYNCING" || loading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-biolumeTeal text-[#050b14] shadow-[0_0_20px_rgba(0,255,229,0.45)] hover:shadow-[0_0_28px_rgba(0,255,229,0.7)] hover:bg-[#7bffe9] disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                <Radio className="h-4 w-4" />
                {status === "SYNCING" || loading ? "Scouting VCs…" : "Scout for VCs"}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Main grid: Sidebar filters + Investor cards */}
      <div className="relative z-10 flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Sidebar: Filter controls */}
        <aside className="w-full lg:w-56 flex-shrink-0 border-r border-white/10 bg-black/20 backdrop-blur-xl p-4 space-y-4">
          <h3 className="text-xs font-semibold text-white/80 uppercase tracking-wider">
            Filter matches
          </h3>
          <div>
            <label className="text-[0.65rem] text-white/50 block mb-1">Stage focus</label>
            <div className="flex flex-wrap gap-1">
              {(["All", "Pre-seed/Seed", "Series A/B+"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, stage: option }))}
                  className={`px-2.5 py-1 rounded-full text-[0.7rem] border transition ${
                    filters.stage === option
                      ? "bg-biolumeTeal/20 border-biolumeTeal text-biolumeTeal"
                      : "bg-white/5 border-white/20 text-white/70 hover:bg-white/10"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[0.65rem] text-white/50 block mb-1">Geography</label>
            <div className="flex flex-wrap gap-1">
              {(["All", "Americas", "Europe", "APAC/Rest"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, geography: option }))}
                  className={`px-2.5 py-1 rounded-full text-[0.7rem] border transition ${
                    filters.geography === option
                      ? "bg-biolumeTeal/20 border-biolumeTeal text-biolumeTeal"
                      : "bg-white/5 border-white/20 text-white/70 hover:bg-white/10"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[0.65rem] text-white/50 block mb-1">Min. match</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={60}
                max={100}
                step={5}
                value={filters.minMatch}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, minMatch: Number(e.target.value) }))
                }
                className="w-full h-1.5 rounded-full appearance-none bg-white/10 accent-biolumeTeal"
              />
              <span className="text-xs text-biolumeTeal font-medium whitespace-nowrap">
                {filters.minMatch}%
              </span>
            </div>
          </div>
        </aside>

        {/* Central: High-signal investor cards (bento) */}
        <section className="flex-1 p-4 lg:p-6 overflow-auto">
          <h2 className="text-sm font-semibold text-white/90 mb-4">High-signal matches</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredInvestors.length === 0 && (
              <div className="col-span-full text-center text-sm text-white/70 border border-dashed border-white/20 rounded-xl py-10 bg-black/20">
                No investors match these filters. Try widening the stage, geography, or minimum match.
              </div>
            )}
            {filteredInvestors.map((inv) => (
              <motion.button
                key={inv.id}
                type="button"
                onClick={() => {
                  setSelectedId(inv.id);
                  setDossierOpen(true);
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`rounded-xl border overflow-hidden text-left backdrop-blur-xl transition ${
                  selectedId === inv.id
                    ? "border-biolumeTeal/50 bg-biolumeTeal/10 shadow-[0_0_20px_rgba(0,255,229,0.15)]"
                    : "border-white/15 bg-white/5 hover:border-biolumeTeal/30 hover:bg-white/10"
                }`}
              >
                <div className="p-4 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-biolumeTeal/20 border border-biolumeTeal/30 flex items-center justify-center flex-shrink-0 text-biolumeTeal font-bold text-sm">
                      {inv.initial}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{inv.name}</p>
                      <p className="text-xs text-biolumeTeal font-medium mt-0.5">{inv.match}% match</p>
                    </div>
                  </div>
                  {/* 3-bar signal strength - brighter if match >= 90 */}
                  <div
                    className={`flex flex-col gap-0.5 flex-shrink-0 ${
                      inv.match >= 90 ? "text-biolumeTeal drop-shadow-[0_0_6px_rgba(0,255,229,0.8)]" : "text-white/50"
                    }`}
                  >
                    <span className="w-4 h-0.5 bg-current rounded" style={{ opacity: inv.match >= 90 ? 1 : 0.6 }} />
                    <span className="w-4 h-0.5 bg-current rounded" style={{ opacity: inv.match >= 90 ? 0.9 : 0.5 }} />
                    <span className="w-4 h-0.5 bg-current rounded" style={{ opacity: inv.match >= 90 ? 0.7 : 0.4 }} />
                  </div>
                </div>
                <div className="px-4 pb-4 flex flex-wrap gap-1.5">
                  {inv.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded text-[0.65rem] bg-white/10 text-white/80"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </motion.button>
            ))}
          </div>
        </section>
      </div>

      {/* Investor Dossier: slide-out panel */}
      <AnimatePresence>
        {dossierOpen && selectedInvestor && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDossierOpen(false)}
            />
            <motion.aside
              className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md border-l border-white/10 bg-[#0a1118]/98 backdrop-blur-xl shadow-2xl flex flex-col"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">
                  Investor dossier — {selectedInvestor.name}
                </h2>
                <button
                  type="button"
                  onClick={() => setDossierOpen(false)}
                  className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-biolumeTeal/20 border border-biolumeTeal/40 flex items-center justify-center text-biolumeTeal font-bold text-xl">
                    {selectedInvestor.initial}
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-white">{selectedInvestor.name}</p>
                    <p className="text-biolumeTeal font-medium">{selectedInvestor.match}% match</p>
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">
                    Compatibility analysis
                  </h3>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
                    <p className="text-xs text-white/90 flex justify-between">
                      <span>Stage focus</span>
                      <span className="text-biolumeTeal">
                        {selectedInvestor.tags.find(
                          (t) =>
                            t.toLowerCase().includes("seed") ||
                            t.toLowerCase().includes("series"),
                        ) ?? "—"}
                      </span>
                    </p>
                    <p className="text-xs text-white/90 flex justify-between">
                      <span>Sector thesis</span>
                      <span className="text-biolumeTeal">
                        {selectedInvestor.tags.find(
                          (t) =>
                            !t.toLowerCase().includes("seed") &&
                            !t.toLowerCase().includes("series"),
                        ) ?? "—"}
                      </span>
                    </p>
                    <p className="text-xs text-white/90 flex justify-between">
                      <span>Check size</span>
                      <span className="text-biolumeTeal">
                        {selectedInvestor.tags.find(
                          (t) =>
                            t.includes("$") || t.toLowerCase().includes("check"),
                        ) ?? "—"}
                      </span>
                    </p>
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">
                    Why they match
                  </h3>
                  <p className="text-sm text-white/85 leading-relaxed">
                    {selectedInvestor.thesis ||
                      "Nova identified this fund as a strong fit based on stage, sector thesis, and geographic focus."}
                  </p>
                </div>
                {/* Partner-level discovery removed per request */}
                <div className="space-y-2">
                  <a
                    href={`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(
                      `Intro – our startup x ${selectedInvestor.name}`,
                    )}&body=${encodeURIComponent(
                      `Hi ${selectedInvestor.name},\n\n${
                        selectedInvestor.thesis ||
                        "I’d love to share our startup with you, as we believe it’s a strong fit for your investment focus."
                      }\n\nHappy to send over a deck and any additional details.\n\nBest,\n`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 rounded-xl bg-biolumeTeal/25 border border-biolumeTeal/60 text-biolumeTeal font-medium text-sm flex items-center justify-center gap-2 hover:bg-biolumeTeal/35 transition"
                  >
                    <Mail className="h-4 w-4" />
                    Draft email in Gmail
                  </a>
                  {selectedInvestor.contactUrl && (
                    <a
                      href={selectedInvestor.contactUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3 rounded-xl bg-biolumeTeal/20 border border-biolumeTeal/50 text-biolumeTeal font-medium text-sm flex items-center justify-center gap-2 hover:bg-biolumeTeal/30 transition"
                    >
                      <Mail className="h-4 w-4" />
                      Open VC contact page
                    </a>
                  )}
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

    </main>
  );
}
