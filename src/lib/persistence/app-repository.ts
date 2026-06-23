import { mockJournalEvents } from "../../data/mock-signals";
import { createConfiguredSqlClient } from "./configured-sql-client";
import { createDatabaseAwarePersistenceRepository } from "./database-client";

const previewSeedEnabled = process.env.ENABLE_PREVIEW_SEED_DATA === "true";
const sqlClient = createConfiguredSqlClient({ env: process.env });
const appPersistenceBundle = createDatabaseAwarePersistenceRepository({
  client: sqlClient.client,
  env: process.env,
  initialJournalEvents: previewSeedEnabled ? mockJournalEvents : [],
});

export const appPersistenceRepository = appPersistenceBundle.repository;
export const appPersistenceDiagnostics = appPersistenceBundle.diagnostics;
