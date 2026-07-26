import { z } from "zod";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeIntegerSchema,
  ReasonCodesSchema,
} from "../../runtime-schema/primitives";
import {
  M1_SCOPE_EPOCH,
  M1_VENUE_SOURCE_IDS,
} from "../source-capability/source-capability-contract";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../universe/stable-artifact";
import {
  M1MultiAssetShadowUpstreamBindingSchema,
  type M1MultiAssetShadowUpstreamBinding,
} from "./m1-multi-asset-shadow-contract";

export const M1_EXPANDED_SHADOW_RELEASE_MANIFEST_VERSION =
  "v2-m1-expanded-shadow-release-manifest.v1" as const;
export const M1_EXPANDED_SHADOW_RELEASE_RESULT_VERSION =
  "v2-m1-expanded-shadow-release-result.v1" as const;

export const M1_EXPANDED_SHADOW_COMPONENT_IDS = [
  "M1_5C_FOUR_VENUE_MULTI_ASSET_SHADOW",
  "M1_5D_MICROSTRUCTURE_FORWARD_SHADOW",
] as const;

export const M1_5C_SHADOW_STATUSES = [
  "PASS_FOUR_VENUE_MULTI_ASSET_SHADOW_NO_AUTHORITY",
  "BLOCKED_EQUITY_TRADABLE_FACT_NO_FALSE_PASS",
  "BLOCKED_SCOPE_OR_SLO_NO_STALE_PROMOTION",
  "TEST_ONLY_NOT_LIVE_EVIDENCE",
] as const;

export const M1_5D_SHADOW_STATUSES = [
  "PASS_FORWARD_MICROSTRUCTURE_SHADOW_NO_AUTHORITY",
  "BLOCKED_UPSTREAM_MULTI_ASSET_GATE",
  "BLOCKED_FORWARD_COVERAGE_OR_QUALITY",
  "BLOCKED_HOST_RECOVERY",
  "TEST_ONLY_NOT_FORWARD_LIVE_EVIDENCE",
] as const;

const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const CommitSchema = z.string().regex(/^[0-9a-f]{40}$/u);
const SourceRefSchema = z.string().regex(
  /^refs\/heads\/(?:main|codex\/[a-z0-9][a-z0-9._/-]{2,180})$/u,
);
const SafeRelativePathSchema = z.string()
  .min(1)
  .max(240)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/u)
  .superRefine((path, context) => {
    const segments = path.split("/");
    if (
      path.startsWith("/") ||
      path.endsWith("/") ||
      path.includes("//") ||
      segments.some((segment) => segment === "." || segment === "..")
    ) {
      context.addIssue({
        code: "custom",
        message: "bundle paths must remain normalized and relative",
      });
    }
  });
const UniqueReasonsSchema = ReasonCodesSchema.superRefine(
  (reasons, context) => {
    if (new Set(reasons).size !== reasons.length) {
      context.addIssue({
        code: "custom",
        message: "reason codes must be unique",
      });
    }
  },
);

const ComponentManifestSchema = z.strictObject({
  componentId: z.enum(M1_EXPANDED_SHADOW_COMPONENT_IDS),
  contractPath: SafeRelativePathSchema,
  contractSha256: DigestSchema,
  runtimeEntrypointPath: SafeRelativePathSchema,
  runtimeEntrypointSha256: DigestSchema,
  compiledRuntimeTreeHash: DigestSchema,
  evidenceDirectoryName: z.enum(["m1-5c", "m1-5d"]),
  rollbackUnitName: NonEmptyStringSchema,
  runProfile: z.literal("31_CYCLES_60_SECOND_CADENCE_MINIMUM_1800_SECONDS"),
  authorityMode: z.literal("NO_AUTHORITY"),
  productionDatabaseMutationAllowed: z.literal(false),
  productionRedisMutationAllowed: z.literal(false),
  productionApplicationMutationAllowed: z.literal(false),
  persistentRawMarketBytesAllowed: z.literal(false),
  temporaryIsolatedShadowStorageAllowed: z.literal(true),
  automaticRollbackRequired: z.literal(true),
  independentAcceptanceRequired: z.literal(true),
});

