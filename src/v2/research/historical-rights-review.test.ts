import assert from "node:assert/strict";
import test from "node:test";
import {
  M2_HISTORICAL_RIGHTS_REVIEW_VERSION,
  M2HistoricalRightsReviewArtifactSchema,
  assessM2HistoricalRightsReview,
  buildM2HistoricalRightsReviewArtifact,
} from "./historical-rights-review";

const HASH_A =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HASH_B =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function approvedRightsReview() {
  return buildM2HistoricalRightsReviewArtifact({
    schemaVersion: M2_HISTORICAL_RIGHTS_REVIEW_VERSION,
    sourceRegistryId: "test-source",
    sourceOperator: "Test Source",
    intendedUse: "PRIVATE_NON_COMMERCIAL_MARKET_RESEARCH",
    deploymentAudience: "SINGLE_ACCOUNT_OWNER_PRIVATE_ACCESS",
    decision: "APPROVED",
    decisionOrigin: "EXTERNAL_HUMAN_REVIEW_RECORD",
    evidenceEnvironment: "EXTERNAL_REVIEW_EVIDENCE",
    retentionRight: "GRANTED",
    replayRight: "GRANTED",
    redistributionRight: "NOT_REQUIRED_PRIVATE_RESEARCH",
    reviewerType: "ACCOUNT_OWNER",
    reviewerIdentity: "account-owner-review-record-1",
    reviewedAt: "2026-07-20T08:00:00.000Z",
    reviewValidUntil: "2027-01-20T08:00:00.000Z",
    jurisdictionScope: "account-owner-applicable-jurisdiction",
    accountScope: "single-owner-private-account",
    reviewerAttestationDigest: HASH_B,
    evidence: [{
      evidenceId: "official-terms-capture",
      evidenceType: "OFFICIAL_TERMS",
      sourceOperator: "Test Source",
      url: "https://source.example/official-terms",
      capturedAt: "2026-07-20T07:00:00.000Z",
      termsEffectiveAt: "2026-07-01T00:00:00.000Z",
      contentDigest: HASH_A,
      contentBytes: 1_000,
      captureStatus: "HASHED_CONTENT_CAPTURED",
      retentionClass: "EXTERNAL_CONTENT_ADDRESSED_EVIDENCE_STORE",
      appliesToDataClasses: [
        "HISTORICAL_MARKET_DATA",
        "INSTRUMENT_REFERENCE_DATA",
      ],
    }],
    rawTermsStoredInRepository: false,
    rawMarketDataRedistributionAllowed: false,
    revocationDisposition:
      "DELETE_RETAINED_RAW_DATA_AND_REVOKE_DERIVED_ACCESS",
    limitations: [],
  });
}

