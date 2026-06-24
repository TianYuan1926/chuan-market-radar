import { resource, type Resource } from "../data-status";

export type ExternalIntelSourceId =
  | "binance_announcements"
  | "okx_announcements"
  | "dex_screener_public_api"
  | "coingecko_trending"
  | "coingecko_coin_list"
  | "defillama_public_api"
  | "project_official_rss"
  | "block_explorer_low_frequency";

export type ExternalIntelSourceTier =
  | "official_api"
  | "official_announcement"
  | "authorized_public_api"
  | "official_rss"
  | "low_frequency_public_page";

export type ExternalIntelEventKind =
  | "LISTING_EVENT"
  | "DELIST_RISK"
  | "DEX_VOLUME_SPIKE"
  | "LIQUIDITY_CHANGE"
  | "WHALE_FLOW"
  | "UNLOCK_EVENT"
  | "SECURITY_RISK"
  | "NARRATIVE_CATALYST";

export type ExternalIntelImpact = "bullish_context" | "bearish_context" | "risk_context" | "neutral_context";

export type ExternalIntelSourcePlan = {
  id: ExternalIntelSourceId;
  label: string;
  tier: ExternalIntelSourceTier;
  enabledByDefault: boolean;
  maxFrequencyMinutes: number;
  allowedUse: "context_only";
  canCreateTradeSignal: false;
  mustRespectRobots: boolean;
  requiresLogin: false;
  avoidsPaywall: true;
  notes: string[];
};

export type SourceFetchRun = {
  id: string;
  sourceId: ExternalIntelSourceId;
  startedAt: string;
  finishedAt?: string;
  status: "success" | "partial" | "failed" | "skipped";
  rowsRead: number;
  rowsAccepted: number;
  latencyMs?: number;
  error?: string;
};

export type ExternalEvent = {
  id: string;
  sourceId: ExternalIntelSourceId;
  kind: ExternalIntelEventKind;
  symbol?: string;
  title: string;
  summary: string;
  sourceUrl?: string;
  observedAt: string;
  impact: ExternalIntelImpact;
  confidence: number;
  allowedUse: "context_only";
  canCreateTradeSignal: false;
  rawBodyStored: false;
};

export type ExternalEventInput = Omit<ExternalEvent, "allowedUse" | "canCreateTradeSignal" | "confidence" | "rawBodyStored" | "summary" | "title"> & {
  confidence?: number;
  summary?: string;
  title?: string;
};

export type ExternalIntelEvidenceCandidate = {
  eventId: string;
  family: "EXTERNAL_EVENT";
  direction: "BULLISH" | "BEARISH" | "RISK" | "NEUTRAL";
  label: string;
  summary: string;
  allowedUse: "context_only";
  canCreateTradeSignal: false;
  riskOnly: boolean;
};

export type ExternalIntelContract = {
  schemaVersion: "external-intel.v1";
  guardrails: string[];
  sourcePlan: ExternalIntelSourcePlan[];
  latestRuns: SourceFetchRun[];
  events: ExternalEvent[];
  evidenceCandidates: ExternalIntelEvidenceCandidate[];
};

const maxSummaryLength = 280;
const sourcePlan: ExternalIntelSourcePlan[] = [
  {
    id: "binance_announcements",
    label: "Binance 官方公告",
    tier: "official_announcement",
    enabledByDefault: false,
    maxFrequencyMinutes: 30,
    allowedUse: "context_only",
    canCreateTradeSignal: false,
    mustRespectRobots: true,
    requiresLogin: false,
    avoidsPaywall: true,
    notes: ["只读取公开公告标题、时间、链接和简短摘要；不保存付费全文。"],
  },
  {
    id: "okx_announcements",
    label: "OKX 官方公告",
    tier: "official_announcement",
    enabledByDefault: false,
    maxFrequencyMinutes: 30,
    allowedUse: "context_only",
    canCreateTradeSignal: false,
    mustRespectRobots: true,
    requiresLogin: false,
    avoidsPaywall: true,
    notes: ["只做上市、下架、维护、风险提示等事件归档。"],
  },
  {
    id: "dex_screener_public_api",
    label: "DEX Screener Public API",
    tier: "authorized_public_api",
    enabledByDefault: true,
    maxFrequencyMinutes: 15,
    allowedUse: "context_only",
    canCreateTradeSignal: false,
    mustRespectRobots: true,
    requiresLogin: false,
    avoidsPaywall: true,
    notes: ["只做 DEX 热度、流动性和新池风险背景，不直接生成方向。"],
  },
  {
    id: "coingecko_coin_list",
    label: "CoinGecko 公开币种列表",
    tier: "official_api",
    enabledByDefault: false,
    maxFrequencyMinutes: 360,
    allowedUse: "context_only",
    canCreateTradeSignal: false,
    mustRespectRobots: true,
    requiresLogin: false,
    avoidsPaywall: true,
    notes: ["用于 token identity、logo、名称和合约映射校验。"],
  },
  {
    id: "coingecko_trending",
    label: "CoinGecko Trending Search",
    tier: "official_api",
    enabledByDefault: true,
    maxFrequencyMinutes: 30,
    allowedUse: "context_only",
    canCreateTradeSignal: false,
    mustRespectRobots: true,
    requiresLogin: false,
    avoidsPaywall: true,
    notes: ["读取公开 trending search，只作为市场关注度背景，不等于推荐。"],
  },
  {
    id: "defillama_public_api",
    label: "DefiLlama Public API",
    tier: "official_api",
    enabledByDefault: false,
    maxFrequencyMinutes: 240,
    allowedUse: "context_only",
    canCreateTradeSignal: false,
    mustRespectRobots: true,
    requiresLogin: false,
    avoidsPaywall: true,
    notes: ["用于协议 TVL 和链上生态背景，低频读取。"],
  },
  {
    id: "project_official_rss",
    label: "项目官方 RSS / GitHub Release",
    tier: "official_rss",
    enabledByDefault: false,
    maxFrequencyMinutes: 120,
    allowedUse: "context_only",
    canCreateTradeSignal: false,
    mustRespectRobots: true,
    requiresLogin: false,
    avoidsPaywall: true,
    notes: ["只接受项目官方来源，不读取个人隐私或非授权内容。"],
  },
  {
    id: "block_explorer_low_frequency",
    label: "区块浏览器公开 API 低频观察",
    tier: "authorized_public_api",
    enabledByDefault: false,
    maxFrequencyMinutes: 60,
    allowedUse: "context_only",
    canCreateTradeSignal: false,
    mustRespectRobots: true,
    requiresLogin: false,
    avoidsPaywall: true,
    notes: ["只做大额转账、解锁和合约风险背景，禁止高频抓取。"],
  },
];

