import { z } from "zod";
import {
  validateFactQualityLineage,
} from "./artifact-integrity";
import {
  IsoDateTimeSchema,
  NonEmptyStringSchema,
} from "../../../runtime-schema/primitives";
import {
  deepFreezeArtifact,
  stableContentHash,
  stableSha256,
} from "../../universe/stable-artifact";
import {
  M1_ARTIFACT_NAMES,
  type M1ArtifactName,
  type M1StoredArtifactRecord,
  M1_STORE_SCHEMA_VERSION,
  M1StoreError,
} from "./contracts";

export const M1_REPLAY_MANIFEST_SCHEMA_VERSION =
  "v2-m1-replay-manifest.v1" as const;

const Sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

export const M1ReplayArtifactReferenceSchema = z.strictObject({
  artifactName: z.enum(M1_ARTIFACT_NAMES),
  artifactId: NonEmptyStringSchema,
  sourceCutoff: IsoDateTimeSchema,
  persistedAt: IsoDateTimeSchema,
  storageDigest: Sha256Schema,
});

export type M1ReplayArtifactReference = z.infer<
  typeof M1ReplayArtifactReferenceSchema
>;

const M1ReplayManifestBaseSchema = z.strictObject({
  schemaVersion: z.literal(M1_REPLAY_MANIFEST_SCHEMA_VERSION),
  manifestId: NonEmptyStringSchema,
  manifestDigest: Sha256Schema,
  eventCutoff: IsoDateTimeSchema,
  knowledgeCutoff: IsoDateTimeSchema,
  createdAt: IsoDateTimeSchema,
  storeSchemaVersion: z.literal(M1_STORE_SCHEMA_VERSION),
  sourceArtifacts: z.array(M1ReplayArtifactReferenceSchema).min(3),
  expectedOnlineFeatureSet: M1ReplayArtifactReferenceSchema.extend({
    artifactName: z.literal("FeatureSetSnapshot"),
  }),
  featureComputation: z.strictObject({
    computedAt: IsoDateTimeSchema,
    engineVersion: NonEmptyStringSchema,
    featureSetVersion: NonEmptyStringSchema,
    releaseId: NonEmptyStringSchema,
  }),
});

export type M1ReplayManifest = z.infer<typeof M1ReplayManifestBaseSchema>;

function manifestContent(manifest: Omit<
  M1ReplayManifest,
  "manifestId" | "manifestDigest"
>) {
  return {
    createdAt: manifest.createdAt,
    eventCutoff: manifest.eventCutoff,
    expectedOnlineFeatureSet: manifest.expectedOnlineFeatureSet,
    featureComputation: manifest.featureComputation,
    knowledgeCutoff: manifest.knowledgeCutoff,
    schemaVersion: manifest.schemaVersion,
    sourceArtifacts: manifest.sourceArtifacts,
    storeSchemaVersion: manifest.storeSchemaVersion,
  };
}

export const M1ReplayManifestSchema = M1ReplayManifestBaseSchema.superRefine(
  (manifest, context) => {
    const eventMs = Date.parse(manifest.eventCutoff);
    const knowledgeMs = Date.parse(manifest.knowledgeCutoff);
    const createdMs = Date.parse(manifest.createdAt);
    if (eventMs > knowledgeMs) {
      context.addIssue({
        code: "custom",
        message: "eventCutoff cannot exceed knowledgeCutoff",
        path: ["eventCutoff"],
      });
    }
    if (knowledgeMs > createdMs) {
      context.addIssue({
        code: "custom",
        message: "knowledgeCutoff cannot exceed manifest creation time",
        path: ["knowledgeCutoff"],
      });
    }

    const allReferences = [
      ...manifest.sourceArtifacts,
      manifest.expectedOnlineFeatureSet,
    ];
    for (const [index, reference] of allReferences.entries()) {
      if (Date.parse(reference.sourceCutoff) > eventMs) {
        context.addIssue({
          code: "custom",
          message: "replay artifacts cannot read beyond the event cutoff",
          path: index < manifest.sourceArtifacts.length
            ? ["sourceArtifacts", index, "sourceCutoff"]
            : ["expectedOnlineFeatureSet", "sourceCutoff"],
        });
      }
      if (Date.parse(reference.persistedAt) > knowledgeMs) {
        context.addIssue({
          code: "custom",
          message: "replay artifacts cannot read beyond the knowledge cutoff",
          path: index < manifest.sourceArtifacts.length
            ? ["sourceArtifacts", index, "persistedAt"]
            : ["expectedOnlineFeatureSet", "persistedAt"],
        });
      }
    }

    const sourceKeys = manifest.sourceArtifacts.map(
      (reference) => `${reference.artifactName}:${reference.artifactId}`,
    );
    if (new Set(sourceKeys).size !== sourceKeys.length) {
      context.addIssue({
        code: "custom",
        message: "source artifact references must be unique",
        path: ["sourceArtifacts"],
      });
    }
    const counts = new Map<M1ArtifactName, number>();
    for (const reference of manifest.sourceArtifacts) {
      counts.set(
        reference.artifactName,
        (counts.get(reference.artifactName) ?? 0) + 1,
      );
    }
    if (
      counts.get("EligibleInstrumentSnapshot") !== 1 ||
      counts.get("FactQualitySnapshot") !== 1 ||
      (counts.get("PointInTimeMarketFact") ?? 0) < 1 ||
      [...counts.keys()].some((name) => ![
        "EligibleInstrumentSnapshot",
        "PointInTimeMarketFact",
        "FactQualitySnapshot",
      ].includes(name))
    ) {
      context.addIssue({
        code: "custom",
        message: "manifest sources require one universe, facts and one fact-quality snapshot only",
        path: ["sourceArtifacts"],
      });
    }

    const content = manifestContent(manifest);
    const expectedDigest = stableContentHash(content);
    const expectedId = `replay-manifest:${stableSha256(content).slice(0, 24)}`;
    if (manifest.manifestDigest !== expectedDigest) {
      context.addIssue({
        code: "custom",
        message: "manifest digest does not match canonical manifest content",
        path: ["manifestDigest"],
      });
    }
    if (manifest.manifestId !== expectedId) {
      context.addIssue({
        code: "custom",
        message: "manifest id does not match canonical manifest content",
        path: ["manifestId"],
      });
    }
  },
);

