export type PrivateSessionEnv = {
  [key: string]: string | undefined;
  CHUAN_PRIVATE_MODE_ENABLED?: string;
  CHUAN_SESSION_COOKIE_NAME?: string;
  CHUAN_SESSION_PASSWORD?: string;
  CHUAN_SESSION_SECRET?: string;
  CHUAN_SESSION_SECRET_PREVIOUS?: string;
  CHUAN_SESSION_TTL_SECONDS?: string;
};

export type PrivateSessionConfig = {
  cookieName: string;
  configurationIssues: string[];
  enabled: boolean;
  configured: boolean;
  rotationReady: boolean;
  ttlSeconds: number;
};

export type PrivateSessionPayload = {
  exp: number;
  iat: number;
  nonce: string;
  sub: string;
  v: "private-session.v1";
};

const defaultCookieName = "chuan_session";
const defaultSessionTtlSeconds = 7 * 24 * 60 * 60;
const minimumPasswordBytes = 16;
const minimumSecretBytes = 32;
const maximumClockSkewMs = 30_000;
const cookieNamePattern = /^[A-Za-z0-9_-]{1,64}$/u;
const noncePattern = /^[A-Za-z0-9_-]{22}$/u;

function truthy(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function cleanText(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed || "";
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function ttlSeconds(value: string | undefined) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return defaultSessionTtlSeconds;
  }

  return Math.min(Math.max(Math.floor(parsed), 60), 60 * 60 * 24 * 30);
}

function utf8(value: string) {
  return new TextEncoder().encode(value);
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function base64UrlEncodeJson(value: unknown) {
  return bytesToBase64Url(utf8(JSON.stringify(value)));
}

function base64UrlDecodeJson<T>(value: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T;
  } catch {
    return null;
  }
}

function randomNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  return bytesToBase64Url(bytes);
}

async function hmacSha256(message: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    utf8(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, utf8(message));

  return bytesToBase64Url(new Uint8Array(signature));
}

function constantTimeEqual(left: string, right: string) {
  let diff = left.length ^ right.length;
  const max = Math.max(left.length, right.length);

  for (let index = 0; index < max; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
}

export function privateSessionConfig(env: PrivateSessionEnv = {}): PrivateSessionConfig {
  const enabled = truthy(env.CHUAN_PRIVATE_MODE_ENABLED);
  const configuredCookieName = cleanText(env.CHUAN_SESSION_COOKIE_NAME) || defaultCookieName;
  const password = cleanText(env.CHUAN_SESSION_PASSWORD);
  const secret = cleanText(env.CHUAN_SESSION_SECRET);
  const previousSecret = cleanText(env.CHUAN_SESSION_SECRET_PREVIOUS);
  const configurationIssues = [
    !cookieNamePattern.test(configuredCookieName) ? "cookie_name_invalid" : null,
    !password ? "password_missing" : null,
    password && byteLength(password) < minimumPasswordBytes ? "password_too_short" : null,
    !secret ? "secret_missing" : null,
    secret && byteLength(secret) < minimumSecretBytes ? "secret_too_short" : null,
    secret && password && secret === password ? "secret_matches_password" : null,
    previousSecret && byteLength(previousSecret) < minimumSecretBytes
      ? "previous_secret_too_short"
      : null,
    previousSecret && previousSecret === secret ? "previous_secret_matches_current" : null,
  ].filter((issue): issue is string => Boolean(issue));

  return {
    cookieName: cookieNamePattern.test(configuredCookieName) ? configuredCookieName : defaultCookieName,
    configurationIssues,
    configured: configurationIssues.length === 0,
    enabled,
    rotationReady: Boolean(previousSecret) && configurationIssues.length === 0,
    ttlSeconds: ttlSeconds(env.CHUAN_SESSION_TTL_SECONDS),
  };
}

export function isPrivateModeEnabled(env: PrivateSessionEnv = {}) {
  return privateSessionConfig(env).enabled;
}

export function verifyPrivatePassword(password: string, env: PrivateSessionEnv = {}) {
  const expected = cleanText(env.CHUAN_SESSION_PASSWORD);
  const config = privateSessionConfig(env);

  return config.configured && Boolean(expected) && constantTimeEqual(password, expected);
}

export async function createPrivateSessionToken(
  subject: string,
  env: PrivateSessionEnv = {},
  now = new Date(),
) {
  const secret = cleanText(env.CHUAN_SESSION_SECRET);
  const config = privateSessionConfig(env);

  if (!secret || !config.configured) {
    return null;
  }

  const payload: PrivateSessionPayload = {
    exp: now.getTime() + config.ttlSeconds * 1000,
    iat: now.getTime(),
    nonce: randomNonce(),
    sub: subject.trim() || "operator",
    v: "private-session.v1",
  };
  const encodedPayload = base64UrlEncodeJson(payload);
  const signature = await hmacSha256(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export async function verifyPrivateSessionToken(
  token: string | undefined | null,
  env: PrivateSessionEnv = {},
  now = new Date(),
) {
  const config = privateSessionConfig(env);
  const secret = cleanText(env.CHUAN_SESSION_SECRET);
  const previousSecret = cleanText(env.CHUAN_SESSION_SECRET_PREVIOUS);

  if (!token || !secret || !config.configured) {
    return null;
  }

  const [encodedPayload, signature, extra] = token.split(".");

  if (!encodedPayload || !signature || extra !== undefined) {
    return null;
  }

  const [expectedSignature, previousExpectedSignature] = await Promise.all([
    hmacSha256(encodedPayload, secret),
    hmacSha256(encodedPayload, previousSecret || secret),
  ]);

  const currentMatches = constantTimeEqual(signature, expectedSignature);
  const previousMatches = Boolean(previousSecret) &&
    constantTimeEqual(signature, previousExpectedSignature);

  if (!currentMatches && !previousMatches) {
    return null;
  }

  const payload = base64UrlDecodeJson<PrivateSessionPayload>(encodedPayload);

  if (!payload ||
    Object.keys(payload).sort().join(",") !== "exp,iat,nonce,sub,v" ||
    payload.v !== "private-session.v1" ||
    typeof payload.exp !== "number" ||
    !Number.isSafeInteger(payload.exp) ||
    typeof payload.iat !== "number" ||
    !Number.isSafeInteger(payload.iat) ||
    typeof payload.nonce !== "string" ||
    !noncePattern.test(payload.nonce) ||
    typeof payload.sub !== "string" ||
    !payload.sub.trim() ||
    payload.sub.length > 128 ||
    payload.iat > now.getTime() + maximumClockSkewMs ||
    payload.exp <= payload.iat ||
    payload.exp - payload.iat > config.ttlSeconds * 1000 ||
    payload.exp <= now.getTime()) {
    return null;
  }

  return payload;
}
