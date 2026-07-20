import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  stat,
  unlink,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import {
  deepFreezeArtifact,
  stableContentHash,
} from "../modules/universe/stable-artifact";
import {
  NonEmptyStringSchema,
} from "../runtime-schema/primitives";
import {
  M2ForwardInstrumentRawEvidenceSchema,
  type M2ForwardInstrumentRawEvidence,
} from "./forward-instrument-capture";

export const M2_FORWARD_INSTRUMENT_ARTIFACT_REFERENCE_VERSION =
  "v2-m2-forward-instrument-artifact-reference.v1" as const;

const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;
const MAX_JOURNAL_BYTES = 64 * 1024 * 1024;
const MAX_JOURNAL_RECORD_BYTES = 1024 * 1024;
const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const StorageKeySchema = z.string().regex(
  /^(?:raw|artifacts)\/sha256\/[0-9a-f]{64}\.json$/u,
);
const JournalChainRecordSchema = z.object({
  entrySequence: z.number().int().nonnegative(),
  previousEntryDigest: DigestSchema.nullable(),
  journalEntryDigest: DigestSchema,
}).passthrough();

const ArtifactReferenceCoreSchema = z.strictObject({
  schemaVersion: z.literal(M2_FORWARD_INSTRUMENT_ARTIFACT_REFERENCE_VERSION),
  artifactKind: z.enum(["SNAPSHOT", "BATCH", "CONTINUITY"]),
  artifactDigest: DigestSchema,
  contentDigest: DigestSchema,
  contentBytes: z.number().int().positive().max(MAX_ARTIFACT_BYTES),
  storageKey: StorageKeySchema,
  retentionClass: z.literal("EXTERNAL_CONTENT_ADDRESSED_EVIDENCE_STORE"),
});

export const M2ForwardInstrumentArtifactReferenceSchema =
  ArtifactReferenceCoreSchema.extend({
    referenceId: NonEmptyStringSchema,
    referenceDigest: DigestSchema,
  }).superRefine((reference, context) => {
    const { referenceId, referenceDigest, ...core } = reference;
    if (referenceDigest !== stableContentHash(core)) {
      context.addIssue({
        code: "custom",
        message: "forward artifact reference digest mismatch",
        path: ["referenceDigest"],
      });
    }
    const artifactHex = reference.artifactDigest.slice("sha256:".length);
    if (
      reference.storageKey !== `artifacts/sha256/${artifactHex}.json` ||
      referenceId !== `forward-instrument-artifact-ref:${artifactHex}`
    ) {
      context.addIssue({
        code: "custom",
        message: "forward artifact reference address mismatch",
        path: ["storageKey"],
      });
    }
  });

export type M2ForwardInstrumentArtifactReference = z.infer<
  typeof M2ForwardInstrumentArtifactReferenceSchema
>;

function pathIsWithin(parent: string, candidate: string): boolean {
  const relativePath = relative(resolve(parent), resolve(candidate));
  return relativePath === "" || (
    !relativePath.startsWith("..") && !isAbsolute(relativePath)
  );
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function fileBytes(path: string, maximumBytes: number): Promise<Uint8Array> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("forward evidence object must be a regular file");
  }
  if (metadata.size > maximumBytes) {
    throw new Error("forward evidence object exceeds its read limit");
  }
  const bytes = await readFile(path);
  if (bytes.byteLength > maximumBytes) {
    throw new Error("forward evidence object exceeds its read limit");
  }
  return bytes;
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error
    ? (error as NodeJS.ErrnoException).code
    : undefined;
}

export type M2ForwardInstrumentEvidenceStore = Readonly<{
  appendJournalRecord(
    record: Readonly<Record<string, unknown>>,
    expectedPreviousDigest: string | null,
  ): Promise<void>;
  putArtifact(input: Readonly<{
    artifact: unknown;
    artifactDigest: string;
    artifactKind: "SNAPSHOT" | "BATCH" | "CONTINUITY";
  }>): Promise<M2ForwardInstrumentArtifactReference>;
  putRaw(
    evidence: M2ForwardInstrumentRawEvidence,
    bytes: Uint8Array,
  ): Promise<void>;
  readArtifact(reference: M2ForwardInstrumentArtifactReference): Promise<unknown>;
  readLastJournalRecord(): Promise<unknown | null>;
  readJournalRecords(): Promise<readonly unknown[]>;
  root: string;
  verifyRaw(evidence: M2ForwardInstrumentRawEvidence): Promise<void>;
}>;

async function ensureContainedDirectory(root: string, path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const actual = await realpath(path);
  if (!pathIsWithin(root, actual)) {
    throw new Error("forward evidence directory escaped its external root");
  }
}

