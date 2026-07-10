import { randomBytes as nodeRandomBytes } from "node:crypto";

export type UuidV7Dependencies = {
  now?: () => number;
  randomBytes?: (length: number) => Uint8Array;
};

const MAX_UUID_V7_TIMESTAMP = 0xffffffffffff;

function defaultRandomBytes(length: number) {
  return nodeRandomBytes(length);
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function generateUuidV7(dependencies: UuidV7Dependencies = {}) {
  const timestamp = (dependencies.now ?? Date.now)();
  if (
    !Number.isSafeInteger(timestamp)
    || timestamp < 0
    || timestamp > MAX_UUID_V7_TIMESTAMP
  ) {
    throw new Error("Clock must return a valid UUIDv7 Unix millisecond timestamp");
  }

  const random = (dependencies.randomBytes ?? defaultRandomBytes)(10);
  if (random.length !== 10) {
    throw new Error("UUIDv7 random source must return exactly 10 bytes");
  }

  const bytes = new Uint8Array(16);
  let remaining = timestamp;
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = remaining % 256;
    remaining = Math.floor(remaining / 256);
  }
  bytes[6] = 0x70 | (random[0] & 0x0f);
  bytes[7] = random[1];
  bytes[8] = 0x80 | (random[2] & 0x3f);
  bytes.set(random.subarray(3), 9);

  const encoded = hex(bytes);
  return `${encoded.slice(0, 8)}-${encoded.slice(8, 12)}-${encoded.slice(12, 16)}-${encoded.slice(16, 20)}-${encoded.slice(20)}`;
}
