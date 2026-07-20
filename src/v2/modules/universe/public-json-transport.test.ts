import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createPublicJsonTransport } from "./public-json-transport";

const NOW = new Date("2026-01-15T00:00:00.000Z");

test("uses only credential-free GET against the exact HTTPS allowlist", async () => {
  const observed: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const transport = createPublicJsonTransport(async (input, init) => {
    observed.push({ input, init });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  }, () => NOW);

  const result = await transport({
    allowedHost: "example.com",
    url: "https://example.com/public",
  });

  assert.equal(result.ok, true);
  const request = observed[0];
  assert.ok(request);
  assert.equal(request.init?.method, "GET");
  assert.equal(request.init?.credentials, "omit");
  assert.equal(request.init?.redirect, "error");
  assert.equal(new URL(String(request.input)).hostname, "example.com");
  assert.equal(result.ok && result.rawBody, undefined);
  assert.equal(result.ok && result.bodyDigest, undefined);
  assert.equal(result.ok && result.bodyBytes, undefined);
});

test("optionally exposes the exact response bytes with their measured digest", async () => {
  const body = new TextEncoder().encode('{"unicode":"\u4e2d\u6587","n":1}');
  const transport = createPublicJsonTransport(async () => new Response(body, {
    headers: { "content-type": "application/json" },
    status: 200,
  }), () => NOW);

  const result = await transport({
    allowedHost: "example.com",
    captureBody: true,
    url: "https://example.com/public",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.bodyBytes, body.byteLength);
  assert.equal(
    result.bodyDigest,
    `sha256:${createHash("sha256").update(body).digest("hex")}`,
  );
  assert.deepEqual(result.rawBody, body);
});

test("rejects a host escape before fetch is called", async () => {
  let called = false;
  const transport = createPublicJsonTransport(async () => {
    called = true;
    return new Response("{}");
  }, () => NOW);

  const result = await transport({
    allowedHost: "example.com",
    url: "https://attacker.example/public",
  });

  assert.equal(called, false);
  assert.equal(result.ok, false);
  assert.equal(
    result.ok ? null : result.failure.reasonCode,
    "provider_url_outside_allowlist",
  );
});

test("classifies 429, invalid JSON and oversized bodies without payload echo", async () => {
  const responses = [
    new Response("rate body must not surface", { status: 429 }),
    new Response("not-json", { status: 200 }),
    new Response("123456", {
      headers: { "content-length": "6" },
      status: 200,
    }),
  ];
  const transport = createPublicJsonTransport(async () => responses.shift()!, () => NOW);

  const rateLimited = await transport({
    allowedHost: "example.com",
    url: "https://example.com/a",
  });
  const invalidJson = await transport({
    allowedHost: "example.com",
    url: "https://example.com/b",
  });
  const oversized = await transport({
    allowedHost: "example.com",
    maxResponseBytes: 5,
    url: "https://example.com/c",
  });

  assert.deepEqual(
    [rateLimited, invalidJson, oversized].map((result) =>
      result.ok ? null : result.failure.reasonCode),
    ["provider_http_429", "provider_json_invalid", "provider_response_too_large"],
  );
  assert.equal(JSON.stringify([rateLimited, invalidJson]).includes("not-json"), false);
  assert.equal(
    JSON.stringify([rateLimited, invalidJson]).includes("rate body"),
    false,
  );
});

test("aborts a hung request at its explicit timeout", async () => {
  const transport = createPublicJsonTransport(
    (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      });
    }),
    () => NOW,
  );

  const result = await transport({
    allowedHost: "example.com",
    timeoutMs: 5,
    url: "https://example.com/slow",
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.ok ? null : result.failure.reasonCode,
    "provider_timeout",
  );
});
