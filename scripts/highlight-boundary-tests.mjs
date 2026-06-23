import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      let resolved = path.resolve(specifier.slice(2));
      if (!path.extname(resolved) && existsSync(`${resolved}.ts`)) {
        resolved = `${resolved}.ts`;
      }
      if (!path.extname(resolved) && existsSync(`${resolved}.tsx`)) {
        resolved = `${resolved}.tsx`;
      }
      return {
        url: pathToFileURL(resolved).href,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  getHighlightRanges,
  getHighlightSegments,
} = await import("../lib/provotypographer/core.ts");

assert.equal(
  getHighlightSegments("the last. First", "word", 2, 1, false).highlight,
  "the last",
  "word highlight should clamp inside the current sentence by default",
);

assert.equal(
  getHighlightSegments("the last. First", "word", 2, 1, true).highlight,
  "last. First",
  "word highlight should preserve cross-boundary windows when enabled",
);

assert.equal(
  getHighlightSegments("abc. de", "char", 4, 2, false).highlight,
  "abc.",
  "char highlight should clamp to the current sentence when size crosses a boundary",
);

assert.deepEqual(
  getHighlightRanges("One. Two.", "sentence", 2, false),
  [{ start: 0, end: 9 }],
  "sentence highlight ranges should be unchanged by boundary clamping",
);

console.log("Highlight boundary helper tests passed.");
