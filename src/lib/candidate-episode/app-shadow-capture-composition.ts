import { appPersistenceRepository } from "../persistence/app-repository";
import { createCandidateRuntimeDatabase } from "./candidate-runtime-database";
import { CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED } from "./feature-flags";
import { CandidateShadowCaptureComposition } from "./shadow-capture-composition";

const sourceDatabase = createCandidateRuntimeDatabase({ env: process.env, purpose: "source" });
const consumerDatabase = createCandidateRuntimeDatabase({ env: process.env, purpose: "consumer" });
const monitorDatabase = createCandidateRuntimeDatabase({ env: process.env, purpose: "monitor" });

export const appCandidateShadowCaptureComposition = new CandidateShadowCaptureComposition({
  codeActivationAllowed: CANDIDATE_PRODUCTION_ACTIVATION_ALLOWED,
  consumerTransactions: consumerDatabase.transactions,
  env: process.env,
  monitorTransactions: monitorDatabase.transactions,
  repository: appPersistenceRepository,
  sourceTransactions: sourceDatabase.transactions,
});
