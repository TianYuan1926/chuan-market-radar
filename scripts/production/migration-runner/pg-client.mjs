import { createRequire } from "node:module";
import { join } from "node:path";

const requireCandidates = [createRequire(import.meta.url)];
const applicationRoot = process.env.MARKET_RADAR_APPLICATION_ROOT;

if (applicationRoot) {
  requireCandidates.push(createRequire(join(applicationRoot, "package.json")));
}

let pg;
for (const requireCandidate of requireCandidates) {
  try {
    pg = requireCandidate("pg");
    break;
  } catch (error) {
    if (error?.code !== "MODULE_NOT_FOUND") {
      throw error;
    }
  }
}

if (!pg) {
  throw new Error("approved_pg_runtime_unavailable");
}

export default pg;