const BundleFileSchema = z.strictObject({
  path: SafeRelativePathSchema,
  sha256: DigestSchema,
  bytes: z.number().int().positive().max(64 * 1024 * 1024),
  mode: z.enum(["0444", "0555"]),
  class: z.enum([
    "MANIFEST",
    "ENTRYPOINT",
    "RUNTIME",
    "DEPENDENCY",
    "LICENSE",
  ]),
  containsSecret: z.literal(false),
});

const ManifestInputSchema = z.strictObject({
  sourceCommit: CommitSchema,
  sourceRef: SourceRefSchema,
  sourceTreeHash: DigestSchema,
  generatedAt: IsoDateTimeSchema,
  approvalIssuedAt: IsoDateTimeSchema,
  approvalExpiresAt: IsoDateTimeSchema,
  dispatchId: z.string().regex(/^[a-z0-9][a-z0-9-]{15,100}$/u),
  expectedProductionHead: CommitSchema,
  productionTopologyBeforeHash: DigestSchema,
  upstreamBindingId: NonEmptyStringSchema,
  upstreamBindingHash: DigestSchema,
  evidenceClass: z.enum(["LIVE_READ_ONLY", "TEST_ONLY"]),
  networkEnvironment: z.enum([
    "TENCENT_ISOLATED_READ_ONLY",
    "TEST_HARNESS",
  ]),
  allowedVenueHosts: z.array(NonEmptyStringSchema).min(4).max(16),
  components: z.array(ComponentManifestSchema).length(2),
  files: z.array(BundleFileSchema).min(4).max(256),
  transportArchiveSha256: DigestSchema,
  dependencyLockSha256: DigestSchema,
  zodRuntimeTreeHash: DigestSchema,
  stagingDirectory: NonEmptyStringSchema,
  evidenceRoot: NonEmptyStringSchema,
  maxExecutions: z.literal(1),
  maxRuntimeSeconds: z.number().int().min(1_900).max(5_400),
  buildOnTargetAllowed: z.literal(false),
  sourceSyncAllowed: z.literal(false),
  dependencyInstallAllowed: z.literal(false),
  transportContainsSecrets: z.literal(false),
  readProductionSecretsAllowed: z.literal(false),
  writeProductionEnvironmentAllowed: z.literal(false),
  productionRepositoryMutationAllowed: z.literal(false),
  productionServiceMutationAllowed: z.literal(false),
  temporaryStagingCleanupRequired: z.literal(true),
  crossComponentPassAllowed: z.literal(false),
  automaticTradingAllowed: z.literal(false),
});

