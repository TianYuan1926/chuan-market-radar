import { mockJournalEvents } from "../../data/mock-signals";
import { createDatabaseAwarePersistenceRepository } from "./database-client";
import { createNeonSqlClient } from "./neon-client";

const neonSqlClient = createNeonSqlClient({ env: process.env });
const appPersistenceBundle = createDatabaseAwarePersistenceRepository({
  client: neonSqlClient.client,
  env: process.env,
  initialJournalEvents: mockJournalEvents,
});

export const appPersistenceRepository = appPersistenceBundle.repository;
export const appPersistenceDiagnostics = appPersistenceBundle.diagnostics;
