import type { ScanRunStatus } from "./scan-runtime";

export type ScanActionDisposition = {
  httpStatus: 200 | 409 | 503;
  ok: boolean;
  retryable: boolean;
};

export function scanActionDisposition(status: ScanRunStatus): ScanActionDisposition {
  if (status === "updated") {
    return {
      httpStatus: 200,
      ok: true,
      retryable: false,
    };
  }

  if (status === "in_progress") {
    return {
      httpStatus: 409,
      ok: false,
      retryable: true,
    };
  }

  return {
    httpStatus: 503,
    ok: false,
    retryable: status === "served_cache",
  };
}