const ManifestCoreSchema = ManifestInputSchema.extend({
  schemaVersion: z.literal(M1_EXPANDED_SHADOW_RELEASE_MANIFEST_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  releaseId: CommitSchema,
  componentAccounting: z.literal(
    "TWO_INDEPENDENT_COMPONENTS_NO_CROSS_PASS_OR_SHARED_ROLLBACK_RESULT",
  ),
  venueDenominator: z.tuple([
    z.literal("BINANCE_FUTURES"),
    z.literal("OKX_SWAP"),
    z.literal("BYBIT_DERIVATIVES"),
    z.literal("BITGET_FUTURES"),
  ]),
  bundleFileCount: NonNegativeIntegerSchema,
  bundlePayloadBytes: NonNegativeIntegerSchema,
});

export const M1ExpandedShadowReleaseManifestSchema =
  ManifestCoreSchema.extend({
    manifestId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((manifest, context) => {
    if (
      manifest.components.some(
        (component, index) =>
          component.componentId !== M1_EXPANDED_SHADOW_COMPONENT_IDS[index],
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "release components must remain complete and ordered",
        path: ["components"],
      });
    }
    if (
      manifest.files.some((file, index) =>
        index > 0 &&
        manifest.files[index - 1]!.path.localeCompare(file.path) >= 0
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "bundle files must remain unique and canonically ordered",
        path: ["files"],
      });
    }
    if (
      manifest.bundleFileCount !== manifest.files.length ||
      manifest.bundlePayloadBytes !== manifest.files.reduce(
        (total, file) => total + file.bytes,
        0,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "bundle file accounting does not reconcile",
        path: ["bundleFileCount"],
      });
    }
    const expectedHash = stableContentHash(manifestCore(manifest));
    if (manifest.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "release manifest content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      manifest.manifestId !==
        `m1-expanded-shadow-release:${expectedHash.slice(7, 31)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "release manifest id mismatch",
        path: ["manifestId"],
      });
    }
  });

export type M1ExpandedShadowReleaseManifestInput = z.input<
  typeof ManifestInputSchema
>;
export type M1ExpandedShadowReleaseManifest = z.infer<
  typeof M1ExpandedShadowReleaseManifestSchema
>;

function manifestCore(
  manifest: z.input<typeof ManifestCoreSchema> & {
    readonly manifestId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof ManifestCoreSchema> {
  return ManifestCoreSchema.parse({
    schemaVersion: manifest.schemaVersion,
    scopeEpoch: manifest.scopeEpoch,
    releaseId: manifest.releaseId,
    sourceCommit: manifest.sourceCommit,
    sourceRef: manifest.sourceRef,
    sourceTreeHash: manifest.sourceTreeHash,
    generatedAt: manifest.generatedAt,
    approvalIssuedAt: manifest.approvalIssuedAt,
    approvalExpiresAt: manifest.approvalExpiresAt,
    dispatchId: manifest.dispatchId,
    expectedProductionHead: manifest.expectedProductionHead,
    productionTopologyBeforeHash: manifest.productionTopologyBeforeHash,
    upstreamBindingId: manifest.upstreamBindingId,
    upstreamBindingHash: manifest.upstreamBindingHash,
    evidenceClass: manifest.evidenceClass,
    networkEnvironment: manifest.networkEnvironment,
    allowedVenueHosts: manifest.allowedVenueHosts,
    components: manifest.components,
    files: manifest.files,
    transportArchiveSha256: manifest.transportArchiveSha256,
    dependencyLockSha256: manifest.dependencyLockSha256,
    zodRuntimeTreeHash: manifest.zodRuntimeTreeHash,
    stagingDirectory: manifest.stagingDirectory,
    evidenceRoot: manifest.evidenceRoot,
    maxExecutions: manifest.maxExecutions,
    maxRuntimeSeconds: manifest.maxRuntimeSeconds,
    buildOnTargetAllowed: manifest.buildOnTargetAllowed,
    sourceSyncAllowed: manifest.sourceSyncAllowed,
    dependencyInstallAllowed: manifest.dependencyInstallAllowed,
    transportContainsSecrets: manifest.transportContainsSecrets,
    readProductionSecretsAllowed: manifest.readProductionSecretsAllowed,
    writeProductionEnvironmentAllowed:
      manifest.writeProductionEnvironmentAllowed,
    productionRepositoryMutationAllowed:
      manifest.productionRepositoryMutationAllowed,
    productionServiceMutationAllowed:
      manifest.productionServiceMutationAllowed,
    temporaryStagingCleanupRequired:
      manifest.temporaryStagingCleanupRequired,
    crossComponentPassAllowed: manifest.crossComponentPassAllowed,
    automaticTradingAllowed: manifest.automaticTradingAllowed,
    componentAccounting: manifest.componentAccounting,
    venueDenominator: manifest.venueDenominator,
    bundleFileCount: manifest.bundleFileCount,
    bundlePayloadBytes: manifest.bundlePayloadBytes,
  });
}

function assertNoSecretLikeMaterial(
  input: M1ExpandedShadowReleaseManifestInput,
): void {
  const serialized = JSON.stringify(input).toLowerCase();
  const forbidden = [
    "api_key=",
    "apikey=",
    "secret=",
    "token=",
    "authorization:",
    "private_key",
    "begin rsa private key",
    ".env.production",
  ];
  if (forbidden.some((needle) => serialized.includes(needle))) {
    throw new Error("release manifest contains secret-like material");
  }
}

export function buildM1ExpandedShadowReleaseManifest(inputValue: {
  readonly upstreamBinding: M1MultiAssetShadowUpstreamBinding;
  readonly manifest: M1ExpandedShadowReleaseManifestInput;
}): M1ExpandedShadowReleaseManifest {
  const upstream = M1MultiAssetShadowUpstreamBindingSchema.parse(
    inputValue.upstreamBinding,
  );
  const input = ManifestInputSchema.parse(inputValue.manifest);
  assertNoSecretLikeMaterial(input);
  if (
    input.sourceCommit !== upstream.releaseId ||
    input.upstreamBindingId !== upstream.upstreamBindingId ||
    input.upstreamBindingHash !== upstream.contentHash ||
    input.evidenceClass !== upstream.evidenceClass ||
    input.networkEnvironment !== upstream.networkEnvironment
  ) {
    throw new Error("release manifest exact source or upstream identity drifted");
  }
  const issuedAt = Date.parse(input.approvalIssuedAt);
  const expiresAt = Date.parse(input.approvalExpiresAt);
  const generatedAt = Date.parse(input.generatedAt);
  if (
    generatedAt > issuedAt ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > 90 * 60_000
  ) {
    throw new Error("release approval window is invalid or exceeds 90 minutes");
  }
  const hosts = [...new Set(input.allowedVenueHosts)].sort();
  if (
    hosts.length !== input.allowedVenueHosts.length ||
    M1_VENUE_SOURCE_IDS.some((venue) =>
      !hosts.some((host) =>
        host.toLowerCase().includes(
          venue.split("_")[0]!.toLowerCase(),
        )
      )
    )
  ) {
    throw new Error("release host allowlist does not cover the four Venues");
  }
  const components = [...input.components].sort(
    (left, right) =>
      M1_EXPANDED_SHADOW_COMPONENT_IDS.indexOf(left.componentId) -
      M1_EXPANDED_SHADOW_COMPONENT_IDS.indexOf(right.componentId),
  );
  if (
    new Set(components.map((component) => component.componentId)).size !==
      M1_EXPANDED_SHADOW_COMPONENT_IDS.length ||
    components[0]!.evidenceDirectoryName !== "m1-5c" ||
    components[1]!.evidenceDirectoryName !== "m1-5d" ||
    components[0]!.rollbackUnitName === components[1]!.rollbackUnitName
  ) {
    throw new Error(
      "release components require independent evidence and rollback identities",
    );
  }
  const files = [...input.files].sort((left, right) =>
    left.path.localeCompare(right.path)
  );
  if (new Set(files.map((file) => file.path)).size !== files.length) {
    throw new Error("release bundle file paths must be unique");
  }
  const core = manifestCore({
    ...input,
    schemaVersion: M1_EXPANDED_SHADOW_RELEASE_MANIFEST_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: input.sourceCommit,
    allowedVenueHosts: hosts,
    components,
    files,
    componentAccounting:
      "TWO_INDEPENDENT_COMPONENTS_NO_CROSS_PASS_OR_SHARED_ROLLBACK_RESULT",
    venueDenominator: [...M1_VENUE_SOURCE_IDS],
    bundleFileCount: files.length,
    bundlePayloadBytes: files.reduce(
      (total, file) => total + file.bytes,
      0,
    ),
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1ExpandedShadowReleaseManifestSchema.parse({
    ...core,
    manifestId:
      `m1-expanded-shadow-release:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}

const ComponentResultSchema = z.strictObject({
  componentId: z.enum(M1_EXPANDED_SHADOW_COMPONENT_IDS),
  executed: z.boolean(),
  evidenceId: NonEmptyStringSchema.nullable(),
  evidenceHash: DigestSchema.nullable(),
  status: z.union([
    z.enum(M1_5C_SHADOW_STATUSES),
    z.enum(M1_5D_SHADOW_STATUSES),
    z.literal("NOT_EXECUTED"),
  ]),
  acceptanceGate: z.enum(["PASS", "BLOCKED", "NOT_EVALUATED"]),
  rollbackStatus: z.enum([
    "RESTORED_EXACT",
    "NOT_REQUIRED_TEST_ONLY",
    "FAILED",
    "NOT_EXECUTED",
  ]),
  reasonCodes: UniqueReasonsSchema,
}).superRefine((result, context) => {
  const componentStatusAllowed = result.status === "NOT_EXECUTED" ||
    (
      result.componentId === "M1_5C_FOUR_VENUE_MULTI_ASSET_SHADOW"
        ? (M1_5C_SHADOW_STATUSES as readonly string[]).includes(result.status)
        : (M1_5D_SHADOW_STATUSES as readonly string[]).includes(result.status)
    );
  if (!componentStatusAllowed) {
    context.addIssue({
      code: "custom",
      message: "component status belongs to the other independent component",
      path: ["status"],
    });
  }
  const hasEvidence =
    result.evidenceId !== null && result.evidenceHash !== null;
  if (result.executed !== hasEvidence) {
    context.addIssue({
      code: "custom",
      message: "executed component and evidence identity must agree",
    });
  }
  if (
    !result.executed &&
    (
      result.status !== "NOT_EXECUTED" ||
      result.acceptanceGate !== "NOT_EVALUATED" ||
      result.rollbackStatus !== "NOT_EXECUTED"
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "non-executed component cannot claim status or rollback",
    });
  }
  const pass =
    result.status ===
      "PASS_FOUR_VENUE_MULTI_ASSET_SHADOW_NO_AUTHORITY" ||
    result.status ===
      "PASS_FORWARD_MICROSTRUCTURE_SHADOW_NO_AUTHORITY";
  if (
    result.executed &&
    result.acceptanceGate !== (pass ? "PASS" : "BLOCKED")
  ) {
    context.addIssue({
      code: "custom",
      message: "component acceptance Gate overstates component status",
      path: ["acceptanceGate"],
    });
  }
  if (
    result.executed &&
    result.rollbackStatus === "FAILED" &&
    result.reasonCodes.length === 0
  ) {
    context.addIssue({
      code: "custom",
      message: "failed rollback requires reason codes",
      path: ["reasonCodes"],
    });
  }
});

const ReleaseResultInputSchema = z.strictObject({
  releaseId: CommitSchema,
  manifestId: NonEmptyStringSchema,
  manifestHash: DigestSchema,
  dispatchId: NonEmptyStringSchema,
  evaluatedAt: IsoDateTimeSchema,
  evidenceClass: z.enum(["LIVE_READ_ONLY", "TEST_ONLY"]),
  components: z.array(ComponentResultSchema).length(2),
  topologyBeforeHash: DigestSchema,
  topologyAfterHash: DigestSchema,
  nonTargetServiceCountBefore: NonNegativeIntegerSchema,
  nonTargetServiceCountAfter: NonNegativeIntegerSchema,
  stagingPathCountAfter: NonNegativeIntegerSchema,
  temporaryContainerCountAfter: NonNegativeIntegerSchema,
  temporaryNetworkCountAfter: NonNegativeIntegerSchema,
  temporaryVolumeCountAfter: NonNegativeIntegerSchema,
  productionChanged: z.literal(false),
  secretMaterialPresent: z.literal(false),
  crossComponentPassAllowed: z.literal(false),
  candidateAuthorityGranted: z.literal(false),
  strategyAuthorityGranted: z.literal(false),
  readyAuthorityGranted: z.literal(false),
  automaticTradingAllowed: z.literal(false),
});

const ReleaseResultCoreSchema = ReleaseResultInputSchema.extend({
  schemaVersion: z.literal(M1_EXPANDED_SHADOW_RELEASE_RESULT_VERSION),
  scopeEpoch: z.literal(M1_SCOPE_EPOCH),
  componentPassCount: NonNegativeIntegerSchema,
  componentBlockedCount: NonNegativeIntegerSchema,
  hostRecoveryGate: z.enum(["PASS", "BLOCKED", "TEST_ONLY"]),
  releaseAcceptanceGate: z.enum(["PASS", "BLOCKED"]),
  status: z.enum([
    "PASS_BOTH_COMPONENTS_INDEPENDENT_NO_AUTHORITY",
    "BLOCKED_COMPONENT_FAILURE_NO_CROSS_PASS",
    "BLOCKED_HOST_RECOVERY",
    "TEST_ONLY_NOT_PRODUCTION_EVIDENCE",
  ]),
  reasonCodes: UniqueReasonsSchema,
});

export const M1ExpandedShadowReleaseResultSchema =
  ReleaseResultCoreSchema.extend({
    resultId: NonEmptyStringSchema,
    contentHash: DigestSchema,
  }).superRefine((result, context) => {
    if (
      result.components.some(
        (component, index) =>
          component.componentId !== M1_EXPANDED_SHADOW_COMPONENT_IDS[index],
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "component results must remain complete and ordered",
        path: ["components"],
      });
    }
    const passCount = result.components.filter(
      (component) => component.acceptanceGate === "PASS",
    ).length;
    const blockedCount = result.components.filter(
      (component) => component.acceptanceGate === "BLOCKED",
    ).length;
    if (
      result.componentPassCount !== passCount ||
      result.componentBlockedCount !== blockedCount
    ) {
      context.addIssue({
        code: "custom",
        message: "component result accounting does not reconcile",
      });
    }
    const rollbackModesValid = result.evidenceClass === "TEST_ONLY"
      ? result.components.every(
          (component) =>
            component.rollbackStatus === "NOT_REQUIRED_TEST_ONLY",
        )
      : result.components.every(
          (component) => component.rollbackStatus === "RESTORED_EXACT",
        );
    const hostExact =
      result.topologyBeforeHash === result.topologyAfterHash &&
      result.nonTargetServiceCountBefore ===
        result.nonTargetServiceCountAfter &&
      result.stagingPathCountAfter === 0 &&
      result.temporaryContainerCountAfter === 0 &&
      result.temporaryNetworkCountAfter === 0 &&
      result.temporaryVolumeCountAfter === 0 &&
      rollbackModesValid;
    const hostGate = result.evidenceClass === "TEST_ONLY"
      ? "TEST_ONLY"
      : hostExact
        ? "PASS"
        : "BLOCKED";
    const expectedStatus = result.evidenceClass === "TEST_ONLY"
      ? "TEST_ONLY_NOT_PRODUCTION_EVIDENCE"
      : !hostExact
        ? "BLOCKED_HOST_RECOVERY"
        : passCount === M1_EXPANDED_SHADOW_COMPONENT_IDS.length
          ? "PASS_BOTH_COMPONENTS_INDEPENDENT_NO_AUTHORITY"
          : "BLOCKED_COMPONENT_FAILURE_NO_CROSS_PASS";
    const releasePass =
      result.evidenceClass === "LIVE_READ_ONLY" &&
      hostExact &&
      passCount === M1_EXPANDED_SHADOW_COMPONENT_IDS.length;
    if (
      result.hostRecoveryGate !== hostGate ||
      result.releaseAcceptanceGate !== (releasePass ? "PASS" : "BLOCKED") ||
      result.status !== expectedStatus
    ) {
      context.addIssue({
        code: "custom",
        message: "release result Gate or status overstates component evidence",
        path: ["status"],
      });
    }
    const expectedHash = stableContentHash(releaseResultCore(result));
    if (result.contentHash !== expectedHash) {
      context.addIssue({
        code: "custom",
        message: "release result content hash mismatch",
        path: ["contentHash"],
      });
    }
    if (
      result.resultId !==
        `m1-expanded-shadow-result:${expectedHash.slice(7, 31)}`
    ) {
      context.addIssue({
        code: "custom",
        message: "release result id mismatch",
        path: ["resultId"],
      });
    }
  });