function clampConfidence(value: number | undefined) {
  if (!Number.isFinite(value ?? NaN)) {
    return 50;
  }

  return Math.min(100, Math.max(0, Math.round(value as number)));
}

function clampText(value: string | undefined, fallback: string) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  const base = normalized.length > 0 ? normalized : fallback;

  return base.length > maxSummaryLength ? `${base.slice(0, maxSummaryLength - 1)}…` : base;
}

function normalizeSymbol(symbol: string | undefined) {
  const normalized = (symbol ?? "").replace(/[^A-Z0-9]/giu, "").toUpperCase();

  return normalized.length > 0 ? normalized : undefined;
}

function sourceAllowed(sourceId: ExternalIntelSourceId) {
  return sourcePlan.some((source) => source.id === sourceId);
}

export function buildExternalIntelSourcePlan() {
  return sourcePlan.map((source) => ({ ...source, notes: [...source.notes] }));
}

export function normalizeExternalEvent(input: ExternalEventInput): ExternalEvent {
  if (!sourceAllowed(input.sourceId)) {
    throw new Error(`Unsupported external intel source: ${input.sourceId}`);
  }

  return {
    ...input,
    allowedUse: "context_only",
    canCreateTradeSignal: false,
    confidence: clampConfidence(input.confidence),
    rawBodyStored: false,
    summary: clampText(input.summary, input.title ?? input.kind),
    symbol: normalizeSymbol(input.symbol),
    title: clampText(input.title, input.kind),
  };
}

function directionFromImpact(impact: ExternalIntelImpact): ExternalIntelEvidenceCandidate["direction"] {
  if (impact === "bullish_context") return "BULLISH";
  if (impact === "bearish_context") return "BEARISH";
  if (impact === "risk_context") return "RISK";
  return "NEUTRAL";
}

export function externalEventToEvidenceCandidate(event: ExternalEvent): ExternalIntelEvidenceCandidate {
  return {
    eventId: event.id,
    family: "EXTERNAL_EVENT",
    direction: directionFromImpact(event.impact),
    label: `${event.kind}${event.symbol ? `:${event.symbol}` : ""}`,
    summary: event.summary,
    allowedUse: "context_only",
    canCreateTradeSignal: false,
    riskOnly: event.impact === "risk_context" || event.kind === "SECURITY_RISK" || event.kind === "DELIST_RISK",
  };
}

export function buildExternalIntelContract({
  events = [],
  latestRuns = [],
}: {
  events?: ExternalEvent[];
  latestRuns?: SourceFetchRun[];
} = {}): Resource<ExternalIntelContract> {
  const normalizedEvents = events.map((event) => normalizeExternalEvent(event));
  const hasFailures = latestRuns.some((run) => run.status === "failed" || run.status === "partial");
  const status = normalizedEvents.length > 0
    ? hasFailures ? "partial" : "live"
    : hasFailures ? "failed" : "empty";

  return resource(
    {
      schemaVersion: "external-intel.v1",
      guardrails: [
        "合法外部情报只能作为上下文、风险提示和复盘样本入口。",
        "不绕过登录、付费墙、验证码、robots.txt 或网站明确禁止的抓取规则。",
        "不保存付费全文、受版权保护全文、个人隐私或无法追溯来源的内容。",
        "任何 ExternalEvent 都不能直接生成交易计划，必须先进入 Evidence / Risk Gate / Review。",
      ],
      sourcePlan: buildExternalIntelSourcePlan(),
      latestRuns,
      events: normalizedEvents,
      evidenceCandidates: normalizedEvents.map(externalEventToEvidenceCandidate),
    },
    status,
    {
      source: "external-intel",
      reason: normalizedEvents.length > 0
        ? "已标准化外部事件；仍只作为上下文，不直接喊单。"
        : hasFailures
          ? "外部情报 collector 已启用但本轮失败；不使用旧数据或假事件填充。"
          : "合法外部情报基础层已就绪，collector 尚未产生事件。",
    },
  );
}
