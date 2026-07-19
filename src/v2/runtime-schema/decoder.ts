import type { AuthorityOutputName } from "../domain/module-registry";
import {
  RUNTIME_SCHEMA_NAMES,
  RUNTIME_SCHEMA_REGISTRY,
  type RuntimeArtifactByName,
} from "./registry";

export const RUNTIME_BOUNDARY_KINDS = [
  "API",
  "PROCESS",
  "STORAGE",
  "REPLAY",
] as const;

export type RuntimeBoundaryKind = (typeof RUNTIME_BOUNDARY_KINDS)[number];

export type RuntimeDecodeIssue = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type RuntimeDecodeErrorCode =
  | "UNKNOWN_ARTIFACT"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_JSON"
  | "UNSAFE_OBJECT_GRAPH"
  | "SCHEMA_REJECTED";

export type RuntimeDecodeFailure = Readonly<{
  ok: false;
  artifactName: string;
  boundary: RuntimeBoundaryKind;
  errorCode: RuntimeDecodeErrorCode;
  issues: readonly RuntimeDecodeIssue[];
}>;

export type RuntimeDecodeSuccess<Name extends AuthorityOutputName> = Readonly<{
  ok: true;
  artifactName: Name;
  boundary: RuntimeBoundaryKind;
  value: Readonly<RuntimeArtifactByName[Name]>;
}>;

export type RuntimeDecodeResult<Name extends AuthorityOutputName> =
  | RuntimeDecodeSuccess<Name>
  | RuntimeDecodeFailure;

export const DEFAULT_MAX_RUNTIME_JSON_BYTES = 8 * 1024 * 1024;
export const HARD_MAX_RUNTIME_JSON_BYTES = 32 * 1024 * 1024;
const MAX_OBJECT_DEPTH = 64;
const MAX_OBJECT_NODES = 100_000;
const MAX_CONTAINER_ENTRIES = 100_000;
const MAX_REPORTED_ISSUES = 32;
const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const schemaNames = new Set<string>(RUNTIME_SCHEMA_NAMES);

function issuePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return "$";
  }

  return path.reduce<string>((result, segment) => {
    if (typeof segment === "number") {
      return `${result}[${segment}]`;
    }
    const value = String(segment);
    return /^[A-Za-z_$][\w$]*$/u.test(value)
      ? `${result}.${value}`
      : `${result}[${JSON.stringify(value)}]`;
  }, "$");
}

function failure(
  artifactName: string,
  boundary: RuntimeBoundaryKind,
  errorCode: RuntimeDecodeErrorCode,
  issues: readonly RuntimeDecodeIssue[],
): RuntimeDecodeFailure {
  return Object.freeze({
    ok: false,
    artifactName,
    boundary,
    errorCode,
    issues: Object.freeze(issues.slice(0, MAX_REPORTED_ISSUES)),
  });
}

function inspectObjectGraph(value: unknown): RuntimeDecodeIssue[] {
  const issues: RuntimeDecodeIssue[] = [];
  const seen = new WeakSet<object>();
  let nodeCount = 0;

  function visit(current: unknown, path: PropertyKey[], depth: number): void {
    if (issues.length >= MAX_REPORTED_ISSUES) {
      return;
    }
    if (depth > MAX_OBJECT_DEPTH) {
      issues.push({
        code: "object_depth_exceeded",
        path: issuePath(path),
        message: `object depth exceeds ${MAX_OBJECT_DEPTH}`,
      });
      return;
    }

    nodeCount += 1;
    if (nodeCount > MAX_OBJECT_NODES) {
      issues.push({
        code: "object_node_limit_exceeded",
        path: issuePath(path),
        message: `object node count exceeds ${MAX_OBJECT_NODES}`,
      });
      return;
    }
    if (current === null || typeof current !== "object") {
      return;
    }
    if (seen.has(current)) {
      issues.push({
        code: "cyclic_object_graph",
        path: issuePath(path),
        message: "cyclic objects are not valid cross-boundary artifacts",
      });
      return;
    }

    const prototype = Object.getPrototypeOf(current);
    if (
      !Array.isArray(current) &&
      prototype !== Object.prototype &&
      prototype !== null
    ) {
      issues.push({
        code: "non_plain_object",
        path: issuePath(path),
        message: "cross-boundary artifacts must contain only plain objects and arrays",
      });
      return;
    }

    seen.add(current);
    const isArray = Array.isArray(current);
    const ownKeys = Reflect.ownKeys(current);
    const entryLimit = MAX_CONTAINER_ENTRIES + (isArray ? 1 : 0);
    if (ownKeys.length > entryLimit) {
      issues.push({
        code: "container_entry_limit_exceeded",
        path: issuePath(path),
        message: `container entry count exceeds ${MAX_CONTAINER_ENTRIES}`,
      });
      seen.delete(current);
      return;
    }
    if (isArray && current.length > MAX_CONTAINER_ENTRIES) {
      issues.push({
        code: "array_length_limit_exceeded",
        path: issuePath(path),
        message: `array length exceeds ${MAX_CONTAINER_ENTRIES}`,
      });
      seen.delete(current);
      return;
    }

    const entries: Array<[string, unknown]> = [];
    let arrayIndexCount = 0;
    for (const key of ownKeys) {
      if (isArray && key === "length") {
        continue;
      }
      if (typeof key !== "string") {
        issues.push({
          code: "symbol_object_key",
          path: issuePath(path),
          message: "symbol keys are forbidden in cross-boundary artifacts",
        });
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || descriptor.get || descriptor.set) {
        issues.push({
          code: "accessor_object_property",
          path: issuePath([...path, key]),
          message: "accessor properties are forbidden in cross-boundary artifacts",
        });
        continue;
      }
      if (!descriptor.enumerable) {
        issues.push({
          code: "hidden_object_property",
          path: issuePath([...path, key]),
          message: "non-enumerable properties are forbidden in cross-boundary artifacts",
        });
        continue;
      }
      if (isArray) {
        if (!/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= current.length) {
          issues.push({
            code: "custom_array_property",
            path: issuePath([...path, key]),
            message: "arrays cannot carry custom cross-boundary properties",
          });
          continue;
        }
        arrayIndexCount += 1;
      }
      entries.push([key, descriptor.value]);
    }
    if (isArray && arrayIndexCount !== current.length) {
      issues.push({
        code: "sparse_array",
        path: issuePath(path),
        message: "sparse arrays are forbidden in cross-boundary artifacts",
      });
    }

    for (const [key, child] of entries) {
      if (FORBIDDEN_OBJECT_KEYS.has(key)) {
        issues.push({
          code: "forbidden_object_key",
          path: issuePath([...path, key]),
          message: "prototype-mutating object keys are forbidden",
        });
      } else {
        visit(child, [...path, key], depth + 1);
      }
    }
    seen.delete(current);
  }

  visit(value, [], 0);
  return issues;
}

