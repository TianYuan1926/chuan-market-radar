import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import ts from "typescript";

const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs"] as const;
const IMPORT_RESOLUTION_EXTENSIONS = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
] as const;
const GRAPH_SCAN_ROOTS = ["src", "deploy", "scripts", "tools"] as const;
const V2_OWNED_GRAPH_PREFIXES = GRAPH_SCAN_ROOTS.map(
  (root) => `${root}/v2/`,
);
const V2_OWNED_REPOSITORY_PREFIXES = [
  ...V2_OWNED_GRAPH_PREFIXES,
  ".github/workflows/v2-",
] as const;
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".tmp",
  "node_modules",
  "dist",
  "build",
]);

export type LegacyCapabilityAtlas = Readonly<{
  schemaVersion: string;
  legacyDeletionAllowed: boolean;
  capabilities: readonly Readonly<{
    id: string;
    paths: readonly string[];
    classification: string;
    v2Destination: string;
    deleteGate: string;
  }>[];
}>;

export type LegacyExtractionPolicy = Readonly<{
  schemaVersion: string;
  reviewedAgainstCommit: string;
  legacyRuntimeImportAllowed: boolean;
  copyPasteWithoutBehavioralFixtureAllowed: boolean;
  entries: readonly LegacyExtractionPolicyEntry[];
}>;

export type LegacyExtractionPolicyEntry = Readonly<{
  capabilityId: string;
  decision: string;
  decisionReason: string;
  extractionCandidates: readonly Readonly<{
    sourcePath: string;
    symbols: readonly string[];
    requiredEvidence: readonly string[];
  }>[];
  storageObjects: readonly string[];
}>;

export type LegacyConsumerMapCapability = Readonly<{
  capabilityId: string;
  classification: string;
  v2Destination: string;
  decision: string;
  decisionReason: string;
  sourcePaths: readonly string[];
  sourceFiles: readonly string[];
  sourceDigest: string;
  directRuntimeConsumers: readonly string[];
  directTestConsumers: readonly string[];
  runtimeEntrypoints: readonly string[];
  extractionCandidates: LegacyExtractionPolicyEntry["extractionCandidates"];
  storageObjects: readonly string[];
  deleteGate: string;
  deletionAllowedNow: false;
}>;

export type LegacyConsumerMap = Readonly<{
  schemaVersion: "market-radar-legacy-consumer-map.v1";
  atlasSchemaVersion: string;
  extractionPolicySchemaVersion: string;
  reviewedAgainstCommit: string;
  sourceGraphDigest: string;
  legacyRuntimeImportAllowed: false;
  copyPasteWithoutBehavioralFixtureAllowed: false;
  legacyDeletionAllowed: false;
  capabilities: readonly LegacyConsumerMapCapability[];
  totals: Readonly<{
    capabilities: number;
    sourceFiles: number;
    directRuntimeConsumerEdges: number;
    directTestConsumerEdges: number;
    runtimeEntrypoints: number;
    extractionCandidates: number;
    storageObjects: number;
  }>;
}>;

function toRepositoryPath(repositoryRoot: string, absolutePath: string): string {
  return relative(repositoryRoot, absolutePath).split(sep).join("/");
}

function listFiles(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }

  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    throw new Error(`Legacy consumer map refuses symlink source: ${path}`);
  }
  if (stat.isFile()) {
    return [path];
  }
  if (!stat.isDirectory()) {
    return [];
  }

  const files: string[] = [];
  for (const name of readdirSync(path).sort()) {
    if (IGNORED_DIRECTORIES.has(name)) {
      continue;
    }
    files.push(...listFiles(resolve(path, name)));
  }
  return files;
}

function isCodeFile(path: string): boolean {
  return CODE_EXTENSIONS.includes(
    extname(path) as (typeof CODE_EXTENSIONS)[number],
  );
}

export function isV2OwnedRepositoryPath(repositoryPath: string): boolean {
  return V2_OWNED_REPOSITORY_PREFIXES.some((prefix) =>
    repositoryPath.startsWith(prefix)
  );
}

function isV2OwnedPath(repositoryRoot: string, path: string): boolean {
  return isV2OwnedRepositoryPath(toRepositoryPath(repositoryRoot, path));
}

function isTestFile(path: string): boolean {
  return /(?:^|\/)(?:fixtures?|testing)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(
    path,
  );
}

function isRuntimeEntrypoint(path: string): boolean {
  return (
    /^src\/app\/.+\/(?:page|route)\.tsx?$/u.test(path) ||
    /^src\/app\/(?:page|layout)\.tsx?$/u.test(path) ||
    /^deploy\/workers\/[^/]+\.[cm]?js$/u.test(path) ||
    /^src\/scripts\/[^/]+\.ts$/u.test(path) ||
    /^scripts\/.+\.(?:mjs|js|sh)$/u.test(path) ||
    /^tools\/[^/]+\.mjs$/u.test(path)
  );
}