test("pending rights evidence stays blocked without inventing a human decision", () => {
  const pending = buildM2HistoricalRightsReviewArtifact({
    schemaVersion: M2_HISTORICAL_RIGHTS_REVIEW_VERSION,
    sourceRegistryId: "test-source",
    sourceOperator: "Test Source",
    intendedUse: "PRIVATE_NON_COMMERCIAL_MARKET_RESEARCH",
    deploymentAudience: "SINGLE_ACCOUNT_OWNER_PRIVATE_ACCESS",
    decision: "PENDING_HUMAN_REVIEW",
    decisionOrigin: "PENDING_HUMAN_REVIEW",
    evidenceEnvironment: "EXTERNAL_REVIEW_EVIDENCE",
    retentionRight: "UNKNOWN",
    replayRight: "UNKNOWN",
    redistributionRight: "NOT_REQUIRED_PRIVATE_RESEARCH",
    reviewerType: "UNASSIGNED",
    reviewerIdentity: null,
    reviewedAt: null,
    reviewValidUntil: null,
    jurisdictionScope: null,
    accountScope: null,
    reviewerAttestationDigest: null,
    evidence: [{
      evidenceId: "official-terms-reference",
      evidenceType: "OFFICIAL_TERMS",
      sourceOperator: "Test Source",
      url: "https://source.example/official-terms",
      capturedAt: "2026-07-20T07:00:00.000Z",
      termsEffectiveAt: null,
      contentDigest: null,
      contentBytes: null,
      captureStatus: "REFERENCE_ONLY_UNHASHED",
      retentionClass: "REFERENCE_ONLY",
      appliesToDataClasses: ["HISTORICAL_MARKET_DATA"],
    }],
    rawTermsStoredInRepository: false,
    rawMarketDataRedistributionAllowed: false,
    revocationDisposition:
      "DELETE_RETAINED_RAW_DATA_AND_REVOKE_DERIVED_ACCESS",
    limitations: ["human_review_required"],
  });
  const assessment = assessM2HistoricalRightsReview(
    pending,
    "2026-07-20T09:00:00.000Z",
  );
  assert.equal(assessment.status, "BLOCKED");
  assert.equal(assessment.bulkRetentionAllowed, false);
  assert.equal(assessment.replayAllowed, false);
  assert.ok(assessment.blockerReasonCodes.includes(
    "source_rights_human_review_pending",
  ));
  assert.ok(assessment.blockerReasonCodes.includes(
    "source_rights_evidence_not_immutably_captured",
  ));
});

test("only a current external human review with hashed terms unlocks rights", () => {
  const assessment = assessM2HistoricalRightsReview(
    approvedRightsReview(),
    "2026-07-20T09:00:00.000Z",
  );
  assert.equal(assessment.status, "READY");
  assert.equal(assessment.bulkRetentionAllowed, true);
  assert.equal(assessment.replayAllowed, true);
  assert.deepEqual(assessment.blockerReasonCodes, []);
});

test("approval binds the exact operator and both required data classes", () => {
  const approved = approvedRightsReview();
  const { reviewArtifactId, reviewDigest, ...core } = approved;
  assert.ok(reviewArtifactId);
  assert.ok(reviewDigest);
  assert.throws(
    () => buildM2HistoricalRightsReviewArtifact({
      ...core,
      sourceOperator: "Different Source",
    }),
    /rights evidence must bind the exact reviewed source operator/u,
  );
  assert.throws(
    () => buildM2HistoricalRightsReviewArtifact({
      ...core,
      evidence: core.evidence.map((item) => ({
        ...item,
        appliesToDataClasses: ["CURRENT_MARKET_DATA" as const],
      })),
    }),
    /approved source rights require historical market and instrument reference scope/u,
  );
});

test("synthetic evidence cannot be labelled as a completed approval", () => {
  const forged = structuredClone(approvedRightsReview());
  forged.evidenceEnvironment = "SYNTHETIC_CONTRACT_FIXTURE";
  assert.throws(
    () => M2HistoricalRightsReviewArtifactSchema.parse(forged),
    /completed source rights require external human evidence/u,
  );
});

test("the reviewer role cannot be replaced by an automated agent", () => {
  const forged = structuredClone(approvedRightsReview()) as unknown as {
    reviewerType: string;
  };
  forged.reviewerType = "AUTOMATED_AGENT";
  assert.throws(
    () => M2HistoricalRightsReviewArtifactSchema.parse(forged),
    /Invalid option/u,
  );
});

test("expired rights review fails closed", () => {
  const assessment = assessM2HistoricalRightsReview(
    approvedRightsReview(),
    "2027-01-20T08:00:00.001Z",
  );
  assert.equal(assessment.status, "BLOCKED");
  assert.ok(assessment.blockerReasonCodes.includes(
    "source_rights_review_expired_or_unbounded",
  ));
});

test("rights artifacts are content-addressed and tamper-evident", () => {
  const forged = structuredClone(approvedRightsReview());
  forged.accountScope = "different-account";
  assert.throws(
    () => M2HistoricalRightsReviewArtifactSchema.parse(forged),
    /rights review digest mismatch/u,
  );
});