function traceChronologyIssues(value: unknown): RuntimeDecodeIssue[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.sourceCutoff !== "string" ||
    typeof record.generatedAt !== "string"
  ) {
    return [];
  }
  if (Date.parse(record.sourceCutoff) <= Date.parse(record.generatedAt)) {
    return [];
  }
  return [
    {
      code: "trace_cutoff_after_generation",
      path: "$.sourceCutoff",
      message: "source cutoff cannot be later than artifact generation time",
    },
  ];
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return value;
  }

  seen.add(value);
  for (const child of Object.values(value)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}

export function isAuthorityOutputName(
  value: string,
): value is AuthorityOutputName {
  return schemaNames.has(value);
}

export function decodeRuntimeArtifact<Name extends AuthorityOutputName>(
  artifactName: Name,
  input: unknown,
  boundary: RuntimeBoundaryKind,
): RuntimeDecodeResult<Name> {
  let graphIssues: RuntimeDecodeIssue[];
  try {
    graphIssues = inspectObjectGraph(input);
  } catch {
    return failure(artifactName, boundary, "UNSAFE_OBJECT_GRAPH", [
      {
        code: "object_inspection_failed",
        path: "$",
        message: "cross-boundary object inspection failed closed",
      },
    ]);
  }
  if (graphIssues.length > 0) {
    return failure(
      artifactName,
      boundary,
      "UNSAFE_OBJECT_GRAPH",
      graphIssues,
    );
  }

  const schema = RUNTIME_SCHEMA_REGISTRY[artifactName];
  const result = schema.safeParse(input);
  if (!result.success) {
    return failure(
      artifactName,
      boundary,
      "SCHEMA_REJECTED",
      result.error.issues.map((issue) => ({
        code: issue.code,
        path: issuePath(issue.path),
        message: issue.code === "custom"
          ? issue.message
          : `runtime schema constraint failed: ${issue.code}`,
      })),
    );
  }

  const chronologyIssues = traceChronologyIssues(result.data);
  if (chronologyIssues.length > 0) {
    return failure(
      artifactName,
      boundary,
      "SCHEMA_REJECTED",
      chronologyIssues,
    );
  }

  return Object.freeze({
    ok: true,
    artifactName,
    boundary,
    value: deepFreeze(result.data) as Readonly<RuntimeArtifactByName[Name]>,
  });
}

export function decodeNamedRuntimeArtifact(
  artifactName: string,
  input: unknown,
  boundary: RuntimeBoundaryKind,
): RuntimeDecodeResult<AuthorityOutputName> {
  if (!isAuthorityOutputName(artifactName)) {
    return failure(artifactName, boundary, "UNKNOWN_ARTIFACT", [
      {
        code: "unknown_artifact_name",
        path: "$",
        message: "artifact name has no registered authority schema",
      },
    ]);
  }

  return decodeRuntimeArtifact(artifactName, input, boundary);
}

export function decodeRuntimeJson<Name extends AuthorityOutputName>(
  artifactName: Name,
  json: string,
  boundary: RuntimeBoundaryKind,
  maximumBytes = DEFAULT_MAX_RUNTIME_JSON_BYTES,
): RuntimeDecodeResult<Name> {
  const requestedMaximum = Number.isFinite(maximumBytes)
    ? Math.floor(maximumBytes)
    : DEFAULT_MAX_RUNTIME_JSON_BYTES;
  const boundedMaximum = Math.min(
    Math.max(1, requestedMaximum),
    HARD_MAX_RUNTIME_JSON_BYTES,
  );
  const payloadBytes = new TextEncoder().encode(json).byteLength;

  if (payloadBytes > boundedMaximum) {
    return failure(artifactName, boundary, "PAYLOAD_TOO_LARGE", [
      {
        code: "payload_byte_limit_exceeded",
        path: "$",
        message: `payload exceeds the ${boundedMaximum}-byte boundary limit`,
      },
    ]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    return failure(artifactName, boundary, "INVALID_JSON", [
      {
        code: "invalid_json",
        path: "$",
        message: "payload is not valid JSON",
      },
    ]);
  }

  return decodeRuntimeArtifact(artifactName, parsed, boundary);
}
