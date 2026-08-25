import type { CSSProperties } from "react";

import { conditionSpec, type ConditionSpec } from "@/lib/condition-spec";

export type LogEntry = {
  event: "start" | "stop" | "tick" | "manual";
  index: number;
  timestamp: string;
};

export type TokenizationUnit = ConditionSpec["tokenization"]["unit"];
export type ReaderMode = ConditionSpec["mode"];
export type HighlightRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export type ContinuousHighlightLayout = {
  container: HTMLElement;
  entries: Array<{ node: Text; start: number; end: number }>;
  ranges: Array<{ start: number; end: number }>;
  textLength: number;
  contentLength: number;
};
export const RSVP_FLOW_SLICE_ATTRIBUTE = "data-rsvp-flow-slice";
export type SettingsJson = ConditionSpec & {
  ui?: {
    viewportStep?: ViewportStep;
    advanceStep?: number;
    viewportWidthPercent?: number;
    viewportHeightPercent?: number;
  };
};
export type SharePayloadV1 = {
  version: 1;
  settings: SettingsJson;
  text?: string;
};
export const RSVP_STEPS = [
  "letter-1",
  "letter-2",
  "letter-3",
  "word-1",
  "word-2",
  "word-3",
  "sentence-1",
  "sentence-2",
  "sentence-3",
  "paragraph-1",
  "paragraph-2",
  "paragraph-3",
] as const;
export const CONTINUOUS_STEPS = [...RSVP_STEPS] as const;
export type ViewportStep = (typeof CONTINUOUS_STEPS)[number];
export const MIN_SETTINGS_WIDTH = 280;
export const MIN_VIEWPORT_WIDTH = 320;
export const VIEWPORT_SIZE_MIN_PERCENT = 1;
export const VIEWPORT_SIZE_MAX_PERCENT = 100;
export const SPEED_MIN_CPS = 1;
export const SPEED_MAX_CPS = 80;
export const RSVP_BLANK_INTERVAL_MIN_MS = -1000;
export const RSVP_BLANK_INTERVAL_MAX_MS = 1000;
export const HIGHLIGHT_JUMP_RATE_MIN = 0.25;
export const HIGHLIGHT_JUMP_RATE_MAX = 80;
export const SHARE_HASH_PREFIX = "share=";
export const SHARE_URL_MAX_LENGTH = 7000;
export const FONT_FAMILY_OPTIONS = [
  {
    label: "Geist",
    value: "Geist",
  },
  {
    label: "System Sans",
    value:
      '"Avenir Next", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  {
    label: "Serif",
    value: 'Georgia, "Times New Roman", Times, serif',
  },
  {
    label: "Monospace",
    value:
      '"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  {
    label: "Arial",
    value: "Arial, Helvetica, sans-serif",
  },
  {
    label: "Verdana",
    value: "Verdana, Geneva, sans-serif",
  },
] as const;
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const DEFAULT_TEXT_PATH = `${BASE_PATH}/default-text.txt`;
export const FIXATION_PARAMS_PATH = `${BASE_PATH}/data/fixation_formula_params.csv`;
export const GAZE_DURATIONS_PATH = `${BASE_PATH}/data/predicted_gaze_durations_default.csv`;
export const SENTENCE_REGEX = /[^.!?]+[.!?]["'”’)\]]*|[^.!?]+$/g;
export const VIEWPORT_STEP_LABELS: Record<ViewportStep, string> = {
  "letter-1": "1 L",
  "letter-2": "2 L",
  "letter-3": "3 L",
  "word-1": "1 W",
  "word-2": "2 W",
  "word-3": "3 W",
  "sentence-1": "1 S",
  "sentence-2": "2 S",
  "sentence-3": "3 S",
  "paragraph-1": "1 P",
  "paragraph-2": "2 P",
  "paragraph-3": "3 P",
};

export function getRsvpPhaseTiming(
  displayDurationMs: number,
  blankIntervalMs: number,
) {
  const safeDisplayDurationMs = Math.max(20, displayDurationMs);
  const safeBlankIntervalMs = clamp(
    blankIntervalMs,
    RSVP_BLANK_INTERVAL_MIN_MS,
    RSVP_BLANK_INTERVAL_MAX_MS,
  );
  const nextOnsetMs = Math.max(20, safeDisplayDurationMs + safeBlankIntervalMs);

  return {
    displayDurationMs: safeDisplayDurationMs,
    nextOnsetMs,
    blankDurationMs:
      safeBlankIntervalMs > 0 ? safeBlankIntervalMs : 0,
    overlapDurationMs:
      safeBlankIntervalMs < 0
        ? Math.max(0, safeDisplayDurationMs - nextOnsetMs)
        : 0,
  };
}

export function getRsvpHighlightTiming(
  baseDurationMs: number,
  punctuationHoldMs: number,
) {
  const traversalDurationMs = Math.max(20, baseDurationMs);
  const holdDurationMs = Math.max(0, punctuationHoldMs);
  return {
    traversalDurationMs,
    totalDurationMs: traversalDurationMs + holdDurationMs,
  };
}

export function getViewportStepsForMode(mode: ReaderMode) {
  return mode === "continuous" ? CONTINUOUS_STEPS : RSVP_STEPS;
}

export function getStepIndex(step: ViewportStep, mode: ReaderMode): number {
  return getViewportStepsForMode(mode).indexOf(step);
}

export function getViewportTokenCount(step: ViewportStep): number {
  const match = step.match(/-(\d)$/);
  return match ? Number(match[1]) : 1;
}

export function getViewportStepFromTokenization(
  unit: TokenizationUnit,
  chunkSize: number,
): ViewportStep {
  const size = Math.max(1, Math.floor(chunkSize || 1));
  if (unit === "sentence") {
    if (size === 1) return "sentence-1";
    if (size === 2) return "sentence-2";
    return "sentence-3";
  }
  if (unit === "paragraph") {
    if (size === 1) return "paragraph-1";
    if (size === 2) return "paragraph-2";
    return "paragraph-3";
  }
  if (unit === "char") {
    if (size === 1) return "letter-1";
    if (size === 2) return "letter-2";
    return "letter-3";
  }
  if (size === 1) return "word-1";
  if (size === 2) return "word-2";
  return "word-3";
}

export function getTokenizationFromViewportStep(step: ViewportStep): {
  unit: TokenizationUnit;
  chunkSize: number;
} {
  if (step === "letter-1") return { unit: "char", chunkSize: 1 };
  if (step === "letter-2") return { unit: "char", chunkSize: 2 };
  if (step === "letter-3") return { unit: "char", chunkSize: 3 };
  if (step === "word-1") return { unit: "word", chunkSize: 1 };
  if (step === "word-2") return { unit: "word", chunkSize: 2 };
  if (step === "word-3") return { unit: "word", chunkSize: 3 };
  if (step === "sentence-1") return { unit: "sentence", chunkSize: 1 };
  if (step === "sentence-2") return { unit: "sentence", chunkSize: 2 };
  if (step === "sentence-3") return { unit: "sentence", chunkSize: 3 };
  if (step === "paragraph-1") return { unit: "paragraph", chunkSize: 1 };
  if (step === "paragraph-2") return { unit: "paragraph", chunkSize: 2 };
  return { unit: "paragraph", chunkSize: 3 };
}

export function sanitizeSettingsName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function normalizeFontFamily(value: unknown): string {
  if (typeof value !== "string") {
    return conditionSpec.typography.fontFamily;
  }
  const trimmed = value.trim();
  return trimmed || conditionSpec.typography.fontFamily;
}

export function isEnglishLanguageTag(value: string): boolean {
  return /^en(?:[-_]|$)/i.test(value.trim());
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function gzipString(value: string): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") {
    return null;
  }
  const stream = new Blob([value])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzipString(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Compressed share links are not supported in this browser.");
  }
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const stream = new Blob([buffer])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

export function buildShareUrlFromEncodedPayload(encodedPayload: string): string {
  const url = new URL(window.location.href);
  url.hash = `${SHARE_HASH_PREFIX}${encodedPayload}`;
  return url.toString();
}

export async function encodeSharePayload(payload: SharePayloadV1): Promise<string> {
  const json = JSON.stringify(payload);
  const plainPayload = `v1.j.${bytesToBase64Url(new TextEncoder().encode(json))}`;
  const gzipped = await gzipString(json);
  if (!gzipped) {
    return plainPayload;
  }
  const gzipPayload = `v1.g.${bytesToBase64Url(gzipped)}`;
  return gzipPayload.length < plainPayload.length ? gzipPayload : plainPayload;
}

export async function decodeSharePayload(encodedPayload: string): Promise<SharePayloadV1> {
  const [version, encoding, body] = encodedPayload.split(".");
  if (version !== "v1" || !body) {
    throw new Error("Unsupported share link format.");
  }

  const raw =
    encoding === "j"
      ? new TextDecoder().decode(base64UrlToBytes(body))
      : encoding === "g"
        ? await gunzipString(base64UrlToBytes(body))
        : null;
  if (!raw) {
    throw new Error("Unsupported share link encoding.");
  }

  const payload = JSON.parse(raw) as SharePayloadV1;
  if (
    !payload ||
    payload.version !== 1 ||
    !payload.settings ||
    typeof payload.settings !== "object"
  ) {
    throw new Error("Invalid share link payload.");
  }
  return payload;
}

export function getRsvpDisplayToken(
  tokens: string[],
  startIndex: number,
  viewportTokenCount: number,
  unit: TokenizationUnit,
): string {
  if (!tokens.length) {
    return "";
  }

  const size = Math.max(1, Math.floor(viewportTokenCount || 1));
  const safeStart =
    ((startIndex % tokens.length) + tokens.length) % tokens.length;
  if (size === 1) {
    return tokens[safeStart] ?? "";
  }

  const windowTokens: string[] = [];
  for (let i = 0; i < size; i += 1) {
    windowTokens.push(tokens[(safeStart + i) % tokens.length] ?? "");
  }
  if (unit === "char") {
    return windowTokens.join("");
  }
  if (unit === "paragraph") {
    return windowTokens.join("\n\n");
  }
  return windowTokens.join(" ");
}

export function splitAroundCenterCharacter(value: string): {
  left: string;
  center: string;
  right: string;
} {
  if (!value) {
    return { left: "", center: "", right: "" };
  }
  const chars = Array.from(value);
  const centerIndex = Math.floor(chars.length / 2);
  return {
    left: chars.slice(0, centerIndex).join(""),
    center: chars[centerIndex] ?? "",
    right: chars.slice(centerIndex + 1).join(""),
  };
}

export function getHighlightSegments(
  value: string,
  unit: ConditionSpec["typography"]["rsvpHighlight"]["unit"],
  size: number,
  jumpIndex?: number,
  allowBoundaryCrossing = false,
): {
  before: string;
  highlight: string;
  after: string;
} {
  const normalizeSegments = ({
    before,
    highlight,
    after,
  }: {
    before: string;
    highlight: string;
    after: string;
  }) => {
    const highlightChars = Array.from(highlight);
    let start = 0;
    let end = highlightChars.length;

    while (start < end && /\s/u.test(highlightChars[start] ?? "")) {
      start += 1;
    }
    while (end > start && /\s/u.test(highlightChars[end - 1] ?? "")) {
      end -= 1;
    }

    return {
      before: before + highlightChars.slice(0, start).join(""),
      highlight: highlightChars.slice(start, end).join(""),
      after: highlightChars.slice(end).join("") + after,
    };
  };

  if (!value) {
    return { before: "", highlight: "", after: "" };
  }

  const getSentenceSpans = () => {
    const sentenceMatches = Array.from(value.matchAll(SENTENCE_REGEX));
    return sentenceMatches.length
      ? sentenceMatches.map((match) => ({
          start: match.index ?? 0,
          end: (match.index ?? 0) + match[0].length,
        }))
      : [{ start: 0, end: value.length }];
  };

  const findSentenceSpan = (start: number, end: number) => {
    const spans = getSentenceSpans();
    return (
      spans.find((span) => start >= span.start && end <= span.end) ??
      spans.find((span) => start >= span.start && start < span.end) ??
      spans[spans.length - 1] ??
      { start: 0, end: value.length }
    );
  };

  if (unit === "word") {
    const wordMatches = Array.from(value.matchAll(/\S+/g));
    if (!wordMatches.length) {
      return { before: value, highlight: "", after: "" };
    }
    const clampedSize = Math.max(1, Math.min(size, wordMatches.length));
    const maxStartWordIndex = Math.max(0, wordMatches.length - clampedSize);
    let startWordIndex =
      jumpIndex == null
        ? Math.max(0, Math.floor((wordMatches.length - clampedSize) / 2))
        : clamp(
            jumpIndex,
            0,
            allowBoundaryCrossing
              ? maxStartWordIndex
              : Math.max(0, wordMatches.length - 1),
          );

    let sentenceWordMatches = wordMatches;
    if (!allowBoundaryCrossing) {
      const currentMatch = wordMatches[startWordIndex];
      const currentStart = currentMatch?.index ?? 0;
      const currentEnd = currentStart + (currentMatch?.[0].length ?? 0);
      const sentenceSpan = findSentenceSpan(currentStart, currentEnd);
      const sentenceStartWordIndex = wordMatches.findIndex((match) => {
        const matchStart = match.index ?? 0;
        const matchEnd = matchStart + match[0].length;
        return matchStart >= sentenceSpan.start && matchEnd <= sentenceSpan.end;
      });
      const sentenceEndWordIndex =
        wordMatches.length -
        1 -
        [...wordMatches]
          .reverse()
          .findIndex((match) => {
            const matchStart = match.index ?? 0;
            const matchEnd = matchStart + match[0].length;
            return matchStart >= sentenceSpan.start && matchEnd <= sentenceSpan.end;
          });
      if (sentenceStartWordIndex >= 0 && sentenceEndWordIndex >= sentenceStartWordIndex) {
        const sentenceWordCount =
          sentenceEndWordIndex - sentenceStartWordIndex + 1;
        const sentenceWindowSize = Math.min(clampedSize, sentenceWordCount);
        startWordIndex = clamp(
          startWordIndex,
          sentenceStartWordIndex,
          sentenceEndWordIndex - sentenceWindowSize + 1,
        );
        sentenceWordMatches = wordMatches.slice(
          sentenceStartWordIndex,
          sentenceEndWordIndex + 1,
        );
      }
    }

    const endWordIndex =
      startWordIndex +
      Math.min(clampedSize, sentenceWordMatches.length) -
      1;
    const startMatch = wordMatches[startWordIndex];
    const endMatch = wordMatches[endWordIndex];
    const startIndex = startMatch?.index ?? 0;
    let endIndex =
      (endMatch?.index ?? 0) + (endMatch?.[0].length ?? 0);
    if (!allowBoundaryCrossing) {
      while (endIndex > startIndex && /[.!?]["'”’)\]]*$/u.test(value.slice(startIndex, endIndex))) {
        endIndex -= 1;
      }
    }
    return normalizeSegments({
      before: value.slice(0, startIndex),
      highlight: value.slice(startIndex, endIndex),
      after: value.slice(endIndex),
    });
  }

  if (unit === "sentence") {
    const sentenceMatches = Array.from(value.matchAll(SENTENCE_REGEX));
    if (!sentenceMatches.length) {
      return { before: value, highlight: "", after: "" };
    }
    const clampedSize = Math.max(1, Math.min(size, sentenceMatches.length));
    const maxStartSentenceIndex = Math.max(0, sentenceMatches.length - clampedSize);
    const startSentenceIndex =
      jumpIndex == null
        ? Math.max(0, Math.floor((sentenceMatches.length - clampedSize) / 2))
        : clamp(jumpIndex, 0, maxStartSentenceIndex);
    const endSentenceIndex = startSentenceIndex + clampedSize - 1;
    const startMatch = sentenceMatches[startSentenceIndex];
    const endMatch = sentenceMatches[endSentenceIndex];
    const startIndex = startMatch?.index ?? 0;
    const endIndex = (endMatch?.index ?? 0) + (endMatch?.[0].length ?? 0);
    return normalizeSegments({
      before: value.slice(0, startIndex),
      highlight: value.slice(startIndex, endIndex),
      after: value.slice(endIndex),
    });
  }

  if (unit === "paragraph") {
    const paragraphMatches = Array.from(
      value.matchAll(/[\s\S]+?(?=(?:\n\s*\n+)|$)/g),
    ).filter((match) => Boolean(match[0]?.trim()));
    if (!paragraphMatches.length) {
      return { before: value, highlight: "", after: "" };
    }
    const clampedSize = Math.max(1, Math.min(size, paragraphMatches.length));
    const maxStartParagraphIndex = Math.max(
      0,
      paragraphMatches.length - clampedSize,
    );
    const startParagraphIndex =
      jumpIndex == null
        ? Math.max(0, Math.floor((paragraphMatches.length - clampedSize) / 2))
        : clamp(jumpIndex, 0, maxStartParagraphIndex);
    const endParagraphIndex = startParagraphIndex + clampedSize - 1;
    const startMatch = paragraphMatches[startParagraphIndex];
    const endMatch = paragraphMatches[endParagraphIndex];
    const startIndex = startMatch?.index ?? 0;
    const endIndex = (endMatch?.index ?? 0) + (endMatch?.[0].length ?? 0);
    return normalizeSegments({
      before: value.slice(0, startIndex),
      highlight: value.slice(startIndex, endIndex),
      after: value.slice(endIndex),
    });
  }

  const chars = Array.from(value);
  const clampedSize = Math.max(1, Math.min(size, chars.length));
  let maxStartIndex = Math.max(0, chars.length - clampedSize);
  let startIndex =
    jumpIndex == null
      ? Math.max(0, Math.floor((chars.length - clampedSize) / 2))
      : clamp(
          jumpIndex,
          0,
          allowBoundaryCrossing ? maxStartIndex : Math.max(0, chars.length - 1),
        );
  let windowSize = clampedSize;
  if (!allowBoundaryCrossing) {
    const charOffsets: number[] = [];
    let runningOffset = 0;
    chars.forEach((char) => {
      charOffsets.push(runningOffset);
      runningOffset += char.length;
    });
    const charStart = charOffsets[startIndex] ?? 0;
    const charEnd =
      startIndex + 1 < charOffsets.length
        ? (charOffsets[startIndex + 1] ?? runningOffset)
        : runningOffset;
    const sentenceSpan = findSentenceSpan(charStart, charEnd);
    const sentenceStartIndex = charOffsets.findIndex(
      (offset) => offset >= sentenceSpan.start,
    );
    const sentenceEndIndex =
      charOffsets.length -
      1 -
      [...charOffsets]
        .reverse()
        .findIndex((offset) => offset < sentenceSpan.end);
    if (sentenceStartIndex >= 0 && sentenceEndIndex >= sentenceStartIndex) {
      const sentenceCharCount = sentenceEndIndex - sentenceStartIndex + 1;
      windowSize = Math.min(clampedSize, sentenceCharCount);
      maxStartIndex = sentenceEndIndex - windowSize + 1;
      startIndex = clamp(startIndex, sentenceStartIndex, maxStartIndex);
    }
  }
  return normalizeSegments({
    before: chars.slice(0, startIndex).join(""),
    highlight: chars.slice(startIndex, startIndex + windowSize).join(""),
    after: chars.slice(startIndex + windowSize).join(""),
  });
}

export function getHighlightPositionCount(
  value: string,
  unit: ConditionSpec["typography"]["rsvpHighlight"]["unit"],
  size: number,
  allowBoundaryCrossing = false,
): number {
  if (!value) {
    return 1;
  }

  const clampedSize = Math.max(1, size);

  if (unit === "word") {
    const wordCount = Array.from(value.matchAll(/\S+/g)).length;
    if (!allowBoundaryCrossing) {
      return Math.max(1, wordCount);
    }
    return Math.max(1, wordCount - Math.min(clampedSize, wordCount) + 1);
  }

  if (unit === "sentence") {
    const sentenceCount = Array.from(value.matchAll(SENTENCE_REGEX)).length;
    return Math.max(
      1,
      sentenceCount - Math.min(clampedSize, sentenceCount) + 1,
    );
  }

  if (unit === "paragraph") {
    const paragraphCount = Array.from(
      value.matchAll(/[\s\S]+?(?=(?:\n\s*\n+)|$)/g),
    ).filter((match) => Boolean(match[0]?.trim())).length;
    return Math.max(
      1,
      paragraphCount - Math.min(clampedSize, paragraphCount) + 1,
    );
  }

  const charCount = Array.from(value).length;
  if (!allowBoundaryCrossing) {
    return Math.max(1, charCount);
  }
  return Math.max(1, charCount - Math.min(clampedSize, charCount) + 1);
}

export function getHighlightRanges(
  value: string,
  unit: ConditionSpec["typography"]["rsvpHighlight"]["unit"],
  size: number,
  allowBoundaryCrossing = false,
): Array<{ start: number; end: number }> {
  if (!value) {
    return [{ start: 0, end: 0 }];
  }

  const clampedSize = Math.max(1, size);

  const pushUniqueRange = (
    ranges: Array<{ start: number; end: number }>,
    range: { start: number; end: number },
  ) => {
    const previous = ranges[ranges.length - 1];
    if (previous && previous.start === range.start && previous.end === range.end) {
      return;
    }
    ranges.push(range);
  };

  const trimSentenceEndPunctuation = (start: number, end: number) => {
    let nextEnd = end;
    while (
      nextEnd > start &&
      /[.!?]["'”’)\]]*$/u.test(value.slice(start, nextEnd))
    ) {
      nextEnd -= 1;
    }
    return nextEnd;
  };

  const buildRangesFromMatches = (
    matches: Array<{ index: number; length: number }>,
    clampToSentences: boolean,
  ) => {
    if (!matches.length) {
      return [{ start: 0, end: value.length }];
    }
    const ranges: Array<{ start: number; end: number }> = [];

    if (!clampToSentences) {
      const windowSize = Math.min(clampedSize, matches.length);
      for (let startIndex = 0; startIndex <= matches.length - windowSize; startIndex += 1) {
        const startMatch = matches[startIndex];
        const last = matches[startIndex + windowSize - 1];
        if (!startMatch || !last) {
          continue;
        }
        pushUniqueRange(ranges, {
          start: startMatch.index,
          end: last.index + last.length,
        });
      }
      return ranges.length ? ranges : [{ start: 0, end: value.length }];
    }

    const sentenceSpans = Array.from(value.matchAll(SENTENCE_REGEX)).map((match) => ({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    }));
    const spans = sentenceSpans.length
      ? sentenceSpans
      : [{ start: 0, end: value.length }];
    let matchCursor = 0;

    spans.forEach((span) => {
      while (
        matchCursor < matches.length &&
        matches[matchCursor].index + matches[matchCursor].length <= span.start
      ) {
        matchCursor += 1;
      }

      const sentenceStartIndex = matchCursor;
      while (
        matchCursor < matches.length &&
        matches[matchCursor].index >= span.start &&
        matches[matchCursor].index + matches[matchCursor].length <= span.end
      ) {
        matchCursor += 1;
      }

      const sentenceEndIndex = matchCursor - 1;
      if (sentenceEndIndex < sentenceStartIndex) {
        return;
      }

      const sentenceMatchCount = sentenceEndIndex - sentenceStartIndex + 1;
      const windowSize = Math.min(clampedSize, sentenceMatchCount);
      const maxStartIndex = sentenceEndIndex - windowSize + 1;

      for (
        let startIndex = sentenceStartIndex;
        startIndex <= sentenceEndIndex;
        startIndex += 1
      ) {
        const nextStartIndex = clamp(
          startIndex,
          sentenceStartIndex,
          maxStartIndex,
        );
        const startMatch = matches[nextStartIndex];
        const last = matches[nextStartIndex + windowSize - 1];
        if (!startMatch || !last) {
          continue;
        }
        pushUniqueRange(ranges, {
          start: startMatch.index,
          end: trimSentenceEndPunctuation(
            startMatch.index,
            last.index + last.length,
          ),
        });
      }
    });

    return ranges.length ? ranges : [{ start: 0, end: value.length }];
  };

  if (unit === "word") {
    return buildRangesFromMatches(
      Array.from(value.matchAll(/\S+/g)).map((match) => ({
        index: match.index ?? 0,
        length: match[0].length,
      })),
      !allowBoundaryCrossing,
    );
  }

  if (unit === "sentence") {
    return buildRangesFromMatches(
      Array.from(value.matchAll(SENTENCE_REGEX)).map((match) => ({
        index: match.index ?? 0,
        length: match[0].length,
      })),
      false,
    );
  }

  if (unit === "paragraph") {
    return buildRangesFromMatches(
      Array.from(value.matchAll(/[\s\S]+?(?=(?:\n\s*\n+)|$)/g))
        .filter((match) => Boolean(match[0]?.trim()))
        .map((match) => ({
          index: match.index ?? 0,
          length: match[0].length,
        })),
      false,
    );
  }

  const chars = Array.from(value);
  if (!chars.length) {
    return [{ start: 0, end: 0 }];
  }
  const charOffsets: number[] = [];
  let runningOffset = 0;
  chars.forEach((char) => {
    charOffsets.push(runningOffset);
    runningOffset += char.length;
  });
  const windowSize = Math.min(clampedSize, chars.length);
  const ranges: Array<{ start: number; end: number }> = [];

  if (allowBoundaryCrossing) {
    for (let startIndex = 0; startIndex <= chars.length - windowSize; startIndex += 1) {
      const start = charOffsets[startIndex] ?? 0;
      const end =
        startIndex + windowSize < charOffsets.length
          ? (charOffsets[startIndex + windowSize] ?? runningOffset)
          : runningOffset;
      pushUniqueRange(ranges, { start, end });
    }
    return ranges.length ? ranges : [{ start: 0, end: value.length }];
  }

  const sentenceSpans = Array.from(value.matchAll(SENTENCE_REGEX)).map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
  const spans = sentenceSpans.length
    ? sentenceSpans
    : [{ start: 0, end: value.length }];
  let charCursor = 0;

  spans.forEach((span) => {
    while (charCursor < charOffsets.length && charOffsets[charCursor] < span.start) {
      charCursor += 1;
    }

    const sentenceStartIndex = charCursor;
    while (charCursor < charOffsets.length && charOffsets[charCursor] < span.end) {
      charCursor += 1;
    }

    const sentenceEndIndex = charCursor - 1;
    if (sentenceEndIndex < sentenceStartIndex) {
      return;
    }

    const sentenceCharCount = sentenceEndIndex - sentenceStartIndex + 1;
    const sentenceWindowSize = Math.min(windowSize, sentenceCharCount);
    const maxStartIndex = sentenceEndIndex - sentenceWindowSize + 1;

    for (
      let startIndex = sentenceStartIndex;
      startIndex <= sentenceEndIndex;
      startIndex += 1
    ) {
      const nextStartIndex = clamp(
        startIndex,
        sentenceStartIndex,
        maxStartIndex,
      );
      const start = charOffsets[nextStartIndex] ?? 0;
      const end =
        nextStartIndex + sentenceWindowSize < charOffsets.length
          ? (charOffsets[nextStartIndex + sentenceWindowSize] ?? runningOffset)
          : runningOffset;
      pushUniqueRange(ranges, { start, end });
    }
  });

  return ranges.length ? ranges : [{ start: 0, end: value.length }];
}

export function getHighlightRangesForPrefix({
  value,
  prefixEnd,
  unit,
  size,
  allowBoundaryCrossing = false,
}: {
  value: string;
  prefixEnd: number;
  unit: ConditionSpec["typography"]["rsvpHighlight"]["unit"];
  size: number;
  allowBoundaryCrossing?: boolean;
}) {
  const safePrefixEnd = clamp(Math.floor(prefixEnd), 0, value.length);
  return getHighlightRanges(
    value.slice(0, safePrefixEnd),
    unit,
    size,
    allowBoundaryCrossing,
  );
}

export function findHighlightRangeIndexForOffset(
  ranges: Array<{ start: number; end: number }>,
  offset: number,
): number {
  if (!ranges.length) {
    return 0;
  }

  let low = 0;
  let high = ranges.length - 1;
  let best = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const range = ranges[middle];
    if (!range) {
      break;
    }
    if (range.start <= offset) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  const current = ranges[best];
  const next = ranges[best + 1];
  if (current && next && offset > current.end) {
    const currentDistance = Math.abs(offset - current.end);
    const nextDistance = Math.abs(next.start - offset);
    if (nextDistance < currentDistance) {
      return best + 1;
    }
  }

  return best;
}

export function getHighlightSpanStyle(
  highlightStyle: ConditionSpec["typography"]["rsvpHighlight"]["style"],
): CSSProperties {
  if (highlightStyle === "bold") {
    return {
      textShadow: "0.025em 0 currentColor, -0.025em 0 currentColor",
    };
  }
  if (highlightStyle === "outline") {
    return {
      boxShadow: "0 0 0 2px currentColor",
      borderRadius: "0.12em",
    };
  }
  return {
    backgroundColor: "rgba(250, 204, 21, 0.45)",
    borderRadius: "0.12em",
  };
}

export function getHighlightOverlayStyle(
  highlightStyle: ConditionSpec["typography"]["rsvpHighlight"]["style"],
): CSSProperties {
  if (highlightStyle === "bold") {
    return {
      backgroundColor: "rgba(250, 204, 21, 0.22)",
      borderRadius: "0.12em",
      outline: "1px solid rgba(24, 24, 27, 0.18)",
    };
  }
  if (highlightStyle === "outline") {
    return {
      borderRadius: "0.12em",
      boxShadow: "inset 0 0 0 2px currentColor",
    };
  }
  return {
    backgroundColor: "rgba(250, 204, 21, 0.45)",
    borderRadius: "0.12em",
  };
}

export function isInsideAriaHidden(node: Node): boolean {
  let current: Node | null = node.parentNode;
  while (current) {
    if (
      current instanceof HTMLElement &&
      current.getAttribute("aria-hidden") === "true"
    ) {
      return true;
    }
    current = current.parentNode;
  }
  return false;
}

function getReadableTextBlockAncestor(node: Node): Element | null {
  let current = node.parentElement;
  while (current) {
    const display = getComputedStyle(current).display;
    if (
      display === "block" ||
      display === "flow-root" ||
      display === "list-item" ||
      display === "flex" ||
      display === "grid" ||
      display === "table" ||
      display === "table-row" ||
      display === "table-cell"
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function shouldSeparateReadableTextNodes(previousNode: Text, nextNode: Text) {
  const previousBlock = getReadableTextBlockAncestor(previousNode);
  const nextBlock = getReadableTextBlockAncestor(nextNode);
  return Boolean(previousBlock && nextBlock && previousBlock !== nextBlock);
}

export function collectReadableTextNodes(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const entries: Array<{
    node: Text;
    start: number;
    end: number;
  }> = [];
  let text = "";
  let previousTextNode: Text | null = null;
  let current = walker.nextNode();

  while (current) {
    if (current instanceof Text && !isInsideAriaHidden(current)) {
      const value = current.nodeValue ?? "";
      if (value.length > 0) {
        if (
          previousTextNode &&
          shouldSeparateReadableTextNodes(previousTextNode, current) &&
          text.length > 0 &&
          !/\s$/u.test(text)
        ) {
          text += "\n";
        }
        const start = text.length;
        text += value;
        entries.push({
          node: current,
          start,
          end: start + value.length,
        });
        previousTextNode = current;
      }
    }
    current = walker.nextNode();
  }

  return { text, entries };
}

export function findTextPosition(
  entries: Array<{ node: Text; start: number; end: number }>,
  offset: number,
  bias: "start" | "end",
) {
  if (!entries.length) {
    return null;
  }

  const clampedOffset = clamp(offset, 0, entries[entries.length - 1]?.end ?? 0);
  const entry = entries.find((candidate) =>
    bias === "start"
      ? clampedOffset >= candidate.start && clampedOffset < candidate.end
      : clampedOffset > candidate.start && clampedOffset <= candidate.end,
  );
  if (!entry) {
    const fallback = bias === "start" ? entries[0] : entries[entries.length - 1];
    return fallback
      ? {
          node: fallback.node,
          offset: bias === "start" ? 0 : fallback.end - fallback.start,
        }
      : null;
  }

  return {
    node: entry.node,
    offset: clampedOffset - entry.start,
  };
}

export function getTextRangeRects({
  container,
  entries,
  start,
  end,
}: {
  container: HTMLElement;
  entries: Array<{ node: Text; start: number; end: number }>;
  start: number;
  end: number;
}): HighlightRect[] {
  if (end <= start) {
    return [];
  }

  const containerRect = container.getBoundingClientRect();
  const rects = entries.flatMap((entry) => {
    const overlapStart = Math.max(start, entry.start);
    const overlapEnd = Math.min(end, entry.end);
    if (overlapEnd <= overlapStart) {
      return [];
    }

    const range = document.createRange();
    range.setStart(entry.node, overlapStart - entry.start);
    range.setEnd(entry.node, overlapEnd - entry.start);
    const entryRects = Array.from(range.getClientRects())
      .map((rect) => ({
        left: rect.left - containerRect.left,
        top: rect.top - containerRect.top,
        width: rect.width,
        height: rect.height,
      }))
      .filter((rect) => rect.width > 0 && rect.height > 0);
    range.detach();
    return entryRects;
  });
  return rects;
}

export function buildContinuousHighlightLayout({
  container,
  direction,
  unit,
  size,
  allowBoundaryCrossing,
  limitToRsvpFlowSlice = false,
}: {
  container: HTMLElement;
  direction: ConditionSpec["motion"]["direction"];
  unit: ConditionSpec["typography"]["rsvpHighlight"]["unit"];
  size: number;
  allowBoundaryCrossing: boolean;
  limitToRsvpFlowSlice?: boolean;
}): ContinuousHighlightLayout | null {
  const { text, entries } = collectReadableTextNodes(container);
  if (!text || !entries.length) {
    return null;
  }

  const flowSliceEnd = limitToRsvpFlowSlice
    ? entries.reduce((end, entry) => {
        const flowSlice = entry.node.parentElement?.closest(
          `[${RSVP_FLOW_SLICE_ATTRIBUTE}="true"]`,
        );
        return flowSlice ? Math.max(end, entry.end) : end;
      }, 0)
    : text.length;
  const rangeText = text.slice(
    0,
    limitToRsvpFlowSlice ? Math.max(0, flowSliceEnd) : text.length,
  );
  const ranges = getHighlightRanges(
    rangeText,
    unit,
    size,
    allowBoundaryCrossing,
  );
  if (!ranges.length) {
    return null;
  }

  return {
    container,
    entries,
    ranges,
    textLength: text.length,
    contentLength: Math.max(
      1,
      direction === "horizontal" ? container.scrollWidth : container.scrollHeight,
    ),
  };
}

export function endsWithPausePunctuation(token: string): boolean {
  return /[.,!?;:]["')\]]?$/.test(token.trim());
}

export function getEstimatedCharsPerVerticalLine(spec: ConditionSpec): number {
  const approxCharPx = Math.max(
    1,
    spec.typography.fontSizePx * 0.62 + spec.typography.letterSpacingPx,
  );
  const lineWidthPx =
    spec.typography.useViewportWidth || spec.typography.lineWidthPx <= 0
      ? Math.max(240, spec.window.width - spec.typography.viewportPaddingPx * 2)
      : spec.typography.lineWidthPx;
  return Math.max(1, lineWidthPx / approxCharPx);
}

export function speedToPxPerSecond(
  spec: ConditionSpec,
  measuredPixelsPerCharacter?: number,
): number {
  const safeCharsPerSecond = Math.max(1, spec.motion.speed.value);
  if (
    measuredPixelsPerCharacter != null &&
    Number.isFinite(measuredPixelsPerCharacter) &&
    measuredPixelsPerCharacter > 0
  ) {
    return Math.max(1, safeCharsPerSecond * measuredPixelsPerCharacter);
  }

  const approxCharPx =
    spec.typography.fontSizePx * 0.62 + spec.typography.letterSpacingPx;
  if (spec.motion.direction === "vertical") {
    const lineHeightPx = spec.typography.fontSizePx * spec.typography.lineHeight;
    return Math.max(
      1,
      safeCharsPerSecond *
        (lineHeightPx / getEstimatedCharsPerVerticalLine(spec)),
    );
  }
  return Math.max(1, safeCharsPerSecond * Math.max(1, approxCharPx));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getAdvanceCharacterCount(
  tokens: string[],
  startIndex: number,
  advanceCount: number,
  unit: TokenizationUnit,
): number {
  if (!tokens.length) {
    return 1;
  }

  return Math.max(
    1,
    getAdvanceText(tokens, startIndex, advanceCount, unit).length,
  );
}

export function getAdvanceText(
  tokens: string[],
  startIndex: number,
  advanceCount: number,
  unit: TokenizationUnit,
): string {
  if (!tokens.length) {
    return "";
  }
  const safeStart =
    ((startIndex % tokens.length) + tokens.length) % tokens.length;
  const size = Math.max(1, Math.floor(advanceCount || 1));
  const movedTokens: string[] = [];
  for (let i = 0; i < size; i += 1) {
    movedTokens.push(tokens[(safeStart + i) % tokens.length] ?? "");
  }
  return movedTokens.join(unit === "char" ? "" : " ");
}

export function tokenizeText(
  text: string,
  unit: TokenizationUnit,
  chunkSize: number,
): string[] {
  const size = Math.max(1, Math.floor(chunkSize || 1));

  const baseTokens =
    unit === "char"
      ? Array.from(text)
      : unit === "sentence"
        ? (text.match(SENTENCE_REGEX) ?? [])
            .map((token) => token.trim())
            .filter(Boolean)
        : unit === "paragraph"
          ? text
              .split(/\n\s*\n+/)
              .map((token) => token.trim())
              .filter(Boolean)
        : text.trim().split(/\s+/).filter(Boolean);

  if (!baseTokens.length) {
    return [];
  }

  if (size === 1 && unit !== "chunk") {
    return baseTokens;
  }

  const grouped: string[] = [];
  for (let i = 0; i < baseTokens.length; i += size) {
    grouped.push(
      baseTokens.slice(i, i + size).join(unit === "char" ? "" : " "),
    );
  }

  return grouped;
}

export function formatTokenAsSentenceLines(value: string): string {
  if (!value.trim()) {
    return "";
  }
  return (value.match(SENTENCE_REGEX) ?? [value])
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .join("\n");
}

export function splitTokenIntoParagraphs(value: string): string[] {
  return value
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function splitParagraphIntoSentences(value: string): string[] {
  return splitParagraphIntoSentenceParts(value).map((part) => part.text);
}

export function splitParagraphIntoSentenceParts(value: string): Array<{
  text: string;
  separatorBefore: string;
}> {
  return (value.match(SENTENCE_REGEX) ?? [value])
    .map((sentence) => {
      const leadingWhitespace = sentence.match(/^\s+/u)?.[0] ?? "";
      return {
        text: sentence.trim(),
        separatorBefore: leadingWhitespace ? " " : "",
      };
    })
    .filter((part) => Boolean(part.text));
}

export function getSentenceMarkerGlyph(shape: string): string {
  if (shape === "square") return "■";
  if (shape === "diamond") return "◆";
  if (shape === "triangle") return "▲";
  return "●";
}

export function getSentenceMarkerColor(shape: string): string {
  if (shape === "square") return "#2563eb";
  if (shape === "diamond") return "#dc2626";
  if (shape === "triangle") return "#16a34a";
  return "#111111";
}

export const SENTENCE_MARKER_CYCLE = ["circle", "square", "diamond", "triangle"] as const;

export function getMarkerVariantIndex({
  unitIndex,
  unitCount,
  side,
  mode,
}: {
  unitIndex: number;
  unitCount: number;
  side: "start" | "end";
  mode: ConditionSpec["typography"]["sentenceMarkers"]["mode"];
}) {
  if (mode === "line" && unitCount <= 0) {
    return null;
  }
  if (side === "start") {
    return unitIndex === 0 ? null : unitIndex - 1;
  }
  return unitIndex >= unitCount - 1 ? null : unitIndex;
}

export function getSentenceMarkerAppearance({
  variantIndex,
  variationMode,
}: {
  variantIndex: number;
  variationMode: ConditionSpec["typography"]["sentenceMarkers"]["variationMode"];
}) {
  const cycledShape =
    SENTENCE_MARKER_CYCLE[variantIndex % SENTENCE_MARKER_CYCLE.length] ?? "circle";
  return {
    glyph: getSentenceMarkerGlyph(
      variationMode === "color" ? "circle" : cycledShape,
    ),
    color:
      variationMode === "shape"
        ? undefined
        : getSentenceMarkerColor(cycledShape),
  };
}

export type RenderedLineRect = {
  top: number;
  left: number;
  right: number;
  height: number;
};

export function renderLineRectsFromElement(
  container: HTMLElement,
  target: HTMLElement,
): RenderedLineRect[] {
  const range = document.createRange();
  range.selectNodeContents(target);
  const rawRects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 || rect.height > 0,
  );
  range.detach?.();

  if (!rawRects.length) {
    return [];
  }

  const containerRect = container.getBoundingClientRect();
  const grouped: RenderedLineRect[] = [];

  rawRects.forEach((rect) => {
    const top = rect.top - containerRect.top;
    const left = rect.left - containerRect.left;
    const right = rect.right - containerRect.left;
    const existing = grouped.find((entry) => Math.abs(entry.top - top) < 1);
    if (existing) {
      existing.left = Math.min(existing.left, left);
      existing.right = Math.max(existing.right, right);
      existing.height = Math.max(existing.height, rect.height);
      return;
    }
    grouped.push({
      top,
      left,
      right,
      height: rect.height,
    });
  });

  grouped.sort((a, b) => a.top - b.top);
  return grouped;
}

export function countTextUnits(value: string): number {
  return Array.from(value).length;
}

export type StaircaseLinePart = {
  text: string;
  sentenceIndex: number;
  isSentenceStart: boolean;
  isSentenceEnd: boolean;
};

export type StaircaseAppendInput = {
  rawText: string;
  sentenceIndex: number;
  isSentenceStart: boolean;
  isSentenceEnd: boolean;
};

export type StaircaseParagraphLine = {
  lineIndex: number;
  parts: StaircaseLinePart[];
  continuationFromPreviousLineIndex: number | null;
  continuationToNextLineIndex: number | null;
};

export function buildParagraphStaircaseLines({
  paragraph,
  startLineIndex,
  getLineWidthCh,
}: {
  paragraph: string;
  startLineIndex: number;
  getLineWidthCh: (lineIndex: number) => number;
}): StaircaseParagraphLine[] {
  const sentences = splitParagraphIntoSentenceParts(paragraph);
  const lines: StaircaseParagraphLine[] = [];
  let currentLineIndex = startLineIndex;
  let currentLineParts: StaircaseLinePart[] = [];
  let currentLineText = "";

  const getSafeWidth = () => Math.max(6, Math.floor(getLineWidthCh(currentLineIndex)));

  const pushCurrentLine = () => {
    if (!currentLineParts.length) {
      return;
    }
    lines.push({
      lineIndex: currentLineIndex,
      parts: currentLineParts,
      continuationFromPreviousLineIndex: null,
      continuationToNextLineIndex: null,
    });
    currentLineParts = [];
    currentLineText = "";
    currentLineIndex += 1;
  };

  const appendText = ({
    rawText,
    sentenceIndex,
    isSentenceStart,
    isSentenceEnd,
  }: StaircaseAppendInput) => {
    let remaining = rawText;
    let atSentenceStart = isSentenceStart;

    while (remaining) {
      if (!currentLineText && /^\s/.test(remaining)) {
        remaining = remaining.trimStart();
        continue;
      }

      const availableWidth = getSafeWidth();
      const nextValue = `${currentLineText}${remaining}`;
      if (!currentLineText || countTextUnits(nextValue) <= availableWidth) {
        currentLineText = nextValue;
        currentLineParts.push({
          text: remaining,
          sentenceIndex,
          isSentenceStart: atSentenceStart,
          isSentenceEnd,
        });
        return;
      }

      let splitIndex = availableWidth - countTextUnits(currentLineText);
      const sliceable = Array.from(remaining);
      splitIndex = Math.max(1, Math.min(splitIndex, sliceable.length));

      let chunk = sliceable.slice(0, splitIndex).join("");
      const rest = sliceable.slice(splitIndex).join("");

      if (sliceable.length > splitIndex) {
        const breakpoint = Math.max(chunk.lastIndexOf(" "), chunk.lastIndexOf("\t"));
        if (breakpoint > 0) {
          chunk = chunk.slice(0, breakpoint + 1);
        } else if (breakpoint === 0 && currentLineText) {
          pushCurrentLine();
          remaining = remaining.trimStart();
          continue;
        }
      }

      currentLineText = `${currentLineText}${chunk}`;
      currentLineParts.push({
        text: chunk,
        sentenceIndex,
        isSentenceStart: atSentenceStart,
        isSentenceEnd: false,
      });
      pushCurrentLine();
      remaining = remaining.slice(chunk.length);
      atSentenceStart = false;

      if (remaining === rest && !remaining.trim()) {
        remaining = "";
      }
    }
  };

  sentences.forEach((sentence, sentenceIndex) => {
    appendText({
      rawText: `${sentence.separatorBefore}${sentence.text}`,
      sentenceIndex,
      isSentenceStart: true,
      isSentenceEnd: true,
    });
  });

  pushCurrentLine();

  let continuationIndex = 0;
  for (let index = 0; index < lines.length - 1; index += 1) {
    const currentLine = lines[index];
    const nextLine = lines[index + 1];
    const currentLastPart = currentLine.parts[currentLine.parts.length - 1];
    const nextFirstPart = nextLine.parts[0];
    if (!currentLastPart || !nextFirstPart) {
      continue;
    }
    const continuesAcrossLines =
      currentLastPart.sentenceIndex === nextFirstPart.sentenceIndex &&
      !currentLastPart.isSentenceEnd &&
      !nextFirstPart.isSentenceStart;
    if (!continuesAcrossLines) {
      continue;
    }
    currentLine.continuationToNextLineIndex = continuationIndex;
    nextLine.continuationFromPreviousLineIndex = continuationIndex;
    continuationIndex += 1;
  }

  return lines;
}

export function getApproximateStaircaseWidthCh({
  maxWidthCh,
  lineWidthPx,
  fontSizePx,
}: {
  maxWidthCh: number;
  lineWidthPx: number;
  fontSizePx: number;
}) {
  if (maxWidthCh > 0) {
    return maxWidthCh;
  }
  return Math.max(24, Math.round(lineWidthPx / Math.max(1, fontSizePx * 0.6)));
}
