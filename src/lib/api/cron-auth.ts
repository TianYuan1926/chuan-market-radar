export type CronAuthEnv = {
  CRON_SECRET?: string;
  NODE_ENV?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
};

export type CronAuthOptions = {
  requireSecret?: boolean;
};

function trimmed(value?: string) {
  return value?.trim() ?? "";
}

function isHostedRuntime(env: CronAuthEnv) {
  return env.NODE_ENV === "production" ||
    env.VERCEL === "1" ||
    env.VERCEL_ENV === "production" ||
    env.VERCEL_ENV === "preview";
}

export function isCronRequestAuthorized(
  authorization: string | null,
  env: CronAuthEnv = process.env,
  options: CronAuthOptions = {},
) {
  const expectedSecret = trimmed(env.CRON_SECRET);

  if (!expectedSecret) {
    if (options.requireSecret) {
      return false;
    }

    return !isHostedRuntime(env);
  }

  return authorization === `Bearer ${expectedSecret}`;
}
