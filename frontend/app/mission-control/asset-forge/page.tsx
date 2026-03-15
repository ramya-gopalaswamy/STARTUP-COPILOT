"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Sparkles, Download, Image, BarChart3, Type, Link2, Paperclip, Send, X, Undo2, Presentation, ChevronLeft, ChevronRight, ImagePlus, Video, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, ResponsiveContainer } from "recharts";
import { useSharedWorkspace } from "../../../src/context/SharedWorkspaceContext";
import type { SharedWorkspace } from "../../../src/lib/types/sharedWorkspace";

const CHAPTERS = [
  { id: "hook", label: "Product / Title", slideIndex: 0 },
  { id: "problem", label: "The Problem", slideIndex: 1 },
  { id: "solution", label: "The Solution", slideIndex: 2 },
  { id: "business", label: "Business Model", slideIndex: 3 },
  { id: "market", label: "Market Size", slideIndex: 4 },
] as const;

const FALLBACK_NARRATIVE: Record<string, string> = {
  hook: "We're building the first autonomous fleet for 4,000m depth operations. One sentence: Deep-sea data at surface speed.",
  problem: "Today, deep-sea survey and maintenance rely on crewed vessels and single ROVs. Downtime is measured in weeks; data latency in days. Operators can't scale.",
  solution: "Our platform orchestrates swarms of depth-rated drones with real-time data pipelines. Deploy once, survey continuously—with 10x faster turnaround.",
  business: "Hardware-as-a-Service plus data licensing. Recurring revenue from fleet subscriptions; margin from proprietary datasets for energy and research verticals.",
  market: "TAM: $12B ocean tech by 2030. Our wedge: 4,000m+ capable systems—a $2.1B segment growing 18% CAGR. SAM focused on survey and inspection: $480M.",
};

const FALLBACK_GOLDEN_THREAD = "Deep-sea data at surface speed";

const FALLBACK_ASSETS: { id: string; type: string; label: string; icon: string }[] = [
  { id: "1", type: "image", label: "Depth map", icon: "Image" },
  { id: "2", type: "chart", label: "TAM/SAM", icon: "BarChart3" },
  { id: "3", type: "logo", label: "Logo mark", icon: "Type" },
  { id: "4", type: "diagram", label: "Pipeline", icon: "Link2" },
  { id: "5", type: "image", label: "ROV mockup", icon: "Image" },
  { id: "6", type: "chart", label: "Growth curve", icon: "BarChart3" },
];

const ICON_MAP = { Image, BarChart3, Type, Link2 } as const;

type DeckThemeId = "midnight" | "sunlight" | "abyssal" | "neon";

const DECK_THEMES: { id: DeckThemeId; name: string; desc: string }[] = [
  { id: "midnight", name: "Midnight Stealth", desc: "Dark venture deck with teal accents" },
  { id: "sunlight", name: "Sunlight Clarity", desc: "Bright, minimal white deck" },
  { id: "abyssal", name: "Abyssal Gradient", desc: "Deep-ocean gradient with warm highlights" },
  { id: "neon", name: "Neon Grid", desc: "Dark canvas with neon magenta grid" },
];

const FALLBACK_SLIDE_TITLES: Record<string, string> = {
  hook: "Product name",
  problem: "Deep-sea operations don't scale",
  solution: "Swarm orchestration at depth",
  business: "Hardware-as-a-Service + Data licensing",
  market: "Addressable opportunity",
};

const FALLBACK_MARKET_SHARE = [
  { name: "Segment A", share: 35, fill: "#00FFE5" },
  { name: "Segment B", share: 28, fill: "#7523FF" },
  { name: "Segment C", share: 22, fill: "#FF8100" },
  { name: "Others", share: 15, fill: "#64748b" },
];

