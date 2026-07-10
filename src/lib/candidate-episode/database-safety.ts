export type RehearsalDatabaseHostClass = "ci" | "docker" | "local";

export type RehearsalDatabaseTarget = {
  databaseName: string;
  hostClass: RehearsalDatabaseHostClass;
  transport: "tcp" | "unix_socket";
};

export type RehearsalDatabaseSafetyReason =
  | "app_env"
  | "database_host"
  | "database_name"
  | "database_protocol"
  | "database_url_missing"
  | "environment"
  | "generic_database_env"
  | "node_env"
  | "production_override"
  | "rehearsal_flag";

export class RehearsalDatabaseSafetyError extends Error {
  constructor(readonly reason: RehearsalDatabaseSafetyReason) {
    super(`WP-G0.2 rehearsal database target rejected: ${reason}`);
    this.name = "RehearsalDatabaseSafetyError";
  }
}

type SafetyEnv = Record<string, string | undefined>;

const productionOverrideKeys = [
  "ALLOW_PRODUCTION_DATABASE",
  "CONFIRM_PRODUCTION",
  "PRODUCTION_OVERRIDE",
  "WP_G0_2_ALLOW_PRODUCTION",
] as const;

function hasValue(value: string | undefined) {
  return Boolean(value?.trim());
}

function classifyHost(url: URL): Pick<RehearsalDatabaseTarget, "hostClass" | "transport"> {
  const socketHost = url.searchParams.get("host")?.trim();

  if (socketHost) {
    if (!socketHost.startsWith("/tmp/wp_g0_2_rehearsal_")) {
      throw new RehearsalDatabaseSafetyError("database_host");
    }

    return {
      hostClass: "local",
      transport: "unix_socket",
    };
  }

  const hostname = url.hostname.toLowerCase();

  if (["127.0.0.1", "::1", "[::1]", "localhost"].includes(hostname)) {
    return {
      hostClass: "local",
      transport: "tcp",
    };
  }

  if (hostname === "wp-g0-2-rehearsal-postgres") {
    return {
      hostClass: "docker",
      transport: "tcp",
    };
  }

  if (hostname === "wp-g0-2-rehearsal-ci-postgres") {
    return {
      hostClass: "ci",
      transport: "tcp",
    };
  }

  throw new RehearsalDatabaseSafetyError("database_host");
}

export function assertRehearsalDatabaseTarget({
  environment,
  env,
}: {
  environment: string;
  env: SafetyEnv;
}): RehearsalDatabaseTarget {
  if (environment !== "rehearsal") {
    throw new RehearsalDatabaseSafetyError("environment");
  }

  if (env.APP_ENV !== "rehearsal") {
    throw new RehearsalDatabaseSafetyError("app_env");
  }

  if (env.NODE_ENV !== "test" && env.NODE_ENV !== "development") {
    throw new RehearsalDatabaseSafetyError("node_env");
  }

  if (env.WP_G0_2_REHEARSAL !== "true") {
    throw new RehearsalDatabaseSafetyError("rehearsal_flag");
  }

  if (productionOverrideKeys.some((key) => hasValue(env[key]))) {
    throw new RehearsalDatabaseSafetyError("production_override");
  }

  if (hasValue(env.DATABASE_URL) || hasValue(env.POSTGRES_URL)) {
    throw new RehearsalDatabaseSafetyError("generic_database_env");
  }

  const connectionString = env.WP_G0_2_REHEARSAL_DATABASE_URL?.trim();

  if (!connectionString) {
    throw new RehearsalDatabaseSafetyError("database_url_missing");
  }

  let url: URL;

  try {
    url = new URL(connectionString);
  } catch {
    throw new RehearsalDatabaseSafetyError("database_protocol");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new RehearsalDatabaseSafetyError("database_protocol");
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

  if (
    !/^wp_g0_2_rehearsal_[a-z0-9_]+$/.test(databaseName) ||
    /(^|_)(prod|production)($|_)/.test(databaseName)
  ) {
    throw new RehearsalDatabaseSafetyError("database_name");
  }

  return {
    databaseName,
    ...classifyHost(url),
  };
}
