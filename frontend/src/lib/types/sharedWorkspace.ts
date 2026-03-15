export type AgentStatus = "IDLE" | "SYNCING" | "COMPLETE";

/** One citation from web grounding (url, domain, title). */
export interface MarketIntelSource {
  url?: string | null;
  domain?: string | null;
  title?: string | null;
}

/** One follow-up Q&A pair. */
export interface MarketIntelFollowUp {
  question: string;
  answer: string;
}

export interface MarketIntelState {
  status: AgentStatus;
  last_message?: string | null;
  competitor?: string | null;
  market_gap?: string | null;
  summary?: string | null;
  report_text?: string | null;
  market_share_data?: Record<string, unknown>[];
  opportunity_gap_data?: Record<string, unknown>[];
  trend_data?: Record<string, unknown>[];
  pie_colors?: string[];
  /** Web grounding citations (url, domain, title). */
  sources?: MarketIntelSource[];
  /** Follow-up Q&A over the report. */
  follow_up_answers?: MarketIntelFollowUp[];
}

export interface AssetForgeState {
  status: AgentStatus;
  last_message?: string | null;
  narrative_flow?: string | null;
  context_inherited: boolean;
  golden_thread?: string | null;
  narrative_chapters?: Record<string, string>;
  assets?: { id: string; type: string; label: string; icon?: string }[];
  /** After chat-edit with image: slide_id -> stored filename (for UI preview) */
  embedded_slide_images?: Record<string, string> | null;
  /** Font/color/background overrides from chat (e.g. title_font_size_pt, bullet_color_hex, content_slide_bg_hex) */
  style_overrides?: Record<string, string | number> | null;
}

export interface VCScoutPin {
  name: string;
  region: string;
  lat: number;
  lng: number;
  stage_focus?: string | null;
  sector_focus?: string | null;
  check_size?: string | null;
  website?: string | null;
  contact_url?: string | null;
  match_score?: number | null;
  compatibility_summary?: string | null;
  partners?: {
    name: string;
    role?: string | null;
    focus?: string | null;
    notable_investments?: string | null;
  }[];
}

export interface VCScoutState {
  status: AgentStatus;
  last_message?: string | null;
  pins: VCScoutPin[];
}

export interface CodeLabState {
  status: AgentStatus;
  last_message?: string | null;
  scaffold_summary?: string | null;
  generated_file_paths?: string[];
}

export interface FinanceAuditorPoint {
  month: string;
  burn: number;
  runway_months: number;
}

export interface FinanceAuditorState {
  status: AgentStatus;
  last_message?: string | null;
  series: FinanceAuditorPoint[];
}

export interface SharkPersonaMessage {
  shark_id: string;
  display_name: string;
  role: string;
  color: string;
  text: string;
  is_barge_in: boolean;
}

export interface VirtualTankState {
  active: boolean;
  last_messages: SharkPersonaMessage[];
  fundability_score?: number | null;
  metrics?: {
    filler_count: number;
    user_utterances: string[];
    clarity_score?: number | null;
    clarity_notes?: string | null;
    confidence_score?: number | null;
  };
  verdicts?: {
    shark_id: string;
    display_name: string;
    verdict: string;
    detail: string;
  }[];
}

export interface SharedWorkspace {
  idea_parsed: boolean;
  market_gap?: string | null;
  pitch_deck_status: "NotStarted" | "InProgress" | "Ready";
  fundability_score?: number | null;
  context_inherited: boolean;

  market_intel: MarketIntelState;
  asset_forge: AssetForgeState;
  vc_scout: VCScoutState;
  code_lab: CodeLabState;
  finance_auditor: FinanceAuditorState;
  virtual_tank: VirtualTankState;
}

