"use client";

import {
  type CSSProperties,
  type ChangeEvent,
  type MouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { conditionSpec, type ConditionSpec } from "@/lib/condition-spec";

type LogEntry = {
  event: "start" | "stop" | "tick" | "manual";
  index: number;
  timestamp: string;
};

type TokenizationUnit = ConditionSpec["tokenization"]["unit"];
type ReaderMode = ConditionSpec["mode"];
type SettingsJson = ConditionSpec & {
  ui?: {
    viewportStep?: ViewportStep;
    advanceStep?: number;
    viewportWidthPercent?: number;
    viewportHeightPercent?: number;
  };
};
const RSVP_STEPS = [
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
const CONTINUOUS_STEPS = [...RSVP_STEPS] as const;
type ViewportStep = (typeof CONTINUOUS_STEPS)[number];
const MIN_SETTINGS_WIDTH = 280;
const MIN_VIEWPORT_WIDTH = 320;
const VIEWPORT_SIZE_MIN_PERCENT = 1;
const VIEWPORT_SIZE_MAX_PERCENT = 100;
const SPEED_MIN_CPS = 1;
const SPEED_MAX_CPS = 80;
const HIGHLIGHT_JUMP_RATE_MIN = 0.25;
const HIGHLIGHT_JUMP_RATE_MAX = 80;
const DEFAULT_TEXT_PATH = "/default-text.txt";
const SENTENCE_REGEX = /[^.!?]+[.!?]["'”’)\]]*|[^.!?]+$/g;
const VIEWPORT_STEP_LABELS: Record<ViewportStep, string> = {
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

function getViewportStepsForMode(mode: ReaderMode) {
  return mode === "continuous" ? CONTINUOUS_STEPS : RSVP_STEPS;
}

function getStepIndex(step: ViewportStep, mode: ReaderMode): number {
  return getViewportStepsForMode(mode).indexOf(step);
}

function getViewportTokenCount(step: ViewportStep): number {
  const match = step.match(/-(\d)$/);
  return match ? Number(match[1]) : 1;
}

function getViewportStepFromTokenization(
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

function getTokenizationFromViewportStep(step: ViewportStep): {
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

function sanitizeSettingsName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getRsvpDisplayToken(
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

function splitAroundCenterCharacter(value: string): {
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

function getHighlightSegments(
  value: string,
  unit: ConditionSpec["typography"]["rsvpHighlight"]["unit"],
  size: number,
  jumpIndex?: number,
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

  if (unit === "word") {
    const wordMatches = Array.from(value.matchAll(/\S+/g));
    if (!wordMatches.length) {
      return { before: value, highlight: "", after: "" };
    }
    const clampedSize = Math.max(1, Math.min(size, wordMatches.length));
    const maxStartWordIndex = Math.max(0, wordMatches.length - clampedSize);
    const startWordIndex =
      jumpIndex == null
        ? Math.max(0, Math.floor((wordMatches.length - clampedSize) / 2))
        : clamp(jumpIndex, 0, maxStartWordIndex);
    const endWordIndex = startWordIndex + clampedSize - 1;
    const startMatch = wordMatches[startWordIndex];
    const endMatch = wordMatches[endWordIndex];
    const startIndex = startMatch?.index ?? 0;
    const endIndex =
      (endMatch?.index ?? 0) + (endMatch?.[0].length ?? 0);
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
  const maxStartIndex = Math.max(0, chars.length - clampedSize);
  const startIndex =
    jumpIndex == null
      ? Math.max(0, Math.floor((chars.length - clampedSize) / 2))
      : clamp(jumpIndex, 0, maxStartIndex);
  return normalizeSegments({
    before: chars.slice(0, startIndex).join(""),
    highlight: chars.slice(startIndex, startIndex + clampedSize).join(""),
    after: chars.slice(startIndex + clampedSize).join(""),
  });
}

function getHighlightPositionCount(
  value: string,
  unit: ConditionSpec["typography"]["rsvpHighlight"]["unit"],
  size: number,
): number {
  if (!value) {
    return 1;
  }

  const clampedSize = Math.max(1, size);

  if (unit === "word") {
    const wordCount = Array.from(value.matchAll(/\S+/g)).length;
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
  return Math.max(1, charCount - Math.min(clampedSize, charCount) + 1);
}

function getHighlightSpanStyle(
  highlightStyle: ConditionSpec["typography"]["rsvpHighlight"]["style"],
): CSSProperties {
  if (highlightStyle === "bold") {
    return { fontWeight: 700 };
  }
  if (highlightStyle === "outline") {
    return {
      boxShadow: "inset 0 0 0 2px currentColor",
      borderRadius: "0.12em",
      paddingInline: "0.08em",
    };
  }
  return {
    backgroundColor: "rgba(250, 204, 21, 0.45)",
    borderRadius: "0.12em",
    paddingInline: "0.08em",
  };
}

function HighlightedToken({
  token,
  unit,
  size,
  style,
  preserveWhitespace = false,
  jumpIndex,
}: {
  token: string;
  unit: ConditionSpec["typography"]["rsvpHighlight"]["unit"];
  size: number;
  style: ConditionSpec["typography"]["rsvpHighlight"]["style"];
  preserveWhitespace?: boolean;
  jumpIndex?: number;
}) {
  const { before, highlight, after } = getHighlightSegments(
    token,
    unit,
    size,
    jumpIndex,
  );
  const highlightStyle = getHighlightSpanStyle(style);
  return (
    <span className={preserveWhitespace ? "whitespace-pre-wrap" : undefined}>
      <span>{before}</span>
      {highlight ? <span style={highlightStyle}>{highlight}</span> : null}
      <span>{after}</span>
    </span>
  );
}

function AnimatedHighlightedToken({
  token,
  unit,
  size,
  style,
  jumpRateHz,
  preserveWhitespace = false,
}: {
  token: string;
  unit: ConditionSpec["typography"]["rsvpHighlight"]["unit"];
  size: number;
  style: ConditionSpec["typography"]["rsvpHighlight"]["style"];
  jumpRateHz: number;
  preserveWhitespace?: boolean;
}) {
  const [jumpIndex, setJumpIndex] = useState(0);
  const positionCount = getHighlightPositionCount(token, unit, size);

  useEffect(() => {
    if (positionCount <= 1 || jumpRateHz <= 0) {
      return;
    }

    const delayMs = Math.max(50, Math.round(1000 / jumpRateHz));
    const intervalId = window.setInterval(() => {
      setJumpIndex((prev) => Math.min(prev + 1, positionCount - 1));
    }, delayMs);

    return () => window.clearInterval(intervalId);
  }, [jumpRateHz, positionCount]);

  return (
    <HighlightedToken
      token={token}
      unit={unit}
      size={size}
      style={style}
      preserveWhitespace={preserveWhitespace}
      jumpIndex={jumpIndex}
    />
  );
}

function endsWithPausePunctuation(token: string): boolean {
  return /[.,!?;:]["')\]]?$/.test(token.trim());
}

function speedToPxPerSecond(spec: ConditionSpec): number {
  const safeCharsPerSecond = Math.max(1, spec.motion.speed.value);
  const approxCharPx =
    spec.typography.fontSizePx * 0.62 + spec.typography.letterSpacingPx;
  return Math.max(10, safeCharsPerSecond * Math.max(1, approxCharPx));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getAdvanceCharacterCount(
  tokens: string[],
  startIndex: number,
  advanceCount: number,
  unit: TokenizationUnit,
): number {
  if (!tokens.length) {
    return 1;
  }

  const safeStart =
    ((startIndex % tokens.length) + tokens.length) % tokens.length;
  const size = Math.max(1, Math.floor(advanceCount || 1));
  const movedTokens: string[] = [];

  for (let i = 0; i < size; i += 1) {
    movedTokens.push(tokens[(safeStart + i) % tokens.length] ?? "");
  }

  const movedText = movedTokens.join(unit === "char" ? "" : " ");
  return Math.max(1, movedText.length);
}

function tokenizeText(
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

function formatTokenAsSentenceLines(value: string): string {
  if (!value.trim()) {
    return "";
  }
  return (value.match(SENTENCE_REGEX) ?? [value])
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .join("\n");
}

function splitTokenIntoParagraphs(value: string): string[] {
  return value
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function splitParagraphIntoSentences(value: string): string[] {
  return (value.match(SENTENCE_REGEX) ?? [value])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function getSentenceMarkerGlyph(shape: string): string {
  if (shape === "square") return "■";
  if (shape === "diamond") return "◆";
  if (shape === "triangle") return "▲";
  return "●";
}

function getSentenceMarkerColor(shape: string): string {
  if (shape === "square") return "#2563eb";
  if (shape === "diamond") return "#dc2626";
  if (shape === "triangle") return "#16a34a";
  return "#111111";
}

const SENTENCE_MARKER_CYCLE = ["circle", "square", "diamond", "triangle"] as const;

function getMarkerVariantIndex({
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

function getSentenceMarkerAppearance({
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

type RenderedLineRect = {
  top: number;
  left: number;
  right: number;
  height: number;
};

function renderLineRectsFromElement(
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

function countTextUnits(value: string): number {
  return Array.from(value).length;
}

type StaircaseLinePart = {
  text: string;
  sentenceIndex: number;
  isSentenceStart: boolean;
  isSentenceEnd: boolean;
};

type StaircaseAppendInput = {
  rawText: string;
  sentenceIndex: number;
  isSentenceStart: boolean;
  isSentenceEnd: boolean;
};

type StaircaseParagraphLine = {
  lineIndex: number;
  parts: StaircaseLinePart[];
  continuationFromPreviousLineIndex: number | null;
  continuationToNextLineIndex: number | null;
};

function buildParagraphStaircaseLines({
  paragraph,
  startLineIndex,
  getLineWidthCh,
}: {
  paragraph: string;
  startLineIndex: number;
  getLineWidthCh: (lineIndex: number) => number;
}): StaircaseParagraphLine[] {
  const sentences = splitParagraphIntoSentences(paragraph);
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
      rawText: sentence,
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

function getApproximateStaircaseWidthCh({
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

function LineMarkerParagraph({
  sentenceLayouts,
  sentenceMarkers,
  showStartMarker,
  showEndMarker,
}: {
  sentenceLayouts: Array<{
    key: string;
    sentence: string;
    sentenceStyle: CSSProperties;
  }>;
  sentenceMarkers: ConditionSpec["typography"]["sentenceMarkers"];
  showStartMarker: boolean;
  showEndMarker: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sentenceRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [lineRects, setLineRects] = useState<RenderedLineRect[]>([]);
  const markerGap = `${Math.max(0, sentenceMarkers.gapCh)}ch`;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateLineRects = () => {
      const nextLineRects = sentenceLayouts.flatMap((_, sentenceIndex) => {
        const sentenceNode = sentenceRefs.current[sentenceIndex];
        if (!sentenceNode) {
          return [];
        }
        return renderLineRectsFromElement(container, sentenceNode);
      });
      setLineRects(nextLineRects);
    };

    updateLineRects();
    const observer = new ResizeObserver(updateLineRects);
    observer.observe(container);
    sentenceRefs.current.forEach((sentenceNode) => {
      if (sentenceNode) {
        observer.observe(sentenceNode);
      }
    });
    return () => observer.disconnect();
  }, [sentenceLayouts]);

  const getMarkerStyle = (
    lineRect: RenderedLineRect,
    side: "start" | "end",
    color: string | undefined,
  ): CSSProperties => ({
    position: "absolute",
    top: lineRect.top,
    left: side === "start" ? lineRect.left : lineRect.right,
    transform:
      side === "start"
        ? `translateX(calc(-100% - ${markerGap}))`
        : `translateX(${markerGap})`,
    color,
    fontSize: `${Math.max(0.4, sentenceMarkers.sizeEm)}em`,
    lineHeight: `${lineRect.height}px`,
    pointerEvents: "none",
    zIndex: 1,
  });

  return (
    <div
      ref={containerRef}
      className="relative"
    >
      {lineRects.map((lineRect, lineIndex) => {
        const startMarker =
          lineIndex > 0
            ? getSentenceMarkerAppearance({
                variantIndex: lineIndex - 1,
                variationMode: sentenceMarkers.variationMode,
              })
            : null;
        const endMarker =
          lineIndex < lineRects.length - 1
            ? getSentenceMarkerAppearance({
                variantIndex: lineIndex,
                variationMode: sentenceMarkers.variationMode,
              })
            : null;
        return (
          <span key={`line-guide-${lineIndex}`}>
            {showStartMarker && startMarker ? (
              <span
                aria-hidden="true"
                style={getMarkerStyle(lineRect, "start", startMarker.color)}
              >
                {startMarker.glyph}
              </span>
            ) : null}
            {showEndMarker && endMarker ? (
              <span
                aria-hidden="true"
                style={getMarkerStyle(lineRect, "end", endMarker.color)}
              >
                {endMarker.glyph}
              </span>
            ) : null}
          </span>
        );
      })}
      {sentenceLayouts.map((layout, sentenceIndex) => (
        <div
          key={layout.key}
          ref={(node) => {
            sentenceRefs.current[sentenceIndex] = node;
          }}
          className="max-w-full"
          style={layout.sentenceStyle}
        >
          {layout.sentence}
        </div>
      ))}
    </div>
  );
}

function SentenceStructuredRenderer({
  token,
  staircaseEnabled,
  indentStepCh,
  indentMode,
  maxWidthCh,
  fontSizePx,
  lineWidthPx,
  sentenceMarkers,
}: {
  token: string;
  staircaseEnabled: boolean;
  indentStepCh: number;
  indentMode: ConditionSpec["typography"]["paragraphStaircase"]["indentMode"];
  maxWidthCh: number;
  fontSizePx: number;
  lineWidthPx: number;
  sentenceMarkers: ConditionSpec["typography"]["sentenceMarkers"];
}) {
  const paragraphs = splitTokenIntoParagraphs(token);
  const safeIndentStepCh = Math.max(0, indentStepCh);
  const staircaseWidthCh = getApproximateStaircaseWidthCh({
    maxWidthCh,
    lineWidthPx,
    fontSizePx,
  });
  const showStartMarker =
    sentenceMarkers.enabled &&
    (sentenceMarkers.position === "both" ||
      sentenceMarkers.position === "start");
  const showEndMarker =
    sentenceMarkers.enabled &&
    (sentenceMarkers.position === "both" || sentenceMarkers.position === "end");
  const markerGap = `${Math.max(0, sentenceMarkers.gapCh)}ch`;
  const getAbsoluteMarkerStyle = (
    side: "start" | "end",
    color: string | undefined,
  ): CSSProperties => ({
    position: "absolute",
    top: 0,
    [side === "start" ? "left" : "right"]: 0,
    transform:
      side === "start"
        ? `translateX(calc(-100% - ${markerGap}))`
        : `translateX(${markerGap})`,
    color,
    fontSize: `${Math.max(0.4, sentenceMarkers.sizeEm)}em`,
    lineHeight: "inherit",
    pointerEvents: "none",
  });

  if (!paragraphs.length) {
    return null;
  }

  return (
    <div className="space-y-4 whitespace-normal text-left">
      {paragraphs.map((paragraph, paragraphIndex) => {
        const sentences = splitParagraphIntoSentences(paragraph);
        const sentenceCount = sentences.length;
        const effectiveMarkerMode =
          sentenceMarkers.mode === "line" ? "line" : "sentence";
        const useLineLayout = indentMode === "line";
        const paragraphLines =
          useLineLayout
            ? buildParagraphStaircaseLines({
                paragraph,
                startLineIndex: 0,
                getLineWidthCh: (lineIndex) =>
                  Math.max(
                    6,
                    staircaseWidthCh -
                      (staircaseEnabled ? lineIndex * safeIndentStepCh : 0),
                  ),
              })
            : null;
        return (
          <div key={`${paragraphIndex}-${paragraph.slice(0, 32)}`}>
            {useLineLayout && paragraphLines ? (
              paragraphLines.map((line, lineIndex) => {
                const lineIndent =
                  staircaseEnabled && indentMode === "line"
                  ? line.lineIndex * safeIndentStepCh
                  : 0;
                const lineWidthCh = Math.max(6, staircaseWidthCh - lineIndent);
                const constrainLineWidth =
                  indentMode === "line" || maxWidthCh > 0;
                const lineStyle: CSSProperties = {
                  position: "relative",
                  marginLeft: `${lineIndent}ch`,
                  maxWidth: constrainLineWidth ? `${lineWidthCh}ch` : undefined,
                };
                const startLineMarker =
                  line.continuationFromPreviousLineIndex == null
                    ? null
                    : getSentenceMarkerAppearance({
                        variantIndex: line.continuationFromPreviousLineIndex,
                        variationMode: sentenceMarkers.variationMode,
                      });
                const endLineMarker =
                  line.continuationToNextLineIndex == null
                    ? null
                    : getSentenceMarkerAppearance({
                        variantIndex: line.continuationToNextLineIndex,
                        variationMode: sentenceMarkers.variationMode,
                      });

                return (
                  <div
                    key={`${paragraphIndex}-line-${lineIndex}`}
                    className="max-w-full"
                    style={lineStyle}
                  >
                    {showStartMarker &&
                    effectiveMarkerMode === "line" &&
                    startLineMarker ? (
                      <span
                        aria-hidden="true"
                        style={getAbsoluteMarkerStyle(
                          "start",
                          startLineMarker.color,
                        )}
                      >
                        {startLineMarker.glyph}
                      </span>
                    ) : null}
                    {line.parts.map((part, partIndex) => {
                      const startMarkerVariant = getMarkerVariantIndex({
                        unitIndex: part.sentenceIndex,
                        unitCount: sentenceCount,
                        side: "start",
                        mode: effectiveMarkerMode,
                      });
                      const endMarkerVariant = getMarkerVariantIndex({
                        unitIndex: part.sentenceIndex,
                        unitCount: sentenceCount,
                        side: "end",
                        mode: effectiveMarkerMode,
                      });
                      const startMarker =
                        startMarkerVariant == null
                          ? null
                          : getSentenceMarkerAppearance({
                              variantIndex: startMarkerVariant,
                              variationMode: sentenceMarkers.variationMode,
                            });
                      const endMarker =
                        endMarkerVariant == null
                          ? null
                          : getSentenceMarkerAppearance({
                              variantIndex: endMarkerVariant,
                              variationMode: sentenceMarkers.variationMode,
                            });

                      return (
                        <span key={`${paragraphIndex}-line-${lineIndex}-part-${partIndex}`}>
                          {showStartMarker &&
                          effectiveMarkerMode === "sentence" &&
                          part.isSentenceStart &&
                          startMarker ? (
                            <span
                              aria-hidden="true"
                              className="shrink-0 leading-[inherit]"
                              style={{
                                color: startMarker.color,
                                fontSize: `${Math.max(0.4, sentenceMarkers.sizeEm)}em`,
                                marginRight: markerGap,
                              }}
                            >
                              {startMarker.glyph}
                            </span>
                          ) : null}
                          <span>{part.text}</span>
                          {showEndMarker &&
                          effectiveMarkerMode === "sentence" &&
                          part.isSentenceEnd &&
                          endMarker ? (
                            <span
                              aria-hidden="true"
                              className="leading-[inherit]"
                              style={{
                                color: endMarker.color,
                                fontSize: `${Math.max(0.4, sentenceMarkers.sizeEm)}em`,
                                marginLeft: markerGap,
                              }}
                            >
                              {endMarker.glyph}
                            </span>
                          ) : null}
                        </span>
                      );
                    })}
                    {showEndMarker &&
                    effectiveMarkerMode === "line" &&
                    endLineMarker ? (
                      <span
                        aria-hidden="true"
                        style={getAbsoluteMarkerStyle(
                          "end",
                          endLineMarker.color,
                        )}
                      >
                        {endLineMarker.glyph}
                      </span>
                    ) : null}
                  </div>
                );
              })
            ) : null}
            {sentences.map((sentence, sentenceIndex) => {
              if (useLineLayout || effectiveMarkerMode === "line") {
                return null;
              }
              const sentenceIndent = staircaseEnabled
                ? sentenceIndex * safeIndentStepCh
                : 0;
              const sentenceWidthCh =
                maxWidthCh > 0
                  ? Math.max(6, staircaseWidthCh - sentenceIndent)
                  : undefined;
              const sentenceStyle: CSSProperties = {
                marginLeft: `${sentenceIndent}ch`,
                maxWidth:
                  sentenceWidthCh != null ? `${sentenceWidthCh}ch` : undefined,
              };
              const startMarkerVariant = getMarkerVariantIndex({
                unitIndex: sentenceIndex,
                unitCount: sentenceCount,
                side: "start",
                mode: "sentence",
              });
              const endMarkerVariant = getMarkerVariantIndex({
                unitIndex: sentenceIndex,
                unitCount: sentenceCount,
                side: "end",
                mode: "sentence",
              });
              const startMarker =
                startMarkerVariant == null
                  ? null
                  : getSentenceMarkerAppearance({
                      variantIndex: startMarkerVariant,
                      variationMode: sentenceMarkers.variationMode,
                    });
              const endMarker =
                endMarkerVariant == null
                  ? null
                  : getSentenceMarkerAppearance({
                      variantIndex: endMarkerVariant,
                      variationMode: sentenceMarkers.variationMode,
                    });
              return (
                <div
                  key={`${paragraphIndex}-${sentenceIndex}`}
                  className="max-w-full"
                  style={sentenceStyle}
                >
                  {showStartMarker && startMarker ? (
                    <span
                      aria-hidden="true"
                      className="shrink-0 leading-[inherit]"
                      style={{
                        color: startMarker.color,
                        fontSize: `${Math.max(0.4, sentenceMarkers.sizeEm)}em`,
                        marginRight: markerGap,
                      }}
                    >
                      {startMarker.glyph}
                    </span>
                  ) : null}
                  <span>
                    {sentence}
                    {showEndMarker && endMarker ? (
                      <span
                        aria-hidden="true"
                        className="leading-[inherit]"
                        style={{
                          color: endMarker.color,
                          fontSize: `${Math.max(0.4, sentenceMarkers.sizeEm)}em`,
                          marginLeft: markerGap,
                        }}
                      >
                        {endMarker.glyph}
                      </span>
                    ) : null}
                  </span>
                </div>
              );
            })}
            {!useLineLayout && effectiveMarkerMode === "line" ? (
              <LineMarkerParagraph
                sentenceLayouts={sentences.map((sentence, sentenceIndex) => {
                  const sentenceIndent = staircaseEnabled
                    ? sentenceIndex * safeIndentStepCh
                    : 0;
                  const sentenceWidthCh =
                    maxWidthCh > 0
                      ? Math.max(6, staircaseWidthCh - sentenceIndent)
                      : undefined;
                  return {
                    key: `${paragraphIndex}-${sentenceIndex}`,
                    sentence,
                    sentenceStyle: {
                      marginLeft: `${sentenceIndent}ch`,
                      maxWidth:
                        sentenceWidthCh != null
                          ? `${sentenceWidthCh}ch`
                          : undefined,
                    } satisfies CSSProperties,
                  };
                })}
                sentenceMarkers={sentenceMarkers}
                showStartMarker={showStartMarker}
                showEndMarker={showEndMarker}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function RsvpRenderer({
  spec,
  token,
  viewportStep,
  jumpRateHz,
}: {
  spec: ConditionSpec;
  token: string;
  viewportStep: ViewportStep;
  jumpRateHz: number;
}) {
  const alignment = spec.typography.alignment;
  const textAlign = alignment === "justify" ? "justify" : alignment;
  const rsvpHighlight =
    spec.typography.rsvpHighlight ?? conditionSpec.typography.rsvpHighlight;
  const highlightEnabled =
    spec.mode === "rsvp" && rsvpHighlight.enabled;
  const jumpHighlightEnabled = highlightEnabled && rsvpHighlight.mode === "jump";
  const isSentenceOrParagraph =
    viewportStep.startsWith("sentence") || viewportStep.startsWith("paragraph");
  const useSentenceStructuredLayout =
    isSentenceOrParagraph &&
    !highlightEnabled &&
    (spec.typography.paragraphStaircase.enabled ||
      spec.typography.sentenceMarkers.enabled);
  const horizontalJustify = isSentenceOrParagraph
    ? useSentenceStructuredLayout
      ? "flex-start"
      : alignment === "center"
      ? "center"
      : alignment === "right"
        ? "flex-end"
        : "flex-start"
    : "center";
  const multilineToken = viewportStep.startsWith("sentence")
    ? formatTokenAsSentenceLines(token)
    : token;
  const highlightUnit = rsvpHighlight.unit;
  const highlightSize = rsvpHighlight.size;
  const highlightStyle = rsvpHighlight.style;
  const { left, center, right } = highlightEnabled
    ? { left: "", center: "", right: "" }
    : splitAroundCenterCharacter(token);
  return (
    <div
      className="flex h-full w-full items-center"
      style={{ justifyContent: horizontalJustify }}
    >
      <div
        className={`w-full select-none ${isSentenceOrParagraph ? "" : "grid grid-cols-[1fr_auto_1fr] items-center"}`}
        style={{
          maxWidth: spec.typography.useViewportWidth
            ? "100%"
            : spec.typography.lineWidthPx,
          fontFamily: spec.typography.fontFamily,
          fontSize: spec.typography.fontSizePx,
          lineHeight: spec.typography.lineHeight,
          letterSpacing: spec.typography.letterSpacingPx,
          wordSpacing: spec.typography.wordSpacingPx,
          textAlign: isSentenceOrParagraph
            ? useSentenceStructuredLayout
              ? "left"
              : textAlign
            : undefined,
          fontVariationSettings: spec.typography.variableAxes
            ? Object.entries(spec.typography.variableAxes)
                .map(([axis, value]) => `"${axis}" ${value}`)
                .join(", ")
            : undefined,
        }}
      >
        {token ? (
          isSentenceOrParagraph ? (
            useSentenceStructuredLayout ? (
              <SentenceStructuredRenderer
                token={token}
                staircaseEnabled={spec.typography.paragraphStaircase.enabled}
                indentStepCh={spec.typography.paragraphStaircase.indentStepCh}
                indentMode={spec.typography.paragraphStaircase.indentMode}
                maxWidthCh={spec.typography.paragraphStaircase.maxWidthCh}
                fontSizePx={spec.typography.fontSizePx}
                lineWidthPx={spec.typography.lineWidthPx}
                sentenceMarkers={spec.typography.sentenceMarkers}
              />
            ) : (
              <div className="whitespace-pre-wrap">
                {highlightEnabled ? (
                  jumpHighlightEnabled ? (
                    <AnimatedHighlightedToken
                      key={`${multilineToken}-${highlightUnit}-${highlightSize}`}
                      token={multilineToken}
                      unit={highlightUnit}
                      size={highlightSize}
                      style={highlightStyle}
                      jumpRateHz={jumpRateHz}
                      preserveWhitespace
                    />
                  ) : (
                    <HighlightedToken
                      token={multilineToken}
                      unit={highlightUnit}
                      size={highlightSize}
                      style={highlightStyle}
                      preserveWhitespace
                    />
                  )
                ) : (
                  multilineToken
                )}
              </div>
            )
          ) : (
            highlightEnabled ? (
              <div className="col-span-3 text-center whitespace-pre">
                {jumpHighlightEnabled ? (
                  <AnimatedHighlightedToken
                    key={`${token}-${highlightUnit}-${highlightSize}`}
                    token={token}
                    unit={highlightUnit}
                    size={highlightSize}
                    style={highlightStyle}
                    jumpRateHz={jumpRateHz}
                  />
                ) : (
                  <HighlightedToken
                    token={token}
                    unit={highlightUnit}
                    size={highlightSize}
                    style={highlightStyle}
                  />
                )}
              </div>
            ) : (
              <>
                <span className="justify-self-end whitespace-pre text-right">
                  {left}
                </span>
                <span className="whitespace-pre">{center}</span>
                <span className="whitespace-pre text-left">{right}</span>
              </>
            )
          )
        ) : (
          <span className="col-span-3 text-center">Enter text to begin</span>
        )}
      </div>
    </div>
  );
}

function getContinuousSeparator(unit: TokenizationUnit) {
  if (unit === "char") {
    return "";
  }
  if (unit === "paragraph") {
    return "\n\n";
  }
  return " ";
}

function ContinuousRsvpRenderer({
  spec,
  tokens,
}: {
  spec: ConditionSpec;
  tokens: string[];
}) {
  const direction = spec.motion.direction;
  const rsvpHighlight =
    spec.typography.rsvpHighlight ?? conditionSpec.typography.rsvpHighlight;
  const highlightEnabled = rsvpHighlight.enabled;
  const jumpHighlightEnabled = highlightEnabled && rsvpHighlight.mode === "jump";
  const isSentenceStructuredUnit =
    spec.tokenization.unit === "sentence" || spec.tokenization.unit === "paragraph";
  const useSentenceStructuredLayout =
    !highlightEnabled &&
    isSentenceStructuredUnit &&
    (spec.typography.paragraphStaircase.enabled ||
      spec.typography.sentenceMarkers.enabled);
  const textAlign =
    useSentenceStructuredLayout
      ? "left"
      : spec.typography.alignment === "justify"
      ? "justify"
      : spec.typography.alignment;
  const separator = getContinuousSeparator(spec.tokenization.unit);
  const preserveTokenWhitespace =
    spec.tokenization.unit === "sentence" || spec.tokenization.unit === "paragraph";
  const effectiveJumpRateHz = clamp(
    rsvpHighlight.jumpRateHz,
    HIGHLIGHT_JUMP_RATE_MIN,
    HIGHLIGHT_JUMP_RATE_MAX,
  );
  const pxPerSecond = speedToPxPerSecond(spec);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const pxPerSecondRef = useRef(pxPerSecond);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const tokenRefs = useRef<Array<HTMLElement | null>>([]);
  const cycleLengthRef = useRef(2000);
  const offsetPxRef = useRef(0);
  const [activeJumpTokenIndex, setActiveJumpTokenIndex] = useState<number | null>(null);
  const loopGapPx = Math.max(
    12,
    direction === "vertical"
      ? spec.typography.fontSizePx * spec.typography.lineHeight * 2
      : spec.typography.fontSizePx * 0.9,
  );
  const text = useMemo(
    () =>
      useSentenceStructuredLayout
        ? tokens.join(spec.tokenization.unit === "paragraph" ? "\n\n" : " ")
        : direction === "vertical"
        ? tokens.join("\n")
        : tokens.join(
            spec.tokenization.unit === "char"
              ? ""
              : spec.tokenization.unit === "paragraph"
                ? "\n\n"
                : " ",
          ),
    [direction, spec.tokenization.unit, tokens, useSentenceStructuredLayout],
  );
  const displayText = text || "Enter text to begin";

  const applyTrackTransform = useCallback(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    track.style.transform =
      direction === "horizontal"
        ? `translateX(${-offsetPxRef.current}px)`
        : `translateY(${-offsetPxRef.current}px)`;
  }, [direction]);

  useEffect(() => {
    pxPerSecondRef.current = pxPerSecond;
  }, [pxPerSecond]);

  useEffect(() => {
    if (!spec.motion.autoplay || spec.mode !== "continuous") {
      return;
    }

    const tick = (ts: number) => {
      const lastTs = lastTsRef.current;
      const dt = lastTs == null ? 0 : (ts - lastTs) / 1000;
      lastTsRef.current = ts;
      const cycle = Math.max(1, cycleLengthRef.current);
      offsetPxRef.current = (offsetPxRef.current + pxPerSecondRef.current * dt) % cycle;
      applyTrackTransform();
      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = null;
      lastTsRef.current = null;
    };
  }, [applyTrackTransform, spec.mode, spec.motion.autoplay]);

  useEffect(() => {
    const node = measureRef.current;
    if (!node) {
      return;
    }

    const updateCycleLength = () => {
      const nextCycle =
        direction === "horizontal"
          ? node.scrollWidth + loopGapPx
          : node.scrollHeight + loopGapPx;
      cycleLengthRef.current = Math.max(1, nextCycle);
      offsetPxRef.current %= cycleLengthRef.current;
      applyTrackTransform();
    };

    updateCycleLength();
    const resizeObserver = new ResizeObserver(updateCycleLength);
    resizeObserver.observe(node);
    if (node.parentElement) {
      resizeObserver.observe(node.parentElement);
    }
    window.addEventListener("resize", updateCycleLength);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateCycleLength);
    };
  }, [
    applyTrackTransform,
    direction,
    displayText,
    loopGapPx,
    spec.motion.wrapVerticalText,
    spec.typography.alignment,
    spec.typography.fontFamily,
    spec.typography.fontSizePx,
    spec.typography.letterSpacingPx,
    spec.typography.lineHeight,
    spec.typography.wordSpacingPx,
  ]);

  useEffect(() => {
    applyTrackTransform();
  }, [applyTrackTransform]);

  useEffect(() => {
    if (!jumpHighlightEnabled || tokens.length === 0 || !viewportRef.current) {
      return;
    }

    let frameId = 0;

    const updateJumpFocus = () => {
      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }

      const viewportRect = viewport.getBoundingClientRect();
      const focusPoint =
        direction === "horizontal"
          ? viewportRect.left + viewportRect.width / 2
          : viewportRect.top + viewportRect.height / 2;

      let bestIndex: number | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      tokenRefs.current.forEach((node, index) => {
        if (!node) {
          return;
        }
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          return;
        }

        const tokenCenter =
          direction === "horizontal"
            ? rect.left + rect.width / 2
            : rect.top + rect.height / 2;
        const distance = Math.abs(tokenCenter - focusPoint);

        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });

      if (bestIndex == null) {
        setActiveJumpTokenIndex(null);
        frameId = window.requestAnimationFrame(updateJumpFocus);
        return;
      }
      setActiveJumpTokenIndex((prev) => (prev === bestIndex ? prev : bestIndex));
      frameId = window.requestAnimationFrame(updateJumpFocus);
    };

    frameId = window.requestAnimationFrame(updateJumpFocus);
    return () => window.cancelAnimationFrame(frameId);
  }, [
    direction,
    jumpHighlightEnabled,
    rsvpHighlight.size,
    rsvpHighlight.unit,
    tokens,
  ]);

  const contentClassName = useMemo(() => {
    if (useSentenceStructuredLayout) {
      return "text-left";
    }
    if (direction === "horizontal") {
      return "whitespace-nowrap";
    }
    return "flex w-full flex-col";
  }, [direction, useSentenceStructuredLayout]);

  const contentStyle = useMemo<CSSProperties>(
    () => ({
      fontFamily: spec.typography.fontFamily,
      fontSize: spec.typography.fontSizePx,
      lineHeight: spec.typography.lineHeight,
      letterSpacing: spec.typography.letterSpacingPx,
      wordSpacing: spec.typography.wordSpacingPx,
      textAlign,
    }),
    [
      spec.typography.fontFamily,
      spec.typography.fontSizePx,
      spec.typography.lineHeight,
      spec.typography.letterSpacingPx,
      spec.typography.wordSpacingPx,
      textAlign,
    ],
  );

  const contentChildren = useMemo(() => {
    if (useSentenceStructuredLayout) {
      return (
        <SentenceStructuredRenderer
          token={displayText}
          staircaseEnabled={spec.typography.paragraphStaircase.enabled}
          indentStepCh={spec.typography.paragraphStaircase.indentStepCh}
          indentMode={spec.typography.paragraphStaircase.indentMode}
          maxWidthCh={spec.typography.paragraphStaircase.maxWidthCh}
          fontSizePx={spec.typography.fontSizePx}
          lineWidthPx={spec.typography.lineWidthPx}
          sentenceMarkers={spec.typography.sentenceMarkers}
        />
      );
    }

    return tokens.map((token, index) => {
      const showTokenHighlight =
        highlightEnabled &&
        (!jumpHighlightEnabled || index === activeJumpTokenIndex);
      const tokenContent = showTokenHighlight ? (
        jumpHighlightEnabled ? (
          <AnimatedHighlightedToken
            key={`jump-${token}-${index}-${rsvpHighlight.unit}-${rsvpHighlight.size}-${effectiveJumpRateHz}`}
            token={token}
            unit={rsvpHighlight.unit}
            size={rsvpHighlight.size}
            style={rsvpHighlight.style}
            jumpRateHz={effectiveJumpRateHz}
            preserveWhitespace={preserveTokenWhitespace}
          />
        ) : (
          <HighlightedToken
            token={token}
            unit={rsvpHighlight.unit}
            size={rsvpHighlight.size}
            style={rsvpHighlight.style}
            preserveWhitespace={preserveTokenWhitespace}
          />
        )
      ) : (
        token
      );

      if (direction === "vertical") {
        return (
          <div
            key={`${token}-${index}`}
            ref={(node) => {
              tokenRefs.current[index] = node;
            }}
            className={
              spec.motion.wrapVerticalText
                ? "w-full whitespace-pre-wrap break-words"
                : "w-full whitespace-pre"
            }
          >
            {tokenContent}
          </div>
        );
      }

      return (
        <span
          key={`${token}-${index}`}
          ref={(node) => {
            tokenRefs.current[index] = node;
          }}
          className="inline-block"
        >
          {index > 0 && separator ? <span>{separator}</span> : null}
          {tokenContent}
        </span>
      );
    });
  }, [
    displayText,
    direction,
    effectiveJumpRateHz,
    highlightEnabled,
    jumpHighlightEnabled,
    activeJumpTokenIndex,
    preserveTokenWhitespace,
    rsvpHighlight.size,
    rsvpHighlight.style,
    rsvpHighlight.unit,
    separator,
    spec.motion.wrapVerticalText,
    spec.typography.fontSizePx,
    spec.typography.lineWidthPx,
    spec.typography.paragraphStaircase.enabled,
    spec.typography.paragraphStaircase.indentMode,
    spec.typography.paragraphStaircase.indentStepCh,
    spec.typography.paragraphStaircase.maxWidthCh,
    spec.typography.sentenceMarkers,
    tokens,
    useSentenceStructuredLayout,
  ]);

  const renderContinuousContent = (measurementRef?: RefObject<HTMLDivElement | null>) => (
    <div
      ref={measurementRef}
      className={contentClassName}
      style={contentStyle}
    >
      {contentChildren}
    </div>
  );

  return (
    <div
      ref={viewportRef}
      className="relative h-full w-full overflow-hidden"
    >
      <div
        className="absolute left-0 top-0 h-full w-full opacity-15"
        style={{
          background:
            direction === "horizontal"
              ? "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(34,197,94,0.25) 50%, rgba(255,255,255,0) 100%)"
              : "linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(34,197,94,0.25) 50%, rgba(255,255,255,0) 100%)",
        }}
      />
      {direction === "horizontal" ? (
        <div className="absolute inset-y-0 left-0 flex items-center overflow-hidden">
          <div
            ref={trackRef}
            className="flex items-center px-8"
            style={{
              gap: loopGapPx,
            }}
          >
            {renderContinuousContent(measureRef)}
            <div aria-hidden="true">{renderContinuousContent()}</div>
          </div>
        </div>
      ) : (
        <div className="absolute inset-x-0 top-0 overflow-hidden px-8">
          <div
            ref={trackRef}
            className="flex flex-col"
            style={{
              gap: loopGapPx,
            }}
          >
            {renderContinuousContent(measureRef)}
            <div aria-hidden="true">{renderContinuousContent()}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Viewport({
  spec,
  viewportStep,
  rsvpToken,
  continuousTokens,
  highlightJumpRateHz,
  manualAdvanceEnabled,
  onManualAdvance,
  onViewportMouseMove,
  onViewportMouseLeave,
}: {
  spec: ConditionSpec;
  viewportStep: ViewportStep;
  rsvpToken: string;
  continuousTokens: string[];
  highlightJumpRateHz: number;
  manualAdvanceEnabled: boolean;
  onManualAdvance: () => void;
  onViewportMouseMove: (event: MouseEvent<HTMLDivElement>) => void;
  onViewportMouseLeave: () => void;
}) {
  return (
    <div
      className={`h-full w-full overflow-hidden border border-zinc-300 select-none ${
        manualAdvanceEnabled ? "cursor-pointer" : ""
      }`}
      style={{ padding: spec.typography.viewportPaddingPx }}
      onClick={manualAdvanceEnabled ? onManualAdvance : undefined}
      onMouseMove={onViewportMouseMove}
      onMouseLeave={onViewportMouseLeave}
    >
      {spec.mode === "continuous" ? (
        <ContinuousRsvpRenderer
          spec={spec}
          tokens={continuousTokens}
        />
      ) : (
        <RsvpRenderer
          spec={spec}
          token={rsvpToken}
          viewportStep={viewportStep}
          jumpRateHz={highlightJumpRateHz}
        />
      )}
    </div>
  );
}

export default function Home() {
  const [spec, setSpec] = useState<ConditionSpec>({
    ...conditionSpec,
    typography: {
      ...conditionSpec.typography,
    },
    motion: {
      ...conditionSpec.motion,
      speed: { ...conditionSpec.motion.speed, unit: "cps" },
    },
  });
  const [viewportStep, setViewportStep] = useState<ViewportStep>("word-1");
  const [advanceStep, setAdvanceStep] = useState(1);
  const [rsvpIndex, setRsvpIndex] = useState(0);
  const [isSpecModalOpen, setIsSpecModalOpen] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(true);
  const [settingsWidth, setSettingsWidth] = useState(420);
  const [viewportWidthPercent, setViewportWidthPercent] = useState(100);
  const [viewportHeightPercent, setViewportHeightPercent] = useState(100);
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const [isResizingViewport, setIsResizingViewport] = useState(false);
  const [settingsName, setSettingsName] = useState("condition-spec");
  const [settingsModalError, setSettingsModalError] = useState("");
  const [text, setText] = useState("");
  const logsRef = useRef<LogEntry[]>([]);
  const rsvpIndexRef = useRef(0);
  const baseSpeedBeforeMouseRef = useRef<number | null>(null);
  const splitViewRef = useRef<HTMLDivElement | null>(null);
  const viewportAreaRef = useRef<HTMLDivElement | null>(null);
  const viewportResizeStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    widthPercent: number;
    heightPercent: number;
    horizontalSign: 1 | -1;
    verticalSign: 1 | -1;
  } | null>(null);
  const settingsFileInputRef = useRef<HTMLInputElement | null>(null);
  const rsvpHighlight =
    spec.typography.rsvpHighlight ?? conditionSpec.typography.rsvpHighlight;
  const allowedHighlightSteps = useMemo(
    () =>
      RSVP_STEPS.slice(
        0,
        Math.max(1, getStepIndex(viewportStep, "rsvp") + 1),
      ),
    [viewportStep],
  );
  const currentHighlightStep = getViewportStepFromTokenization(
    rsvpHighlight.unit,
    rsvpHighlight.size,
  );
  const highlightStep = allowedHighlightSteps.includes(currentHighlightStep)
    ? currentHighlightStep
    : allowedHighlightSteps[allowedHighlightSteps.length - 1] ?? "letter-1";
  const highlightStepIndex = Math.max(
    0,
    allowedHighlightSteps.indexOf(highlightStep),
  );

  const appendLog = useCallback((entry: LogEntry) => {
    const next = [...logsRef.current, entry];
    logsRef.current = next.length > 200 ? next.slice(next.length - 200) : next;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadDefaultText = async () => {
      try {
        const response = await fetch(DEFAULT_TEXT_PATH);
        if (!response.ok) {
          return;
        }
        const loadedText = await response.text();
        if (!cancelled) {
          setText(loadedText);
        }
      } catch {
        // if default text file isnt there just keep whats already loaded
      }
    };

    void loadDefaultText();
    return () => {
      cancelled = true;
    };
  }, []);

  // rsvp size comes from viewport step
  // keep base tokens ungrouped so counts dont multiply
  const rsvpChunkSize = 1;
  const rsvpTokens = useMemo(
    () => tokenizeText(text, spec.tokenization.unit, rsvpChunkSize),
    [rsvpChunkSize, spec.tokenization.unit, text],
  );
  const continuousTokens = useMemo(
    () =>
      tokenizeText(
        text,
        spec.tokenization.unit,
        Math.max(1, spec.tokenization.chunkSize),
      ),
    [text, spec.tokenization.chunkSize, spec.tokenization.unit],
  );
  const viewportTokenCount = useMemo(
    () => getViewportTokenCount(viewportStep),
    [viewportStep],
  );
  const maxAdvanceStep = viewportTokenCount;
  const effectiveAdvanceStep = Math.max(
    1,
    Math.min(maxAdvanceStep, Math.floor(advanceStep || 1)),
  );
  const safeRsvpIndex = rsvpTokens.length ? rsvpIndex % rsvpTokens.length : 0;
  const currentRsvpToken = getRsvpDisplayToken(
    rsvpTokens,
    safeRsvpIndex,
    viewportTokenCount,
    spec.tokenization.unit,
  );
  const effectiveHighlightJumpRateHz = clamp(
    rsvpHighlight.jumpRateHz,
    HIGHLIGHT_JUMP_RATE_MIN,
    HIGHLIGHT_JUMP_RATE_MAX,
  );
  const settingsPayload = useMemo<SettingsJson>(
    () => ({
      ...spec,
      ui: {
        viewportStep,
        advanceStep,
        viewportWidthPercent,
        viewportHeightPercent,
      },
    }),
    [
      advanceStep,
      spec,
      viewportHeightPercent,
      viewportStep,
      viewportWidthPercent,
    ],
  );
  const canManualAdvance =
    spec.mode === "rsvp" && !spec.motion.autoplay && rsvpTokens.length > 0;

  useEffect(() => {
    if (highlightStep === currentHighlightStep) {
      return;
    }
    const nextHighlightTokenization = getTokenizationFromViewportStep(highlightStep);
    setSpec((prev) => ({
      ...prev,
      typography: {
        ...prev.typography,
        rsvpHighlight: {
          ...(prev.typography.rsvpHighlight ??
            conditionSpec.typography.rsvpHighlight),
          unit:
            nextHighlightTokenization.unit === "char" ||
            nextHighlightTokenization.unit === "word" ||
            nextHighlightTokenization.unit === "sentence" ||
            nextHighlightTokenization.unit === "paragraph"
              ? nextHighlightTokenization.unit
              : "char",
          size: nextHighlightTokenization.chunkSize,
        },
      },
    }));
  }, [currentHighlightStep, highlightStep]);

  const handleViewportMouseMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!spec.motion.rateControl.enabled) {
        return;
      }
      if (baseSpeedBeforeMouseRef.current == null) {
        baseSpeedBeforeMouseRef.current = spec.motion.speed.value;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.height <= 0) {
        return;
      }
      const yNorm = clamp((event.clientY - rect.top) / rect.height, 0, 1);
      const mapped = 1 - yNorm;
      const nextCps = clamp(
        Math.round(SPEED_MIN_CPS + mapped * (SPEED_MAX_CPS - SPEED_MIN_CPS)),
        SPEED_MIN_CPS,
        SPEED_MAX_CPS,
      );
      setSpec((prev) => {
        if (prev.motion.speed.value === nextCps) {
          return prev;
        }
        return {
          ...prev,
          motion: {
            ...prev.motion,
            speed: { ...prev.motion.speed, unit: "cps", value: nextCps },
          },
        };
      });
    },
    [spec.motion.rateControl.enabled, spec.motion.speed.value],
  );

  const handleViewportMouseLeave = useCallback(() => {
    if (
      spec.motion.rateControl.resetOnLeave &&
      baseSpeedBeforeMouseRef.current != null
    ) {
      const fallbackSpeed = baseSpeedBeforeMouseRef.current;
      setSpec((prev) => ({
        ...prev,
        motion: {
          ...prev.motion,
          speed: {
            ...prev.motion.speed,
            unit: "cps",
            value: clamp(
              Math.round(fallbackSpeed),
              SPEED_MIN_CPS,
              SPEED_MAX_CPS,
            ),
          },
        },
      }));
    }
    baseSpeedBeforeMouseRef.current = null;
  }, [spec.motion.rateControl.resetOnLeave]);

  useEffect(() => {
    rsvpIndexRef.current = safeRsvpIndex;
  }, [safeRsvpIndex]);

  useEffect(() => {
    if (spec.motion.rateControl.enabled) {
      return;
    }
    baseSpeedBeforeMouseRef.current = null;
  }, [spec.motion.rateControl.enabled]);

  useEffect(() => {
    const allowedSteps = getViewportStepsForMode(spec.mode);
    if (allowedSteps.includes(viewportStep)) {
      return;
    }
    const fallbackStep: ViewportStep = "word-1";
    setViewportStep(fallbackStep);
    const tokenization = getTokenizationFromViewportStep(fallbackStep);
    setSpec((prev) => ({
      ...prev,
      tokenization: {
        ...prev.tokenization,
        unit: tokenization.unit,
        chunkSize: tokenization.chunkSize,
      },
    }));
  }, [spec.mode, viewportStep]);

  useEffect(() => {
    if (
      spec.mode !== "continuous" ||
      spec.motion.direction !== "horizontal" ||
      viewportStep === "paragraph-3"
    ) {
      return;
    }

    setViewportStep("paragraph-3");
    setSpec((prev) => ({
      ...prev,
      tokenization: {
        ...prev.tokenization,
        unit: "paragraph",
        chunkSize: 3,
      },
    }));
  }, [spec.mode, spec.motion.direction, viewportStep]);

  const advanceRsvp = useCallback(
    (event: "tick" | "manual") => {
      if (spec.mode !== "rsvp" || rsvpTokens.length === 0) {
        return null;
      }
      const currentIndex = rsvpIndexRef.current;
      const next = (currentIndex + effectiveAdvanceStep) % rsvpTokens.length;
      rsvpIndexRef.current = next;
      setRsvpIndex(next);
      appendLog({
        event,
        index: next,
        timestamp: new Date().toISOString(),
      });
      return {
        token: getRsvpDisplayToken(
          rsvpTokens,
          next,
          viewportTokenCount,
          spec.tokenization.unit,
        ),
        advancedCharCount: getAdvanceCharacterCount(
          rsvpTokens,
          currentIndex,
          effectiveAdvanceStep,
          spec.tokenization.unit,
        ),
      };
    },
    [
      appendLog,
      effectiveAdvanceStep,
      rsvpTokens,
      spec.mode,
      spec.tokenization.unit,
      viewportTokenCount,
    ],
  );

  useEffect(() => {
    if (
      spec.mode !== "rsvp" ||
      !spec.motion.autoplay ||
      rsvpTokens.length === 0
    ) {
      return;
    }

    let timeoutId: number;
    let cancelled = false;

    const tick = () => {
      if (cancelled) {
        return;
      }
      const result = advanceRsvp("tick");
      if (!result) {
        return;
      }
      const speedValue = Math.max(1, spec.motion.speed.value);
      const msPerToken = Math.max(
        20,
        Math.round((result.advancedCharCount * 1000) / speedValue),
      );
      const extraDelay =
        spec.motion.pauseAtPunctuation.enabled &&
        endsWithPausePunctuation(result.token) &&
        spec.mode === "rsvp"
          ? Math.max(0, spec.motion.pauseAtPunctuation.delayMs)
          : 0;
      timeoutId = window.setTimeout(tick, msPerToken + extraDelay);
    };
    timeoutId = window.setTimeout(tick, 1);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    advanceRsvp,
    rsvpTokens.length,
    spec.mode,
    spec.motion.autoplay,
    spec.motion.pauseAtPunctuation.delayMs,
    spec.motion.pauseAtPunctuation.enabled,
    spec.motion.speed.value,
  ]);

  useEffect(() => {
    if (!canManualAdvance) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") {
        return;
      }
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName ?? "";
      if (
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      event.preventDefault();
      advanceRsvp("manual");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [advanceRsvp, canManualAdvance]);

  const setAutoplay = useCallback(
    (autoplay: boolean) => {
      setSpec((prev) => ({
        ...prev,
        motion: { ...prev.motion, autoplay },
      }));
      appendLog({
        event: autoplay ? "start" : "stop",
        index: safeRsvpIndex,
        timestamp: new Date().toISOString(),
      });
    },
    [appendLog, safeRsvpIndex],
  );

  const applyViewportStep = useCallback((step: ViewportStep) => {
    setViewportStep(step);
    const tokenization = getTokenizationFromViewportStep(step);
    setSpec((prev) => ({
      ...prev,
      tokenization: {
        ...prev.tokenization,
        unit: tokenization.unit,
        chunkSize: tokenization.chunkSize,
      },
    }));
  }, []);

  const handleDownloadSettings = useCallback(() => {
    const safeName = sanitizeSettingsName(settingsName) || "condition-spec";
    const fileName = `${safeName}.json`;
    const blob = new Blob([JSON.stringify(settingsPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [settingsName, settingsPayload]);

  const handleCopySettings = useCallback(async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard not available in this browser.");
      }
      await navigator.clipboard.writeText(JSON.stringify(settingsPayload, null, 2));
      setSettingsModalError("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to copy settings JSON.";
      setSettingsModalError(message);
    }
  }, [settingsPayload]);

  const handleResetDefaults = useCallback(() => {
    const defaultSpec: ConditionSpec = {
      ...conditionSpec,
      motion: {
        ...conditionSpec.motion,
        speed: { ...conditionSpec.motion.speed, unit: "cps" },
      },
      typography: {
        ...conditionSpec.typography,
      },
    };
    setSpec(defaultSpec);
    setViewportStep(
      getViewportStepFromTokenization(
        conditionSpec.tokenization.unit,
        conditionSpec.tokenization.chunkSize,
      ),
    );
    setAdvanceStep(1);
    setViewportWidthPercent(VIEWPORT_SIZE_MAX_PERCENT);
    setViewportHeightPercent(VIEWPORT_SIZE_MAX_PERCENT);
    baseSpeedBeforeMouseRef.current = null;
    setSettingsModalError("");
  }, []);

  const handleUploadSettingsFile = useCallback(async (file: File) => {
    const raw = await file.text();
    const parsed = JSON.parse(raw) as Omit<Partial<ConditionSpec>, "typography" | "motion"> & {
      typography?: Partial<ConditionSpec["typography"]> & {
        sentenceMarkers?: Partial<ConditionSpec["typography"]["sentenceMarkers"]> & {
          pairingMode?: "sentence" | "guide";
        };
        rsvpHighlight?: Partial<ConditionSpec["typography"]["rsvpHighlight"]>;
      };
      ui?: SettingsJson["ui"];
      motion?: Omit<Partial<ConditionSpec["motion"]>, "speed"> & {
        speed?: { unit?: string; value?: number };
        rateControl?: Partial<ConditionSpec["motion"]["rateControl"]>;
      };
    };

    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.tokenization ||
      !parsed.motion ||
      !parsed.typography
    ) {
      throw new Error("Invalid settings JSON structure.");
    }

    const next = {
      ...conditionSpec,
      ...parsed,
      mode:
        parsed.mode === "rsvp" || parsed.mode === "continuous"
          ? parsed.mode
          : "continuous",
      tokenization: {
        ...conditionSpec.tokenization,
        ...parsed.tokenization,
      },
      typography: {
        ...conditionSpec.typography,
        ...parsed.typography,
        viewportPaddingPx: Number.isFinite(
          Number(parsed.typography?.viewportPaddingPx),
        )
          ? Math.max(0, Number(parsed.typography?.viewportPaddingPx))
          : conditionSpec.typography.viewportPaddingPx,
        useViewportWidth:
          typeof parsed.typography?.useViewportWidth === "boolean"
            ? parsed.typography.useViewportWidth
            : conditionSpec.typography.useViewportWidth,
        alignment:
          parsed.typography?.alignment === "left" ||
          parsed.typography?.alignment === "center" ||
          parsed.typography?.alignment === "right" ||
          parsed.typography?.alignment === "justify"
            ? parsed.typography.alignment
            : conditionSpec.typography.alignment,
        paragraphStaircase: {
          ...conditionSpec.typography.paragraphStaircase,
          ...parsed.typography?.paragraphStaircase,
          enabled:
            typeof parsed.typography?.paragraphStaircase?.enabled === "boolean"
              ? parsed.typography.paragraphStaircase.enabled
              : conditionSpec.typography.paragraphStaircase.enabled,
          indentStepCh: Math.max(
            0,
            Number(parsed.typography?.paragraphStaircase?.indentStepCh) ||
              conditionSpec.typography.paragraphStaircase.indentStepCh,
          ),
          indentMode:
            parsed.typography?.paragraphStaircase?.indentMode === "line" ||
            parsed.typography?.paragraphStaircase?.indentMode === "sentence"
              ? parsed.typography.paragraphStaircase.indentMode
              : conditionSpec.typography.paragraphStaircase.indentMode,
          maxWidthCh: Math.max(
            0,
            Number(parsed.typography?.paragraphStaircase?.maxWidthCh) ||
              conditionSpec.typography.paragraphStaircase.maxWidthCh,
          ),
        },
        sentenceMarkers: {
          ...conditionSpec.typography.sentenceMarkers,
          ...parsed.typography?.sentenceMarkers,
          enabled:
            typeof parsed.typography?.sentenceMarkers?.enabled === "boolean"
              ? parsed.typography.sentenceMarkers.enabled
              : conditionSpec.typography.sentenceMarkers.enabled,
          position:
            parsed.typography?.sentenceMarkers?.position === "both" ||
            parsed.typography?.sentenceMarkers?.position === "start" ||
            parsed.typography?.sentenceMarkers?.position === "end"
              ? parsed.typography.sentenceMarkers.position
              : conditionSpec.typography.sentenceMarkers.position,
          variationMode:
            parsed.typography?.sentenceMarkers?.variationMode === "shape" ||
            parsed.typography?.sentenceMarkers?.variationMode === "color" ||
            parsed.typography?.sentenceMarkers?.variationMode === "both"
              ? parsed.typography.sentenceMarkers.variationMode
              : conditionSpec.typography.sentenceMarkers.variationMode,
          mode:
            parsed.typography?.sentenceMarkers?.mode === "sentence" ||
            parsed.typography?.sentenceMarkers?.mode === "line"
              ? parsed.typography.sentenceMarkers.mode
              : parsed.typography?.sentenceMarkers?.pairingMode === "guide" ||
                  parsed.typography?.sentenceMarkers?.pairingMode === "sentence"
                ? "sentence"
                : conditionSpec.typography.sentenceMarkers.mode,
          sizeEm: Math.max(
            0.4,
            Number(parsed.typography?.sentenceMarkers?.sizeEm) ||
              conditionSpec.typography.sentenceMarkers.sizeEm,
          ),
          gapCh: Math.max(
            0,
            Number(parsed.typography?.sentenceMarkers?.gapCh) ||
              conditionSpec.typography.sentenceMarkers.gapCh,
          ),
        },
        rsvpHighlight: {
          ...conditionSpec.typography.rsvpHighlight,
          ...parsed.typography?.rsvpHighlight,
          enabled:
            typeof parsed.typography?.rsvpHighlight?.enabled === "boolean"
              ? parsed.typography.rsvpHighlight.enabled
              : conditionSpec.typography.rsvpHighlight.enabled,
          unit:
            parsed.typography?.rsvpHighlight?.unit === "char" ||
            parsed.typography?.rsvpHighlight?.unit === "word" ||
            parsed.typography?.rsvpHighlight?.unit === "sentence" ||
            parsed.typography?.rsvpHighlight?.unit === "paragraph"
              ? parsed.typography.rsvpHighlight.unit
              : conditionSpec.typography.rsvpHighlight.unit,
          size: clamp(
            Number(parsed.typography?.rsvpHighlight?.size) ||
              conditionSpec.typography.rsvpHighlight.size,
            1,
            3,
          ),
          style:
            parsed.typography?.rsvpHighlight?.style === "bold" ||
            parsed.typography?.rsvpHighlight?.style === "background" ||
            parsed.typography?.rsvpHighlight?.style === "outline"
              ? parsed.typography.rsvpHighlight.style
              : conditionSpec.typography.rsvpHighlight.style,
          mode:
            parsed.typography?.rsvpHighlight?.mode === "jump" ||
            parsed.typography?.rsvpHighlight?.mode === "static"
              ? parsed.typography.rsvpHighlight.mode
              : conditionSpec.typography.rsvpHighlight.mode,
          jumpRateHz: clamp(
            Number(parsed.typography?.rsvpHighlight?.jumpRateHz) ||
              conditionSpec.typography.rsvpHighlight.jumpRateHz,
            HIGHLIGHT_JUMP_RATE_MIN,
            HIGHLIGHT_JUMP_RATE_MAX,
          ),
        },
      },
      motion: {
        ...conditionSpec.motion,
        ...parsed.motion,
        wrapVerticalText:
          typeof parsed.motion?.wrapVerticalText === "boolean"
            ? parsed.motion.wrapVerticalText
            : conditionSpec.motion.wrapVerticalText,
        speed: {
          ...conditionSpec.motion.speed,
          ...parsed.motion?.speed,
          unit:
            parsed.motion?.speed?.unit === "wpm"
              ? "cps"
              : parsed.motion?.speed?.unit === "cps" ||
                  parsed.motion?.speed?.unit === "pxps"
                ? parsed.motion.speed.unit
                : conditionSpec.motion.speed.unit,
          value:
            parsed.motion?.speed?.unit === "wpm"
              ? Math.max(
                  1,
                  Math.round((Number(parsed.motion?.speed?.value) || 0) / 12),
                )
              : Math.max(
                  1,
                  Number(parsed.motion?.speed?.value) ||
                    conditionSpec.motion.speed.value,
                ),
        },
        pauseAtPunctuation: {
          ...conditionSpec.motion.pauseAtPunctuation,
          ...parsed.motion?.pauseAtPunctuation,
        },
        rateControl: {
          ...conditionSpec.motion.rateControl,
          ...parsed.motion?.rateControl,
          source: "mouseY",
          invert: true,
          minCps: Math.max(
            1,
            Number(parsed.motion?.rateControl?.minCps) ||
              conditionSpec.motion.rateControl.minCps,
          ),
          maxCps: Math.max(
            1,
            Number(parsed.motion?.rateControl?.maxCps) ||
              conditionSpec.motion.rateControl.maxCps,
          ),
        },
      },
    } satisfies ConditionSpec;

    const normalizedMinCps = Math.max(
      1,
      Math.min(next.motion.rateControl.minCps, next.motion.rateControl.maxCps),
    );
    const normalizedMaxCps = Math.max(
      normalizedMinCps,
      next.motion.rateControl.maxCps,
    );
    setSpec({
      ...next,
      motion: {
        ...next.motion,
        rateControl: {
          ...next.motion.rateControl,
          minCps: normalizedMinCps,
          maxCps: normalizedMaxCps,
        },
      },
    });
    const fallbackViewportStep = getViewportStepFromTokenization(
      next.tokenization.unit,
      next.tokenization.chunkSize,
    );
    const uploadedViewportStep = parsed.ui?.viewportStep;
    const modeSteps = getViewportStepsForMode(next.mode);
    const resolvedViewportStep =
      uploadedViewportStep && modeSteps.includes(uploadedViewportStep)
        ? uploadedViewportStep
        : fallbackViewportStep;
    setViewportStep(resolvedViewportStep);
    setAdvanceStep(
      clamp(
        Number(parsed.ui?.advanceStep) || 1,
        1,
        getViewportTokenCount(resolvedViewportStep),
      ),
    );
    setViewportWidthPercent(
      clamp(
        Number(parsed.ui?.viewportWidthPercent) || VIEWPORT_SIZE_MAX_PERCENT,
        VIEWPORT_SIZE_MIN_PERCENT,
        VIEWPORT_SIZE_MAX_PERCENT,
      ),
    );
    setViewportHeightPercent(
      clamp(
        Number(parsed.ui?.viewportHeightPercent) || VIEWPORT_SIZE_MAX_PERCENT,
        VIEWPORT_SIZE_MIN_PERCENT,
        VIEWPORT_SIZE_MAX_PERCENT,
      ),
    );
    setSettingsModalError("");
  }, []);

  const handleSettingsFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      try {
        await handleUploadSettingsFile(file);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to import JSON.";
        setSettingsModalError(message);
      } finally {
        event.target.value = "";
      }
    },
    [handleUploadSettingsFile],
  );

  useEffect(() => {
    if (!isResizingPanel || !isSettingsVisible) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const node = splitViewRef.current;
      if (!node) {
        return;
      }
      const rect = node.getBoundingClientRect();
      const maxSettingsWidth = Math.max(
        MIN_SETTINGS_WIDTH,
        rect.width - MIN_VIEWPORT_WIDTH,
      );
      const nextWidth = rect.right - event.clientX;
      const clampedWidth = Math.min(
        maxSettingsWidth,
        Math.max(MIN_SETTINGS_WIDTH, nextWidth),
      );
      setSettingsWidth(clampedWidth);
    };

    const handlePointerUp = () => {
      setIsResizingPanel(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingPanel, isSettingsVisible]);

  useEffect(() => {
    const handleResize = () => {
      const node = splitViewRef.current;
      if (!node) {
        return;
      }
      const maxSettingsWidth = Math.max(
        MIN_SETTINGS_WIDTH,
        node.getBoundingClientRect().width - MIN_VIEWPORT_WIDTH,
      );
      setSettingsWidth((prev) =>
        Math.min(maxSettingsWidth, Math.max(MIN_SETTINGS_WIDTH, prev)),
      );
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isSettingsVisible]);

  useEffect(() => {
    if (!isResizingViewport) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const start = viewportResizeStartRef.current;
      const area = viewportAreaRef.current;
      if (!start || !area) {
        return;
      }
      const rect = area.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      const deltaXPercent =
        ((event.clientX - start.pointerX) / rect.width) * 100;
      const deltaYPercent =
        ((event.clientY - start.pointerY) / rect.height) * 100;

      setViewportWidthPercent(
        clamp(
          start.widthPercent + deltaXPercent * start.horizontalSign,
          VIEWPORT_SIZE_MIN_PERCENT,
          VIEWPORT_SIZE_MAX_PERCENT,
        ),
      );
      setViewportHeightPercent(
        clamp(
          start.heightPercent + deltaYPercent * start.verticalSign,
          VIEWPORT_SIZE_MIN_PERCENT,
          VIEWPORT_SIZE_MAX_PERCENT,
        ),
      );
    };

    const handlePointerUp = () => {
      viewportResizeStartRef.current = null;
      setIsResizingViewport(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingViewport]);

  return (
    <main className="bg-white text-black">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-4">
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            className="rounded border border-zinc-300 px-3 py-1 text-sm"
            onClick={() => setIsSettingsVisible((prev) => !prev)}
          >
            {isSettingsVisible ? "Hide Settings" : "Show Settings"}
          </button>
        </div>

        <div
          ref={splitViewRef}
          className="flex h-[calc(100vh-5rem)] min-h-[680px] rounded border border-zinc-200"
        >
          <section className="min-w-0 flex-1 overflow-auto p-4">
            <div
              ref={viewportAreaRef}
              className="relative flex h-full items-center justify-center"
            >
              <div
                className="relative overflow-hidden"
                style={{
                  width: `${viewportWidthPercent}%`,
                  height: `${viewportHeightPercent}%`,
                }}
              >
                <div
                  className="absolute left-1/2 top-1/2"
                  style={{
                    width: `${10000 / viewportWidthPercent}%`,
                    height: `${10000 / viewportHeightPercent}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <Viewport
                    spec={spec}
                    viewportStep={viewportStep}
                    rsvpToken={currentRsvpToken}
                    continuousTokens={continuousTokens}
                    highlightJumpRateHz={effectiveHighlightJumpRateHz}
                    manualAdvanceEnabled={canManualAdvance}
                    onManualAdvance={() => advanceRsvp("manual")}
                    onViewportMouseMove={handleViewportMouseMove}
                    onViewportMouseLeave={handleViewportMouseLeave}
                  />
                </div>
                {[
                  {
                    key: "top-left",
                    className: "-left-2 -top-2 cursor-nwse-resize",
                    horizontalSign: -1 as const,
                    verticalSign: -1 as const,
                  },
                  {
                    key: "top-right",
                    className: "-right-2 -top-2 cursor-nesw-resize",
                    horizontalSign: 1 as const,
                    verticalSign: -1 as const,
                  },
                  {
                    key: "bottom-left",
                    className: "-bottom-2 -left-2 cursor-nesw-resize",
                    horizontalSign: -1 as const,
                    verticalSign: 1 as const,
                  },
                  {
                    key: "bottom-right",
                    className: "-bottom-2 -right-2 cursor-nwse-resize",
                    horizontalSign: 1 as const,
                    verticalSign: 1 as const,
                  },
                ].map((handle) => (
                  <button
                    key={handle.key}
                    type="button"
                    aria-label={`Resize viewport from ${handle.key}`}
                    className={`absolute h-6 w-6 border-0 bg-transparent p-0 outline-none ${handle.className}`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      viewportResizeStartRef.current = {
                        pointerX: event.clientX,
                        pointerY: event.clientY,
                        widthPercent: viewportWidthPercent,
                        heightPercent: viewportHeightPercent,
                        horizontalSign: handle.horizontalSign,
                        verticalSign: handle.verticalSign,
                      };
                      setIsResizingViewport(true);
                    }}
                  />
                ))}
              </div>
            </div>
          </section>

          {isSettingsVisible ? (
            <>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize settings panel"
                className={`w-2 shrink-0 cursor-col-resize border-l border-r border-zinc-200 bg-zinc-100 transition-colors ${
                  isResizingPanel ? "bg-zinc-300" : "hover:bg-zinc-200"
                }`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setIsResizingPanel(true);
                }}
              />
              <aside
                className="shrink-0 overflow-y-auto p-4"
                style={{ width: settingsWidth }}
              >
                <div className="space-y-4">
                  <label className="flex flex-col gap-2 text-sm">
                    Text
                    <textarea
                      className="min-h-24 rounded border border-zinc-300 p-2"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-sm">
                    Mode
                    <select
                      className="rounded border border-zinc-300 px-2 py-1"
                      value={spec.mode}
                      onChange={(e) =>
                        setSpec((prev) => ({
                          ...prev,
                          mode: e.target.value as ConditionSpec["mode"],
                        }))
                      }
                    >
                      <option value="rsvp">rsvp</option>
                      <option value="continuous">continuous</option>
                    </select>
                  </label>

                  <div className="space-y-2">
                    <label className="flex flex-col gap-1 text-sm">
                      Viewport Step
                      <input
                        type="range"
                        min={0}
                        max={getViewportStepsForMode(spec.mode).length - 1}
                        step={1}
                        list="viewport-step-ticks"
                        disabled={
                          spec.mode === "continuous" &&
                          spec.motion.direction === "horizontal"
                        }
                        value={getStepIndex(viewportStep, spec.mode)}
                        onChange={(e) =>
                          applyViewportStep(
                            getViewportStepsForMode(spec.mode)[
                              Number(e.target.value)
                            ] ?? "word-1",
                          )
                        }
                      />
                    </label>
                    <datalist id="viewport-step-ticks">
                      {getViewportStepsForMode(spec.mode).map((_, index) => (
                        <option key={index} value={index} />
                      ))}
                    </datalist>
                    <div
                      className="grid text-center text-xs text-zinc-500"
                      style={{
                        gridTemplateColumns: `repeat(${getViewportStepsForMode(spec.mode).length}, minmax(0, 1fr))`,
                      }}
                    >
                      {getViewportStepsForMode(spec.mode).map((step) => (
                        <span
                          key={step}
                          className={
                            step === viewportStep
                              ? "font-medium text-black"
                              : undefined
                          }
                        >
                          {VIEWPORT_STEP_LABELS[step]}
                        </span>
                      ))}
                    </div>
                    {spec.mode === "continuous" &&
                    spec.motion.direction === "horizontal" ? (
                      <span className="text-xs text-zinc-500">
                        Horizontal continuous is locked to `3 P`.
                      </span>
                    ) : null}
                  </div>

                  <label className="flex flex-col gap-1 text-sm">
                    Advance Step: {effectiveAdvanceStep}
                    <input
                      type="range"
                      min={1}
                      max={maxAdvanceStep}
                      step={1}
                      list="advance-step-ticks"
                      disabled={spec.mode !== "rsvp"}
                      value={effectiveAdvanceStep}
                      onChange={(e) =>
                        setAdvanceStep(
                          Math.max(
                            1,
                            Math.min(
                              maxAdvanceStep,
                              Number(e.target.value) || 1,
                            ),
                          ),
                        )
                      }
                    />
                    <datalist id="advance-step-ticks">
                      {Array.from(
                        { length: maxAdvanceStep },
                        (_, i) => i + 1,
                      ).map((value) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                    <span className="text-xs text-zinc-500">
                      Allowed range: 1-{maxAdvanceStep}
                    </span>
                  </label>

                  <label className="flex flex-col gap-1 text-sm">
                    Viewport Width: {Math.round(viewportWidthPercent)}%
                    <input
                      type="range"
                      min={VIEWPORT_SIZE_MIN_PERCENT}
                      max={VIEWPORT_SIZE_MAX_PERCENT}
                      step={1}
                      value={viewportWidthPercent}
                      onChange={(e) =>
                        setViewportWidthPercent(
                          clamp(
                            Number(e.target.value) || VIEWPORT_SIZE_MAX_PERCENT,
                            VIEWPORT_SIZE_MIN_PERCENT,
                            VIEWPORT_SIZE_MAX_PERCENT,
                          ),
                        )
                      }
                    />
                    <span className="text-xs text-zinc-500">
                      Adjusts inner viewport width.
                    </span>
                  </label>

                  <label className="flex flex-col gap-1 text-sm">
                    Viewport Height: {Math.round(viewportHeightPercent)}%
                    <input
                      type="range"
                      min={VIEWPORT_SIZE_MIN_PERCENT}
                      max={VIEWPORT_SIZE_MAX_PERCENT}
                      step={1}
                      value={viewportHeightPercent}
                      onChange={(e) =>
                        setViewportHeightPercent(
                          clamp(
                            Number(e.target.value) || VIEWPORT_SIZE_MAX_PERCENT,
                            VIEWPORT_SIZE_MIN_PERCENT,
                            VIEWPORT_SIZE_MAX_PERCENT,
                          ),
                        )
                      }
                    />
                    <span className="text-xs text-zinc-500">
                      Adjusts inner viewport height.
                    </span>
                  </label>

                  <section className="space-y-3 rounded border border-zinc-200 p-3 text-sm">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
                      Mouse Y Rate Control
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex items-center gap-2 pt-6">
                        <input
                          type="checkbox"
                          checked={spec.motion.rateControl.enabled}
                          onChange={(e) =>
                            setSpec((prev) => ({
                              ...prev,
                              motion: {
                                ...prev.motion,
                                rateControl: {
                                  ...prev.motion.rateControl,
                                  enabled: e.target.checked,
                                },
                              },
                            }))
                          }
                        />
                        Enable Mouse Y
                      </label>
                      <label className="flex items-center gap-2 pt-6">
                        <input
                          type="checkbox"
                          checked={spec.motion.rateControl.resetOnLeave}
                          disabled={!spec.motion.rateControl.enabled}
                          onChange={(e) =>
                            setSpec((prev) => ({
                              ...prev,
                              motion: {
                                ...prev.motion,
                                rateControl: {
                                  ...prev.motion.rateControl,
                                  resetOnLeave: e.target.checked,
                                },
                              },
                            }))
                          }
                        />
                        Reset on mouse leave
                      </label>
                    </div>
                  </section>

                  <div className="grid gap-4">
                    {spec.mode === "rsvp" ? (
                      <section className="space-y-3 rounded border border-zinc-200 p-3 text-sm">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
                          Playback
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="flex items-center gap-2 pt-6">
                            <input
                              type="checkbox"
                              checked={spec.motion.autoplay}
                              onChange={(e) => setAutoplay(e.target.checked)}
                            />
                            Autoplay
                          </label>
                          <label className="flex flex-col gap-1">
                            Speed (chars/sec): {spec.motion.speed.value}
                            <input
                              className="w-full"
                              type="range"
                              min={1}
                              max={80}
                              step={1}
                              value={spec.motion.speed.value}
                              onChange={(e) =>
                                setSpec((prev) => ({
                                  ...prev,
                                  motion: {
                                    ...prev.motion,
                                    speed: {
                                      unit: "cps",
                                      value: Math.max(
                                        1,
                                        Number(e.target.value) || 1,
                                      ),
                                    },
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className="flex items-center gap-2 pt-6">
                            <input
                              type="checkbox"
                              checked={spec.motion.pauseAtPunctuation.enabled}
                              onChange={(e) =>
                                setSpec((prev) => ({
                                  ...prev,
                                  motion: {
                                    ...prev.motion,
                                    pauseAtPunctuation: {
                                      ...prev.motion.pauseAtPunctuation,
                                      enabled: e.target.checked,
                                    },
                                  },
                                }))
                              }
                            />
                            Pause at punctuation
                          </label>
                          <label className="flex flex-col gap-1">
                            Punctuation Delay (ms):{" "}
                            {spec.motion.pauseAtPunctuation.delayMs}
                            <input
                              className="w-full"
                              type="range"
                              min={0}
                              max={2000}
                              step={25}
                              disabled={!spec.motion.pauseAtPunctuation.enabled}
                              value={spec.motion.pauseAtPunctuation.delayMs}
                              onChange={(e) =>
                                setSpec((prev) => ({
                                  ...prev,
                                  motion: {
                                    ...prev.motion,
                                    pauseAtPunctuation: {
                                      ...prev.motion.pauseAtPunctuation,
                                      delayMs: Math.max(
                                        0,
                                        Number(e.target.value) || 0,
                                      ),
                                    },
                                  },
                                }))
                              }
                            />
                          </label>
                        </div>
                        <div className="flex items-end gap-2">
                          <button
                            type="button"
                            className="rounded border border-zinc-300 px-3 py-1"
                            disabled={spec.mode !== "rsvp"}
                            onClick={() => setAutoplay(!spec.motion.autoplay)}
                          >
                            {spec.motion.autoplay ? "Pause" : "Play"}
                          </button>
                          <button
                            type="button"
                            className="rounded border border-zinc-300 px-3 py-1"
                            disabled={spec.mode !== "rsvp"}
                            onClick={() => {
                              rsvpIndexRef.current = 0;
                              setRsvpIndex(0);
                              appendLog({
                                event: "stop",
                                index: 0,
                                timestamp: new Date().toISOString(),
                              });
                            }}
                          >
                            Reset
                          </button>
                          <span className="pb-1 text-xs text-zinc-600">
                            {safeRsvpIndex + 1}/{Math.max(1, rsvpTokens.length)}
                          </span>
                        </div>
                        {canManualAdvance ? (
                          <p className="text-xs text-zinc-600">
                            Manual mode: click the viewport or press Space to
                            advance.
                          </p>
                        ) : null}
                      </section>
                    ) : null}

                    {spec.mode === "continuous" ? (
                      <section className="space-y-3 rounded border border-zinc-200 p-3 text-sm">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
                          Continuous
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="flex items-center gap-2 pt-6">
                            <input
                              type="checkbox"
                              checked={spec.motion.autoplay}
                              onChange={(e) => setAutoplay(e.target.checked)}
                            />
                            Autoplay
                          </label>
                          <label className="flex flex-col gap-1">
                            Speed (chars/sec): {spec.motion.speed.value}
                            <input
                              className="w-full"
                              type="range"
                              min={1}
                              max={80}
                              step={1}
                              value={spec.motion.speed.value}
                              onChange={(e) =>
                                setSpec((prev) => ({
                                  ...prev,
                                  motion: {
                                    ...prev.motion,
                                    speed: {
                                      unit: "cps",
                                      value: Math.max(
                                        1,
                                        Number(e.target.value) || 1,
                                      ),
                                    },
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            Direction
                            <select
                              className="rounded border border-zinc-300 px-2 py-1"
                              value={spec.motion.direction}
                              onChange={(e) =>
                                setSpec((prev) => ({
                                  ...prev,
                                  motion: {
                                    ...prev.motion,
                                    direction: e.target
                                      .value as ConditionSpec["motion"]["direction"],
                                  },
                                }))
                              }
                            >
                              <option value="horizontal">horizontal</option>
                              <option value="vertical">vertical</option>
                            </select>
                          </label>
                          <label className="flex items-center gap-2 pt-6">
                            <input
                              type="checkbox"
                              checked={spec.motion.wrapVerticalText}
                              disabled={spec.motion.direction !== "vertical"}
                              onChange={(e) =>
                                setSpec((prev) => ({
                                  ...prev,
                                  motion: {
                                    ...prev.motion,
                                    wrapVerticalText: e.target.checked,
                                  },
                                }))
                              }
                            />
                            Wrap vertical text
                          </label>
                        </div>
                      </section>
                    ) : null}

                    <section className="space-y-3 rounded border border-zinc-200 p-3 text-sm">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
                        Typography
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1">
                          Font Size: {spec.typography.fontSizePx}px
                          <input
                            className="w-full"
                            type="range"
                            min={12}
                            max={120}
                            step={1}
                            value={spec.typography.fontSizePx}
                            onChange={(e) =>
                              setSpec((prev) => ({
                                ...prev,
                                typography: {
                                  ...prev.typography,
                                  fontSizePx: Math.max(
                                    12,
                                    Number(e.target.value) || 12,
                                  ),
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          Line Height: {spec.typography.lineHeight.toFixed(2)}
                          <input
                            className="w-full"
                            type="range"
                            step="0.05"
                            min={0.8}
                            max={3}
                            value={spec.typography.lineHeight}
                            onChange={(e) =>
                              setSpec((prev) => ({
                                ...prev,
                                typography: {
                                  ...prev.typography,
                                  lineHeight: Math.max(
                                    0.8,
                                    Number(e.target.value) || 0.8,
                                  ),
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          Alignment
                          <select
                            className="rounded border border-zinc-300 px-2 py-1"
                            value={spec.typography.alignment}
                            onChange={(e) =>
                              setSpec((prev) => ({
                                ...prev,
                                typography: {
                                  ...prev.typography,
                                  alignment: e.target
                                    .value as ConditionSpec["typography"]["alignment"],
                                },
                              }))
                            }
                          >
                            <option value="left">left</option>
                            <option value="center">center</option>
                            <option value="right">right</option>
                            <option value="justify">justify</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-2 pt-6">
                          <input
                            type="checkbox"
                            checked={spec.typography.useViewportWidth}
                            onChange={(e) =>
                              setSpec((prev) => ({
                                ...prev,
                                typography: {
                                  ...prev.typography,
                                  useViewportWidth: e.target.checked,
                                },
                              }))
                            }
                          />
                          Use full viewport width
                        </label>
                      </div>
                      <label className="flex flex-col gap-1">
                        Line Width: {spec.typography.lineWidthPx}px
                        <input
                          className="w-full"
                          type="range"
                          min={200}
                          max={1400}
                          step={10}
                          disabled={spec.typography.useViewportWidth}
                          value={spec.typography.lineWidthPx}
                          onChange={(e) =>
                            setSpec((prev) => ({
                              ...prev,
                              typography: {
                                ...prev.typography,
                                lineWidthPx: Math.max(
                                  200,
                                  Number(e.target.value) || 200,
                                ),
                              },
                            }))
                          }
                        />
                        <span className="text-xs text-zinc-500">
                          {spec.typography.useViewportWidth
                            ? "Disable full viewport width to edit line width."
                            : "Caps text measure inside the viewport."}
                        </span>
                      </label>
                      <label className="flex flex-col gap-1">
                        Viewport Padding: {spec.typography.viewportPaddingPx}px
                        <input
                          className="w-full"
                          type="range"
                          min={0}
                          max={120}
                          step={1}
                          value={spec.typography.viewportPaddingPx}
                          onChange={(e) =>
                            setSpec((prev) => ({
                              ...prev,
                              typography: {
                                ...prev.typography,
                                viewportPaddingPx: Math.max(
                                  0,
                                  Number(e.target.value) || 0,
                                ),
                              },
                            }))
                          }
                        />
                        <span className="text-xs text-zinc-500">
                          Space between the text area and the viewport edge.
                        </span>
                      </label>
                      <section className="space-y-3 rounded border border-zinc-200 p-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={rsvpHighlight.enabled}
                            onChange={(e) =>
                              setSpec((prev) => ({
                                ...prev,
                                typography: {
                                  ...prev.typography,
                                  rsvpHighlight: {
                                    ...(
                                      prev.typography.rsvpHighlight ??
                                      conditionSpec.typography.rsvpHighlight
                                    ),
                                    enabled: e.target.checked,
                                  },
                                },
                              }))
                            }
                          />
                          <span>Enable Highlight</span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="flex flex-col gap-1">
                            Highlight Mode
                            <select
                              className="rounded border border-zinc-300 px-2 py-1"
                              disabled={!rsvpHighlight.enabled}
                              value={rsvpHighlight.mode}
                              onChange={(e) =>
                                setSpec((prev) => ({
                                  ...prev,
                                  typography: {
                                    ...prev.typography,
                                    rsvpHighlight: {
                                      ...(
                                        prev.typography.rsvpHighlight ??
                                        conditionSpec.typography.rsvpHighlight
                                      ),
                                      mode: e.target
                                        .value as ConditionSpec["typography"]["rsvpHighlight"]["mode"],
                                    },
                                  },
                                }))
                              }
                            >
                              <option value="static">static</option>
                              <option value="jump">jump</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1">
                            Highlight Style
                            <select
                              className="rounded border border-zinc-300 px-2 py-1"
                              disabled={!rsvpHighlight.enabled}
                              value={rsvpHighlight.style}
                              onChange={(e) =>
                                setSpec((prev) => ({
                                  ...prev,
                                  typography: {
                                    ...prev.typography,
                                    rsvpHighlight: {
                                      ...(
                                        prev.typography.rsvpHighlight ??
                                        conditionSpec.typography.rsvpHighlight
                                      ),
                                      style: e.target
                                        .value as ConditionSpec["typography"]["rsvpHighlight"]["style"],
                                    },
                                  },
                                }))
                              }
                            >
                              <option value="bold">bold</option>
                              <option value="background">background</option>
                              <option value="outline">outline</option>
                            </select>
                          </label>
                        </div>
                        <label className="flex flex-col gap-1">
                          Highlight Jump Rate: {effectiveHighlightJumpRateHz.toFixed(2)} steps/sec
                          <input
                            className="w-full"
                            type="range"
                            min={HIGHLIGHT_JUMP_RATE_MIN}
                            max={HIGHLIGHT_JUMP_RATE_MAX}
                            step={0.25}
                            disabled={
                              !rsvpHighlight.enabled || rsvpHighlight.mode !== "jump"
                            }
                            value={effectiveHighlightJumpRateHz}
                            onChange={(e) =>
                              setSpec((prev) => ({
                                ...prev,
                                typography: {
                                  ...prev.typography,
                                  rsvpHighlight: {
                                    ...(
                                      prev.typography.rsvpHighlight ??
                                      conditionSpec.typography.rsvpHighlight
                                    ),
                                    jumpRateHz: clamp(
                                      Number(e.target.value) ||
                                        conditionSpec.typography.rsvpHighlight.jumpRateHz,
                                      HIGHLIGHT_JUMP_RATE_MIN,
                                      HIGHLIGHT_JUMP_RATE_MAX,
                                    ),
                                  },
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          Highlight Size: {VIEWPORT_STEP_LABELS[highlightStep]}
                          <input
                            className="w-full"
                            type="range"
                            min={0}
                            max={Math.max(0, allowedHighlightSteps.length - 1)}
                            step={1}
                            disabled={!rsvpHighlight.enabled}
                            value={highlightStepIndex}
                            onChange={(e) =>
                              setSpec((prev) => ({
                                ...prev,
                                typography: {
                                  ...prev.typography,
                                  rsvpHighlight: {
                                    ...(
                                      prev.typography.rsvpHighlight ??
                                      conditionSpec.typography.rsvpHighlight
                                    ),
                                    unit:
                                      getTokenizationFromViewportStep(
                                        allowedHighlightSteps[
                                          Math.max(
                                            0,
                                            Math.min(
                                              allowedHighlightSteps.length - 1,
                                              Number(e.target.value) || 0,
                                            ),
                                          )
                                        ] ?? "letter-1",
                                      ).unit as ConditionSpec["typography"]["rsvpHighlight"]["unit"],
                                    size: clamp(
                                      getTokenizationFromViewportStep(
                                        allowedHighlightSteps[
                                          Math.max(
                                            0,
                                            Math.min(
                                              allowedHighlightSteps.length - 1,
                                              Number(e.target.value) || 0,
                                            ),
                                          )
                                        ] ?? "letter-1",
                                      ).chunkSize,
                                      1,
                                      3,
                                    ),
                                  },
                                },
                              }))
                            }
                          />
                        </label>
                        <p className="text-xs text-zinc-500">
                          Uses the same step ladder as Viewport Step, capped at the current viewport setting.
                        </p>
                      </section>
                      <section className="space-y-3 rounded border border-zinc-200 p-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={spec.typography.paragraphStaircase.enabled}
                            onChange={(e) =>
                              setSpec((prev) => ({
                                ...prev,
                                typography: {
                                  ...prev.typography,
                                  paragraphStaircase: {
                                    ...prev.typography.paragraphStaircase,
                                    enabled: e.target.checked,
                                  },
                                },
                              }))
                            }
                          />
                          <span>Enable staircase</span>
                        </div>
                      <label className="flex flex-col gap-1">
                        Stair Indent:{" "}
                        {spec.typography.paragraphStaircase.indentStepCh.toFixed(
                          1,
                        )}
                          ch
                          <input
                            className="w-full"
                            type="range"
                            min={0}
                            max={12}
                            step={0.5}
                            disabled={!spec.typography.paragraphStaircase.enabled}
                            value={spec.typography.paragraphStaircase.indentStepCh}
                            onChange={(e) =>
                              setSpec((prev) => ({
                                ...prev,
                                typography: {
                                  ...prev.typography,
                                  paragraphStaircase: {
                                    ...prev.typography.paragraphStaircase,
                                    indentStepCh: Math.max(
                                      0,
                                      Number(e.target.value) || 0,
                                    ),
                                  },
                                },
                              }))
                            }
                          />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="flex flex-col gap-1">
                            Staircase Mode
                            <select
                              value={spec.typography.paragraphStaircase.indentMode}
                              disabled={!spec.typography.paragraphStaircase.enabled}
                              onChange={(e) =>
                                setSpec((prev) => ({
                                  ...prev,
                                  typography: {
                                    ...prev.typography,
                                    paragraphStaircase: {
                                      ...prev.typography.paragraphStaircase,
                                      indentMode:
                                        e.target.value === "line"
                                          ? "line"
                                          : "sentence",
                                    },
                                  },
                                }))
                              }
                              className="rounded border border-zinc-300 bg-white px-2 py-1"
                            >
                              <option value="sentence">By sentence</option>
                              <option value="line">By line</option>
                            </select>
                          </label>
                        </div>
                        <label className="flex flex-col gap-1">
                          Max Line Width:{" "}
                          {spec.typography.paragraphStaircase.maxWidthCh > 0
                            ? `${spec.typography.paragraphStaircase.maxWidthCh.toFixed(0)}ch`
                            : "auto"}
                          <input
                            className="w-full"
                            type="range"
                            min={0}
                            max={120}
                            step={1}
                            disabled={!spec.typography.paragraphStaircase.enabled}
                            value={spec.typography.paragraphStaircase.maxWidthCh}
                            onChange={(e) =>
                              setSpec((prev) => ({
                                ...prev,
                                typography: {
                                  ...prev.typography,
                                  paragraphStaircase: {
                                    ...prev.typography.paragraphStaircase,
                                    maxWidthCh: Math.max(
                                      0,
                                      Number(e.target.value) || 0,
                                    ),
                                  },
                                },
                              }))
                            }
                          />
                        </label>
                        <p className="text-xs text-zinc-500">
                          By line steps every wrapped line. By sentence steps only new sentences. Max line width limits each staircase line before wrapping so the right edge steps too.
                        </p>
                      </section>
                      <section className="space-y-3 rounded border border-zinc-200 p-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={spec.typography.sentenceMarkers.enabled}
                            onChange={(e) =>
                              setSpec((prev) => ({
                                ...prev,
                                typography: {
                                  ...prev.typography,
                                  sentenceMarkers: {
                                    ...prev.typography.sentenceMarkers,
                                    enabled: e.target.checked,
                                  },
                                },
                              }))
                            }
                          />
                          <span>Enable guide markers</span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="flex flex-col gap-1">
                            Marker Position
                            <select
                              className="rounded border border-zinc-300 px-2 py-1"
                              disabled={!spec.typography.sentenceMarkers.enabled}
                              value={spec.typography.sentenceMarkers.position}
                              onChange={(e) =>
                                setSpec((prev) => ({
                                  ...prev,
                                  typography: {
                                    ...prev.typography,
                                    sentenceMarkers: {
                                      ...prev.typography.sentenceMarkers,
                                      position: e.target
                                        .value as ConditionSpec["typography"]["sentenceMarkers"]["position"],
                                    },
                                  },
                                }))
                              }
                            >
                              <option value="both">both</option>
                              <option value="start">start</option>
                              <option value="end">end</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1">
                            Marker Variation
                            <select
                              className="rounded border border-zinc-300 px-2 py-1"
                              disabled={!spec.typography.sentenceMarkers.enabled}
                              value={spec.typography.sentenceMarkers.variationMode}
                              onChange={(e) =>
                                setSpec((prev) => ({
                                  ...prev,
                                  typography: {
                                    ...prev.typography,
                                    sentenceMarkers: {
                                      ...prev.typography.sentenceMarkers,
                                      variationMode: e.target
                                        .value as ConditionSpec["typography"]["sentenceMarkers"]["variationMode"],
                                    },
                                  },
                                }))
                              }
                            >
                              <option value="shape">shape</option>
                              <option value="color">color</option>
                              <option value="both">both</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1">
                            Guide Mode
                            <select
                              className="rounded border border-zinc-300 px-2 py-1"
                              disabled={!spec.typography.sentenceMarkers.enabled}
                              value={spec.typography.sentenceMarkers.mode}
                              onChange={(e) =>
                                setSpec((prev) => ({
                                  ...prev,
                                  typography: {
                                    ...prev.typography,
                                    sentenceMarkers: {
                                      ...prev.typography.sentenceMarkers,
                                      mode: e.target
                                        .value as ConditionSpec["typography"]["sentenceMarkers"]["mode"],
                                    },
                                  },
                                }))
                              }
                            >
                              <option value="sentence">sentence</option>
                              <option value="line">line</option>
                            </select>
                          </label>
                        </div>
                        <label className="flex flex-col gap-1">
                          Marker Size: {spec.typography.sentenceMarkers.sizeEm.toFixed(1)}em
                          <input
                            className="w-full"
                            type="range"
                            min={0.4}
                            max={1.8}
                            step={0.1}
                            disabled={!spec.typography.sentenceMarkers.enabled}
                            value={spec.typography.sentenceMarkers.sizeEm}
                            onChange={(e) =>
                              setSpec((prev) => ({
                                ...prev,
                                typography: {
                                  ...prev.typography,
                                  sentenceMarkers: {
                                    ...prev.typography.sentenceMarkers,
                                    sizeEm: Math.max(
                                      0.4,
                                      Number(e.target.value) || 0.4,
                                    ),
                                  },
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          Marker Gap: {spec.typography.sentenceMarkers.gapCh.toFixed(1)}ch
                          <input
                            className="w-full"
                            type="range"
                            min={0}
                            max={3}
                            step={0.1}
                            disabled={!spec.typography.sentenceMarkers.enabled}
                            value={spec.typography.sentenceMarkers.gapCh}
                            onChange={(e) =>
                              setSpec((prev) => ({
                                ...prev,
                                typography: {
                                  ...prev.typography,
                                  sentenceMarkers: {
                                    ...prev.typography.sentenceMarkers,
                                    gapCh: Math.max(
                                      0,
                                      Number(e.target.value) || 0,
                                    ),
                                  },
                                },
                              }))
                            }
                          />
                        </label>
                        <p className="text-xs text-zinc-500">
                          Sentence mode pairs adjacent sentence boundaries. Line mode pairs wrapped lines in the line-based staircase renderer and otherwise falls back to sentence mode.
                        </p>
                      </section>
                    </section>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="rounded border border-zinc-300 px-3 py-1 text-sm"
                      onClick={() => setIsSpecModalOpen(true)}
                    >
                      View Settings Json
                    </button>
                  </div>
                </div>
              </aside>
            </>
          ) : null}
        </div>
      </div>

      {isSpecModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-3xl rounded border border-zinc-300 bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">ConditionSpec</h2>
              <button
                type="button"
                className="rounded border border-zinc-300 px-2 py-1 text-xs"
                onClick={() => setIsSpecModalOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto]">
              <label className="flex flex-col gap-1 text-sm">
                Name
                <input
                  type="text"
                  className="rounded border border-zinc-300 px-2 py-1"
                  value={settingsName}
                  onChange={(e) => setSettingsName(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="self-end rounded border border-zinc-300 px-3 py-1 text-sm"
                onClick={handleDownloadSettings}
              >
                Download JSON
              </button>
              <button
                type="button"
                className="self-end rounded border border-zinc-300 px-3 py-1 text-sm"
                onClick={() => void handleCopySettings()}
              >
                Copy JSON
              </button>
              <button
                type="button"
                className="self-end rounded border border-zinc-300 px-3 py-1 text-sm"
                onClick={() => settingsFileInputRef.current?.click()}
              >
                Upload JSON
              </button>
              <button
                type="button"
                className="self-end rounded border border-zinc-300 px-3 py-1 text-sm"
                onClick={handleResetDefaults}
              >
                Reset Defaults
              </button>
              <input
                ref={settingsFileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleSettingsFileChange}
              />
            </div>
            {settingsModalError ? (
              <p className="mb-3 text-xs text-red-600">{settingsModalError}</p>
            ) : null}
            <pre className="max-h-[70vh] overflow-auto rounded border border-zinc-200 p-3 text-xs">
              {JSON.stringify(settingsPayload, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
    </main>
  );
}
