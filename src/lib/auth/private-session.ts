export type PrivateSessionEnv = {
  [key: string]: string | undefined;
  CHUAN_PRIVATE_MODE_ENABLED?: string;
  CHUAN_SESSION_COOKIE_NAME?: string;
  CHUAN_SESSION_PASSWORD?: string;
  CHUAN_SESSION_SECRET?: string;
  CHUAN_SESSION_TTL_SECONDS?: string;
};

export type PrivateSessionConfig = {
  cookieName: string;
  enabled: boolean;
  configured: boolean;
  ttlSeconds: number;
};

export type PrivateSessionPayload = {
  exp: number;
  iat: number;
  nonce: string;
  sub: string;
};

const defaultCookieName = "chuan_session";
const defaultSessionTtlSeconds = 7 * 24 * 60 * 60;

function truthy(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function cleanText(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed || "";
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

  return {
    cookieName: cleanText(env.CHUAN_SESSION_COOKIE_NAME) || defaultCookieName,
    configured: Boolean(cleanText(env.CHUAN_SESSION_PASSWORD) && cleanText(env.CHUAN_SESSION_SECRET)),
    enabled,
    ttlSeconds: ttlSeconds(env.CHUAN_SESSION_TTL_SECONDS),
  };
}

export function isPrivateModeEnabled(env: PrivateSessionEnv = {}) {
  return privateSessionConfig(env).enabled;
}

export function verifyPrivatePassword(password: string, env: PrivateSessionEnv = {}) {
  const expected = cleanText(env.CHUAN_SESSION_PASSWORD);

  return Boolean(expected) && constantTimeEqual(password, expected);
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
  const secret = cleanText(env.CHUAN_SESSION_SECRET);

  if (!token || !secret) {
    return null;
  }

  const [encodedPayload, signature, extra] = token.split(".");

  if (!encodedPayload || !signature || extra !== undefined) {
    return null;
  }

  const expectedSignature = await hmacSha256(encodedPayload, secret);

  if (!constantTimeEqual(signature, expectedSignature)) {
    return null;
  }

  const payload = base64UrlDecodeJson<PrivateSessionPayload>(encodedPayload);

  if (!payload || typeof payload.exp !== "number" || payload.exp <= now.getTime()) {
    return null;
  }

  return payload;
}