async function writeContentAddressed(input: Readonly<{
  bytes: Uint8Array;
  expectedDigest: string;
  expectedBytes: number;
  path: string;
}>): Promise<void> {
  if (
    input.bytes.byteLength !== input.expectedBytes ||
    sha256(input.bytes) !== input.expectedDigest
  ) {
    throw new Error("forward evidence bytes do not match their content address");
  }

  const verifyExisting = async () => {
    const existing = await fileBytes(input.path, input.expectedBytes + 1);
    if (
      existing.byteLength !== input.expectedBytes ||
      sha256(existing) !== input.expectedDigest
    ) {
      throw new Error("existing forward evidence object is corrupted");
    }
    await chmod(input.path, 0o600);
  };

  try {
    await verifyExisting();
    return;
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      throw error;
    }
  }

  const temporaryPath = `${input.path}.partial.${process.pid}.${randomUUID()}`;
  const handle = await open(temporaryPath, "wx", 0o600);
  let handleClosed = false;
  try {
    try {
      await handle.writeFile(input.bytes);
      await handle.sync();
    } finally {
      await handle.close();
      handleClosed = true;
    }
    try {
      await link(temporaryPath, input.path);
    } catch (error) {
      if (errorCode(error) !== "EEXIST") {
        throw error;
      }
    }
    await verifyExisting();
  } finally {
    try {
      if (!handleClosed) {
        await handle.close();
      }
    } finally {
      await unlink(temporaryPath).catch((error: unknown) => {
        if (errorCode(error) !== "ENOENT") {
          throw error;
        }
      });
    }
  }
}

