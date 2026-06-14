export type VercelDeployTarget = "development" | "preview" | "production";
export type VercelEnvSensitivity = "public" | "server" | "secret";

type VercelEnv = Record<string, string | undefined>;

export type VercelEnvVariablePlan = {
  description: string;
  key: string;
  present: boolean;
  required: boolean;
  safeValue?: string;
  sensitivity: VercelEnvSensitivity;
};

export type VercelEnvPlan = {
  missingRequired: string[];
  ready: boolean;
  target: VercelDeployTarget;
  variables: VercelEnvVariablePlan[];
  warnings: string[];
};

export type BuildVercelEnvPlanOptions = {
  env?: VercelEnv;
  target?: VercelDeployTarget;
};

type EnvDefinition = {
  defaultValue?: string;
  description: string;
  key: string;
  requiredFor: VercelDeployTarget[];
  sensitivity: VercelEnvSensitivity;
};

const envDefinitions: EnvDefinition[] = [
  {
    defaultValue: "川",
    description: "站点公开名称。",
    key: "NEXT_PUBLIC_SITE_NAME",
    requiredFor: ["development", "preview", "production"],
    sensitivity: "public",
  },
  {
    defaultValue: "mock",
    description: "行情数据源，预览可用 mock，生产必须切到 coinglass。",
    key: "MARKET_DATA_PROVIDER",
    requiredFor: ["development", "preview", "production"],
    sensitivity: "server",
  },
  {
    defaultValue: "60",
    description: "扫描接口每分钟限流。",
    key: "SCAN_API_RATE_LIMIT",
    requiredFor: ["development", "preview", "production"],
    sensitivity: "server",
  },
  {
    defaultValue: "30",
    description: "交易日记写入接口每分钟限流。",
    key: "JOURNAL_API_RATE_LIMIT",
    requiredFor: ["development", "preview", "production"],
    sensitivity: "server",
  },
  {
    description: "后台刷新、迁移、部署检查接口的 Bearer token。",
    key: "CRON_SECRET",
    requiredFor: ["preview", "production"],
    sensitivity: "secret",
  },
  {
    defaultValue: "public-demo",
    description: "公开站点的数据命名空间。",
    key: "PERSISTENCE_SCOPE",
    requiredFor: ["development", "preview", "production"],
    sensitivity: "server",
  },
  {
    defaultValue: "neon",
    description: "数据库驱动，当前方案使用 neon。",
    key: "DATABASE_DRIVER",
    requiredFor: ["preview", "production"],
    sensitivity: "server",
  },
  {
    description: "Neon Postgres 连接串。",
    key: "DATABASE_URL",
    requiredFor: ["preview", "production"],
    sensitivity: "secret",
  },
  {
    description: "CoinGlass 真实行情 API Key。",
    key: "COINGLASS_API_KEY",
    requiredFor: ["production"],
    sensitivity: "secret",
  },
  {
    defaultValue: "BTC,ETH,SOL,ENA,SUI,ONDO,TIA",
    description: "CoinGlass 低频轮询基础币池。",
    key: "COINGLASS_BASE_ASSETS",
    requiredFor: ["production"],
    sensitivity: "server",
  },
  {
    defaultValue: "3",
    description: "每个扫描窗口请求的基础币数量。",
    key: "COINGLASS_BATCH_SIZE",
    requiredFor: ["production"],
    sensitivity: "server",
  },
  {
    defaultValue: "300",
    description: "CoinGlass 主扫描每日请求预算，用于自动压缩批次，业余会员阶段建议先保守。",
    key: "COINGLASS_DAILY_REQUEST_BUDGET",
    requiredFor: ["production"],
    sensitivity: "server",
  },
];

function trimmed(value?: string) {
  return value?.trim() ?? "";
}

function visibleValue(definition: EnvDefinition, env: VercelEnv) {
  if (definition.sensitivity === "secret") {
    return undefined;
  }

  return trimmed(env[definition.key]) || definition.defaultValue;
}

function isPresent(definition: EnvDefinition, env: VercelEnv) {
  return Boolean(trimmed(env[definition.key]) || definition.defaultValue);
}

function targetName(target: VercelDeployTarget) {
  if (target === "production") {
    return "production";
  }

  if (target === "development") {
    return "development";
  }

  return "preview";
}

function buildWarnings({
  env,
  target,
}: {
  env: VercelEnv;
  target: VercelDeployTarget;
}) {
  const provider = trimmed(env.MARKET_DATA_PROVIDER) || "mock";
  const warnings: string[] = [];

  if (target === "production" && provider !== "coinglass") {
    warnings.push("production 不能继续使用 mock 数据源，需要 MARKET_DATA_PROVIDER=coinglass。");
  }

  if (target !== "production" && provider === "mock") {
    warnings.push("mock 数据源只适合公开预览和 UI 流程验证，不能当成真实市场扫描。");
  }

  return warnings;
}

export function buildVercelEnvPlan({
  env = {},
  target = "preview",
}: BuildVercelEnvPlanOptions = {}): VercelEnvPlan {
  const variables = envDefinitions.map<VercelEnvVariablePlan>((definition) => {
    const required = definition.requiredFor.includes(target);

    return {
      description: definition.description,
      key: definition.key,
      present: isPresent(definition, env),
      required,
      safeValue: visibleValue(definition, env),
      sensitivity: definition.sensitivity,
    };
  });
  const missingRequired = variables
    .filter((variable) => variable.required && !variable.present)
    .map((variable) => variable.key);
  const provider = trimmed(env.MARKET_DATA_PROVIDER) || "mock";

  if (target === "production" && provider !== "coinglass") {
    missingRequired.push("MARKET_DATA_PROVIDER=coinglass");
  }

  return {
    missingRequired,
    ready: missingRequired.length === 0,
    target,
    variables,
    warnings: buildWarnings({ env, target }),
  };
}

export function buildVercelEnvCliSummary(plan: VercelEnvPlan) {
  const envTarget = targetName(plan.target);
  const header = plan.ready
    ? `Vercel ${envTarget} 环境变量计划：可继续部署。`
    : `Vercel ${envTarget} 环境变量计划：仍缺少 ${plan.missingRequired.join(", ")}。`;
  const lines = [
    header,
    "",
    "需要在 Vercel Project Settings 或 CLI 添加：",
    ...plan.variables
      .filter((variable) => variable.required || variable.present)
      .map((variable) => {
        const status = variable.present ? "已设置" : "缺失";
        const value = variable.safeValue ? `=${variable.safeValue}` : "";

        return `- ${status} ${variable.key}${value} (${variable.sensitivity}) -> vercel env add ${variable.key} ${envTarget}`;
      }),
  ];

  if (plan.warnings.length > 0) {
    lines.push("", "注意：", ...plan.warnings.map((warning) => `- ${warning}`));
  }

  return `${lines.join("\n")}\n`;
}
