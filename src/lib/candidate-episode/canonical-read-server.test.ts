import assert from "node:assert/strict";
import test from "node:test";
import { createCandidateCanonicalReadServer } from "./canonical-read-server";
import type { JournalEvent } from "../analysis/types";

test("server composition fails closed before touching Legacy when monitor DB is unavailable", async () => {
  let legacyReads = 0;
  const adapter = createCandidateCanonicalReadServer({
    repository: {
      async listJournalEvents(): Promise<JournalEvent[]> {
        legacyReads += 1;
        return [];
      },
    },
    transactions: null,
  });
  const result = await adapter.execute(new URLSearchParams());
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.ok, false);
  assert.deepEqual(result.body.blockers, ["candidate_read_trusted_context_invalid"]);
  assert.equal(legacyReads, 0);
});

test("server composition rejects public authority controls before dependency reads", async () => {
  const adapter = createCandidateCanonicalReadServer({
    repository: { async listJournalEvents() { return []; } },
    transactions: null,
  });
  const result = await adapter.execute(new URLSearchParams("phase=canonical&releaseId=forged"));
  assert.equal(result.statusCode, 400);
  assert.equal(result.body.ok, false);
  assert.deepEqual(result.body.blockers, [
    "candidate_read_query_unknown:phase",
    "candidate_read_query_unknown:releaseId",
  ]);
});
