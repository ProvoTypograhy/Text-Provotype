import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  LEXICAL_FIXATION_MAX_MS,
  LEXICAL_FIXATION_MIN_MS,
  extractLexicalWords,
  getLexicalAdvanceDurationMs,
  getPredictedFixationMs,
  normalizeLexicalWord,
  parseFixationFormulaParamsCsv,
  parsePredictedGazeDurationsCsv,
} from "../lib/provotypographer/lexical-timing.ts";

const [paramsCsv, predictionsCsv] = await Promise.all([
  readFile(new URL("../public/data/fixation_formula_params.csv", import.meta.url), "utf8"),
  readFile(
    new URL("../public/data/predicted_gaze_durations_default.csv", import.meta.url),
    "utf8",
  ),
]);
const params = parseFixationFormulaParamsCsv(paramsCsv);
const predictions = parsePredictedGazeDurationsCsv(predictionsCsv);
const resources = { params, predictedDefaultMsByWord: predictions };

assert.equal(params.defaultBaselineMs, 218.498582640921);
assert.equal(predictions.size, 40481);
assert.equal(normalizeLexicalWord("“DON’T!”"), "don't");
assert.deepEqual(extractLexicalWords("Hello, don’t stop—now."), [
  "hello",
  "don't",
  "stop-now",
]);

const knownDefault = getPredictedFixationMs("a", resources, params.defaultBaselineMs);
assert.ok(Math.abs(knownDefault - 179.936675250976) < 1e-9);
const scaledKnown = getPredictedFixationMs("a", resources, 300);
assert.ok(Math.abs(scaledKnown - 179.936675250976 * (300 / params.defaultBaselineMs)) < 1e-9);

const unknownWord = "quizzaciously";
const difficulty =
  params.betaLengthLd *
    ((unknownWord.length - params.lengthMu) / params.lengthSd) +
  params.betaFreqLd * ((0 - params.freqMu) / params.freqSd) -
  params.difficultyRef;
const expectedUnknown = Math.min(
  LEXICAL_FIXATION_MAX_MS,
  Math.max(
    LEXICAL_FIXATION_MIN_MS,
    params.defaultBaselineMs * Math.exp(params.lambdaFix * difficulty),
  ),
);
assert.ok(
  Math.abs(
    getPredictedFixationMs(unknownWord, resources, params.defaultBaselineMs) -
      expectedUnknown,
  ) < 1e-9,
);

const withoutSaccades = getLexicalAdvanceDurationMs("a world", resources, {
  baselineFixationMs: params.defaultBaselineMs,
  includeSaccade: false,
  saccadeMs: 30,
});
const withSaccades = getLexicalAdvanceDurationMs("a world", resources, {
  baselineFixationMs: params.defaultBaselineMs,
  includeSaccade: true,
  saccadeMs: 30,
});
assert.equal(withSaccades - withoutSaccades, 60);
assert.equal(
  getLexicalAdvanceDurationMs("?!", resources, {
    baselineFixationMs: params.defaultBaselineMs,
    includeSaccade: true,
    saccadeMs: 30,
  }),
  20,
);
assert.equal(
  getPredictedFixationMs("a", resources, 1),
  179.936675250976 * (100 / params.defaultBaselineMs),
);

console.log("Lexical timing tests passed.");
