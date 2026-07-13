export function nextFixedRateRunAt({
  intervalMs,
  nowMs,
  previousScheduledAtMs,
}) {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error("intervalMs must be a positive finite number");
  }

  if (!Number.isFinite(nowMs) || !Number.isFinite(previousScheduledAtMs)) {
    throw new Error("schedule timestamps must be finite numbers");
  }

  const firstCandidate = previousScheduledAtMs + intervalMs;

  if (firstCandidate > nowMs) {
    return firstCandidate;
  }

  const missedSlots = Math.floor((nowMs - firstCandidate) / intervalMs) + 1;
  return firstCandidate + missedSlots * intervalMs;
}
