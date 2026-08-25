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
  buildParagraphStaircaseLines,
  findHighlightRangeIndexForOffset,
  findTextPosition,
  getHighlightRanges,
  getHighlightRangesForPrefix,
  getHighlightSegments,
  getHighlightSpanStyle,
  getRsvpHighlightTiming,
  isEnglishLanguageTag,
  splitParagraphIntoSentenceParts,
} = await import("../lib/provotypographer/core.ts");

assert.deepEqual(
  splitParagraphIntoSentenceParts("One.   Two three."),
  [
    { text: "One.", separatorBefore: "" },
    { text: "Two three.", separatorBefore: " " },
  ],
  "sentence splitting should preserve a normalized logical separator",
);

const staircaseLines = buildParagraphStaircaseLines({
  paragraph: "Administration. It was her complaint.",
  startLineIndex: 0,
  getLineWidthCh: () => 18,
});
assert.deepEqual(
  staircaseLines.map((line) => line.parts.map((part) => part.text).join("")),
  ["Administration.", "It was her complaint."],
  "sentence boundaries should wrap as word boundaries without stranding letters",
);
assert.equal(
  buildParagraphStaircaseLines({
    paragraph: "One.Two",
    startLineIndex: 0,
    getLineWidthCh: () => 20,
  })[0]?.parts.map((part) => part.text).join(""),
  "One.Two",
  "staircase layout should not invent separators absent from the source",
);

assert.equal(isEnglishLanguageTag("en-US"), true);
assert.equal(isEnglishLanguageTag("en_GB"), true);
assert.equal(isEnglishLanguageTag("en"), true);
assert.equal(isEnglishLanguageTag("fr-CA"), false);
assert.equal(isEnglishLanguageTag(""), false);

for (const style of ["bold", "background", "outline"]) {
  const spanStyle = getHighlightSpanStyle(style);
  assert.equal(
    spanStyle.paddingInline,
    undefined,
    `${style} highlighting must not add horizontal padding`,
  );
  assert.equal(
    spanStyle.fontWeight,
    undefined,
    `${style} highlighting must not change font metrics`,
  );
}

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

assert.deepEqual(
  getHighlightRanges("One two three. Four five six.", "word", 2, false),
  [
    { start: 0, end: 7 },
    { start: 4, end: 13 },
    { start: 15, end: 24 },
    { start: 20, end: 28 },
  ],
  "word ranges should clamp inside sentences without duplicate tail windows",
);

assert.deepEqual(
  getHighlightRanges("One.\n\nTwo three.", "word", 2, false),
  [
    { start: 0, end: 3 },
    { start: 6, end: 15 },
  ],
  "word ranges should include the first word after a paragraph break",
);

assert.deepEqual(
  getHighlightRanges("One two. Three four.", "word", 2, true),
  [
    { start: 0, end: 8 },
    { start: 4, end: 14 },
    { start: 9, end: 20 },
  ],
  "word ranges should preserve cross-boundary windows when enabled",
);

const threeParagraphViewport = "Alpha one.\n\nBeta two.\n\nGamma three.";
const firstParagraphEnd = threeParagraphViewport.indexOf("\n\n");
assert.deepEqual(
  getHighlightRangesForPrefix({
    value: threeParagraphViewport,
    prefixEnd: firstParagraphEnd,
    unit: "word",
    size: 1,
    allowBoundaryCrossing: false,
  }),
  [
    { start: 0, end: 5 },
    { start: 6, end: 9 },
  ],
  "flow-locked highlighting should limit ranges to the advancing paragraph",
);
assert.equal(
  getHighlightRangesForPrefix({
    value: "Gamma Alpha Beta",
    prefixEnd: "Gamma Alpha".length,
    unit: "word",
    size: 1,
    allowBoundaryCrossing: false,
  }).length,
  2,
  "flow range limiting should support wrapped end-of-document windows",
);
assert.deepEqual(
  getHighlightRangesForPrefix({
    value: "One two. Three four.",
    prefixEnd: "One two.".length,
    unit: "word",
    size: 2,
    allowBoundaryCrossing: false,
  }),
  [{ start: 0, end: 7 }],
  "flow range limiting should retain sentence-boundary clamping",
);

assert.deepEqual(getRsvpHighlightTiming(1200, 225), {
  traversalDurationMs: 1200,
  totalDurationMs: 1425,
});

assert.equal(
  findHighlightRangeIndexForOffset(
    getHighlightRanges("One.\n\nTwo three.", "word", 2, false),
    6,
  ),
  1,
  "continuous range lookup should resolve to the first range after a paragraph break",
);

const firstNode = { id: "first" };
const secondNode = { id: "second" };
assert.deepEqual(
  findTextPosition(
    [
      { node: firstNode, start: 0, end: 5 },
      { node: secondNode, start: 5, end: 11 },
    ],
    5,
    "start",
  ),
  { node: secondNode, offset: 0 },
  "range starts at adjacent text-node boundaries should resolve to the next text node",
);
assert.deepEqual(
  findTextPosition(
    [
      { node: firstNode, start: 0, end: 5 },
      { node: secondNode, start: 5, end: 11 },
    ],
    5,
    "end",
  ),
  { node: firstNode, offset: 5 },
  "range ends at adjacent text-node boundaries should resolve to the previous text node",
);

const longText = Array.from({ length: 1500 }, (_, index) =>
  `Sentence ${index} has several words for range generation.`,
).join(" ");
const startMs = performance.now();
const longRanges = getHighlightRanges(longText, "word", 3, false);
const elapsedMs = performance.now() - startMs;
assert.equal(
  longRanges.length,
  1500 * 6,
  "long sentence-clamped word ranges should not create duplicate tail windows",
);
assert.ok(
  elapsedMs < 1000,
  `long sentence-clamped word range generation took ${elapsedMs.toFixed(1)}ms`,
);

console.log("Highlight boundary helper tests passed.");
