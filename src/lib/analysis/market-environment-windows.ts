export type MarketEnvironmentWindowKey = "large" | "major" | "medium" | "short";

export type MarketEnvironmentTimeWindow = {
  defaultHours: number;
  label: string;
  maxHours: number;
  minHours: number;
  purpose: string;
};

export type MarketEnvironmentTimeframeWindow = {
  label: string;
  purpose: string;
  timeframes: readonly ["1d", "1w"];
};

export type MarketEnvironmentWindow =
  | MarketEnvironmentTimeWindow
  | MarketEnvironmentTimeframeWindow;

export const marketEnvironmentWindows = {
  short: {
    defaultHours: 24,
    label: "短周期环境",
    maxHours: 24,
    minHours: 4,
    purpose: "判断当前异动是否只是瞬时噪声，以及短线成交/波动是否正在变化。",
  },
  medium: {
    defaultHours: 24 * 7,
    label: "中周期环境",
    maxHours: 24 * 7,
    minHours: 24 * 3,
    purpose: "判断 3-7 天内山寨资金是否持续流入，避免只看一根短线 K 线。",
  },
  large: {
    defaultHours: 24 * 30,
    label: "长周期环境",
    maxHours: 24 * 90,
    minHours: 24 * 30,
    purpose: "判断 30-90 天的主环境，30 天只是默认下限，不是唯一长周期口径。",
  },
  major: {
    label: "大级别趋势背景",
    purpose: "用日线和周线判断高周期顺风/逆风，不能被低周期信号推翻。",
    timeframes: ["1d", "1w"],
  },
} as const satisfies Record<MarketEnvironmentWindowKey, MarketEnvironmentWindow>;

function hoursLabel(hours: number) {
  if (hours % 24 === 0) {
    return `${hours / 24}天`;
  }

  return `${hours}小时`;
}

export function describeMarketEnvironmentWindows() {
  const short = marketEnvironmentWindows.short;
  const medium = marketEnvironmentWindows.medium;
  const large = marketEnvironmentWindows.large;
  const major = marketEnvironmentWindows.major;

  return [
    `${short.label}=${hoursLabel(short.minHours)}-${hoursLabel(short.maxHours)}`,
    `${medium.label}=${hoursLabel(medium.minHours)}-${hoursLabel(medium.maxHours)}`,
    `${large.label}=${hoursLabel(large.minHours)}-${hoursLabel(large.maxHours)}，默认 ${hoursLabel(large.defaultHours)}`,
    `${major.label}=${major.timeframes.join("+")}`,
  ].join(" / ");
}

export function defaultLongMarketEnvironmentDays() {
  return marketEnvironmentWindows.large.defaultHours / 24;
}
