import type { SystemHealthReport } from "./system-health";
import { isCronRequestAuthorized } from "./cron-auth";

type DeploymentEnv = Record<string, string | undefined>;

export type DeploymentReadinessState = "ready" | "preview" | "blocked";

export type DeploymentReadinessCheckId =
  | "security"
  | "database"
  | "data-source"
  | "scan-runtime"
  | "rate-limits";

export type DeploymentReadinessCheck = {
  detail: string;
  id: DeploymentReadinessCheckId;
  label: string;
  required: boolean;
  state: DeploymentReadinessState;
};

export type DeploymentReadinessReport = {
  checks: DeploymentReadinessCheck[];
  deployable: boolean;
  environment: {
    databaseDriver: string;
    marketDataProvider: string;
    persistenceScope: string;
    vercelEnv: string;
  };
  generatedAt: string;
  productionReady: boolean;
  secrets: {
    coinglassApiKey: {
      present: boolean;
      value?: never;
    };
    cronSecret: {
      present: boolean;
      validLength: boolean;
      value?: never;
    };
    databaseUrl: {
      present: boolean;
      value?: never;
    };
  };
  status: DeploymentReadinessState;
  summary: string;
};

export type BuildDeploymentReadinessReportOptions = {
  env?: DeploymentEnv;
  health: SystemHealthReport;
  now?: Date;
};

export type AdminDeploymentReadinessError = "readiness_secret_missing" | "unauthorized";

export type AdminDeploymentReadinessResponse = {
  body: AdminDeploymentReadinessResponseBody;
  status: number;
};

export type AdminDeploymentReadinessResponseBody =
  | {
      ok: true;
      report: DeploymentReadinessReport;
    }
  | {
      detail: string;
      error: AdminDeploymentReadinessError;
      ok: false;
    };

export type RunAdminDeploymentReadinessOptions = BuildDeploymentReadinessReportOptions & {
  authorization?: string | null;
};

const minCronSecretLength = 32;
const defaultScanRateLimit = "60";
const defaultJournalRateLimit = "30";

function trimmed(value?: string) {
  return value?.trim() ?? "";
}

function present(value?: string) {
  return trimmed(value).length > 0;
}

function envValue(env: DeploymentEnv, key: string, fallback: string) {
  return trimmed(env[key]) || fallback;
}

function positiveInteger(value: string) {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return parsed > 0 ? parsed : null;
}

function readinessRank(state: DeploymentReadinessState) {
  return {
    ready: 0,
    preview: 1,
    blocked: 2,
  }[state];
}

function strongestReadiness(checks: DeploymentReadinessCheck[]): DeploymentReadinessState {
  return checks.reduce<DeploymentReadinessState>(
    (current, item) => (readinessRank(item.state) > readinessRank(current) ? item.state : current),
    "ready",
  );
}

function readinessSummary(status: DeploymentReadinessState) {
  if (status === "blocked") {
    return "部署前检查存在阻断项，先修复后再公开发布。";
  }

  if (status === "preview") {
    return "当前可以作为公开预览站运行，但还不能称为真实行情生产版。";
  }

  return "部署前检查通过，可以作为真实行情生产版运行。";
}

function securityCheck(env: DeploymentEnv): DeploymentReadinessCheck {
  const secret = trimmed(env.CRON_SECRET);

  if (!secret) {
    return {
      detail: "缺少 CRON_SECRET，后台刷新、迁移和部署检查入口不能公开启用。",
      id: "security",
      label: "后台密钥",
      required: true,
      state: "blocked",
    };
  }

  if (secret.length < minCronSecretLength) {
    return {
      detail: `CRON_SECRET 已配置，但长度少于 ${minCronSecretLength} 位，建议换成随机长字符串。`,
      id: "security",
      label: "后台密钥",
      required: true,
      state: "blocked",
    };
  }

  return {
    detail: "CRON_SECRET 已配置，后台入口可以使用 Bearer token 保护。",
    id: "security",
    label: "后台密钥",
    required: true,
    state: "ready",
  };
}

function databaseCheck(env: DeploymentEnv, health: SystemHealthReport): DeploymentReadinessCheck {
  const databaseUrlPresent = present(env.DATABASE_URL) || present(env.POSTGRES_URL);

  if (!databaseUrlPresent) {
    return {
      detail: "缺少 DATABASE_URL 或 POSTGRES_URL，刷新、日记和段位数据不能永久保存。",
      id: "database",
      label: "Neon 持久化",
      required: true,
      state: "blocked",
    };
  }

  if (!health.persistence.durable || health.persistence.mode !== "database") {
    return {
      detail: `检测到数据库地址，但当前仍是 ${health.persistence.mode} 模式：${health.persistence.detail}`,
      id: "database",
      label: "Neon 持久化",
      required: true,
      state: "blocked",
    };
  }

  if (health.persistence.databaseStatus !== "ready") {
    return {
      detail: `数据库驱动未就绪：${health.persistence.detail}`,
      id: "database",
      label: "Neon 持久化",
      required: true,
      state: "blocked",
    };
  }

  return {
    detail: `数据库已就绪，driver=${health.persistence.databaseDriver}，scope=${health.persistence.scope}。`,
    id: "database",
    label: "Neon 持久化",
    required: true,
    state: "ready",
  };
}

