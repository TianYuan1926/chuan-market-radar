import assert from "node:assert/strict";
import test from "node:test";
import postcss from "postcss";
import sharp from "sharp";

test("A0 image runtime can encode and decode an exact PNG", async () => {
  const png = await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 4,
      background: { r: 20, g: 40, b: 60, alpha: 1 },
    },
  }).png().toBuffer();
  const metadata = await sharp(png).metadata();

  assert.equal(sharp.versions.sharp, "0.35.3");
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 2);
  assert.equal(metadata.height, 2);
});

test("A0 CSS runtime parses and serializes modern declarations", () => {
  const root = postcss.parse(
    ".radar { color: oklch(0.8 0.15 80); container-type: inline-size; }",
  );

  assert.equal(root.nodes.length, 1);
  assert.match(root.toString(), /container-type:\s*inline-size/u);
});