export type M1ExpandedShadowReleaseResultInput = z.input<
  typeof ReleaseResultInputSchema
>;
export type M1ExpandedShadowReleaseResult = z.infer<
  typeof M1ExpandedShadowReleaseResultSchema
>;

function releaseResultCore(
  result: z.input<typeof ReleaseResultCoreSchema> & {
    readonly resultId?: string;
    readonly contentHash?: string;
  },
): z.infer<typeof ReleaseResultCoreSchema> {
  return ReleaseResultCoreSchema.parse({
    schemaVersion: result.schemaVersion,
    scopeEpoch: result.scopeEpoch,
    releaseId: result.releaseId,
    manifestId: result.manifestId,
    manifestHash: result.manifestHash,
    dispatchId: result.dispatchId,
    evaluatedAt: result.evaluatedAt,
    evidenceClass: result.evidenceClass,
    components: result.components,
    componentPassCount: result.componentPassCount,
    componentBlockedCount: result.componentBlockedCount,
    topologyBeforeHash: result.topologyBeforeHash,
    topologyAfterHash: result.topologyAfterHash,
    nonTargetServiceCountBefore: result.nonTargetServiceCountBefore,
    nonTargetServiceCountAfter: result.nonTargetServiceCountAfter,
    stagingPathCountAfter: result.stagingPathCountAfter,
    temporaryContainerCountAfter: result.temporaryContainerCountAfter,
    temporaryNetworkCountAfter: result.temporaryNetworkCountAfter,
    temporaryVolumeCountAfter: result.temporaryVolumeCountAfter,
    hostRecoveryGate: result.hostRecoveryGate,
    releaseAcceptanceGate: result.releaseAcceptanceGate,
    status: result.status,
    reasonCodes: result.reasonCodes,
    productionChanged: result.productionChanged,
    secretMaterialPresent: result.secretMaterialPresent,
    crossComponentPassAllowed: result.crossComponentPassAllowed,
    candidateAuthorityGranted: result.candidateAuthorityGranted,
    strategyAuthorityGranted: result.strategyAuthorityGranted,
    readyAuthorityGranted: result.readyAuthorityGranted,
    automaticTradingAllowed: result.automaticTradingAllowed,
  });
}

