import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";

function waitFor(predicate, timeoutMs = 8_000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error("worker test timed out"));
      }
    }, 25);
  });
}

test("candidate shadow worker runs the protected dormant endpoint and drains on SIGTERM", async () => {
  const requests = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      requests.push({
        authorization: request.headers.authorization ?? null,
        body,
        method: request.method,
        url: request.url,
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, mode: "dormant" }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.equal(typeof address, "object");

  const child = spawn(process.execPath, [
    new URL("./protected-api-worker.mjs", import.meta.url).pathname,
    "candidate-shadow",
  ], {
    env: {
      ...process.env,
      APP_INTERNAL_URL: `http://127.0.0.1:${address.port}`,
      CANDIDATE_SHADOW_INTERVAL_SECONDS: "60",
      CRON_SECRET: "test-only-secret",
      WORKER_IDLE_HEARTBEAT_SECONDS: "60",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  try {
    await waitFor(() => requests.some((request) => (
      request.url === "/api/admin/candidate-shadow/run"
    )));
    child.kill("SIGTERM");
    const [code, signal] = await once(child, "exit");

    assert.equal(code, 0, stderr);
    assert.equal(signal, null);
    assert.equal(requests.some((request) => (
      request.url === "/api/admin/candidate-shadow/run"
      && request.method === "POST"
      && request.authorization === "Bearer test-only-secret"
    )), true);
    assert.match(stdout, /"message":"shutdown-requested"/);
    assert.match(stdout, /"message":"worker-stopped"/);
    assert.equal(requests.some((request) => (
      request.url === "/api/admin/runtime/heartbeat"
      && request.body.includes("graceful shutdown complete")
    )), true);
    assert.doesNotMatch(stdout, /test-only-secret/);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    server.close();
    await once(server, "close");
  }
});