export async function createM2ForwardInstrumentEvidenceStore(input: Readonly<{
  repositoryRoot: string;
  root: string;
}>): Promise<M2ForwardInstrumentEvidenceStore> {
  if (!isAbsolute(input.root) || !isAbsolute(input.repositoryRoot)) {
    throw new Error("forward evidence store paths must be absolute");
  }
  const repositoryRoot = await realpath(input.repositoryRoot);
  await mkdir(input.root, { recursive: true, mode: 0o700 });
  const root = await realpath(input.root);
  if (
    pathIsWithin(repositoryRoot, root) ||
    pathIsWithin(root, repositoryRoot)
  ) {
    throw new Error(
      "forward evidence store must be separate from the Git worktree",
    );
  }

  const rawDirectory = join(root, "raw", "sha256");
  const artifactDirectory = join(root, "artifacts", "sha256");
  const journalDirectory = join(root, "journal");
  await ensureContainedDirectory(root, rawDirectory);
  await ensureContainedDirectory(root, artifactDirectory);
  await ensureContainedDirectory(root, journalDirectory);
  const journalPath = join(journalDirectory, "forward-instrument-captures.v1.jsonl");
  const lockPath = join(journalDirectory, "forward-instrument-captures.v1.lock");

  const storagePath = (storageKey: string): string => {
    const parsed = StorageKeySchema.parse(storageKey);
    const path = resolve(root, parsed);
    if (!pathIsWithin(root, path)) {
      throw new Error("forward evidence storage key escaped its root");
    }
    return path;
  };

  const readLastJournalRecord = async (): Promise<unknown | null> => {
    let size: number;
    try {
      size = (await stat(journalPath)).size;
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        return null;
      }
      throw error;
    }
    if (size === 0) {
      return null;
    }
    const length = Math.min(size, MAX_JOURNAL_RECORD_BYTES);
    const handle = await open(journalPath, "r");
    const bytes = new Uint8Array(length);
    try {
      const result = await handle.read(bytes, 0, length, size - length);
      if (result.bytesRead !== length) {
        throw new Error("forward capture journal tail read was incomplete");
      }
    } finally {
      await handle.close();
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!text.endsWith("\n")) {
      throw new Error("forward capture journal has an incomplete final record");
    }
    const withoutFinalNewline = text.slice(0, -1);
    const separator = withoutFinalNewline.lastIndexOf("\n");
    if (separator < 0 && length < size) {
      throw new Error("forward capture journal record exceeds its tail limit");
    }
    const line = withoutFinalNewline.slice(separator + 1);
    if (line.trim() === "") {
      throw new Error("forward capture journal final record is empty");
    }
    return JSON.parse(line) as unknown;
  };

  const verifyRaw = async (
    rawEvidence: M2ForwardInstrumentRawEvidence,
  ): Promise<void> => {
    const evidence = M2ForwardInstrumentRawEvidenceSchema.parse(rawEvidence);
    const bytes = await fileBytes(
      storagePath(evidence.storageKey),
      evidence.contentBytes + 1,
    );
    if (
      bytes.byteLength !== evidence.contentBytes ||
      sha256(bytes) !== evidence.contentDigest
    ) {
      throw new Error("retained forward raw evidence failed verification");
    }
  };

  return Object.freeze({
    root,
    async putRaw(rawEvidence, bytes) {
      const evidence = M2ForwardInstrumentRawEvidenceSchema.parse(rawEvidence);
      await writeContentAddressed({
        bytes,
        expectedDigest: evidence.contentDigest,
        expectedBytes: evidence.contentBytes,
        path: storagePath(evidence.storageKey),
      });
    },
    verifyRaw,
    async putArtifact(artifactInput) {
      const artifactDigest = DigestSchema.parse(artifactInput.artifactDigest);
      const digestField = {
        SNAPSHOT: "snapshotDigest",
        BATCH: "batchDigest",
        CONTINUITY: "continuityDigest",
      } as const;
      if (
        artifactInput.artifact === null ||
        typeof artifactInput.artifact !== "object" ||
        (artifactInput.artifact as Record<string, unknown>)[
          digestField[artifactInput.artifactKind]
        ] !== artifactDigest
      ) {
        throw new Error("forward artifact does not carry its declared digest");
      }
      const bytes = new TextEncoder().encode(
        `${JSON.stringify(artifactInput.artifact)}\n`,
      );
      if (bytes.byteLength > MAX_ARTIFACT_BYTES) {
        throw new Error("forward normalized artifact exceeds its byte cap");
      }
      const artifactHex = artifactDigest.slice("sha256:".length);
      const core = ArtifactReferenceCoreSchema.parse({
        schemaVersion: M2_FORWARD_INSTRUMENT_ARTIFACT_REFERENCE_VERSION,
        artifactKind: artifactInput.artifactKind,
        artifactDigest,
        contentDigest: sha256(bytes),
        contentBytes: bytes.byteLength,
        storageKey: `artifacts/sha256/${artifactHex}.json`,
        retentionClass: "EXTERNAL_CONTENT_ADDRESSED_EVIDENCE_STORE",
      });
      await writeContentAddressed({
        bytes,
        expectedDigest: core.contentDigest,
        expectedBytes: core.contentBytes,
        path: storagePath(core.storageKey),
      });
      return deepFreezeArtifact(
        M2ForwardInstrumentArtifactReferenceSchema.parse({
          ...core,
          referenceId: `forward-instrument-artifact-ref:${artifactHex}`,
          referenceDigest: stableContentHash(core),
        }),
      );
    },
    async readArtifact(rawReference) {
      const reference = M2ForwardInstrumentArtifactReferenceSchema.parse(
        rawReference,
      );
      const bytes = await fileBytes(
        storagePath(reference.storageKey),
        reference.contentBytes + 1,
      );
      if (
        bytes.byteLength !== reference.contentBytes ||
        sha256(bytes) !== reference.contentDigest
      ) {
        throw new Error("retained forward artifact failed content verification");
      }
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    },
    async appendJournalRecord(record, expectedPreviousDigest) {
      if (expectedPreviousDigest !== null) {
        DigestSchema.parse(expectedPreviousDigest);
      }
      const journalRecord = JournalChainRecordSchema.parse(record);
      const bytes = new TextEncoder().encode(`${JSON.stringify(journalRecord)}\n`);
      if (bytes.byteLength > MAX_JOURNAL_RECORD_BYTES) {
        throw new Error("forward journal record exceeds its byte cap");
      }
      let lock;
      try {
        lock = await open(lockPath, "wx", 0o600);
      } catch (error) {
        if (errorCode(error) === "EEXIST") {
          throw new Error("another forward capture writer holds the journal lock");
        }
        throw error;
      }
      try {
        const previous = await readLastJournalRecord();
        const actualPreviousDigest = previous === null
          ? null
          : JournalChainRecordSchema.parse(previous).journalEntryDigest;
        const expectedSequence = previous === null
          ? 0
          : JournalChainRecordSchema.parse(previous).entrySequence + 1;
        if (
          actualPreviousDigest !== expectedPreviousDigest ||
          journalRecord.previousEntryDigest !== expectedPreviousDigest ||
          journalRecord.entrySequence !== expectedSequence
        ) {
          throw new Error("forward capture journal changed during this capture run");
        }
        const handle = await open(journalPath, "a", 0o600);
        try {
          await handle.write(bytes);
          await handle.sync();
        } finally {
          await handle.close();
        }
        await chmod(journalPath, 0o600);
      } finally {
        await lock.close();
        await unlink(lockPath);
      }
    },
    readLastJournalRecord,
    async readJournalRecords() {
      let bytes: Uint8Array;
      try {
        bytes = await fileBytes(journalPath, MAX_JOURNAL_BYTES);
      } catch (error) {
        if (errorCode(error) === "ENOENT") {
          return Object.freeze([]);
        }
        throw error;
      }
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const lines = text.split("\n");
      if (lines.at(-1) !== "") {
        throw new Error("forward capture journal has an incomplete final record");
      }
      lines.pop();
      return Object.freeze(lines.map((line, index) => {
        if (line.trim() === "") {
          throw new Error(`forward capture journal record ${index} is empty`);
        }
        return JSON.parse(line) as unknown;
      }));
    },
  });
}
