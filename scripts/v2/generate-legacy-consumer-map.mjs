import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = process.cwd();
const require = createRequire(import.meta.url);
const { buildLegacyConsumerMap } = require(
  resolve(
    repositoryRoot,
    ".tmp/market-tests/v2/governance/legacy-consumer-map.js",
  ),
);

const atlasPath = resolve(
  repositoryRoot,
  "docs/architecture/v2/legacy-capability-atlas.v1.json",
);
const policyPath = resolve(
  repositoryRoot,
  "docs/architecture/v2/LEGACY_EXTRACTION_POLICY_V1.json",
);
const outputPath = resolve(
  repositoryRoot,
  "docs/architecture/v2/legacy-consumer-map.v1.json",
);

const atlas = JSON.parse(await readFile(atlasPath, "utf8"));
const policy = JSON.parse(await readFile(policyPath, "utf8"));
const map = buildLegacyConsumerMap(repositoryRoot, atlas, policy);

await writeFile(outputPath, `${JSON.stringify(map, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify({
    status: "generated",
    output: "docs/architecture/v2/legacy-consumer-map.v1.json",
    totals: map.totals,
  }),
);