/** PPT-style slide content per chapter; headings and body from narrative_chapters (first line = title, rest = body) */
function MockSlideContent({
  chapterId,
  theme,
  marketGap,
  narrativeChapters,
  marketIntel,
  embeddedSlideImages,
  styleOverrides,
  backendBaseUrl,
  editable,
  onEditTitle,
  onEditBullet,
}: {
  chapterId: string;
  theme: DeckThemeId;
  marketGap: string;
  narrativeChapters: Record<string, string>;
  marketIntel?: SharedWorkspace["market_intel"] | null;
  embeddedSlideImages?: Record<string, string> | null;
  styleOverrides?: Record<string, string | number> | null;
  backendBaseUrl?: string;
  editable?: boolean;
  onEditTitle?: (chapterId: string, value: string) => void;
  onEditBullet?: (chapterId: string, bulletIndex: number, value: string) => void;
}) {
  const isDark = theme !== "sunlight";
  const themeStyles: Record<
    DeckThemeId,
    {
      muted: string;
      accent: string;
      pill: string;
      boxBorder?: string;
    }
  > = {
    midnight: {
      muted: "text-white/60",
      accent: "text-biolumeTeal",
      pill: "bg-biolumeTeal/15 text-biolumeTeal border-biolumeTeal/40",
      boxBorder: "border-white/10 bg-white/5",
    },
    sunlight: {
      muted: "text-slate-500",
      accent: "text-blue-600",
      pill: "bg-blue-50 text-blue-700 border-blue-200",
      boxBorder: "border-slate-300 bg-white",
    },
    abyssal: {
      muted: "text-sky-100/70",
      accent: "text-anglerfishAmber",
      pill: "bg-anglerfishAmber/15 text-anglerfishAmber border-anglerfishAmber/40",
      boxBorder: "border-anglerfishAmber/40 bg-anglerfishAmber/10",
    },
    neon: {
      muted: "text-slate-200/80",
      accent: "text-electricJellyfish",
      pill: "bg-electricJellyfish/20 text-electricJellyfish border-electricJellyfish/50",
      boxBorder: "border-electricJellyfish/40 bg-black/40",
    },
  };
  const cfg = themeStyles[theme] ?? themeStyles.midnight;
  const muted = cfg.muted;
  const accent = cfg.accent;
  const narrative = narrativeChapters[chapterId] ?? "";
  const lines = narrative.split("\n").map((s) => s.trim()).filter(Boolean);
  const slideTitle = lines[0] ?? FALLBACK_SLIDE_TITLES[chapterId] ?? "Slide";
  // Exclude empty bullet lines so removed lines don't leave extra space
  const slideBodyLines = lines.slice(1).filter((l) => l.replace(/^[•→]\s*/, "").trim() !== "");
  const so = styleOverrides ?? {};
  const titleColor = typeof so.title_color_hex === "string" ? so.title_color_hex : undefined;
  const bulletColor = typeof so.bullet_color_hex === "string" ? so.bullet_color_hex : undefined;
  const titleSizePt = typeof so.title_font_size_pt === "number" ? so.title_font_size_pt : undefined;
  const bulletSizePt = typeof so.bullet_font_size_pt === "number" ? so.bullet_font_size_pt : undefined;

  const preventNewline = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    }
  };

  // Paste as plain text, single line (avoids duplication / extra lines when selecting or pasting)
  const handlePastePlainSingleLine = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const raw = e.clipboardData.getData("text/plain").trim().replace(/\s*\n+\s*/g, " ");
    const target = e.target as HTMLElement;
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(raw);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      target.innerText = raw;
    }
  };

  if (chapterId === "hook") {
    const subtitleText = slideBodyLines.length ? slideBodyLines.join(" ").replace(/^•\s*/g, "").trim() : "The first autonomous fleet for 4,000m depth operations";
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 md:p-10 text-center">
        <span className={`text-xs font-medium uppercase tracking-[0.2em] ${muted}`}>
          Title slide
        </span>
        <h2
          key={editable ? `title-${chapterId}` : undefined}
          className={`mt-3 md:mt-4 text-xl md:text-3xl font-bold ${editable ? "rounded px-1 outline-none ring-1 ring-transparent focus:ring-biolumeTeal/50 cursor-text" : ""} ${
            isDark && !titleColor ? "text-white" : !titleColor ? "text-slate-900" : ""
          }`}
          style={titleColor || titleSizePt ? { color: titleColor, fontSize: titleSizePt ? `${Math.min(titleSizePt, 48)}px` : undefined } : undefined}
          {...(editable && {
            contentEditable: true,
            suppressContentEditableWarning: true,
            onBlur: (e) => {
              const v = (e.target as HTMLElement).innerText?.trim() || "";
              if (v && onEditTitle) onEditTitle(chapterId, v);
            },
            onKeyDown: preventNewline,
            onPaste: handlePastePlainSingleLine,
          })}
        >
          {slideTitle}
        </h2>
        <p
          key={editable ? `subtitle-${chapterId}` : undefined}
          className={`mt-2 md:mt-3 text-sm md:text-lg max-w-md ${editable ? "rounded px-1 outline-none ring-1 ring-transparent focus:ring-biolumeTeal/50 cursor-text" : ""} ${!bulletColor ? muted : ""}`}
          style={bulletColor || bulletSizePt ? { color: bulletColor, fontSize: bulletSizePt ? `${Math.min(bulletSizePt + 4, 22)}px` : undefined } : undefined}
          {...(editable && {
            contentEditable: true,
            suppressContentEditableWarning: true,
            onBlur: (e) => {
              const v = (e.target as HTMLElement).innerText?.replace(/\s+/g, " ").trim() || "";
              if (onEditBullet) onEditBullet(chapterId, 0, v);
            },
            onKeyDown: preventNewline,
            onPaste: handlePastePlainSingleLine,
          })}
        >
          {subtitleText}
        </p>
        {backendBaseUrl && embeddedSlideImages?.[chapterId] ? (
          <div className="mt-4 w-24 h-24 md:w-28 md:h-28 rounded-xl border border-white/20 overflow-hidden flex-shrink-0">
            <img
              src={`${backendBaseUrl}/agents/asset-forge/slide-image/${chapterId}`}
              alt="Slide"
              className="w-full h-full object-contain"
            />
          </div>
        ) : (
          <div
            className={`mt-6 md:mt-8 w-16 h-16 md:w-20 md:h-20 rounded-xl border-2 border-dashed flex items-center justify-center ${
              isDark ? "border-biolumeTeal/40" : "border-slate-300"
            }`}
          >
            <Type className={`w-6 h-6 md:w-8 md:h-8 ${muted}`} />
          </div>
        )}
        <p className={`mt-1 md:mt-2 text-[0.65rem] uppercase tracking-wider ${muted}`}>
          {embeddedSlideImages?.[chapterId] ? "Image" : "Logo"}
        </p>
      </div>
    );
  }

  if (chapterId === "problem") {
    const bullets = slideBodyLines.length ? slideBodyLines : [
      "Crewed vessels and single ROVs — downtime in weeks, data latency in days",
      "Operators can't scale; survey and maintenance are bottlenecked",
      "No real-time visibility at 4,000m+ depth",
    ];
    const hasEmbeddedImage = Boolean(backendBaseUrl && embeddedSlideImages?.[chapterId]);
    return (
      <div className="absolute inset-0 px-6 pt-8 pb-6 md:pt-12 flex flex-col">
        <span className={`text-xs font-medium uppercase tracking-wider ${muted}`}>The Problem</span>
        <div className="flex gap-4 flex-1 min-h-0 mt-1">
          <div className="flex-1 min-w-0 flex flex-col">
            <h2
              key={editable ? `title-${chapterId}-${slideTitle}` : undefined}
              className={`text-lg font-bold ${editable ? "rounded px-1 outline-none ring-1 ring-transparent focus:ring-biolumeTeal/50 cursor-text" : ""} ${isDark && !titleColor ? "text-white" : !titleColor ? "text-slate-900" : ""}`}
              style={titleColor || titleSizePt ? { color: titleColor, fontSize: titleSizePt ? `${Math.min(titleSizePt, 36)}px` : undefined } : undefined}
              {...(editable && {
                contentEditable: true,
                suppressContentEditableWarning: true,
                onBlur: (e) => { const v = (e.target as HTMLElement).innerText?.trim() || ""; if (v && onEditTitle) onEditTitle(chapterId, v); },
                onKeyDown: preventNewline,
                onPaste: handlePastePlainSingleLine,
              })}
            >
              {slideTitle}
            </h2>
            <ul className={`mt-2 space-y-1.5 text-sm flex-1 ${!bulletColor && (isDark ? "text-white/90" : "text-slate-700")}`} style={bulletColor || bulletSizePt ? { color: bulletColor, fontSize: bulletSizePt ? `${bulletSizePt}px` : undefined } : undefined}>
              {bullets.map((b, idx) => (
                <li
                  key={editable ? `bullet-${chapterId}-${idx}-${b.slice(0, 20)}` : idx}
                  className={`flex items-start gap-2 ${editable ? "rounded px-1 outline-none ring-1 ring-transparent focus:ring-biolumeTeal/50 cursor-text" : ""}`}
                  {...(editable && {
                    contentEditable: true,
                    suppressContentEditableWarning: true,
                    onBlur: (e) => {
                      const v = (e.target as HTMLElement).innerText?.replace(/\s+/g, " ").trim().replace(/^•\s*/, "") || "";
                      if (onEditBullet) onEditBullet(chapterId, idx, v);
                    },
                    onKeyDown: preventNewline,
                    onPaste: handlePastePlainSingleLine,
                  })}
                >
                  <span className={accent}>•</span> {b.replace(/^•\s*/, "")}
                </li>
              ))}
            </ul>
          </div>
          {hasEmbeddedImage && (
            <div className="w-[48%] min-w-0 flex-shrink-0 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 overflow-hidden min-h-[100px]">
              <img src={`${backendBaseUrl}/agents/asset-forge/slide-image/${chapterId}`} alt="Slide" className="max-w-full max-h-full object-contain" />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (chapterId === "solution") {
    const bullets = slideBodyLines.length ? slideBodyLines : [
      "Deploy once, survey continuously",
      "10x faster turnaround",
      "Real-time data at 4,000m+",
    ];
    const hasEmbeddedImage = Boolean(backendBaseUrl && embeddedSlideImages?.[chapterId]);
    return (
      <div className="absolute inset-0 px-6 pt-8 pb-6 md:pt-12 flex flex-col">
        <span className={`text-xs font-medium uppercase tracking-wider ${muted}`}>
          The Solution
        </span>
        <div className="flex gap-4 flex-1 min-h-0 mt-1">
          <div className="flex-1 min-w-0 flex flex-col">
            <h2
              key={editable ? `title-${chapterId}-${slideTitle}` : undefined}
              className={`text-lg font-bold ${editable ? "rounded px-1 outline-none ring-1 ring-transparent focus:ring-biolumeTeal/50 cursor-text" : ""} ${isDark && !titleColor ? "text-white" : !titleColor ? "text-slate-900" : ""}`}
              style={titleColor || titleSizePt ? { color: titleColor, fontSize: titleSizePt ? `${Math.min(titleSizePt, 36)}px` : undefined } : undefined}
              {...(editable && {
                contentEditable: true,
                suppressContentEditableWarning: true,
                onBlur: (e) => { const v = (e.target as HTMLElement).innerText?.trim() || ""; if (v && onEditTitle) onEditTitle(chapterId, v); },
                onKeyDown: preventNewline,
                onPaste: handlePastePlainSingleLine,
              })}
            >
              {slideTitle}
            </h2>
            {slideBodyLines.length > 0 ? (
              <ul
                className={`mt-2 space-y-1.5 text-sm ${!bulletColor ? (isDark ? "text-white/90" : "text-slate-700") : ""}`}
                style={bulletColor || bulletSizePt ? { color: bulletColor, fontSize: bulletSizePt ? `${bulletSizePt}px` : undefined } : undefined}
              >
                {bullets.map((b, idx) => (
                  <li
                    key={editable ? `bullet-${chapterId}-${idx}-${b.slice(0, 20)}` : idx}
                    className={`flex items-center gap-2 ${editable ? "rounded px-1 outline-none ring-1 ring-transparent focus:ring-biolumeTeal/50 cursor-text" : ""}`}
                    {...(editable && {
                      contentEditable: true,
                      suppressContentEditableWarning: true,
                      onBlur: (e) => {
                        const v = (e.target as HTMLElement).innerText?.replace(/\s+/g, " ").trim().replace(/^[•→]\s*/, "") || "";
                        if (onEditBullet) onEditBullet(chapterId, idx, v);
                      },
                      onKeyDown: preventNewline,
                      onPaste: handlePastePlainSingleLine,
                    })}
                  >
                    <span className={accent}>→</span> {b.replace(/^[•→]\s*/, "")}
                  </li>
                ))}
              </ul>
            ) : (
              <ul
                className={`mt-2 space-y-1.5 text-sm ${!bulletColor ? (isDark ? "text-white/90" : "text-slate-700") : ""}`}
                style={bulletColor || bulletSizePt ? { color: bulletColor, fontSize: bulletSizePt ? `${bulletSizePt}px` : undefined } : undefined}
              >
                {["Deploy once, survey continuously", "10x faster turnaround", "Real-time data at 4,000m+"].map((b, idx) => (
                  <li
                    key={editable ? `bullet-${chapterId}-${idx}-${b.slice(0, 20)}` : idx}
                    className={`flex items-center gap-2 ${editable ? "rounded px-1 outline-none ring-1 ring-transparent focus:ring-biolumeTeal/50 cursor-text" : ""}`}
                    {...(editable && {
                      contentEditable: true,
                      suppressContentEditableWarning: true,
                      onBlur: (e) => {
                        const v = (e.target as HTMLElement).innerText?.replace(/\s+/g, " ").trim().replace(/^[•→]\s*/, "") || "";
                        if (onEditBullet) onEditBullet(chapterId, idx, v);
                      },
                      onKeyDown: preventNewline,
                      onPaste: handlePastePlainSingleLine,
                    })}
                  >
                    <span className={accent}>→</span> {b}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="w-[48%] min-w-0 flex-shrink-0 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 overflow-hidden min-h-[120px]">
            {hasEmbeddedImage ? (
              <img
                src={`${backendBaseUrl}/agents/asset-forge/slide-image/${chapterId}`}
                alt="Slide"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <span className={muted}>Diagram / image</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (chapterId === "business") {
    const hasEmbeddedImage = Boolean(backendBaseUrl && embeddedSlideImages?.[chapterId]);
    return (
      <div className="absolute inset-0 px-6 pt-8 pb-6 md:pt-12 flex flex-col">
        <span className={`text-xs font-medium uppercase tracking-wider ${muted}`}>
          Business Model
        </span>
        <div className="flex gap-4 flex-1 min-h-0 mt-1">
          <div className="flex-1 min-w-0 flex flex-col">
            <h2
              key={editable ? `title-${chapterId}-${slideTitle}` : undefined}
              className={`text-lg font-bold ${editable ? "rounded px-1 outline-none ring-1 ring-transparent focus:ring-biolumeTeal/50 cursor-text" : ""} ${isDark && !titleColor ? "text-white" : !titleColor ? "text-slate-900" : ""}`}
              style={titleColor || titleSizePt ? { color: titleColor, fontSize: titleSizePt ? `${Math.min(titleSizePt, 36)}px` : undefined } : undefined}
              {...(editable && {
                contentEditable: true,
                suppressContentEditableWarning: true,
                onBlur: (e) => { const v = (e.target as HTMLElement).innerText?.trim() || ""; if (v && onEditTitle) onEditTitle(chapterId, v); },
                onKeyDown: preventNewline,
                onPaste: handlePastePlainSingleLine,
              })}
            >
              {slideTitle}
            </h2>
            {slideBodyLines.length > 0 ? (
              <ul className={`mt-2 space-y-1.5 text-sm ${!bulletColor ? (isDark ? "text-white/90" : "text-slate-700") : ""}`} style={bulletColor || bulletSizePt ? { color: bulletColor, fontSize: bulletSizePt ? `${bulletSizePt}px` : undefined } : undefined}>
                {slideBodyLines.map((b, idx) => (
                  <li
                    key={editable ? `bullet-${chapterId}-${idx}-${b.slice(0, 20)}` : idx}
                    className={`flex items-start gap-2 ${editable ? "rounded px-1 outline-none ring-1 ring-transparent focus:ring-biolumeTeal/50 cursor-text" : ""}`}
                    {...(editable && {
                      contentEditable: true,
                      suppressContentEditableWarning: true,
                      onBlur: (e) => {
                        const v = (e.target as HTMLElement).innerText?.replace(/\s+/g, " ").trim().replace(/^•\s*/, "") || "";
                        if (onEditBullet) onEditBullet(chapterId, idx, v);
                      },
                      onKeyDown: preventNewline,
                      onPaste: handlePastePlainSingleLine,
                    })}
                  >
                    <span className={accent}>•</span> {b.replace(/^•\s*/, "")}
                  </li>
                ))}
              </ul>
            ) : null}
            {!hasEmbeddedImage && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className={`rounded-lg p-3 ${cfg.boxBorder ?? "border-white/10 bg-white/5 border"}`}>
                  <p className={`text-xs font-semibold ${accent}`}>Recurring revenue</p>
                  <p className={`text-xs mt-0.5 ${muted}`}>Fleet subscriptions</p>
                </div>
                <div className={`rounded-lg p-3 ${cfg.boxBorder ?? "border-white/10 bg-white/5 border"}`}>
                  <p className={`text-xs font-semibold ${accent}`}>Data margin</p>
                  <p className={`text-xs mt-0.5 ${muted}`}>Proprietary datasets</p>
                </div>
              </div>
            )}
          </div>
          {hasEmbeddedImage && (
            <div className="w-[48%] min-w-0 flex-shrink-0 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 overflow-hidden min-h-[100px]">
              <img src={`${backendBaseUrl}/agents/asset-forge/slide-image/${chapterId}`} alt="Slide" className="max-w-full max-h-full object-contain" />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (chapterId === "market") {
    const marketTitle = lines.length > 0 ? slideTitle : `${marketGap} — addressable opportunity`;
    const marketShareData = (marketIntel?.market_share_data?.length
      ? marketIntel.market_share_data
      : FALLBACK_MARKET_SHARE) as { name: string; share: number; fill?: string }[];
    const hasRealChart = Boolean(marketIntel?.market_share_data?.length);
    const chartFill = (i: number) =>
      (marketShareData[i] as { fill?: string })?.fill ??
      ["#00FFE5", "#7523FF", "#FF8100", "#64748b", "#22d3ee"][i % 5];
    return (
      <div className="absolute inset-0 px-6 pt-8 pb-6 md:pt-12 flex flex-col">
        <span className={`text-xs font-medium uppercase tracking-wider ${muted}`}>
          Market Size
        </span>
        <h2
          key={editable ? `title-${chapterId}-${marketTitle}` : undefined}
          className={`mt-1 text-lg font-bold ${editable ? "rounded px-1 outline-none ring-1 ring-transparent focus:ring-biolumeTeal/50 cursor-text" : ""} ${isDark && !titleColor ? "text-white" : !titleColor ? "text-slate-900" : ""}`}
          style={titleColor || titleSizePt ? { color: titleColor, fontSize: titleSizePt ? `${Math.min(titleSizePt, 36)}px` : undefined } : undefined}
          {...(editable && {
            contentEditable: true,
            suppressContentEditableWarning: true,
            onBlur: (e) => { const v = (e.target as HTMLElement).innerText?.trim() || ""; if (v && onEditTitle) onEditTitle(chapterId, v); },
            onKeyDown: preventNewline,
            onPaste: handlePastePlainSingleLine,
          })}
        >
          {marketTitle}
        </h2>
        <div className="flex gap-4 flex-1 min-h-0 mt-2">
          <div className="flex-1 min-w-0 flex flex-col">
            {slideBodyLines.length > 0 ? (
              <ul
                className={`space-y-1.5 text-xs ${!bulletColor ? (isDark ? "text-white/90" : "text-slate-700") : ""}`}
                style={bulletColor || bulletSizePt ? { color: bulletColor, fontSize: bulletSizePt ? `${bulletSizePt}px` : undefined } : undefined}
              >
                {slideBodyLines.slice(0, 4).map((b, idx) => (
                  <li
                    key={editable ? `bullet-${chapterId}-${idx}-${b.slice(0, 20)}` : idx}
                    className={`flex items-start gap-1.5 ${editable ? "rounded px-1 outline-none ring-1 ring-transparent focus:ring-biolumeTeal/50 cursor-text" : ""}`}
                    {...(editable && {
                      contentEditable: true,
                      suppressContentEditableWarning: true,
                      onBlur: (e) => {
                        const v = (e.target as HTMLElement).innerText?.replace(/\s+/g, " ").trim().replace(/^•\s*/, "") || "";
                        if (onEditBullet) onEditBullet(chapterId, idx, v);
                      },
                      onKeyDown: preventNewline,
                      onPaste: handlePastePlainSingleLine,
                    })}
                  >
                    <span className={accent}>•</span> {b.replace(/^•\s*/, "")}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex items-center gap-2 mt-auto pt-2 text-[0.65rem] text-biolumeTeal">
              <Link2 className="h-3 w-3 shrink-0" />
              {hasRealChart ? "From Market Intelligence" : "Run Market Intelligence for chart data"}
            </div>
          </div>
          <div className="w-[52%] min-w-0 h-full max-h-[140px] rounded-lg border border-white/10 bg-white/5 overflow-hidden">
            {backendBaseUrl && embeddedSlideImages?.[chapterId] ? (
              <img
                src={`${backendBaseUrl}/agents/asset-forge/slide-image/${chapterId}`}
                alt="Slide"
                className="w-full h-full object-contain"
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={marketShareData} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)"}
                    fontSize={9}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)" }}
                  />
                  <YAxis
                    stroke={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)"}
                    fontSize={9}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)" }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Bar dataKey="share" name="Share" radius={[4, 4, 0, 0]} maxBarSize={28}>
                    {marketShareData.map((_, i) => (
                      <Cell key={i} fill={chartFill(i)} stroke="rgba(0,0,0,0.12)" strokeWidth={1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center p-8 ${
        isDark ? "text-white" : "text-slate-900"
      }`}
    >
      <span className={`text-xs uppercase ${muted}`}>{chapterId || "Slide"}</span>
      <p className="mt-2 text-sm">Content for this slide.</p>
    </div>
  );
}

function ForgingExportOverlay({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [phase, setPhase] = useState<"merge" | "condense" | "done">("merge");

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={() => phase === "done" && onComplete()}
    >
      <div className="flex flex-col items-center gap-6">
        <motion.div
          className="relative w-32 h-32 flex items-center justify-center"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{
            scale: 1,
            opacity: 1,
            boxShadow: [
              "0 0 0 0 rgba(0,255,229,0.4)",
              "0 0 60px 20px rgba(0,255,229,0.2)",
              "0 0 80px 30px rgba(0,255,229,0.15)",
            ],
          }}
          transition={{ duration: 1.2 }}
        >
          <AnimatePresence mode="wait">
            {phase === "merge" && (
              <motion.div
                key="cube"
                className="w-24 h-24 rounded-xl bg-gradient-to-br from-biolumeTeal/30 to-electricJellyfish/30 border border-biolumeTeal/50"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  rotateY: 360,
                  transition: { duration: 1.5 },
                }}
                onAnimationComplete={() =>
                  setTimeout(() => setPhase("condense"), 400)
                }
              />
            )}
            {phase === "condense" && (
              <motion.div
                key="condense"
                initial={{ scale: 1, opacity: 1 }}
                animate={{ scale: 0.6, opacity: 0.9 }}
                transition={{ duration: 0.6 }}
                onAnimationComplete={() =>
                  setTimeout(() => setPhase("done"), 200)
                }
              >
                <motion.div
                  className="w-24 h-24 rounded-xl bg-gradient-to-br from-biolumeTeal/40 to-electricJellyfish/40 border border-biolumeTeal/60 flex items-center justify-center"
                  animate={{
                    boxShadow: "0 0 40px rgba(0,255,229,0.4)",
                  }}
                >
                  <Download className="w-12 h-12 text-biolumeTeal" />
                </motion.div>
              </motion.div>
            )}
            {phase === "done" && (
              <motion.div
                key="pdf"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-20 h-20 rounded-lg bg-midnightTrench border-2 border-biolumeTeal/60 flex items-center justify-center shadow-[0_0_30px_rgba(0,255,229,0.3)]"
              >
                <Download className="w-10 h-10 text-biolumeTeal" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        <motion.p
          className="text-white/90 text-sm font-medium"
          animate={{
            opacity: phase === "done" ? 1 : 0.8,
          }}
        >
          {phase === "merge" && "Forging deck…"}
          {phase === "condense" && "Condensing to PDF…"}
          {phase === "done" && "Export complete. Click to close."}
        </motion.p>
      </div>
    </motion.div>
  );
}

const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000/api";

export default function AssetForgePage() {
  const { sharedWorkspace, triggerAssetForge, refreshFromBackend, loading } = useSharedWorkspace();
  const [activeChapterId, setActiveChapterId] = useState<string>("hook");
  const [slideIndex, setSlideIndex] = useState(0);
  const [theme, setTheme] = useState<DeckThemeId>("midnight");
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [expandedChapter, setExpandedChapter] = useState<string | null>("hook");
  const [isDrafting, setIsDrafting] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [hasTriggeredDeck, setHasTriggeredDeck] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [, setFilesTick] = useState(0); // force re-render when file list changes
  const pendingFilesRef = useRef<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const narrativeHistoryRef = useRef<Record<string, string>[]>([]);
  const [historyLength, setHistoryLength] = useState(0);
  const MAX_HISTORY = 20;
  const [slideshowOpen, setSlideshowOpen] = useState(false);
  const [slideshowIndex, setSlideshowIndex] = useState(0);
  const [imageColor, setImageColor] = useState<string>("");
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<{ path: string; filename: string } | null>(null);
  const [generatedImagePreviewOpen, setGeneratedImagePreviewOpen] = useState(false);
  const [showGenerateImageMode, setShowGenerateImageMode] = useState(false);

  const [reelModalOpen, setReelModalOpen] = useState(false);
  const [reelGenerating, setReelGenerating] = useState(false);
  const [reelStatus, setReelStatus] = useState<"idle" | "scripting" | "generating" | "compositing" | "completed" | "failed">("idle");
  const [reelArn, setReelArn] = useState<string | null>(null);
  const [reelVideoUrl, setReelVideoUrl] = useState<string | null>(null);
  const [reelScript, setReelScript] = useState<string | null>(null);
  const [reelError, setReelError] = useState<string | null>(null);
  const [reelSubtitles, setReelSubtitles] = useState<{ start: number; end: number; text: string }[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<string>("");
  const reelVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!slideshowOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSlideshowOpen(false);
      if (e.key === "ArrowLeft") setSlideshowIndex((i) => (i > 0 ? i - 1 : i));
      if (e.key === "ArrowRight") setSlideshowIndex((i) => (i < CHAPTERS.length - 1 ? i + 1 : i));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slideshowOpen]);

  useEffect(() => {
    if (!generatedImagePreviewOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setGeneratedImagePreviewOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [generatedImagePreviewOpen]);

  useEffect(() => {
    const video = reelVideoRef.current;
    if (!video || reelSubtitles.length === 0) return;
    const onTime = () => {
      const t = video.currentTime;
      const match = reelSubtitles.find((s) => t >= s.start && t < s.end);
      setActiveSubtitle(match?.text ?? "");
    };
    video.addEventListener("timeupdate", onTime);
    return () => video.removeEventListener("timeupdate", onTime);
  }, [reelSubtitles]);

  const af = sharedWorkspace?.asset_forge;
  const showContent = af?.status === "COMPLETE";
  const isGenerating = hasTriggeredDeck && (af?.status === "SYNCING" || loading) && !cancelled;
  const marketGap = sharedWorkspace?.market_gap ?? "4,000m depth drones";
  const narrativeChapters = af?.narrative_chapters && Object.keys(af.narrative_chapters).length > 0 ? af.narrative_chapters : FALLBACK_NARRATIVE;
  const goldenThread = af?.golden_thread ?? FALLBACK_GOLDEN_THREAD;

  const draftingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChapterClick = useCallback((id: string, slideIdx: number) => {
    if (draftingTimeoutRef.current) clearTimeout(draftingTimeoutRef.current);
    setActiveChapterId(id);
    setSlideIndex(slideIdx);
    setExpandedChapter((prev) => (prev === id ? null : id));
    setIsDrafting(true);
    draftingTimeoutRef.current = setTimeout(() => {
      setIsDrafting(false);
      draftingTimeoutRef.current = null;
    }, 3000);
  }, []);

  useEffect(
    () => () => {
      if (draftingTimeoutRef.current) clearTimeout(draftingTimeoutRef.current);
    },
    [],
  );

  const handleDownloadPpt = async () => {
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/agents/asset-forge/pitch-deck`);
      if (!res.ok) throw new Error("Pitch deck not ready");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "pitch_deck.pptx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // 404 or network error: deck not generated yet or backend unreachable
    }
  };

  const handleCreateDeck = () => {
    setCancelled(false);
    setHasTriggeredDeck(true);
    triggerAssetForge();
  };

  const handleCancel = () => {
    setHasTriggeredDeck(false);
    setCancelled(true);
  };

  const handleStartOver = async () => {
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/agents/asset-forge/start-over`, { method: "POST" });
      if (res.ok) {
        setSlideshowOpen(false);
        narrativeHistoryRef.current = [];
        setHistoryLength(0);
        await refreshFromBackend();
      }
    } catch (err) {
      console.error("Asset Forge start over:", err);
    }
  };

  const handleGenerateReel = async () => {
    setReelModalOpen(true);
    setReelGenerating(true);
    setReelStatus("scripting");
    setReelError(null);
    setReelVideoUrl(null);
    setReelScript(null);
    setReelArn(null);

    try {
      const res = await fetch(`${BACKEND_BASE_URL}/agents/asset-forge/pitch-reel/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration_seconds: 48 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setReelScript(data.script);
      setReelArn(data.invocationArn);
      setReelStatus("generating");

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(
            `${BACKEND_BASE_URL}/agents/asset-forge/pitch-reel/status/${encodeURIComponent(data.invocationArn)}`
          );
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();

          if (statusData.status === "Completed" && statusData.videoUrl) {
            clearInterval(pollInterval);
            setReelVideoUrl(statusData.videoUrl);
            if (statusData.subtitleTrack) setReelSubtitles(statusData.subtitleTrack);
            setReelStatus("completed");
            setReelGenerating(false);
          } else if (statusData.status === "Compositing") {
            setReelStatus("compositing");
          } else if (statusData.status === "Failed") {
            clearInterval(pollInterval);
            setReelError(statusData.failureMessage || "Video generation failed");
            setReelStatus("failed");
            setReelGenerating(false);
          }
        } catch {
          // keep polling on network errors
        }
      }, 15000);

      // Safety timeout: stop polling after 20 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        if (reelStatus === "generating") {
          setReelError("Generation timed out. Check your S3 bucket for the video.");
          setReelStatus("failed");
          setReelGenerating(false);
        }
      }, 20 * 60 * 1000);
    } catch (err: any) {
      setReelError(err.message || "Failed to start reel generation");
      setReelStatus("failed");
      setReelGenerating(false);
    }
  };

  const saveNarrativeChapters = useCallback(
    async (updated: Record<string, string>) => {
      try {
        const res = await fetch(`${BACKEND_BASE_URL}/agents/asset-forge/update-content`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ narrative_chapters: updated }),
        });
        if (res.ok) await refreshFromBackend();
      } catch (err) {
        console.error("Asset Forge update-content:", err);
      }
    },
    [refreshFromBackend],
  );

  const pushHistory = useCallback(() => {
    const snap = { ...narrativeChapters };
    narrativeHistoryRef.current = [...narrativeHistoryRef.current, snap].slice(-MAX_HISTORY);
    setHistoryLength(narrativeHistoryRef.current.length);
  }, [narrativeChapters]);

  const handleUndo = useCallback(async () => {
    const prev = narrativeHistoryRef.current.pop();
    setHistoryLength(narrativeHistoryRef.current.length);
    if (prev) await saveNarrativeChapters(prev);
  }, [saveNarrativeChapters]);

  const handleEditTitle = useCallback(
    (chapterId: string, value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      // Only use first line so selection across title+subtitle doesn't duplicate content
      const firstLine = trimmed.split("\n")[0]?.trim() ?? trimmed;
      pushHistory();
      const block = narrativeChapters[chapterId] ?? "";
      const lines = block.split("\n").map((s) => s.trim()).filter(Boolean);
      const bullets = lines.slice(1).filter((b) => b.replace(/^[•→]\s*/, "").trim() !== "");
      const newChapter = firstLine + (bullets.length ? "\n" + bullets.join("\n") : "");
      saveNarrativeChapters({ ...narrativeChapters, [chapterId]: newChapter });
    },
    [narrativeChapters, saveNarrativeChapters, pushHistory],
  );

  const handleEditBullet = useCallback(
    (chapterId: string, bulletIndex: number, value: string) => {
      // Collapse to single line so cross-element selection or paste doesn't duplicate content (esp. slide 1)
      const bulletValue = value.trim().replace(/^[•→]\s*/, "").replace(/\s*\n+\s*/g, " ");
      const block = narrativeChapters[chapterId] ?? "";
      const lines = block.split("\n").map((s) => s.trim()).filter(Boolean);
      const title = lines[0] ?? "";
      const bullets = lines.slice(1).map((b) => (b.startsWith("• ") ? b : "• " + b));
      let newBullets: string[];
      if (bulletIndex < bullets.length) {
        newBullets = bullets.map((b, i) => (i === bulletIndex ? "• " + bulletValue : b));
      } else {
        newBullets = [...bullets];
        while (newBullets.length < bulletIndex) newBullets.push("• ");
        newBullets.push("• " + bulletValue);
      }
      // Remove empty bullets so deleting a line removes the space
      newBullets = newBullets.filter((b) => b.replace(/^[•→]\s*/, "").trim() !== "");
      const newChapter = title + (newBullets.length ? "\n" + newBullets.join("\n") : "");
      pushHistory();
      saveNarrativeChapters({ ...narrativeChapters, [chapterId]: newChapter });
    },
    [narrativeChapters, saveNarrativeChapters, pushHistory],
  );

  const handleExportClose = () => {
    setShowExport(false);
  };

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = input?.files;
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    pendingFilesRef.current = [...pendingFilesRef.current, ...list];
    setFilesTick((t) => t + 1);
    input.value = "";
  }, []);

  // Native change listener so we never miss a selection (avoids React event quirks)
  useEffect(() => {
    const el = fileInputRef.current;
    if (!el) return;
    const onChange = () => {
      const files = el.files;
      if (!files || files.length === 0) return;
      const list = Array.from(files);
      pendingFilesRef.current = [...pendingFilesRef.current, ...list];
      setFilesTick((t) => t + 1);
      el.value = "";
    };
    el.addEventListener("change", onChange);
    return () => el.removeEventListener("change", onChange);
  }, [showContent]); // re-attach when chat bar mounts

  const removePendingFile = useCallback((index: number) => {
    const next = pendingFilesRef.current.filter((_, i) => i !== index);
    pendingFilesRef.current = next;
    setFilesTick((t) => t + 1);
  }, []);

  const handleDownloadGeneratedImage = useCallback(async () => {
    if (!generatedImage) return;
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/agents/asset-forge/asset/${generatedImage.path}`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = generatedImage.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Download generated image:", e);
    }
  }, [generatedImage]);

  const handleGenerateImage = async () => {
    const prompt = chatInput.trim();
    if (!prompt) return;
    setGeneratingImage(true);
    setGeneratedImage(null);
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/agents/asset-forge/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, color_hex: imageColor || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || "Image generation failed");
      }
      const data = (await res.json()) as { path: string; filename: string };
      setGeneratedImage(data);
    } catch (e) {
      console.error("Generate image:", e);
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleChatSubmit = async () => {
    const msg = chatInput.trim();
    const filesToSend = pendingFilesRef.current;
    const hasGenerated = !!generatedImage;
    if (!msg && filesToSend.length === 0 && !hasGenerated) return;
    setChatSending(true);
    try {
      pushHistory();
      let attachments: { filename: string; path: string }[] = [];
      if (filesToSend.length > 0) {
        const form = new FormData();
        filesToSend.forEach((f) => form.append("files", f));
        const uploadRes = await fetch(`${BACKEND_BASE_URL}/agents/asset-forge/upload`, {
          method: "POST",
          body: form,
        });
        if (!uploadRes.ok) throw new Error("Upload failed");
        const uploadData = await uploadRes.json();
        attachments = uploadData.uploads ?? [];
      }
      if (generatedImage) attachments.push(generatedImage);
      const res = await fetch(`${BACKEND_BASE_URL}/agents/asset-forge/chat-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg || "Please incorporate the attached files into the deck where relevant.",
          target: "auto",
          attachments,
        }),
      });
      if (!res.ok) throw new Error("Edit failed");
      setChatInput("");
      setGeneratedImage(null);
      pendingFilesRef.current = [];
      setFilesTick((t) => t + 1);
      await refreshFromBackend();
    } catch (err) {
      console.error("Asset Forge chat-edit:", err);
    } finally {
      setChatSending(false);
    }
  };

  const activeSlideTitle = (() => {
    const ch = CHAPTERS.find((c) => c.id === activeChapterId);
    const narrative = af?.narrative_chapters?.[activeChapterId] ?? "";
    const firstLine = narrative.split("\n")[0]?.trim();
    return (firstLine || ch?.label) ?? "Slide";
  })();

  const canvasBgClass =
    theme === "abyssal"
        ? "bg-gradient-to-b from-slate-900/80 via-slate-950/85 to-black/90"
        : theme === "neon"
          ? "bg-slate-950/90"
          : "bg-black/25";

  return (
    <main className="relative min-h-screen flex flex-col bg-abyssalBlack overflow-hidden">
      {/* Full-screen video background - asset-forge page only */}
      <div className="fixed inset-0 z-0">
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          aria-hidden
        >
          <source src="/videos/seatop.mp4" type="video/mp4" />
        </video>
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/60 via-midnightTrench/75 to-black/80"
          aria-hidden
        />
      </div>

      <header className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-4 py-3 border-b border-white/10 bg-black/25 backdrop-blur-xl">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Link
              href="/mission-control"
              className="flex items-center gap-2 text-sm text-white/80 hover:text-biolumeTeal transition"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Mission Control
            </Link>
            <span className="text-white/40 hidden sm:inline">|</span>
            <h1 className="text-base sm:text-lg font-semibold text-white">
              Asset Forge
              <span className="ml-1 text-xs sm:text-sm text-white/60">
                — Nova‑powered pitch deck studio
              </span>
            </h1>
          </div>
        </div>
        {!showContent && (
          <div className="flex items-center gap-3 justify-end">
            {isGenerating && (
              <button
                type="button"
                onClick={handleCancel}
                className="px-3 py-2 rounded-lg text-white/80 hover:text-white text-xs sm:text-sm underline"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleCreateDeck}
              disabled={isGenerating}
              className="px-5 py-2.5 rounded-xl border-2 border-biolumeTeal bg-biolumeTeal/30 text-white text-sm font-semibold hover:bg-biolumeTeal/50 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg"
            >
              {isGenerating ? "Talking to Nova Pro…" : "Create pitch deck"}
            </button>
          </div>
        )}
        {showContent && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleStartOver}
              className="px-3 py-2 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-white/80 text-sm"
            >
              Start over
            </button>
            <button
              onClick={() => setThemeMenuOpen((o) => !o)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white/90 text-sm"
            >
              <Sparkles className="h-4 w-4 text-biolumeTeal" />
              AI Stylist
            </button>
            <button
              onClick={handleDownloadPpt}
              className="px-4 py-2 rounded-xl bg-biolumeTeal/20 border border-biolumeTeal/50 text-biolumeTeal text-sm font-medium hover:bg-biolumeTeal/30 transition"
            >
              <Download className="h-4 w-4 inline mr-1.5" />
              Download PPT
            </button>
            <button
              onClick={() => { setSlideshowOpen(true); setSlideshowIndex(0); }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white/90 text-sm"
              title="Fullscreen slideshow"
            >
              <Presentation className="h-4 w-4 text-biolumeTeal" />
              Slideshow
            </button>
            <button
              onClick={handleGenerateReel}
              disabled={reelGenerating}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
              title="Generate AI pitch reel video"
            >
              {reelGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
              Pitch Reel
            </button>
          </div>
        )}
      </header>

      {/* Fullscreen slideshow overlay */}
      <AnimatePresence>
        {slideshowOpen && showContent && (
          <motion.div
            className="fixed inset-0 z-[100] flex bg-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Left click zone: previous slide */}
            <button
              type="button"
              className="absolute left-0 top-0 bottom-0 w-1/3 z-10 cursor-pointer flex items-center justify-start pl-4 opacity-0 hover:opacity-100 hover:bg-white/5 transition-opacity"
              onClick={() => setSlideshowIndex((i) => (i > 0 ? i - 1 : i))}
              aria-label="Previous slide"
            >
              <ChevronLeft className="h-12 w-12 text-white/70" />
            </button>
            {/* Right click zone: next slide */}
            <button
              type="button"
              className="absolute right-0 top-0 bottom-0 w-1/3 z-10 cursor-pointer flex items-center justify-end pr-4 opacity-0 hover:opacity-100 hover:bg-white/5 transition-opacity"
              onClick={() => setSlideshowIndex((i) => (i < CHAPTERS.length - 1 ? i + 1 : i))}
              aria-label="Next slide"
            >
              <ChevronRight className="h-12 w-12 text-white/70" />
            </button>
            {/* Close button */}
            <button
              type="button"
              onClick={() => setSlideshowOpen(false)}
              className="absolute top-4 right-4 z-20 rounded-lg p-2 bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition"
              aria-label="Exit slideshow"
            >
              <X className="h-5 w-5" />
            </button>
            {/* Slide counter */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 rounded-full px-4 py-1.5 bg-black/50 text-white/80 text-sm">
              {slideshowIndex + 1} / {CHAPTERS.length}
            </div>
            {/* Slide content — full viewport */}
            <div className="absolute inset-0 flex items-center justify-center p-8 md:p-16 bg-[#0a0a0f]">
              <div
                className="w-full max-w-5xl aspect-video rounded-xl overflow-hidden border border-white/10 shadow-2xl flex-shrink-0 relative"
                style={(() => {
                  const chId = CHAPTERS[slideshowIndex]?.id ?? "hook";
                  const so = sharedWorkspace?.asset_forge?.style_overrides;
                  const titleBg = chId === "hook" && typeof so?.title_slide_bg_hex === "string" ? so.title_slide_bg_hex : null;
                  const contentBg = chId !== "hook" && typeof so?.content_slide_bg_hex === "string" ? so.content_slide_bg_hex : null;
                  const bg = titleBg ?? contentBg ?? (chId === "hook" ? "#020617" : "#0f172a");
                  return { background: bg, backgroundColor: bg };
                })()}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <MockSlideContent
                    chapterId={CHAPTERS[slideshowIndex]?.id ?? "hook"}
                    theme={theme}
                    marketGap={marketGap}
                    narrativeChapters={narrativeChapters}
                    marketIntel={sharedWorkspace?.market_intel}
                    embeddedSlideImages={sharedWorkspace?.asset_forge?.embedded_slide_images ?? undefined}
                    styleOverrides={sharedWorkspace?.asset_forge?.style_overrides ?? undefined}
                    backendBaseUrl={BACKEND_BASE_URL}
                    editable={false}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* When user hasn't created a deck yet: hero CTA + Create pitch deck button */}
      {!showContent && (
        <section className="relative z-10 flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
          <div className="max-w-xl space-y-4">
            <h2 className="text-2xl sm:text-3xl font-semibold text-white">
              From venture context to ready‑to‑share deck
            </h2>
            <p className="text-sm sm:text-base text-white/70">
              We take the same Nova Pro understanding used in Market Intelligence and pour it into a
              6–10 slide investor‑ready narrative. One click, then tweak the style.
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[0.7rem] text-white/60">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-biolumeTeal animate-pulse" />
                Uses Nova Pro under the hood
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-2 py-0.5">
                <span className="w-1 h-1 rounded-full bg-white/60" />
                Drafts title, problem, solution, market, model, ask
              </span>
            </div>
          </div>
          <div className="mt-8 flex flex-col items-center gap-2">
            <button
              onClick={handleCreateDeck}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-biolumeTeal text-white text-lg font-semibold hover:bg-biolumeTeal/90 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-xl border-0"
            >
              {isGenerating ? "Talking to Nova Pro…" : "Create pitch deck"}
            </button>
            {isGenerating && (
              <p className="text-xs text-white/70">
                Nova Pro is drafting your slides. This usually takes a few seconds.
              </p>
            )}
          </div>
        </section>
      )}

      {/* After deck is generated: narrative engine, slides, Download PPT */}
      {showContent && (
      <>
      {/* AI Stylist dropdown */}
      <AnimatePresence>
        {themeMenuOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-30"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setThemeMenuOpen(false)}
            />
            <motion.div
              className="fixed right-4 top-16 z-40 w-56 rounded-xl border border-white/15 bg-midnightTrench/95 backdrop-blur-xl shadow-xl py-2"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <div className="px-3 py-1.5 text-xs text-white/50 uppercase tracking-wider">
                Deck theme
              </div>
              {DECK_THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTheme(t.id);
                    setThemeMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 text-sm flex flex-col gap-0.5 transition ${
                    theme === t.id
                      ? "bg-biolumeTeal/15 text-biolumeTeal"
                      : "text-white/90 hover:bg-white/10"
                  }`}
                >
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs opacity-70">{t.desc}</span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Split-pane layout */}
      <div className="relative z-10 flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left: Narrative Engine */}
        <aside className="w-full lg:w-[380px] flex-shrink-0 border-r border-white/10 bg-black/30 backdrop-blur-xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-white/10">
            <h2 className="text-sm font-semibold text-white mb-1">
              Narrative Engine
            </h2>
            <p className="text-xs text-white/55">
              AI-drafted story flow. Click a chapter to edit or jump to slide.
            </p>
            {/* Golden Thread */}
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-biolumeTeal/30 bg-biolumeTeal/5 px-3 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-biolumeTeal shadow-[0_0_8px_rgba(0,255,229,0.8)]" />
              <span className="text-xs text-white/80">
                Golden thread: &quot;{goldenThread}&quot;
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {CHAPTERS.map((ch) => (
              <motion.div
                key={ch.id}
                layout
                className={`rounded-xl border overflow-hidden transition-colors ${
                  activeChapterId === ch.id
                    ? "border-biolumeTeal/50 bg-biolumeTeal/5"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                }`}
              >
                <button
                  onClick={() => handleChapterClick(ch.id, ch.slideIndex)}
                  className="w-full text-left px-4 py-3 flex items-center justify-between gap-2"
                >
                  <span className="text-sm font-medium text-white truncate min-w-0">
                    {(narrativeChapters[ch.id]?.split("\n")[0]?.trim()) || ch.label}
                  </span>
                  <span className="shrink-0 flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-xs font-medium tabular-nums text-white/80">
                    {ch.slideIndex + 1}
                  </span>
                </button>
                <AnimatePresence>
                  {expandedChapter === ch.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-white/10"
                    >
                      <div className="p-4 pt-3">
                        <p className="text-xs text-white/80 leading-relaxed whitespace-pre-wrap">
                          {narrativeChapters[ch.id]}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </aside>

        {/* Right: Slide Canvas */}
        <section
          className={`flex-1 flex flex-col min-h-[400px] p-4 lg:p-6 overflow-auto backdrop-blur-sm ${canvasBgClass}`}
        >
          <div className="flex items-center justify-between mb-3 flex-shrink-0 gap-3">
            {showContent && (
              <button
                type="button"
                onClick={handleUndo}
                disabled={historyLength === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-white/90 hover:bg-white/10 hover:border-biolumeTeal/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/5 disabled:hover:border-white/20 transition-colors"
                title="Undo last edit"
              >
                <Undo2 className="h-3.5 w-3.5 shrink-0" />
                <span>Undo</span>
              </button>
            )}
            <h2 className="text-sm font-semibold text-white flex-1 min-w-0 truncate flex items-center gap-2">
              <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-xs font-medium text-white/90 tabular-nums">
                {slideIndex + 1} of {CHAPTERS.length}
              </span>
              <span className="truncate">{activeSlideTitle}</span>
            </h2>
            {isDrafting && (
              <span className="text-xs text-biolumeTeal flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-biolumeTeal animate-pulse" />
                Drafting…
              </span>
            )}
          </div>
          <div className="flex-1 flex items-center justify-center min-h-[320px] w-full py-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={slideIndex}
                initial={{ opacity: 0, x: 20 }}
                exit={{ opacity: 0, x: -20 }}
                className={`relative rounded-2xl border-2 overflow-hidden shadow-2xl flex-shrink-0 w-full max-w-[48rem] min-w-[280px] ${
                  isDrafting
                    ? "border-biolumeTeal/70"
                    : theme === "sunlight"
                      ? "border-slate-300"
                      : theme === "neon"
                        ? "border-electricJellyfish/60"
                        : theme === "abyssal"
                          ? "border-anglerfishAmber/50"
                          : "border-white/30"
                }`}
                style={{
                  aspectRatio: "16 / 9",
                  minHeight: "220px",
                  boxShadow: isDrafting
                    ? "0 0 30px rgba(0,255,229,0.25), 0 25px 50px -12px rgba(0,0,0,0.5)"
                    : theme === "sunlight"
                      ? "0 25px 50px -12px rgba(15,23,42,0.35)"
                      : theme === "neon"
                        ? "0 0 40px rgba(117,35,255,0.7), 0 25px 50px -12px rgba(0,0,0,0.7)"
                        : theme === "abyssal"
                          ? "0 25px 60px -16px rgba(8,47,73,0.9)"
                          : "0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)",
                }}
                animate={
                  isDrafting
                    ? {
                        opacity: 1,
                        x: 0,
                        boxShadow: [
                          "0 0 30px rgba(0,255,229,0.25), 0 25px 50px -12px rgba(0,0,0,0.5)",
                          "0 0 50px rgba(0,255,229,0.4), 0 25px 50px -12px rgba(0,0,0,0.5)",
                          "0 0 30px rgba(0,255,229,0.25), 0 25px 50px -12px rgba(0,0,0,0.5)",
                        ],
                      }
                    : { opacity: 1, x: 0 }
                }
                transition={{
                  opacity: { duration: 0.25 },
                  x: { duration: 0.25 },
                  boxShadow: { duration: 2, repeat: isDrafting ? Infinity : 0 },
                }}
              >
                <div
                  className={`absolute inset-0 ${
                    theme === "midnight"
                      ? "text-white"
                      : theme === "sunlight"
                        ? "text-slate-900"
                        : theme === "abyssal"
                          ? "text-sky-100"
                          : "text-slate-50"
                  }`}
                  style={(() => {
                    const so = sharedWorkspace?.asset_forge?.style_overrides;
                    const titleBg = activeChapterId === "hook" && typeof so?.title_slide_bg_hex === "string" ? so.title_slide_bg_hex : null;
                    const contentBg = activeChapterId !== "hook" && typeof so?.content_slide_bg_hex === "string" ? so.content_slide_bg_hex : null;
                    const bgOverride = titleBg ?? contentBg ?? null;
                    if (bgOverride) {
                      return { background: bgOverride, backgroundColor: bgOverride };
                    }
                    return theme === "midnight"
                      ? {
                          background:
                            "radial-gradient(circle at 0% 0%, rgba(0,255,229,0.18) 0%, transparent 40%), radial-gradient(circle at 100% 0%, rgba(117,35,255,0.16) 0%, transparent 45%), radial-gradient(circle at 50% 120%, rgba(15,23,42,1) 0%, rgba(2,6,23,1) 55%, #020617 100%)",
                        }
                      : theme === "sunlight"
                        ? {
                            background:
                              "radial-gradient(circle at 0% 0%, rgba(148,163,184,0.24) 0%, transparent 45%), linear-gradient(135deg, #f8fafc 0%, #e5e7eb 35%, #f9fafb 100%)",
                          }
                        : theme === "abyssal"
                          ? {
                              background:
                                "radial-gradient(circle at 20% -10%, rgba(14,165,233,0.3) 0%, transparent 55%), radial-gradient(circle at 80% 110%, rgba(249,115,22,0.28) 0%, transparent 55%), linear-gradient(to bottom right, #020617 0%, #020617 30%, #020617 55%, #020617 100%)",
                            }
                          : {
                              backgroundImage:
                                "linear-gradient(rgba(15,23,42,0.95) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.95) 1px, transparent 1px), radial-gradient(circle at 0% 0%, rgba(117,35,255,0.6) 0%, transparent 45%), radial-gradient(circle at 100% 0%, rgba(45,212,191,0.5) 0%, transparent 45%)",
                              backgroundSize: "40px 40px, 40px 40px, 120% 120%, 160% 160%",
                              backgroundColor: "#020617",
                            };
                  })()}
                >
                  <MockSlideContent
                    chapterId={activeChapterId}
                    theme={theme}
                    marketGap={marketGap}
                    narrativeChapters={narrativeChapters}
                    marketIntel={sharedWorkspace?.market_intel}
                    embeddedSlideImages={sharedWorkspace?.asset_forge?.embedded_slide_images ?? undefined}
                    styleOverrides={sharedWorkspace?.asset_forge?.style_overrides ?? undefined}
                    backendBaseUrl={BACKEND_BASE_URL}
                    editable={showContent}
                    onEditTitle={handleEditTitle}
                    onEditBullet={handleEditBullet}
                  />
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
          {showContent && (
            <div className="flex items-center justify-center gap-4 mt-2">
              <button
                type="button"
                onClick={() => {
                  if (slideIndex > 0) {
                    const prev = slideIndex - 1;
                    setSlideIndex(prev);
                    setActiveChapterId(CHAPTERS[prev].id);
                  }
                }}
                disabled={slideIndex === 0}
                className="flex items-center justify-center w-10 h-10 rounded-xl border border-white/20 bg-white/5 text-white/80 hover:bg-white/10 hover:border-biolumeTeal/40 hover:text-biolumeTeal disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed transition-colors"
                aria-label="Previous slide"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-xs text-white/60 tabular-nums min-w-[3rem] text-center">
                {slideIndex + 1} of {CHAPTERS.length}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (slideIndex < CHAPTERS.length - 1) {
                    const next = slideIndex + 1;
                    setSlideIndex(next);
                    setActiveChapterId(CHAPTERS[next].id);
                  }
                }}
                disabled={slideIndex >= CHAPTERS.length - 1}
                className="flex items-center justify-center w-10 h-10 rounded-xl border border-white/20 bg-white/5 text-white/80 hover:bg-white/10 hover:border-biolumeTeal/40 hover:text-biolumeTeal disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed transition-colors"
                aria-label="Next slide"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
          <p className="text-center text-[0.65rem] text-white/40 mt-2">
            {showContent ? "Click title or bullets to edit · " : ""}
            Request changes, attach files, or generate an image below
          </p>

            {/* Chat bar — merged with Generate image toggle */}
            <div className="mt-4 pt-4 border-t border-white/10 bg-black/30 rounded-xl p-3">
            {/* Toggle: show "Generate image" button when collapsed */}
            {!showGenerateImageMode && (
              <div className="mb-2">
                <button
                  type="button"
                  onClick={() => setShowGenerateImageMode(true)}
                  disabled={!showContent}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10 hover:border-biolumeTeal/40 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Generate image with AI"
                >
                  <ImagePlus className="h-3.5 w-3.5 text-biolumeTeal" />
                  Generate image
                </button>
              </div>
            )}
            {/* Expandable: Generate image mode — color only; prompt goes in the main textbox below */}
            {showGenerateImageMode && (
              <div className="mb-3 p-2.5 rounded-lg border border-biolumeTeal/30 bg-biolumeTeal/5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[0.65rem] uppercase tracking-wider text-biolumeTeal/90 flex items-center gap-1.5">
                    <ImagePlus className="h-3 w-3" />
                    Generate image with AI — type your prompt in the box below
                  </span>
                  <div className="flex items-center gap-2">
                    <select
                      value={imageColor}
                      onChange={(e) => setImageColor(e.target.value)}
                      className="rounded border border-white/20 bg-white/5 px-2 py-1.5 text-xs text-white focus:border-biolumeTeal/50 focus:outline-none"
                      disabled={!showContent || generatingImage}
                    >
                      <option value="">No color</option>
                      <option value="#FFFFFF">White</option>
                      <option value="#000000">Black</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowGenerateImageMode(false)}
                      className="rounded p-1 hover:bg-white/10 text-white/70 shrink-0"
                      aria-label="Close generate image"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-2 min-h-[32px] flex flex-wrap items-center gap-2">
              {generatedImage && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-biolumeTeal/40 bg-biolumeTeal/15 px-2.5 py-1.5 text-xs text-white">
                  <button
                    type="button"
                    onClick={() => setGeneratedImagePreviewOpen(true)}
                    className="h-5 w-5 rounded object-cover shrink-0 overflow-hidden border-0 p-0 cursor-pointer focus:ring-2 focus:ring-biolumeTeal/50 focus:outline-none"
                    title="Click to preview"
                  >
                    <img
                      src={`${BACKEND_BASE_URL}/agents/asset-forge/asset/${generatedImage.path}`}
                      alt="Generated"
                      className="h-5 w-5 rounded object-cover"
                    />
                  </button>
                  <span className="max-w-[100px] truncate">Generated image</span>
                  <button
                    type="button"
                    onClick={() => void handleDownloadGeneratedImage()}
                    className="rounded p-0.5 hover:bg-white/20 text-white/70 shrink-0"
                    title="Download"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setGeneratedImage(null)}
                    className="rounded p-0.5 hover:bg-white/20 text-white/70 shrink-0"
                    aria-label="Remove generated image"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
              {pendingFilesRef.current.length === 0 && !generatedImage ? (
                <span className="text-xs text-white/50">No files attached</span>
              ) : (
                pendingFilesRef.current.map((file, i) => (
                  <span
                    key={`${file.name}-${file.size}-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-biolumeTeal/40 bg-biolumeTeal/15 px-2.5 py-1.5 text-xs text-white"
                  >
                    <Paperclip className="h-3.5 w-3.5 text-biolumeTeal shrink-0" />
                    <span className="max-w-[140px] truncate" title={file.name}>
                      {file.name}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removePendingFile(i);
                      }}
                      className="rounded p-0.5 hover:bg-white/20 text-white/70 shrink-0"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.shiftKey) return;
                  if (showGenerateImageMode) void handleGenerateImage();
                  else handleChatSubmit();
                }}
                placeholder={showGenerateImageMode ? "Describe the image to generate (e.g. minimal logo, white, handbag)" : "e.g. Add this image to the solution slide, or make title bigger, use blue background, white text"}
                className="flex-1 min-w-0 rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-biolumeTeal/50 focus:outline-none focus:ring-1 focus:ring-biolumeTeal/30"
                disabled={chatSending || !showContent}
              />
              <label
                className={`flex-shrink-0 rounded-lg border border-white/20 bg-white/5 p-2.5 text-white/70 hover:bg-white/10 hover:text-white cursor-pointer flex items-center justify-center ${
                  chatSending || !showContent ? "pointer-events-none opacity-50" : ""
                }`}
                title="Attach files"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="absolute w-0 h-0 opacity-0 overflow-hidden -z-[1]"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.txt,.md"
                  tabIndex={-1}
                  aria-label="Attach files"
                  disabled={chatSending || !showContent}
                />
                <Paperclip className="h-5 w-5 pointer-events-none" />
              </label>
              {showGenerateImageMode ? (
                <button
                  type="button"
                  onClick={() => void handleGenerateImage()}
                  disabled={!chatInput.trim() || generatingImage || !showContent}
                  className="flex-shrink-0 rounded-lg bg-biolumeTeal/90 px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-biolumeTeal disabled:opacity-50 flex items-center gap-2"
                >
                  <ImagePlus className="h-4 w-4" />
                  {generatingImage ? "Generating…" : "Generate"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleChatSubmit()}
                  disabled={chatSending || (!chatInput.trim() && pendingFilesRef.current.length === 0 && !generatedImage) || !showContent}
                  className="flex-shrink-0 rounded-lg bg-biolumeTeal/90 px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-biolumeTeal disabled:opacity-50 flex items-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  {chatSending ? "Applying…" : "Apply"}
                </button>
              )}
            </div>
          </div>
        </section>
      </div>

      </> )}

      {/* Generated image preview modal — stay on same screen, close to go back */}
      <AnimatePresence>
        {generatedImagePreviewOpen && generatedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
            onClick={() => setGeneratedImagePreviewOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={`${BACKEND_BASE_URL}/agents/asset-forge/asset/${generatedImage.path}`}
                alt="Generated preview"
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              />
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setGeneratedImagePreviewOpen(false)}
                  className="rounded-lg bg-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/25 flex items-center gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => { void handleDownloadGeneratedImage(); setGeneratedImagePreviewOpen(false); }}
                  className="rounded-lg bg-biolumeTeal/90 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-biolumeTeal flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Export overlay (e.g. when download fails) */}
      <AnimatePresence>
        {showExport && (
          <ForgingExportOverlay onComplete={handleExportClose} />
        )}
      </AnimatePresence>

      {/* Pitch Reel modal */}
      <AnimatePresence>
        {reelModalOpen && (
          <motion.div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (!reelGenerating) setReelModalOpen(false); }}
          >
            <motion.div
              className="relative w-full max-w-2xl mx-4 rounded-2xl border border-white/10 bg-slate-950/95 backdrop-blur-xl shadow-2xl overflow-hidden"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <Video className="h-5 w-5 text-purple-400" />
                  <h2 className="text-lg font-semibold text-white">AI Pitch Reel</h2>
                </div>
                {!reelGenerating && (
                  <button onClick={() => setReelModalOpen(false)} className="text-white/50 hover:text-white">
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>

              {/* Body */}
              <div className="px-6 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
                {reelStatus === "scripting" && (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <Loader2 className="h-10 w-10 text-purple-400 animate-spin" />
                    <p className="text-white/80 text-sm">Writing your cinematic script with Nova Pro...</p>
                    <p className="text-white/40 text-xs">Analyzing your venture context and crafting 8 scenes</p>
                  </div>
                )}

                {reelStatus === "generating" && (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <div className="relative">
                      <Loader2 className="h-10 w-10 text-purple-400 animate-spin" />
                      <Video className="h-4 w-4 text-purple-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    </div>
                    <p className="text-white/80 text-sm">Nova Reel is generating your pitch video...</p>
                    <p className="text-white/40 text-xs">This takes 5-10 minutes. You can leave this open or come back.</p>
                    <div className="w-full max-w-md bg-white/5 rounded-full h-2 overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                        initial={{ width: "5%" }}
                        animate={{ width: "70%" }}
                        transition={{ duration: 600, ease: "linear" }}
                      />
                    </div>
                    {reelScript && (
                      <details className="w-full mt-2">
                        <summary className="text-xs text-white/40 cursor-pointer hover:text-white/60">View generated script</summary>
                        <pre className="mt-2 text-xs text-white/50 bg-white/5 rounded-lg p-3 whitespace-pre-wrap max-h-40 overflow-y-auto">{reelScript}</pre>
                      </details>
                    )}
                  </div>
                )}

                {reelStatus === "compositing" && (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <div className="relative">
                      <Loader2 className="h-10 w-10 text-emerald-400 animate-spin" />
                      <Video className="h-4 w-4 text-emerald-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    </div>
                    <p className="text-white/80 text-sm">Adding narration and text overlays...</p>
                    <p className="text-white/40 text-xs">Video generated successfully. Now compositing audio and subtitles.</p>
                    <div className="w-full max-w-md bg-white/5 rounded-full h-2 overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full"
                        initial={{ width: "70%" }}
                        animate={{ width: "95%" }}
                        transition={{ duration: 30, ease: "linear" }}
                      />
                    </div>
                  </div>
                )}

                {reelStatus === "completed" && reelVideoUrl && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative w-full rounded-xl overflow-hidden border border-white/10 bg-black">
                      <video
                        ref={reelVideoRef}
                        src={reelVideoUrl}
                        controls
                        autoPlay
                        className="w-full"
                        style={{ maxHeight: "400px" }}
                      />
                      {activeSubtitle && (
                        <div className="absolute bottom-12 left-0 right-0 flex justify-center pointer-events-none px-4">
                          <span className="px-5 py-2.5 rounded-lg bg-black/70 backdrop-blur-sm text-white text-lg font-semibold tracking-wide text-center shadow-lg border border-white/10"
                            style={{ textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
                            {activeSubtitle}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <a
                        href={reelVideoUrl}
                        download="pitch-reel.mp4"
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-300 text-sm font-medium hover:bg-purple-500/30 transition"
                      >
                        <Download className="h-4 w-4" />
                        Download MP4
                      </a>
                      <button
                        onClick={() => { setReelModalOpen(false); }}
                        className="px-4 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white/80 text-sm"
                      >
                        Close
                      </button>
                    </div>
                    {reelScript && (
                      <details className="w-full">
                        <summary className="text-xs text-white/40 cursor-pointer hover:text-white/60">View generated script</summary>
                        <pre className="mt-2 text-xs text-white/50 bg-white/5 rounded-lg p-3 whitespace-pre-wrap max-h-40 overflow-y-auto">{reelScript}</pre>
                      </details>
                    )}
                  </div>
                )}

                {reelStatus === "failed" && (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <div className="h-12 w-12 rounded-full bg-red-500/20 flex items-center justify-center">
                      <X className="h-6 w-6 text-red-400" />
                    </div>
                    <p className="text-red-400 text-sm font-medium">Generation Failed</p>
                    <p className="text-white/50 text-xs text-center max-w-sm">{reelError}</p>
                    <div className="flex gap-3">
                      <button
                        onClick={handleGenerateReel}
                        className="px-4 py-2 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-300 text-sm font-medium hover:bg-purple-500/30 transition"
                      >
                        Try Again
                      </button>
                      <button
                        onClick={() => setReelModalOpen(false)}
                        className="px-4 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white/80 text-sm"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