function dataSourceCheck(env: DeploymentEnv, health: SystemHealthReport): DeploymentReadinessCheck {
  const provider = envValue(env, "MARKET_DATA_PROVIDER", "mock").toLowerCase();

  if (provider === "mock") {
    return {
      detail: "当前使用 mock 演示数据，可以预览 UI 和流程，但不能作为真实市场扫描。",
      id: "data-source",
      label: "行情数据源",
      required: true,
      state: "preview",
    };
  }

  if (provider !== "coinglass") {
    return {
      detail: `未知行情 provider：${provider}。当前只允许 mock 或 coinglass。`,
      id: "data-source",
      label: "行情数据源",
      required: true,
      state: "blocked",
    };
  }

  if (!present(env.COINGLASS_API_KEY)) {
    return {
      detail: "MARKET_DATA_PROVIDER=coinglass，但缺少 COINGLASS_API_KEY。",
      id: "data-source",
      label: "行情数据源",
      required: true,
      state: "blocked",
    };
  }

  if (
    health.dataSource.activeSource !== "coinglass" ||
    health.dataSource.status !== "ready" ||
    !health.dataSource.isRealtime
  ) {
    return {
      detail: `已配置 CoinGlass，但健康检查仍未确认真实数据：${health.dataSource.detail}`,
      id: "data-source",
      label: "行情数据源",
      required: true,
      state: "blocked",
    };
  }

  return {
    detail: "CoinGlass 数据源已启用，健康检查确认正在使用真实行情。",
    id: "data-source",
    label: "行情数据源",
    required: true,
    state: "ready",
  };
}

function scanRuntimeCheck(health: SystemHealthReport): DeploymentReadinessCheck {
  if (health.scan.status === "failed" || health.scan.freshness === "expired" || health.scan.freshness === "unknown") {
    return {
      detail: `扫描运行不健康：status=${health.scan.status}，freshness=${health.scan.freshness}。`,
      id: "scan-runtime",
      label: "扫描运行",
      required: true,
      state: "blocked",
    };
  }

  if (health.scan.freshness === "aging") {
    return {
      detail: `扫描结果已开始变旧，距离上次扫描约 ${health.scan.ageMinutes ?? "未知"} 分钟。`,
      id: "scan-runtime",
      label: "扫描运行",
      required: true,
      state: "preview",
    };
  }

  return {
    detail: `扫描新鲜，当前 cadence=${health.scan.cadenceMinutes} 分钟，候选数=${health.scan.candidateCount}。`,
    id: "scan-runtime",
    label: "扫描运行",
    required: true,
    state: "ready",
  };
}

function rateLimitCheck(env: DeploymentEnv): DeploymentReadinessCheck {
  const scanLimit = positiveInteger(envValue(env, "SCAN_API_RATE_LIMIT", defaultScanRateLimit));
  const journalLimit = positiveInteger(envValue(env, "JOURNAL_API_RATE_LIMIT", defaultJournalRateLimit));

  if (scanLimit === null || journalLimit === null) {
    return {
      detail: "SCAN_API_RATE_LIMIT 和 JOURNAL_API_RATE_LIMIT 必须是正整数。",
      id: "rate-limits",
      label: "接口限流",
      required: true,
      state: "blocked",
    };
  }

  return {
    detail: `限流已配置：scan=${scanLimit}/min，journal=${journalLimit}/min。`,
    id: "rate-limits",
    label: "接口限流",
    required: true,
    state: "ready",
  };
}

function errorResponse(
  status: number,
  body: Extract<AdminDeploymentReadinessResponseBody, { ok: false }>,
): AdminDeploymentReadinessResponse {
  return {
    body,
    status,
  };
}

export function authorizeDeploymentReadinessRequest({
  authorization,
  env = {},
}: {
  authorization?: string | null;
  env?: DeploymentEnv;
}): AdminDeploymentReadinessResponse | null {
  const secret = trimmed(env.CRON_SECRET);

  if (!secret) {
    return errorResponse(503, {
      detail: "Set CRON_SECRET before enabling the deployment readiness endpoint.",
      error: "readiness_secret_missing",
      ok: false,
    });
  }

  if (!isCronRequestAuthorized(authorization ?? null, env, { requireSecret: true })) {
    return errorResponse(401, {
      detail: "The readiness request must include the correct Bearer token.",
      error: "unauthorized",
      ok: false,
    });
  }

  return null;
}

export function buildDeploymentReadinessReport({
  env = {},
  health,
  now = new Date(),
}: BuildDeploymentReadinessReportOptions): DeploymentReadinessReport {
  const checks = [
    securityCheck(env),
    databaseCheck(env, health),
    dataSourceCheck(env, health),
    scanRuntimeCheck(health),
    rateLimitCheck(env),
  ];
  const status = strongestReadiness(checks);

  return {
    checks,
    deployable: status !== "blocked",
    environment: {
      databaseDriver: envValue(env, "DATABASE_DRIVER", health.persistence.databaseDriver),
      marketDataProvider: envValue(env, "MARKET_DATA_PROVIDER", "mock"),
      persistenceScope: envValue(env, "PERSISTENCE_SCOPE", health.persistence.scope),
      vercelEnv: envValue(env, "VERCEL_ENV", "local"),
    },
    generatedAt: now.toISOString(),
    productionReady: status === "ready",
    secrets: {
      coinglassApiKey: {
        present: present(env.COINGLASS_API_KEY),
      },
      cronSecret: {
        present: present(env.CRON_SECRET),
        validLength: trimmed(env.CRON_SECRET).length >= minCronSecretLength,
      },
      databaseUrl: {
        present: present(env.DATABASE_URL) || present(env.POSTGRES_URL),
      },
    },
    status,
    summary: readinessSummary(status),
  };
}

export async function runAdminDeploymentReadiness({
  authorization,
  env = {},
  health,
  now,
}: RunAdminDeploymentReadinessOptions): Promise<AdminDeploymentReadinessResponse> {
  const authorizationFailure = authorizeDeploymentReadinessRequest({ authorization, env });

  if (authorizationFailure) {
    return authorizationFailure;
  }

  return {
    body: {
      ok: true,
      report: buildDeploymentReadinessReport({ env, health, now }),
    },
    status: 200,
  };
}
