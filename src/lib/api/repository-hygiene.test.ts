import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function lines(path: string) {
  return new Set(
    readFileSync(resolve(process.cwd(), path), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
}

test("repository ignore files keep local agent tooling and preview screenshots out of deployable source", () => {
  const gitignore = lines(".gitignore");
  const vercelignore = lines(".vercelignore");
  const requiredPatterns = [
    ".agents/",
    ".codex/",
    "/chuan-quant-heatmap-v4.png",
    "/chuan-v31-main-desktop.png",
    "/chuan-v31-main-mobile.png",
    "/dribbble-quant-reference.png",
    "/flow-14-preview.png",
    "/flow-15-preview.png",
    "/flow-16-preview.png",
    "skills-lock.json",
  ];

  for (const pattern of requiredPatterns) {
    assert.ok(gitignore.has(pattern), `.gitignore missing ${pattern}`);
    assert.ok(vercelignore.has(pattern), `.vercelignore missing ${pattern}`);
  }
});

test("public radar shell does not label the live site as demo data", () => {
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/radar-workspace.tsx"),
    "utf8",
  );

  assert.equal(workspaceSource.includes("公开模板 · 演示数据 · 非实时扫描"), false);
  assert.match(workspaceSource, /CoinGlass/);
});

test("radar UI exposes premium pixel cockpit anchors without relying on prose", () => {
  const workspaceSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/radar-workspace.tsx"),
    "utf8",
  );
  const petSource = readFileSync(
    resolve(process.cwd(), "src/components/radar/pixel-s680.tsx"),
    "utf8",
  );
  const cssSource = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  assert.match(workspaceSource, /studio-scan-grid/);
  assert.match(workspaceSource, /signal-rhythm/);
  assert.match(petSource, /s680-dashboard/);
  assert.match(petSource, /s680-vital/);
  assert.match(cssSource, /\.studio-scan-grid/);
  assert.match(cssSource, /\.signal-rhythm/);
  assert.match(cssSource, /\.s680-dashboard/);
  assert.match(cssSource, /prefers-reduced-motion/);
});

test("external scan scheduler calls the protected scan endpoint without hard-coded secrets", () => {
  const workflowSource = readFileSync(
    resolve(process.cwd(), ".github/workflows/chuan-scan-cron.yml"),
    "utf8",
  );

  assert.match(workflowSource, /cron:\s*["']\*\/30 \* \* \* \*["']/);
  assert.match(workflowSource, /workflow_dispatch:/);
  assert.match(workflowSource, /-X POST "\$CHUAN_SCAN_URL"/);
  assert.match(workflowSource, /Authorization: Bearer \$CHUAN_CRON_SECRET/);
  assert.match(workflowSource, /secrets\.CHUAN_SCAN_URL/);
  assert.match(workflowSource, /secrets\.CHUAN_CRON_SECRET/);
  assert.doesNotMatch(workflowSource, /web-brown-rho-95\.vercel\.app/);
  assert.doesNotMatch(workflowSource, /CRON_SECRET=/);
});
