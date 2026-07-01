import type {
  ProfessionalAuditRoundCoinType,
  ProfessionalAuditRoundSymbolPlan,
} from "./professional-audit-round";

export const auditCoinTypeLabels: Record<ProfessionalAuditRoundCoinType, string> = {
  ai_depin: "AI / Depin",
  defi: "DeFi",
  exchange_infra: "交易所/基础设施",
  gaming: "GameFi",
  large_liquid_alt: "高流动性主流山寨",
  layer1_layer2: "L1 / L2",
  long_tail: "长尾小币",
  meme: "Meme 高波动",
  midcap_trend: "中市值趋势币",
  new_hot_listing: "新上市/热点币",
};

const auditSeeds: Record<ProfessionalAuditRoundCoinType, string[]> = {
  ai_depin: ["FETUSDT", "TAOUSDT", "RENDERUSDT", "WLDUSDT", "ARKMUSDT", "AIUSDT"],
  defi: ["AAVEUSDT", "UNIUSDT", "MKRUSDT", "PENDLEUSDT", "ENAUSDT", "LDOUSDT"],
  exchange_infra: ["BNBUSDT", "OKBUSDT", "GTUSDT", "CAKEUSDT", "RUNEUSDT", "DYDXUSDT"],
  gaming: ["GALAUSDT", "PIXELUSDT", "IMXUSDT", "RONINUSDT", "SANDUSDT", "AXSUSDT"],
  large_liquid_alt: ["SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT"],
  layer1_layer2: ["SUIUSDT", "APTUSDT", "ARBUSDT", "OPUSDT", "SEIUSDT", "TIAUSDT"],
  long_tail: ["1000PEPEUSDT", "1000BONKUSDT", "BICOUSDT", "CELRUSDT", "JASMYUSDT", "TRUUSDT"],
  meme: ["1000PEPEUSDT", "DOGEUSDT", "WIFUSDT", "1000FLOKIUSDT", "1000BONKUSDT", "PNUTUSDT"],
  midcap_trend: ["ONDOUSDT", "INJUSDT", "HYPEUSDT", "JUPUSDT", "WUSDT", "PYTHUSDT"],
  new_hot_listing: ["HYPEUSDT", "WUSDT", "JUPUSDT", "ZROUSDT", "STRKUSDT", "ENAUSDT"],
};

const auditTypeOrder: ProfessionalAuditRoundCoinType[] = [
  "large_liquid_alt",
  "layer1_layer2",
  "defi",
  "meme",
  "ai_depin",
  "gaming",
  "exchange_infra",
  "new_hot_listing",
  "midcap_trend",
  "long_tail",
];

export function defaultAuditSeedSymbols() {
  return [...new Set(Object.values(auditSeeds).flat())].sort();
}

export function deterministicSymbolScore(symbol: string, seed = "") {
  let hash = 2166136261;
  const input = `${seed}:${symbol}`;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function normalizeAvoidedSymbols(symbols?: Iterable<string>) {
  return new Set(
    [...(symbols ?? [])]
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean),
  );
}

function eligibleAltSymbols(symbols: string[]) {
  return symbols
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => symbol && !["BTCUSDT", "ETHUSDT"].includes(symbol));
}

function preferFreshSymbols(symbols: string[], avoided: Set<string>, roundSeed: string) {
  const fresh = symbols
    .filter((symbol) => !avoided.has(symbol))
    .sort((left, right) => deterministicSymbolScore(left, roundSeed) - deterministicSymbolScore(right, roundSeed));
  const fallback = symbols
    .filter((symbol) => avoided.has(symbol))
    .sort((left, right) => deterministicSymbolScore(left, roundSeed) - deterministicSymbolScore(right, roundSeed));

  return [...fresh, ...fallback];
}

export function buildAuditSymbolPlan({
  avoidedSymbols,
  roundSeed = "",
  symbols,
  targetCount,
}: {
  avoidedSymbols?: Iterable<string>;
  roundSeed?: string;
  symbols: string[];
  targetCount: number;
}): ProfessionalAuditRoundSymbolPlan[] {
  const available = new Set(eligibleAltSymbols(symbols));
  const avoided = normalizeAvoidedSymbols(avoidedSymbols);
  const used = new Set<string>();
  const plan: ProfessionalAuditRoundSymbolPlan[] = [];

  for (const coinType of auditTypeOrder) {
    const candidates = preferFreshSymbols(
      auditSeeds[coinType].filter((seed) => available.has(seed)),
      avoided,
      `${roundSeed}:${coinType}`,
    );
    const symbol = candidates.find((candidate) => !used.has(candidate));

    if (!symbol) {
      continue;
    }

    used.add(symbol);
    plan.push({
      coinType,
      coinTypeLabel: auditCoinTypeLabels[coinType],
      symbol,
    });

    if (plan.length >= targetCount) {
      return plan;
    }
  }

  const fallback = preferFreshSymbols(
    [...available].filter((symbol) => !used.has(symbol)),
    avoided,
    `${roundSeed}:fallback`,
  );

  for (const symbol of fallback) {
    plan.push({
      coinType: "long_tail",
      coinTypeLabel: auditCoinTypeLabels.long_tail,
      symbol,
    });
    used.add(symbol);

    if (plan.length >= targetCount) {
      break;
    }
  }

  return plan;
}

export function buildAuditCandidateUniverse({
  auditPlan,
  symbols,
  targetCount,
}: {
  auditPlan: ProfessionalAuditRoundSymbolPlan[];
  symbols: string[];
  targetCount: number;
}) {
  const requiredSymbols = auditPlan.map((item) => item.symbol);
  const required = new Set(requiredSymbols);
  const candidateLimit = Math.max(requiredSymbols.length, targetCount);
  const filler = eligibleAltSymbols(symbols)
    .filter((symbol) => !required.has(symbol))
    .sort((left, right) => deterministicSymbolScore(left) - deterministicSymbolScore(right));

  return [...requiredSymbols, ...filler].slice(0, candidateLimit);
}
