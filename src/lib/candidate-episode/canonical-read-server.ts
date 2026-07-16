import { appPersistenceRepository } from "../persistence/app-repository";
import type { PersistenceRepository } from "../persistence/persistence-store";
import { createCandidateRuntimeDatabase } from "./candidate-runtime-database";
import { CandidateCanonicalReadModel } from "./canonical-read-model";
import { CandidateCanonicalReadOracleCoordinator } from "./canonical-read-oracle";
import {
  CandidateCanonicalApiRouteAdapter,
  type CandidateReadRouteAdapterDependencies,
} from "./canonical-read-route-adapter";
import {
  CandidateTrustedReadContextProvider,
  type CandidateTrustedReadContext,
} from "./canonical-read-trusted-context";
import type { PostgresTransactionAdapter } from "./transaction-adapter";

type CandidateCanonicalReadServerRepository = Pick<PersistenceRepository, "listJournalEvents">;

type CandidateCanonicalReadServerDependencies = Readonly<{
  env?: Record<string, string | undefined>;
  readAuthorityManifest?: (context: Readonly<{ signal: AbortSignal }>) => Promise<string>;
  repository: CandidateCanonicalReadServerRepository;
  transactions: PostgresTransactionAdapter | null;
}>;

function aborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new DOMException("Candidate read aborted", "AbortError");
  }
}

function unavailableDependencies(reason: string): CandidateReadRouteAdapterDependencies {
  const reject = async () => {
    throw new Error(reason);
  };
  return {
    readTrustedContext: reject,
    readLegacyEvents: reject,
    readCandidate: reject,
    compareCandidateReference: reject,
  };
}

export function createCandidateCanonicalReadServer({
  env = process.env,
  readAuthorityManifest,
  repository,
  transactions,
}: CandidateCanonicalReadServerDependencies) {
  if (!transactions) {
    return new CandidateCanonicalApiRouteAdapter(
      unavailableDependencies("candidate_monitor_database_unavailable"),
    );
  }

  const context = new CandidateTrustedReadContextProvider({
    env,
    readAuthorityManifest,
    transactions,
  });
  const candidate = new CandidateCanonicalReadModel(transactions);
  const oracle = new CandidateCanonicalReadOracleCoordinator(transactions);
  return new CandidateCanonicalApiRouteAdapter({
    readTrustedContext: ({ signal }): Promise<CandidateTrustedReadContext> =>
      context.read({ signal }),
    async readLegacyEvents({ maximumEvents, signal }) {
      aborted(signal);
      const events = await repository.listJournalEvents(maximumEvents);
      aborted(signal);
      return events.slice(0, maximumEvents);
    },
    async readCandidate({ cursor, limit, policy, signal }) {
      aborted(signal);
      return candidate.read({ cursor, limit, policy, signal });
    },
    async compareCandidateReference({ cursor, limit, policy, signal }) {
      aborted(signal);
      return oracle.compare({ cursor, limit, policy, signal });
    },
  });
}

let defaultAdapter: CandidateCanonicalApiRouteAdapter | null = null;

export function getCandidateCanonicalReadServer() {
  if (defaultAdapter) return defaultAdapter;
  const runtime = createCandidateRuntimeDatabase({ purpose: "monitor" });
  defaultAdapter = createCandidateCanonicalReadServer({
    repository: appPersistenceRepository,
    transactions: runtime.transactions,
  });
  return defaultAdapter;
}