function reference(
  record: M1StoredArtifactRecord,
): M1ReplayArtifactReference {
  return {
    artifactName: record.artifactName,
    artifactId: record.artifactId,
    sourceCutoff: record.sourceCutoff,
    persistedAt: record.persistedAt,
    storageDigest: record.storageDigest,
  };
}

export function buildM1ReplayManifest(input: {
  createdAt: string;
  eventCutoff: string;
  knowledgeCutoff: string;
  universe: M1StoredArtifactRecord<"EligibleInstrumentSnapshot">;
  facts: readonly M1StoredArtifactRecord<"PointInTimeMarketFact">[];
  factQuality: M1StoredArtifactRecord<"FactQualitySnapshot">;
  onlineFeatureSet: M1StoredArtifactRecord<"FeatureSetSnapshot">;
}): M1ReplayManifest {
  const online = input.onlineFeatureSet.payload;
  const universe = input.universe.payload;
  const facts = input.facts.map((record) => record.payload);
  const factQuality = input.factQuality.payload;
  validateFactQualityLineage({ facts, factQuality });
  const eligibleIds = universe.accounting
    .filter((record) => record.eligible)
    .map((record) => record.canonicalInstrumentId)
    .sort();
  const factInstrumentIds = facts
    .map((fact) => fact.canonicalInstrumentId)
    .sort();
  const sourceFactIds = new Set(facts.map((fact) => fact.factId));
  if (
    JSON.stringify(eligibleIds) !== JSON.stringify(factInstrumentIds) ||
    factQuality.universeSnapshotId !== universe.snapshotId ||
    factQuality.sourceCutoff !== input.eventCutoff ||
    universe.sourceCutoff !== input.eventCutoff ||
    facts.some((fact) => fact.sourceCutoff !== input.eventCutoff) ||
    online.universeSnapshotId !== universe.snapshotId ||
    online.sourceCutoff !== input.eventCutoff ||
    online.features.some((feature) =>
      feature.sourceFactIds.some((factId) => !sourceFactIds.has(factId)))
  ) {
    throw new M1StoreError(
      "REPLAY_SOURCE_MISMATCH",
      "replay manifest sources do not form one exact M1 point-in-time denominator",
    );
  }
  if (online.computation.mode !== "ONLINE" || online.features.length === 0) {
    throw new M1StoreError(
      "REPLAY_MANIFEST_REJECTED",
      "replay manifests require a non-empty independently built ONLINE feature set",
    );
  }
  const computedAt = online.features[0]!.computedAt;
  if (online.features.some((feature) => feature.computedAt !== computedAt)) {
    throw new M1StoreError(
      "REPLAY_MANIFEST_REJECTED",
      "M1 replay requires one exact feature computation cutoff",
    );
  }

  const sourceArtifacts = [
    reference(input.universe),
    ...input.facts.map(reference),
    reference(input.factQuality),
  ].sort((left, right) =>
    `${left.artifactName}:${left.artifactId}`.localeCompare(
      `${right.artifactName}:${right.artifactId}`,
    ));
  const base = {
    schemaVersion: M1_REPLAY_MANIFEST_SCHEMA_VERSION,
    eventCutoff: input.eventCutoff,
    knowledgeCutoff: input.knowledgeCutoff,
    createdAt: input.createdAt,
    storeSchemaVersion: M1_STORE_SCHEMA_VERSION,
    sourceArtifacts,
    expectedOnlineFeatureSet: {
      ...reference(input.onlineFeatureSet),
      artifactName: "FeatureSetSnapshot" as const,
    },
    featureComputation: {
      computedAt,
      engineVersion: online.computation.engineVersion,
      featureSetVersion: online.featureSetVersion,
      releaseId: online.releaseId,
    },
  };
  const content = manifestContent(base);
  const digest = stableSha256(content);
  const parsed = M1ReplayManifestSchema.safeParse({
    ...base,
    manifestId: `replay-manifest:${digest.slice(0, 24)}`,
    manifestDigest: `sha256:${digest}`,
  });
  if (!parsed.success) {
    throw new M1StoreError(
      parsed.error.issues.some((issue) =>
        issue.message.includes("cutoff") || issue.message.includes("beyond"))
        ? "REPLAY_CUTOFF_VIOLATION"
        : "REPLAY_MANIFEST_REJECTED",
      "replay manifest failed its point-in-time contract",
    );
  }
  return deepFreezeArtifact(parsed.data);
}

export function validateM1ReplayManifest(input: unknown): M1ReplayManifest {
  const parsed = M1ReplayManifestSchema.safeParse(input);
  if (!parsed.success) {
    throw new M1StoreError(
      "REPLAY_MANIFEST_REJECTED",
      "stored replay manifest failed canonical validation",
    );
  }
  return deepFreezeArtifact(parsed.data);
}
