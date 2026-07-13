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

test("scanner worker rejects served_cache even when the API responds with HTTP 200", async () => {
  const requests = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      requests.push({ body, method: request.method, url: request.url });
      response.writeHead(200, { "content-type": "application/json" });

      if (request.url === "/api/scan") {
        response.end(JSON.stringify({
          error: "provider rate limit",
          metadata: {
            generatedAt: "2026-07-13T12:00:00.000Z",
            id: "cached-scan",
            runtime: {
              scanCompletedAt: "2026-07-13T12:00:00.000Z",
            },
          },
          ok: false,
          status: "served_cache",
        }));
        return;
      }

      response.end(JSON.stringify({ ok: true }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.equal(typeof address, "object");

  const child = spawn(process.execPath, [
    new URL("./protected-api-worker.mjs", import.meta.url).pathname,
    "scanner",
  ], {
    env: {
      ...process.env,
      APP_INTERNAL_URL: `http://127.0.0.1:${address.port}`,
      CRON_SECRET: "test-only-secret",
      SCANNER_INTERVAL_SECONDS: "60",
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
      request.url === "/api/admin/runtime/heartbeat"
      && request.body.includes('"status":"error"')
      && request.body.includes('"task":"scheduled-scan"')
    )));
    child.kill("SIGTERM");
    const [code, signal] = await once(child, "exit");

    assert.equal(code, null, stderr);
    assert.equal(signal, "SIGTERM");
    assert.match(stdout, /"scheduleMode":"fixed_rate_skip_missed"/);
    assert.match(stdout, /"message":"task-failed"/);
    assert.match(stdout, /"resultStatus":"served_cache"/);
    assert.doesNotMatch(stdout, /"message":"task-ok"[^\n]*"task":"scheduled-scan"/);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    server.close();
    await once(server, "close");
  }
});
