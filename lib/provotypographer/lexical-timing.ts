export const LEXICAL_BASELINE_MIN_MS = 100;
export const LEXICAL_BASELINE_MAX_MS = 500;
export const LEXICAL_FIXATION_MIN_MS = 80;
export const LEXICAL_FIXATION_MAX_MS = 900;
export const RSVP_TIMING_FLOOR_MS = 20;

export type FixationFormulaParams = {
  lengthMu: number;
  lengthSd: number;
  freqMu: number;
  freqSd: number;
  betaLengthLd: number;
  betaFreqLd: number;
  difficultyRef: number;
  lambdaFix: number;
  alphaFix: number;
  defaultBaselineMs: number;
};

export type LexicalTimingResources = {
  params: FixationFormulaParams;
  predictedDefaultMsByWord: ReadonlyMap<string, number>;
};

export type LexicalTimingOptions = {
  baselineFixationMs: number;
  includeSaccade: boolean;
  saccadeMs: number;
};

const PARAM_COLUMNS = [
  "length_mu",
  "length_sd",
  "freq_mu",
  "freq_sd",
  "beta_length_ld",
  "beta_freq_ld",
  "difficulty_ref",
  "lambda_fix",
  "alpha_fix",
  "R_default_ms",
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

function finiteNumber(value: string | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid lexical timing value for ${label}.`);
  }
  return parsed;
}

export function parseFixationFormulaParamsCsv(csv: string): FixationFormulaParams {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error("Fixation formula parameters are missing.");
  }
  const headers = parseCsvLine(lines[0] ?? "");
  const values = parseCsvLine(lines[1] ?? "");
  const row = new Map(headers.map((header, index) => [header, values[index]]));
  PARAM_COLUMNS.forEach((column) => finiteNumber(row.get(column), column));

  return {
    lengthMu: finiteNumber(row.get("length_mu"), "length_mu"),
    lengthSd: finiteNumber(row.get("length_sd"), "length_sd"),
    freqMu: finiteNumber(row.get("freq_mu"), "freq_mu"),
    freqSd: finiteNumber(row.get("freq_sd"), "freq_sd"),
    betaLengthLd: finiteNumber(row.get("beta_length_ld"), "beta_length_ld"),
    betaFreqLd: finiteNumber(row.get("beta_freq_ld"), "beta_freq_ld"),
    difficultyRef: finiteNumber(row.get("difficulty_ref"), "difficulty_ref"),
    lambdaFix: finiteNumber(row.get("lambda_fix"), "lambda_fix"),
    alphaFix: finiteNumber(row.get("alpha_fix"), "alpha_fix"),
    defaultBaselineMs: finiteNumber(row.get("R_default_ms"), "R_default_ms"),
  };
}

export function normalizeLexicalWord(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .toLocaleLowerCase("en-US");
}

export function extractLexicalWords(value: string): string[] {
  return (
    value.match(/[\p{L}\p{N}]+(?:['\u2018\u2019\u2010-\u2015-][\p{L}\p{N}]+)*/gu) ?? []
  )
    .map(normalizeLexicalWord)
    .filter(Boolean);
}

export function parsePredictedGazeDurationsCsv(csv: string): Map<string, number> {
  const lines = csv.trim().split(/\r?\n/);
  const predictions = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const columns = parseCsvLine(line);
    const word = normalizeLexicalWord(columns[0] ?? "");
    const duration = Number(columns[3]);
    if (word && Number.isFinite(duration)) {
      predictions.set(word, duration);
    }
  }
  return predictions;
}

export function getPredictedFixationMs(
  word: string,
  resources: LexicalTimingResources,
  baselineFixationMs: number,
): number {
  const normalizedWord = normalizeLexicalWord(word);
  const safeBaseline = clamp(
    baselineFixationMs,
    LEXICAL_BASELINE_MIN_MS,
    LEXICAL_BASELINE_MAX_MS,
  );
  const knownDefault = resources.predictedDefaultMsByWord.get(normalizedWord);
  const predicted =
    knownDefault == null
      ? (() => {
          const { params } = resources;
          const lexicalDifficulty =
            params.betaLengthLd *
              ((Array.from(normalizedWord).length - params.lengthMu) /
                params.lengthSd) +
            params.betaFreqLd * ((0 - params.freqMu) / params.freqSd) -
            params.difficultyRef;
          return safeBaseline * Math.exp(params.lambdaFix * lexicalDifficulty);
        })()
      : knownDefault * (safeBaseline / resources.params.defaultBaselineMs);

  return clamp(predicted, LEXICAL_FIXATION_MIN_MS, LEXICAL_FIXATION_MAX_MS);
}

export function getLexicalAdvanceDurationMs(
  value: string,
  resources: LexicalTimingResources,
  options: LexicalTimingOptions,
): number {
  const words = extractLexicalWords(value);
  if (!words.length) {
    return RSVP_TIMING_FLOOR_MS;
  }
  const saccadeMs = options.includeSaccade ? Math.max(0, options.saccadeMs) : 0;
  return Math.round(
    words.reduce(
      (total, word) =>
        total +
        getPredictedFixationMs(word, resources, options.baselineFixationMs) +
        saccadeMs,
      0,
    ),
  );
}
