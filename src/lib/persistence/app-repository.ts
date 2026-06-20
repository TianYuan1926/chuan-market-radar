import { mockJournalEvents } from "../../data/mock-signals";
import { createConfiguredSqlClient } from "./configured-sql-client";
import { createDatabaseAwarePersistenceRepository } from "./database-client";

const sqlClient = createConfiguredSqlClient({ env: process.env });
const appPersistenceBundle = createDatabaseAwarePersistenceRepository({
  client: sqlClient.client,
  env: process.env,
  initialJournalEvents: mockJournalEvents,
});

export const appPersistenceRepository = appPersistenceBundle.repository;
export const appPersistenceDiagnostics = appPersistenceBundle.diagnostics;
