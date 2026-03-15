"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, LineChart, AlertTriangle } from "lucide-react";

const MAX_RUNWAY_MONTHS = 24;
const PITCH_READY_MONTHS = 18;
const PITCH_READY_SCORE = 75;

export default function FinanceAuditorPage() {
  const [hiringMonthly, setHiringMonthly] = useState(45000);
  const [serverCosts, setServerCosts] = useState(8000);
  const [marketingSpend, setMarketingSpend] = useState(12000);
  const [userGrowth, setUserGrowth] = useState(15); // % MoM
  const [hiringSpeed, setHiringSpeed] = useState(40); // 0–100
  const [cashOnHand, setCashOnHand] = useState(850000);

  const burnRate = hiringMonthly + serverCosts + marketingSpend;
  const monthsOfSurvival = burnRate > 0 ? Math.min(MAX_RUNWAY_MONTHS, cashOnHand / burnRate) : 0;
  const survivalScore = useMemo(() => {
    const monthScore = Math.min(100, (monthsOfSurvival / MAX_RUNWAY_MONTHS) * 100);
    const growthPenalty = userGrowth > 20 ? -10 : 0;
    const hiringPenalty = hiringSpeed > 70 ? -5 : 0;
    return Math.max(0, Math.min(100, Math.round(monthScore + growthPenalty + hiringPenalty)));
  }, [monthsOfSurvival, userGrowth, hiringSpeed]);

  const isPitchReady = monthsOfSurvival >= PITCH_READY_MONTHS && survivalScore >= PITCH_READY_SCORE;
  const oxygenCritical = monthsOfSurvival < 6;
  const showAlert =
    monthsOfSurvival < 15 ||
    (userGrowth > 25 && hiringSpeed > 60) ||
    survivalScore < 50;

  const needleRotation = (monthsOfSurvival / MAX_RUNWAY_MONTHS) * 180 - 90;

  const milestones = [
    { month: 6, label: "Seed extension" },
    { month: 12, label: "Series A" },
    { month: 18, label: "Series B path" },
  ];

  return (
    <main className="relative min-h-screen flex flex-col bg-[#050b14] overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-[#050b14] via-[#0a1628] to-[#051018]" />
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_50%,rgba(0,255,229,0.06),transparent)]" />

      <header className="relative z-10 flex items-center gap-4 px-4 py-3 border-b border-white/10 bg-black/30 backdrop-blur-xl">
        <Link
          href="/mission-control"
          className="flex items-center gap-2 text-sm text-white/80 hover:text-biolumeTeal transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Mission Control
        </Link>
        <span className="text-white/40">›</span>
        <span className="text-sm font-medium text-white">Finance Auditor</span>
        <span className="text-xs text-white/50 ml-2">Projection simulation · Battle plan</span>
      </header>

      <div className="relative z-10 flex-1 flex flex-col min-h-0 p-4 lg:p-6 overflow-auto">
        <div className="mb-3 max-w-2xl space-y-1.5">
          <p className="text-[0.7rem] text-amber-200/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-1.5 inline-flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.9)]" />
            <span>
              This Finance Auditor view uses mock data only — live financial ingestion and AI analysis are planned as future enhancements to this project.
            </span>
          </p>
          <p className="text-xs text-white/60 max-w-2xl">
            Input your projections. The AI compares them to market reality and simulates your runway. Optimize until the gauge is in the safe zone.
          </p>
        </div>

        {/* Alert panel */}
        {showAlert && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 flex items-start gap-3 p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 backdrop-blur-xl"
          >
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-200">Nova 2 Warning</p>
              <p className="text-xs text-white/80 mt-0.5">
                Market data suggests higher customer acquisition costs. Average dev salary in this sector is ~15% higher than your projection. Consider extending runway or reducing burn.
              </p>
            </div>
          </motion.div>
        )}

        {/* Dual pane: Inputs (left) + Runway gauge (right) */}
        <div className="flex flex-col xl:flex-row gap-6 flex-1 min-h-0">
          {/* Left: Projection cards + sliders */}
          <div className="xl:w-[380px] flex-shrink-0 space-y-4">
            <h2 className="text-xs font-semibold text-white/80 uppercase tracking-wider">
              Projection engine
            </h2>
            <div className="space-y-3">
              {[
                {
                  label: "Hiring (monthly)",
                  value: hiringMonthly,
                  set: setHiringMonthly,
                  suffix: "$",
                  hint: "Salaries + contractors",
                },
                {
                  label: "Ops / Server (monthly)",
                  value: serverCosts,
                  set: setServerCosts,
                  suffix: "$",
                  hint: "Infra, tools",
                },
                {
                  label: "Marketing (monthly)",
                  value: marketingSpend,
                  set: setMarketingSpend,
                  suffix: "$",
                  hint: "CAC, ads",
                },
              ].map(({ label, value, set, suffix, hint }) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/15 bg-black/40 backdrop-blur-xl p-4"
                >
                  <label className="text-[0.65rem] text-white/50 uppercase tracking-wider block mb-1">
                    {label}
                  </label>
                  <p className="text-[0.65rem] text-white/40 mb-2">{hint}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-white/50">{suffix}</span>
                    <input
                      type="number"
                      value={value}
                      onChange={(e) => set(Number(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white text-sm focus:outline-none focus:border-biolumeTeal/50"
                      min={0}
                      step={1000}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-4 pt-2">
              <div className="rounded-xl border border-biolumeTeal/20 bg-biolumeTeal/5 p-4">
                <label className="text-[0.65rem] text-biolumeTeal/80 uppercase tracking-wider block mb-2">
                  User growth (% MoM)
                </label>
                <input
                  type="range"
                  min={0}
                  max={50}
                  value={userGrowth}
                  onChange={(e) => setUserGrowth(Number(e.target.value))}
                  className="w-full h-3 rounded-full appearance-none bg-white/10 accent-biolumeTeal [&::-webkit-slider-thumb]:shadow-[0_0_12px_rgba(0,255,229,0.6)]"
                />
                <p className="text-sm font-medium text-biolumeTeal mt-1">{userGrowth}%</p>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <label className="text-[0.65rem] text-amber-400/80 uppercase tracking-wider block mb-2">
                  Hiring speed
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={hiringSpeed}
                  onChange={(e) => setHiringSpeed(Number(e.target.value))}
                  className="w-full h-3 rounded-full appearance-none bg-white/10 accent-amber-500 [&::-webkit-slider-thumb]:shadow-[0_0_12px_rgba(255,129,0,0.5)]"
                />
                <p className="text-sm font-medium text-amber-400/90 mt-1">{hiringSpeed}%</p>
              </div>
            </div>
            <div className="rounded-xl border border-white/15 bg-black/40 backdrop-blur-xl p-4">
              <label className="text-[0.65rem] text-white/50 uppercase tracking-wider block mb-1">
                Cash on hand
              </label>
              <div className="flex items-center gap-2">
                <span className="text-white/50">$</span>
                <input
                  type="number"
                  value={cashOnHand}
                  onChange={(e) => setCashOnHand(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white text-sm focus:outline-none focus:border-biolumeTeal/50"
                  min={0}
                  step={50000}
                />
              </div>
            </div>
          </div>

          {/* Right: Radial runway gauge + oxygen + timeline */}
          <div className="flex-1 flex flex-col gap-6 min-w-0">
            <h2 className="text-xs font-semibold text-white/80 uppercase tracking-wider">
              Tactical runway
            </h2>
            <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
              {/* Radial Runway Gauge: Months of Survival */}
              <div className="flex-shrink-0">
                <div className="relative w-56 h-32 md:w-72 md:h-40">
                  <svg
                    viewBox="0 0 200 100"
                    className="w-full h-full"
                    aria-hidden
                  >
                    <defs>
                      <linearGradient id="gauge-safe" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#00FFE5" />
                        <stop offset="100%" stopColor="#00aa99" />
                      </linearGradient>
                      <linearGradient id="gauge-crush" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#ff8100" />
                        <stop offset="100%" stopColor="#ff4444" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M 20 90 A 80 80 0 0 1 180 90"
                      fill="none"
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth="12"
                      strokeLinecap="round"
                    />
                    <path
                      d="M 20 90 A 80 80 0 0 1 180 90"
                      fill="none"
                      stroke={oxygenCritical ? "url(#gauge-crush)" : "url(#gauge-safe)"}
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={`${(monthsOfSurvival / MAX_RUNWAY_MONTHS) * 251.2} 251.2`}
                      style={{ transition: "stroke-dasharray 0.5s ease-out" }}
                    />
                    <line
                      x1="100"
                      y1="90"
                      x2="100"
                      y2="30"
                      stroke="rgba(255,255,255,0.9)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      transform={`rotate(${needleRotation} 100 90)`}
                      style={{ transition: "transform 0.5s ease-out" }}
                    />
                  </svg>
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
                    <p className="text-2xl md:text-3xl font-bold text-white tabular-nums">
                      {monthsOfSurvival.toFixed(1)}
                    </p>
                    <p className="text-[0.65rem] text-white/50 uppercase tracking-wider">
                      Months survival
                    </p>
                  </div>
                </div>
              </div>

              {/* Oxygen gauge: circular ring */}
              <div className="flex flex-col items-center gap-2">
                <div className="relative w-28 h-28">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth="8"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke={oxygenCritical ? "#ff4444" : monthsOfSurvival >= 12 ? "#00FFE5" : "#ff8100"}
                      strokeWidth="8"
                      strokeDasharray={`${(monthsOfSurvival / MAX_RUNWAY_MONTHS) * 263.9} 263.9`}
                      strokeLinecap="round"
                      style={{ transition: "stroke-dasharray 0.5s ease-out, stroke 0.3s" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-bold text-white/90">Oxygen</span>
                  </div>
                </div>
                <p className="text-[0.65rem] text-white/50">
                  Burn vs cash · {oxygenCritical ? "Crush depth" : "Safe zone"}
                </p>
              </div>
            </div>

            {/* Milestone markers timeline */}
            <div className="rounded-xl border border-white/15 bg-black/40 backdrop-blur-xl p-4">
              <p className="text-[0.65rem] text-white/50 uppercase tracking-wider mb-3">
                Milestone markers
              </p>
              <div className="flex items-center gap-4 flex-wrap">
                {milestones.map(({ month, label }) => {
                  const passed = monthsOfSurvival >= month;
                  return (
                    <div
                      key={month}
                      className="flex items-center gap-2"
                    >
                      <div
                        className={`w-2 h-2 rounded-full ${
                          passed ? "bg-biolumeTeal shadow-[0_0_8px_rgba(0,255,229,0.6)]" : "bg-white/30"
                        }`}
                      />
                      <span className="text-xs text-white/80">
                        Month {month}: {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Burn summary */}
            <div className="rounded-xl border border-white/15 bg-black/40 backdrop-blur-xl p-4 flex flex-wrap gap-6">
              <div>
                <p className="text-[0.65rem] text-white/50">Monthly burn</p>
                <p className="text-lg font-semibold text-white">${(burnRate / 1000).toFixed(0)}k</p>
              </div>
              <div>
                <p className="text-[0.65rem] text-white/50">Survival score</p>
                <p className="text-lg font-semibold text-biolumeTeal">{survivalScore}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Pearl: Pitch-Ready when optimized */}
        <motion.div
          className="flex justify-center py-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div
            className={`py-4 px-6 rounded-xl border-2 font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 min-w-[280px] ${
              isPitchReady
                ? "bg-amber-500/20 border-amber-400/60 text-amber-300 shadow-[0_0_30px_rgba(251,191,36,0.4)]"
                : "bg-biolumeTeal/10 border-biolumeTeal/60 text-biolumeTeal shadow-[0_0_20px_rgba(0,255,229,0.2)]"
            }`}
          >
            <LineChart className="w-5 h-5" />
            {isPitchReady ? "Pitch-ready" : "Optimize runway"}
          </div>
        </motion.div>
      </div>
    </main>
  );
}
