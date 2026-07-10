import assert from "node:assert/strict";
import test from "node:test";
import { generateUuidV7 } from "./uuid-v7";

test("generateUuidV7 encodes the injected Unix millisecond clock", () => {
  const uuid = generateUuidV7({
    now: () => 0x0123456789ab,
    randomBytes: () => Uint8Array.from([0xcd, 0xef, 0xff, 1, 2, 3, 4, 5, 6, 7]),
  });

  assert.equal(uuid, "01234567-89ab-7def-bf01-020304050607");
});

test("generateUuidV7 requests ten random bytes and applies RFC version and variant bits", () => {
  const requestedLengths: number[] = [];
  const uuid = generateUuidV7({
    now: () => 0,
    randomBytes: (length: number) => {
      requestedLengths.push(length);
      return new Uint8Array(length);
    },
  });

  assert.deepEqual(requestedLengths, [10]);
  assert.match(uuid, /^00000000-0000-7000-8000-000000000000$/);
  assert.equal(uuid[14], "7");
  assert.match(uuid[19], /^[89ab]$/);
});

test("generateUuidV7 reads injected clock and randomness for every generated identifier", () => {
  let clock = 1_000;
  let random = 0;
  const dependencies = {
    now: () => clock++,
    randomBytes: (length: number) => {
      const bytes = new Uint8Array(length);
      bytes.fill(random++);
      return bytes;
    },
  };

  const first = generateUuidV7(dependencies);
  const second = generateUuidV7(dependencies);

  assert.notEqual(first, second);
  assert.equal(first.slice(0, 13), "00000000-03e8");
  assert.equal(second.slice(0, 13), "00000000-03e9");
});

test("generateUuidV7 rejects invalid clocks and random sources", () => {
  assert.throws(
    () => generateUuidV7({ now: () => -1, randomBytes: () => new Uint8Array(10) }),
    /valid UUIDv7 Unix millisecond timestamp/,
  );
  assert.throws(
    () => generateUuidV7({ now: () => 0, randomBytes: () => new Uint8Array(9) }),
    /exactly 10 bytes/,
  );
});
