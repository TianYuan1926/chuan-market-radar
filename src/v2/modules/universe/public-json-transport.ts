import { createHash } from "node:crypto";
import type { ProviderFailure } from "./catalog-types";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export type PublicJsonSuccess = {
  bodyBytes?: number;
  bodyDigest?: string;
  data: unknown;
  ok: true;
  rawBody?: Uint8Array;
  receivedAt: string;
  status: number;
};

export type PublicJsonFailure = {
  failure: ProviderFailure;
  ok: false;
  receivedAt: string;
  status: number | null;
};

export type PublicJsonResult = PublicJsonSuccess | PublicJsonFailure;

export type PublicJsonRequest = {
  allowedHost: string;
  captureBody?: boolean;
  maxResponseBytes?: number;
  timeoutMs?: number;
  url: string;
};

export type PublicJsonTransport = (
  request: PublicJsonRequest,
) => Promise<PublicJsonResult>;

function failure(
  kind: ProviderFailure["kind"],
  reasonCode: string,
  receivedAt: string,
  status: number | null,
): PublicJsonFailure {
  return {
    failure: { kind, reasonCode },
    ok: false,
    receivedAt,
    status,
  };
}

async function readBoundedBody(
  response: Response,
  maxResponseBytes: number,
  captureBody: boolean,
): Promise<Readonly<{
  bodyBytes?: number;
  bodyDigest?: string;
  rawBody?: Uint8Array;
  text: string;
}> | null> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    Number.isFinite(Number(declaredLength)) &&
    Number(declaredLength) > maxResponseBytes
  ) {
    return null;
  }

  if (response.body === null) {
    const rawBody = new Uint8Array();
    return {
      ...(captureBody
        ? {
          bodyBytes: 0,
          bodyDigest:
            `sha256:${createHash("sha256").update(rawBody).digest("hex")}`,
          rawBody,
        }
        : {}),
      text: "",
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const digest = captureBody ? createHash("sha256") : null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  let text = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    total += chunk.value.byteLength;
    if (total > maxResponseBytes) {
      await reader.cancel();
      return null;
    }
    digest?.update(chunk.value);
    if (captureBody) {
      chunks.push(Uint8Array.from(chunk.value));
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  text += decoder.decode();
  const rawBody = captureBody ? new Uint8Array(total) : undefined;
  if (rawBody !== undefined) {
    let offset = 0;
    for (const chunk of chunks) {
      rawBody.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }
  return {
    ...(rawBody === undefined || digest === null
      ? {}
      : {
        bodyBytes: total,
        bodyDigest: `sha256:${digest.digest("hex")}`,
        rawBody,
      }),
    text,
  };
}

export function createPublicJsonTransport(
  fetchImplementation: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): PublicJsonTransport {
  return async (request) => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return failure("INVALID", "invalid_provider_url", now().toISOString(), null);
    }

    if (
      url.protocol !== "https:" ||
      url.hostname !== request.allowedHost ||
      url.username !== "" ||
      url.password !== ""
    ) {
      return failure(
        "INVALID",
        "provider_url_outside_allowlist",
        now().toISOString(),
        null,
      );
    }

    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxResponseBytes =
      request.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs <= 0 ||
      timeoutMs > MAX_TIMEOUT_MS ||
      !Number.isSafeInteger(maxResponseBytes) ||
      maxResponseBytes <= 0 ||
      maxResponseBytes > MAX_RESPONSE_BYTES
    ) {
      return failure(
        "INVALID",
        "invalid_transport_limits",
        now().toISOString(),
        null,
      );
    }

    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetchImplementation(url, {
        cache: "no-store",
        credentials: "omit",
        headers: { accept: "application/json" },
        method: "GET",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: abortController.signal,
      });
      const receivedAt = now().toISOString();

      if (response.status === 429) {
        return failure("RATE_LIMITED", "provider_http_429", receivedAt, 429);
      }
      if (response.status === 401 || response.status === 403) {
        return failure(
          "AUTH_ERROR",
          "provider_http_auth_error",
          receivedAt,
          response.status,
        );
      }
      if (!response.ok) {
        return failure(
          "TRANSPORT_ERROR",
          "provider_http_error",
          receivedAt,
          response.status,
        );
      }

      const body = await readBoundedBody(
        response,
        maxResponseBytes,
        request.captureBody === true,
      );
      if (body === null) {
        return failure(
          "INVALID",
          "provider_response_too_large",
          receivedAt,
          response.status,
        );
      }

      try {
        return {
          ...(body.bodyDigest === undefined
            ? {}
            : {
              bodyBytes: body.bodyBytes,
              bodyDigest: body.bodyDigest,
            }),
          data: JSON.parse(body.text) as unknown,
          ok: true,
          ...(body.rawBody === undefined ? {} : { rawBody: body.rawBody }),
          receivedAt,
          status: response.status,
        };
      } catch {
        return failure(
          "INVALID",
          "provider_json_invalid",
          receivedAt,
          response.status,
        );
      }
    } catch (error) {
      return failure(
        "TRANSPORT_ERROR",
        error instanceof Error && error.name === "AbortError"
          ? "provider_timeout"
          : "provider_request_failed",
        now().toISOString(),
        null,
      );
    } finally {
      clearTimeout(timer);
    }
  };
}