export function buildM1ExpandedShadowReleaseResult(inputValue: {
  readonly manifest: M1ExpandedShadowReleaseManifest;
  readonly result: M1ExpandedShadowReleaseResultInput;
}): M1ExpandedShadowReleaseResult {
  const manifest = M1ExpandedShadowReleaseManifestSchema.parse(
    inputValue.manifest,
  );
  const input = ReleaseResultInputSchema.parse(inputValue.result);
  if (
    input.releaseId !== manifest.releaseId ||
    input.manifestId !== manifest.manifestId ||
    input.manifestHash !== manifest.contentHash ||
    input.dispatchId !== manifest.dispatchId ||
    input.evidenceClass !== manifest.evidenceClass
  ) {
    throw new Error("release result exact manifest identity drifted");
  }
  const components = [...input.components].sort(
    (left, right) =>
      M1_EXPANDED_SHADOW_COMPONENT_IDS.indexOf(left.componentId) -
      M1_EXPANDED_SHADOW_COMPONENT_IDS.indexOf(right.componentId),
  );
  if (
    new Set(components.map((component) => component.componentId)).size !==
    M1_EXPANDED_SHADOW_COMPONENT_IDS.length
  ) {
    throw new Error("release result requires both independent components");
  }
  const passCount = components.filter(
    (component) => component.acceptanceGate === "PASS",
  ).length;
  const blockedCount = components.filter(
    (component) => component.acceptanceGate === "BLOCKED",
  ).length;
  const rollbackModesValid = input.evidenceClass === "TEST_ONLY"
    ? components.every(
        (component) =>
          component.rollbackStatus === "NOT_REQUIRED_TEST_ONLY",
      )
    : components.every(
        (component) => component.rollbackStatus === "RESTORED_EXACT",
      );
  const hostExact =
    input.topologyBeforeHash === input.topologyAfterHash &&
    input.nonTargetServiceCountBefore === input.nonTargetServiceCountAfter &&
    input.stagingPathCountAfter === 0 &&
    input.temporaryContainerCountAfter === 0 &&
    input.temporaryNetworkCountAfter === 0 &&
    input.temporaryVolumeCountAfter === 0 &&
    rollbackModesValid;
  const releasePass =
    input.evidenceClass === "LIVE_READ_ONLY" &&
    hostExact &&
    passCount === M1_EXPANDED_SHADOW_COMPONENT_IDS.length;
  const status = input.evidenceClass === "TEST_ONLY"
    ? "TEST_ONLY_NOT_PRODUCTION_EVIDENCE" as const
    : !hostExact
      ? "BLOCKED_HOST_RECOVERY" as const
      : releasePass
        ? "PASS_BOTH_COMPONENTS_INDEPENDENT_NO_AUTHORITY" as const
        : "BLOCKED_COMPONENT_FAILURE_NO_CROSS_PASS" as const;
  const reasons = [
    ...(blockedCount > 0 ? ["one_or_more_components_blocked"] : []),
    ...(!hostExact ? ["host_recovery_not_exact"] : []),
    ...(
      input.evidenceClass === "TEST_ONLY"
        ? ["test_only_not_production_evidence"]
        : []
    ),
  ];
  const core = releaseResultCore({
    ...input,
    schemaVersion: M1_EXPANDED_SHADOW_RELEASE_RESULT_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    components,
    componentPassCount: passCount,
    componentBlockedCount: blockedCount,
    hostRecoveryGate: input.evidenceClass === "TEST_ONLY"
      ? "TEST_ONLY"
      : hostExact
        ? "PASS"
        : "BLOCKED",
    releaseAcceptanceGate: releasePass ? "PASS" : "BLOCKED",
    status,
    reasonCodes: reasons,
  });
  const contentHash = stableContentHash(core);
  return deepFreezeArtifact(M1ExpandedShadowReleaseResultSchema.parse({
    ...core,
    resultId:
      `m1-expanded-shadow-result:${contentHash.slice(7, 31)}`,
    contentHash,
  }));
}
