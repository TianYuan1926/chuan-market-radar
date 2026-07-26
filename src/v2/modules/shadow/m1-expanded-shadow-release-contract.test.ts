import assert from "node:assert/strict";
import test from "node:test";
import {
  M1_SCOPE_EPOCH,
} from "../source-capability/source-capability-contract";
import {
  stableContentHash,
} from "../universe/stable-artifact";
import {
  M1_MULTI_ASSET_SHADOW_AXIS_IDS,
  M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
  M1MultiAssetShadowUpstreamBindingSchema,
  type M1MultiAssetShadowUpstreamBinding,
} from "./m1-multi-asset-shadow-contract";
import {
  M1ExpandedShadowReleaseResultSchema,
  buildM1ExpandedShadowReleaseManifest,
  buildM1ExpandedShadowReleaseResult,
  type M1ExpandedShadowReleaseManifestInput,
  type M1ExpandedShadowReleaseResultInput,
} from "./m1-expanded-shadow-release-contract";

const RELEASE = "a".repeat(40);

function digest(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

function upstreamBinding(
  evidenceClass: "LIVE_READ_ONLY" | "TEST_ONLY" = "TEST_ONLY",
): M1MultiAssetShadowUpstreamBinding {
  const live = evidenceClass === "LIVE_READ_ONLY";
  const core = {
    schemaVersion: M1_MULTI_ASSET_SHADOW_UPSTREAM_VERSION,
    scopeEpoch: M1_SCOPE_EPOCH,
    releaseId: RELEASE,
    generatedAt: "2026-07-26T03:57:00.000Z",
    sourceCutoff: "2026-07-26T03:56:59.000Z",
    runtimeAdapterArtifactId: "runtime-adapter-live:fixture",
    runtimeAdapterArtifactHash: digest("1"),
    conformanceArtifactId: "source-conformance:fixture",
    conformanceArtifactHash: digest("2"),
    registryDigest: digest("3"),
    profileSetHash: digest("4"),
    evidenceClass,
    networkEnvironment: live
      ? "TENCENT_ISOLATED_READ_ONLY" as const
      : "TEST_HARNESS" as const,
    runtimeAdapterStatus: live
      ? "PASS_BOUNDED_ROUTE_SEGMENT_NO_AUTHORITY" as const
      : "TEST_ONLY_NOT_LIVE_EVIDENCE" as const,
    liveConformantProfileCount: 15 as const,
    routeEligibleProfileCount: 14 as const,
    registryBlockedProfileCount: 1 as const,
    listingCheckpointCommittedCount: 2 as const,
    listingGapCount: 0 as const,
    acceptanceAxes: M1_MULTI_ASSET_SHADOW_AXIS_IDS.map(
      (axisId, index) => ({
        axisId,
        routeGateStatus: "PASS" as const,
        axisEvidenceId: `axis:${axisId}`,
        contentHash: digest(String(index + 5)),
      }),
    ),
    authorityGranted: false as const,
    productionChanged: false as const,
    secretMaterialPresent: false as const,
  };
  const contentHash = stableContentHash(core);
  return M1MultiAssetShadowUpstreamBindingSchema.parse({
    ...core,
    upstreamBindingId: `m1-shadow-upstream:${contentHash.slice(7, 31)}`,
    contentHash,
  });
}

function manifestInput(
  binding: M1MultiAssetShadowUpstreamBinding,
): M1ExpandedShadowReleaseManifestInput {
  return {
    sourceCommit: RELEASE,
    sourceRef: "refs/heads/codex/market-radar-v2-implementation",
    sourceTreeHash: digest("a"),
    generatedAt: "2026-07-26T04:00:00.000Z",
    approvalIssuedAt: "2026-07-26T04:01:00.000Z",
    approvalExpiresAt: "2026-07-26T05:31:00.000Z",
    dispatchId: "m1-expanded-shadow-20260726t040100z",
    expectedProductionHead: "b".repeat(40),
    productionTopologyBeforeHash: digest("b"),
    upstreamBindingId: binding.upstreamBindingId,
    upstreamBindingHash: binding.contentHash,
    evidenceClass: binding.evidenceClass,
    networkEnvironment: binding.networkEnvironment,
    allowedVenueHosts: [
      "api.bitget.com",
      "api.bybit.com",
      "www.okx.com",
      "fapi.binance.com",
    ],
    components: [
      {
        componentId: "M1_5D_MICROSTRUCTURE_FORWARD_SHADOW",
        contractPath:
          "runtime/v2/modules/shadow/m1-microstructure-forward-shadow-contract.js",
        contractSha256: digest("c"),
        runtimeEntrypointPath:
          "scripts/v2/production/m1-expanded-shadow-entrypoint.sh",
        runtimeEntrypointSha256: digest("d"),
        compiledRuntimeTreeHash: digest("e"),
        evidenceDirectoryName: "m1-5d",
        rollbackUnitName: "market-radar-m1-5d-shadow",
        runProfile: "31_CYCLES_60_SECOND_CADENCE_MINIMUM_1800_SECONDS",
        authorityMode: "NO_AUTHORITY",
        productionDatabaseMutationAllowed: false,
        productionRedisMutationAllowed: false,
        productionApplicationMutationAllowed: false,
        persistentRawMarketBytesAllowed: false,
        temporaryIsolatedShadowStorageAllowed: true,
        automaticRollbackRequired: true,
        independentAcceptanceRequired: true,
      },
      {
        componentId: "M1_5C_FOUR_VENUE_MULTI_ASSET_SHADOW",
        contractPath:
          "runtime/v2/modules/shadow/m1-multi-asset-shadow-contract.js",
        contractSha256: digest("f"),
        runtimeEntrypointPath:
          "scripts/v2/production/m1-expanded-shadow-entrypoint.sh",
        runtimeEntrypointSha256: digest("d"),
        compiledRuntimeTreeHash: digest("e"),
        evidenceDirectoryName: "m1-5c",
        rollbackUnitName: "market-radar-m1-5c-shadow",
        runProfile: "31_CYCLES_60_SECOND_CADENCE_MINIMUM_1800_SECONDS",
        authorityMode: "NO_AUTHORITY",
        productionDatabaseMutationAllowed: false,
        productionRedisMutationAllowed: false,
        productionApplicationMutationAllowed: false,
        persistentRawMarketBytesAllowed: false,
        temporaryIsolatedShadowStorageAllowed: true,
        automaticRollbackRequired: true,
        independentAcceptanceRequired: true,
      },
    ],
    files: [
      {
        path: "runtime/node_modules/zod/index.cjs",
        sha256: digest("1"),
        bytes: 1_000,
        mode: "0444",
        class: "DEPENDENCY",
        containsSecret: false,
      },
      {
        path: "scripts/v2/production/m1-expanded-shadow-entrypoint.sh",
        sha256: digest("2"),
        bytes: 2_000,
        mode: "0555",
        class: "ENTRYPOINT",
        containsSecret: false,
      },
      {
        path:
          "runtime/v2/modules/shadow/m1-microstructure-forward-shadow-contract.js",
        sha256: digest("3"),
        bytes: 3_000,
        mode: "0444",
        class: "RUNTIME",
        containsSecret: false,
      },
      {
        path:
          "runtime/v2/modules/shadow/m1-multi-asset-shadow-contract.js",
        sha256: digest("4"),
        bytes: 2_500,
        mode: "0444",
        class: "RUNTIME",
        containsSecret: false,
      },
    ],
    transportArchiveSha256: digest("5"),
    dependencyLockSha256: digest("6"),
    zodRuntimeTreeHash: digest("7"),
    stagingDirectory:
      "/home/ubuntu/.cache/market-radar-v2/m1-expanded-shadow-20260726t040100z",
    evidenceRoot:
      "/var/lib/market-radar-production-dispatch/evidence/m1-expanded-shadow",
    maxExecutions: 1,
    maxRuntimeSeconds: 5_400,
    buildOnTargetAllowed: false,
    sourceSyncAllowed: false,
    dependencyInstallAllowed: false,
    transportContainsSecrets: false,
    readProductionSecretsAllowed: false,
    writeProductionEnvironmentAllowed: false,
    productionRepositoryMutationAllowed: false,
    productionServiceMutationAllowed: false,
    temporaryStagingCleanupRequired: true,
    crossComponentPassAllowed: false,
    automaticTradingAllowed: false,
  };
}

function componentResults(
  evidenceClass: "LIVE_READ_ONLY" | "TEST_ONLY",
  m15cPass = true,
  m15dPass = true,
): M1ExpandedShadowReleaseResultInput["components"] {
  const testOnly = evidenceClass === "TEST_ONLY";
  return [
    {
      componentId: "M1_5D_MICROSTRUCTURE_FORWARD_SHADOW",
      executed: true,
      evidenceId: "m1-5d-evidence",
      evidenceHash: digest("8"),
      status: testOnly
        ? "TEST_ONLY_NOT_FORWARD_LIVE_EVIDENCE"
        : m15dPass
          ? "PASS_FORWARD_MICROSTRUCTURE_SHADOW_NO_AUTHORITY"
          : "BLOCKED_FORWARD_COVERAGE_OR_QUALITY",
      acceptanceGate:
        !testOnly && m15dPass ? "PASS" as const : "BLOCKED" as const,
      rollbackStatus: testOnly
        ? "NOT_REQUIRED_TEST_ONLY" as const
        : "RESTORED_EXACT" as const,
      reasonCodes:
        !testOnly && m15dPass ? [] : ["m1_5d_not_live_pass"],
    },
    {
      componentId: "M1_5C_FOUR_VENUE_MULTI_ASSET_SHADOW",
      executed: true,
      evidenceId: "m1-5c-evidence",
      evidenceHash: digest("9"),
      status: testOnly
        ? "TEST_ONLY_NOT_LIVE_EVIDENCE"
        : m15cPass
          ? "PASS_FOUR_VENUE_MULTI_ASSET_SHADOW_NO_AUTHORITY"
          : "BLOCKED_EQUITY_TRADABLE_FACT_NO_FALSE_PASS",
      acceptanceGate:
        !testOnly && m15cPass ? "PASS" as const : "BLOCKED" as const,
      rollbackStatus: testOnly
        ? "NOT_REQUIRED_TEST_ONLY" as const
        : "RESTORED_EXACT" as const,
      reasonCodes:
        !testOnly && m15cPass ? [] : ["m1_5c_not_live_pass"],
    },
  ];
}

function releaseResultInput(input: {
  manifest: ReturnType<typeof buildM1ExpandedShadowReleaseManifest>;
  m15cPass?: boolean;
  m15dPass?: boolean;
  hostExact?: boolean;
}): M1ExpandedShadowReleaseResultInput {
  const hostExact = input.hostExact ?? true;
  return {
    releaseId: RELEASE,
    manifestId: input.manifest.manifestId,
    manifestHash: input.manifest.contentHash,
    dispatchId: input.manifest.dispatchId,
    evaluatedAt: "2026-07-26T04:32:00.000Z",
    evidenceClass: input.manifest.evidenceClass,
    components: componentResults(
      input.manifest.evidenceClass,
      input.m15cPass,
      input.m15dPass,
    ),
    topologyBeforeHash: digest("a"),
    topologyAfterHash: hostExact ? digest("a") : digest("b"),
    nonTargetServiceCountBefore: 11,
    nonTargetServiceCountAfter: 11,
    stagingPathCountAfter: 0,
    temporaryContainerCountAfter: hostExact ? 0 : 1,
    temporaryNetworkCountAfter: 0,
    temporaryVolumeCountAfter: 0,
    productionChanged: false,
    secretMaterialPresent: false,
    crossComponentPassAllowed: false,
    candidateAuthorityGranted: false,
    strategyAuthorityGranted: false,
    readyAuthorityGranted: false,
    automaticTradingAllowed: false,
  };
}

test("builds a deterministic no-secret manifest with two independent components", () => {
  const binding = upstreamBinding();
  const first = buildM1ExpandedShadowReleaseManifest({
    upstreamBinding: binding,
    manifest: manifestInput(binding),
  });
  const secondInput = manifestInput(binding);
  const second = buildM1ExpandedShadowReleaseManifest({
    upstreamBinding: binding,
    manifest: {
      ...secondInput,
      components: [...secondInput.components].reverse(),
      files: [...secondInput.files].reverse(),
      allowedVenueHosts: [...secondInput.allowedVenueHosts].reverse(),
    },
  });
  assert.equal(first.contentHash, second.contentHash);
  assert.deepEqual(
    first.components.map((component) => component.componentId),
    [
      "M1_5C_FOUR_VENUE_MULTI_ASSET_SHADOW",
      "M1_5D_MICROSTRUCTURE_FORWARD_SHADOW",
    ],
  );
  assert.equal(first.transportContainsSecrets, false);
  assert.equal(first.buildOnTargetAllowed, false);
  assert.equal(first.sourceSyncAllowed, false);
  assert.equal(first.crossComponentPassAllowed, false);
  assert.equal(Object.isFrozen(first), true);
});

test("rejects approval windows longer than ninety minutes", () => {
  const binding = upstreamBinding();
  assert.throws(
    () => buildM1ExpandedShadowReleaseManifest({
      upstreamBinding: binding,
      manifest: {
        ...manifestInput(binding),
        approvalExpiresAt: "2026-07-26T05:31:00.001Z",
      },
    }),
    /exceeds 90 minutes/u,
  );
});

test("rejects secret-like material even when transport flags claim false", () => {
  const binding = upstreamBinding();
  const input = manifestInput(binding);
  assert.throws(
    () => buildM1ExpandedShadowReleaseManifest({
      upstreamBinding: binding,
      manifest: {
        ...input,
        evidenceRoot: "/tmp/evidence?api_key=exposed",
      },
    }),
    /secret-like material/u,
  );
});

test("rejects a host allowlist that silently omits Bitget", () => {
  const binding = upstreamBinding();
  const input = manifestInput(binding);
  assert.throws(
    () => buildM1ExpandedShadowReleaseManifest({
      upstreamBinding: binding,
      manifest: {
        ...input,
        allowedVenueHosts: input.allowedVenueHosts.filter(
          (host) => !host.includes("bitget"),
        ),
      },
    }),
    /four Venues|Too small/u,
  );
});

test("rejects shared rollback identity between M1.5C and M1.5D", () => {
  const binding = upstreamBinding();
  const input = manifestInput(binding);
  assert.throws(
    () => buildM1ExpandedShadowReleaseManifest({
      upstreamBinding: binding,
      manifest: {
        ...input,
        components: input.components.map((component) => ({
          ...component,
          rollbackUnitName: "shared-rollback-unit",
        })),
      },
    }),
    /independent evidence and rollback identities/u,
  );
});

test("accepts a live release only when both component Gates independently pass", () => {
  const binding = upstreamBinding("LIVE_READ_ONLY");
  const manifest = buildM1ExpandedShadowReleaseManifest({
    upstreamBinding: binding,
    manifest: manifestInput(binding),
  });
  const result = buildM1ExpandedShadowReleaseResult({
    manifest,
    result: releaseResultInput({ manifest }),
  });
  assert.equal(result.componentPassCount, 2);
  assert.equal(result.componentBlockedCount, 0);
  assert.equal(result.hostRecoveryGate, "PASS");
  assert.equal(result.releaseAcceptanceGate, "PASS");
  assert.equal(
    result.status,
    "PASS_BOTH_COMPONENTS_INDEPENDENT_NO_AUTHORITY",
  );
});

test("does not let an M1.5D PASS conceal an M1.5C blocker", () => {
  const binding = upstreamBinding("LIVE_READ_ONLY");
  const manifest = buildM1ExpandedShadowReleaseManifest({
    upstreamBinding: binding,
    manifest: manifestInput(binding),
  });
  const result = buildM1ExpandedShadowReleaseResult({
    manifest,
    result: releaseResultInput({
      manifest,
      m15cPass: false,
      m15dPass: true,
    }),
  });
  assert.equal(result.componentPassCount, 1);
  assert.equal(result.componentBlockedCount, 1);
  assert.equal(result.releaseAcceptanceGate, "BLOCKED");
  assert.equal(result.status, "BLOCKED_COMPONENT_FAILURE_NO_CROSS_PASS");
});

test("keeps a complete test package outside production acceptance", () => {
  const binding = upstreamBinding("TEST_ONLY");
  const manifest = buildM1ExpandedShadowReleaseManifest({
    upstreamBinding: binding,
    manifest: manifestInput(binding),
  });
  const result = buildM1ExpandedShadowReleaseResult({
    manifest,
    result: releaseResultInput({ manifest }),
  });
  assert.equal(result.componentPassCount, 0);
  assert.equal(result.componentBlockedCount, 2);
  assert.equal(result.hostRecoveryGate, "TEST_ONLY");
  assert.equal(result.releaseAcceptanceGate, "BLOCKED");
  assert.equal(result.status, "TEST_ONLY_NOT_PRODUCTION_EVIDENCE");
});

test("blocks a two-component live PASS when host recovery is not exact", () => {
  const binding = upstreamBinding("LIVE_READ_ONLY");
  const manifest = buildM1ExpandedShadowReleaseManifest({
    upstreamBinding: binding,
    manifest: manifestInput(binding),
  });
  const resultInput = releaseResultInput({ manifest, hostExact: false });
  const result = buildM1ExpandedShadowReleaseResult({
    manifest,
    result: {
      ...resultInput,
      components: resultInput.components.map((component) => ({
        ...component,
        rollbackStatus: "FAILED" as const,
        reasonCodes: ["host_restore_failed"],
      })),
    },
  });
  assert.equal(result.componentPassCount, 2);
  assert.equal(result.releaseAcceptanceGate, "BLOCKED");
  assert.equal(result.status, "BLOCKED_HOST_RECOVERY");
});

test("rejects a component result status borrowed from the other component", () => {
  const binding = upstreamBinding("LIVE_READ_ONLY");
  const manifest = buildM1ExpandedShadowReleaseManifest({
    upstreamBinding: binding,
    manifest: manifestInput(binding),
  });
  const input = releaseResultInput({ manifest });
  assert.throws(
    () => buildM1ExpandedShadowReleaseResult({
      manifest,
      result: {
        ...input,
        components: input.components.map((component) =>
          component.componentId ===
              "M1_5C_FOUR_VENUE_MULTI_ASSET_SHADOW"
            ? {
                ...component,
                status:
                  "PASS_FORWARD_MICROSTRUCTURE_SHADOW_NO_AUTHORITY" as const,
              }
            : component
        ),
      },
    }),
    /belongs to the other independent component/u,
  );
});

test("schema rejects a recomputed overall PASS that masks one blocked component", () => {
  const binding = upstreamBinding("LIVE_READ_ONLY");
  const manifest = buildM1ExpandedShadowReleaseManifest({
    upstreamBinding: binding,
    manifest: manifestInput(binding),
  });
  const result = buildM1ExpandedShadowReleaseResult({
    manifest,
    result: releaseResultInput({ manifest, m15cPass: false }),
  });
  const core = Object.fromEntries(
    Object.entries(result).filter(
      ([key]) => key !== "resultId" && key !== "contentHash",
    ),
  );
  const forgedCore = {
    ...core,
    releaseAcceptanceGate: "PASS" as const,
    status: "PASS_BOTH_COMPONENTS_INDEPENDENT_NO_AUTHORITY" as const,
  };
  const contentHash = stableContentHash(forgedCore);
  assert.throws(
    () => M1ExpandedShadowReleaseResultSchema.parse({
      ...forgedCore,
      resultId:
        `m1-expanded-shadow-result:${contentHash.slice(7, 31)}`,
      contentHash,
    }),
    /overstates component evidence/u,
  );
});

test("rejects result identity drift from the exact manifest", () => {
  const binding = upstreamBinding("LIVE_READ_ONLY");
  const manifest = buildM1ExpandedShadowReleaseManifest({
    upstreamBinding: binding,
    manifest: manifestInput(binding),
  });
  assert.throws(
    () => buildM1ExpandedShadowReleaseResult({
      manifest,
      result: {
        ...releaseResultInput({ manifest }),
        manifestHash: digest("f"),
      },
    }),
    /exact manifest identity drifted/u,
  );
});