function candidateFile(path: string): string | null {
  for (const extension of IMPORT_RESOLUTION_EXTENSIONS) {
    const file = `${path}${extension}`;
    if (existsSync(file) && lstatSync(file).isFile()) {
      return resolve(file);
    }
  }
  for (const extension of IMPORT_RESOLUTION_EXTENSIONS.slice(1)) {
    const file = resolve(path, `index${extension}`);
    if (existsSync(file) && lstatSync(file).isFile()) {
      return resolve(file);
    }
  }
  return null;
}

function resolveImport(
  repositoryRoot: string,
  importer: string,
  specifier: string,
): string | null {
  if (specifier.startsWith("@/")) {
    return candidateFile(resolve(repositoryRoot, "src", specifier.slice(2)));
  }
  if (specifier.startsWith(".")) {
    return candidateFile(resolve(dirname(importer), specifier));
  }
  return null;
}

function importedFiles(repositoryRoot: string, file: string): string[] {
  const source = readFileSync(file, "utf8");
  const imports = ts.preProcessFile(source, true, true).importedFiles;
  return imports
    .map((entry) => resolveImport(repositoryRoot, file, entry.fileName))
    .filter((path): path is string => path !== null);
}

function exportedNames(file: string): Set<string> {
  const sourceText = readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const names = new Set<string>();

  function hasExportModifier(node: ts.Node): boolean {
    return ts.canHaveModifiers(node) &&
      (ts.getModifiers(node) ?? []).some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      );
  }

  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement) && statement.exportClause) {
      if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          names.add(element.name.text);
        }
      }
      continue;
    }
    if (!hasExportModifier(statement)) {
      continue;
    }
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      names.add(statement.name.text);
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          names.add(declaration.name.text);
        }
      }
    }
  }

  return names;
}

function digestFiles(repositoryRoot: string, files: readonly string[]): string {
  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(toRepositoryPath(repositoryRoot, file));
    digest.update("\0");
    digest.update(readFileSync(file));
    digest.update("\0");
  }
  return `sha256:${digest.digest("hex")}`;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function validatePolicy(
  repositoryRoot: string,
  atlas: LegacyCapabilityAtlas,
  policy: LegacyExtractionPolicy,
): Map<string, LegacyExtractionPolicyEntry> {
  if (atlas.legacyDeletionAllowed) {
    throw new Error("Legacy atlas cannot authorize deletion during M0");
  }
  if (
    policy.legacyRuntimeImportAllowed ||
    policy.copyPasteWithoutBehavioralFixtureAllowed
  ) {
    throw new Error("Legacy extraction policy weakens the V2 isolation boundary");
  }

  const atlasIds = new Set(atlas.capabilities.map((capability) => capability.id));
  const policyById = new Map(
    policy.entries.map((entry) => [entry.capabilityId, entry] as const),
  );
  if (
    policyById.size !== policy.entries.length ||
    policyById.size !== atlasIds.size ||
    [...atlasIds].some((id) => !policyById.has(id))
  ) {
    throw new Error("Extraction policy must cover every Legacy capability exactly once");
  }

  const storageCorpus = [
    ...listFiles(resolve(repositoryRoot, "src/lib/persistence")),
    ...listFiles(resolve(repositoryRoot, "migrations")),
  ]
    .filter((file) => !isTestFile(toRepositoryPath(repositoryRoot, file)))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

  for (const entry of policy.entries) {
    for (const candidate of entry.extractionCandidates) {
      const absolutePath = resolve(repositoryRoot, candidate.sourcePath);
      if (!existsSync(absolutePath) || !lstatSync(absolutePath).isFile()) {
        throw new Error(`Extraction candidate source missing: ${candidate.sourcePath}`);
      }
      const exports = exportedNames(absolutePath);
      for (const symbol of candidate.symbols) {
        if (!exports.has(symbol)) {
          throw new Error(
            `Extraction candidate is not exported: ${candidate.sourcePath}#${symbol}`,
          );
        }
      }
      if (candidate.requiredEvidence.length === 0) {
        throw new Error(
          `Extraction candidate lacks required evidence: ${candidate.sourcePath}`,
        );
      }
    }
    for (const storageObject of entry.storageObjects) {
      if (!storageCorpus.includes(storageObject)) {
        throw new Error(`Storage object not found in schema sources: ${storageObject}`);
      }
    }
  }

  return policyById;
}

export function buildLegacyConsumerMap(
  repositoryRoot: string,
  atlas: LegacyCapabilityAtlas,
  policy: LegacyExtractionPolicy,
): LegacyConsumerMap {
  const policyById = validatePolicy(repositoryRoot, atlas, policy);
  const graphFiles = uniqueSorted(
    GRAPH_SCAN_ROOTS.flatMap((root) => listFiles(resolve(repositoryRoot, root)))
      .filter(isCodeFile)
      .filter((file) => !isV2OwnedPath(repositoryRoot, file))
      .map((file) => resolve(file)),
  );
  const reverseImports = new Map<string, Set<string>>();

  for (const importer of graphFiles) {
    for (const imported of importedFiles(repositoryRoot, importer)) {
      const consumers = reverseImports.get(imported) ?? new Set<string>();
      consumers.add(importer);
      reverseImports.set(imported, consumers);
    }
  }

  const capabilities = atlas.capabilities.map((capability) => {
    const policyEntry = policyById.get(capability.id);
    if (!policyEntry) {
      throw new Error(`Extraction policy missing capability: ${capability.id}`);
    }
    const sourceFiles = uniqueSorted(
      capability.paths.flatMap((path) =>
        listFiles(resolve(repositoryRoot, path)).map((file) => resolve(file)),
      ).filter((file) => !isV2OwnedPath(repositoryRoot, file)),
    );
    if (sourceFiles.length === 0) {
      throw new Error(`Legacy capability has no source files: ${capability.id}`);
    }
    const sourceSet = new Set(sourceFiles);
    const directRuntimeConsumers = new Set<string>();
    const directTestConsumers = new Set<string>();

    for (const sourceFile of sourceFiles) {
      for (const consumer of reverseImports.get(sourceFile) ?? []) {
        if (sourceSet.has(consumer)) {
          continue;
        }
        const consumerPath = toRepositoryPath(repositoryRoot, consumer);
        if (isTestFile(consumerPath)) {
          directTestConsumers.add(consumerPath);
        } else {
          directRuntimeConsumers.add(consumerPath);
        }
      }
    }

    const queue = [...sourceFiles];
    const visited = new Set(queue);
    const runtimeEntrypoints = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      const currentPath = toRepositoryPath(repositoryRoot, current);
      if (!isTestFile(currentPath) && isRuntimeEntrypoint(currentPath)) {
        runtimeEntrypoints.add(currentPath);
      }
      for (const consumer of reverseImports.get(current) ?? []) {
        if (!visited.has(consumer)) {
          visited.add(consumer);
          queue.push(consumer);
        }
      }
    }

    return {
      capabilityId: capability.id,
      classification: capability.classification,
      v2Destination: capability.v2Destination,
      decision: policyEntry.decision,
      decisionReason: policyEntry.decisionReason,
      sourcePaths: [...capability.paths].sort(),
      sourceFiles: sourceFiles.map((file) =>
        toRepositoryPath(repositoryRoot, file),
      ),
      sourceDigest: digestFiles(repositoryRoot, sourceFiles),
      directRuntimeConsumers: uniqueSorted(directRuntimeConsumers),
      directTestConsumers: uniqueSorted(directTestConsumers),
      runtimeEntrypoints: uniqueSorted(runtimeEntrypoints),
      extractionCandidates: policyEntry.extractionCandidates,
      storageObjects: [...policyEntry.storageObjects].sort(),
      deleteGate: capability.deleteGate,
      deletionAllowedNow: false as const,
    };
  });

  const graphDigest = digestFiles(repositoryRoot, graphFiles);
  return {
    schemaVersion: "market-radar-legacy-consumer-map.v1",
    atlasSchemaVersion: atlas.schemaVersion,
    extractionPolicySchemaVersion: policy.schemaVersion,
    reviewedAgainstCommit: policy.reviewedAgainstCommit,
    sourceGraphDigest: graphDigest,
    legacyRuntimeImportAllowed: false,
    copyPasteWithoutBehavioralFixtureAllowed: false,
    legacyDeletionAllowed: false,
    capabilities,
    totals: {
      capabilities: capabilities.length,
      sourceFiles: new Set(
        capabilities.flatMap((capability) => capability.sourceFiles),
      ).size,
      directRuntimeConsumerEdges: capabilities.reduce(
        (sum, capability) => sum + capability.directRuntimeConsumers.length,
        0,
      ),
      directTestConsumerEdges: capabilities.reduce(
        (sum, capability) => sum + capability.directTestConsumers.length,
        0,
      ),
      runtimeEntrypoints: new Set(
        capabilities.flatMap((capability) => capability.runtimeEntrypoints),
      ).size,
      extractionCandidates: capabilities.reduce(
        (sum, capability) => sum + capability.extractionCandidates.length,
        0,
      ),
      storageObjects: new Set(
        capabilities.flatMap((capability) => capability.storageObjects),
      ).size,
    },
  };
}
