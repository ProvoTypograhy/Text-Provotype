import {
  type CSSProperties,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { conditionSpec, type ConditionSpec } from "@/lib/condition-spec";
import {
  HIGHLIGHT_JUMP_RATE_MAX,
  HIGHLIGHT_JUMP_RATE_MIN,
  buildContinuousHighlightLayout,
  clamp,
  collectReadableTextNodes,
  findHighlightRangeIndexForOffset,
  getHighlightOverlayStyle,
  getTextRangeRects,
  speedToPxPerSecond,
  type ContinuousHighlightLayout,
  type HighlightRect,
  type TokenizationUnit,
} from "@/lib/provotypographer/core";
import { SentenceStructuredRenderer } from "./SentenceStructuredRenderer";

function getContinuousDisplayText({
  rawText,
  direction,
  tokenizationUnit,
}: {
  rawText: string;
  direction: ConditionSpec["motion"]["direction"];
  tokenizationUnit: TokenizationUnit;
}) {
  if (!rawText.trim()) {
    return "";
  }

  if (direction === "horizontal") {
    return rawText.replace(/\s+/g, " ").trim();
  }

  if (tokenizationUnit === "paragraph") {
    return rawText
      .split(/\n\s*\n+/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .join("\n\n");
  }

  return rawText.trim();
}

export function ContinuousRsvpRenderer({
  spec,
  rawText,
  resetHighlightKey,
}: {
  spec: ConditionSpec;
  rawText: string;
  resetHighlightKey: number;
}) {
  const direction = spec.motion.direction;
  const rsvpHighlight =
    spec.typography.rsvpHighlight ?? conditionSpec.typography.rsvpHighlight;
  const highlightEnabled = rsvpHighlight.enabled;
  const highlightTiedToFlow = rsvpHighlight.tieToFlow;
  const isSentenceStructuredUnit =
    spec.tokenization.unit === "sentence" || spec.tokenization.unit === "paragraph";
  const useSentenceStructuredLayout =
    direction === "vertical" &&
    isSentenceStructuredUnit &&
    (spec.typography.paragraphStaircase.enabled ||
      spec.typography.sentenceMarkers.enabled);
  const textAlign =
    useSentenceStructuredLayout
      ? "left"
      : spec.typography.alignment === "justify"
      ? "justify"
      : spec.typography.alignment;
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
  const highlightLayoutRef = useRef<ContinuousHighlightLayout | null>(null);
  const measureStartRef = useRef(0);
  const contentLengthRef = useRef(1);
  const cycleLengthRef = useRef(1);
  const offsetPxRef = useRef(0);
  const activeWindowStartIndexRef = useRef(0);
  const layoutSignatureRef = useRef<string | null>(null);
  const highlightRectCacheRef = useRef<Map<number, HighlightRect[]>>(new Map());
  const [activeHighlightRects, setActiveHighlightRects] = useState<HighlightRect[]>([]);
  const activeHighlightRectsReadyRef = useRef(false);
  const [highlightPositionCount, setHighlightPositionCount] = useState(1);
  const loopGapPx = Math.max(
    12,
    direction === "vertical"
      ? spec.typography.fontSizePx * spec.typography.lineHeight * 2
      : spec.typography.fontSizePx * 0.9,
  );
  const text = useMemo(
    () =>
      getContinuousDisplayText({
        rawText,
        direction,
        tokenizationUnit: spec.tokenization.unit,
      }),
    [direction, rawText, spec.tokenization.unit],
  );
  const displayText = text || "Enter text to begin";
  const highlightWindowSize = useMemo(
    () => Math.max(1, Math.floor(rsvpHighlight.size || 1)),
    [rsvpHighlight.size],
  );

  const highlightStyle = useMemo(
    () => getHighlightOverlayStyle(rsvpHighlight.style),
    [rsvpHighlight.style],
  );

  const layoutSignature = useMemo(
    () =>
      JSON.stringify({
        direction,
        useSentenceStructuredLayout,
        tokenizationUnit: spec.tokenization.unit,
        paragraphStaircase: spec.typography.paragraphStaircase,
        sentenceMarkers: spec.typography.sentenceMarkers,
      }),
    [
      direction,
      spec.tokenization.unit,
      spec.typography.paragraphStaircase,
      spec.typography.sentenceMarkers,
      useSentenceStructuredLayout,
    ],
  );

  const getCachedHighlightRects = useCallback(
    (layout: ContinuousHighlightLayout, index: number) => {
      const cachedRects = highlightRectCacheRef.current.get(index);
      if (cachedRects) {
        return cachedRects;
      }

      const range = layout.ranges[index];
      const rects = range
        ? getTextRangeRects({
            container: layout.container,
            entries: layout.entries,
            start: range.start,
            end: range.end,
          })
        : [];
      highlightRectCacheRef.current.set(index, rects);
      return rects;
    },
    [],
  );

  const applyHighlightWindow = useCallback(
    (startIndex: number) => {
      const layout = highlightLayoutRef.current;
      const totalWindows = layout?.ranges.length ?? 0;
      if (!highlightEnabled || !layout || totalWindows === 0) {
        activeWindowStartIndexRef.current = 0;
        activeHighlightRectsReadyRef.current = false;
        highlightRectCacheRef.current.clear();
        setActiveHighlightRects([]);
        return;
      }

      const maxStart = Math.max(0, totalWindows - 1);
      let nextStart = clamp(startIndex, 0, maxStart);
      let nextRects = getCachedHighlightRects(layout, nextStart);
      if (!nextRects.length && totalWindows > 1) {
        for (let distance = 1; distance < totalWindows; distance += 1) {
          const previousIndex = nextStart - distance;
          if (previousIndex >= 0) {
            const previousRects = getCachedHighlightRects(layout, previousIndex);
            if (previousRects.length) {
              nextStart = previousIndex;
              nextRects = previousRects;
              break;
            }
          }

          const nextIndex = nextStart + distance;
          if (nextIndex < totalWindows) {
            const candidateRects = getCachedHighlightRects(layout, nextIndex);
            if (candidateRects.length) {
              nextStart = nextIndex;
              nextRects = candidateRects;
              break;
            }
          }
        }
      }
      if (
        nextStart === activeWindowStartIndexRef.current &&
        activeHighlightRectsReadyRef.current
      ) {
        return;
      }
      activeWindowStartIndexRef.current = nextStart;
      activeHighlightRectsReadyRef.current = true;
      setActiveHighlightRects(nextRects);
    },
    [getCachedHighlightRects, highlightEnabled],
  );

  const measureContinuousLayout = useCallback(() => {
    const measureNode = measureRef.current;
    if (!measureNode) {
      highlightLayoutRef.current = null;
      activeHighlightRectsReadyRef.current = false;
      highlightRectCacheRef.current.clear();
      setHighlightPositionCount(1);
      return;
    }

    measureStartRef.current =
      direction === "horizontal" ? measureNode.offsetLeft : measureNode.offsetTop;
    contentLengthRef.current = Math.max(
      1,
      direction === "horizontal" ? measureNode.scrollWidth : measureNode.scrollHeight,
    );
    cycleLengthRef.current = Math.max(1, contentLengthRef.current + loopGapPx);
    const readableText = collectReadableTextNodes(measureNode).text;
    const measuredPixelsPerCharacter =
      readableText.length > 0
        ? contentLengthRef.current / readableText.length
        : undefined;
    pxPerSecondRef.current = speedToPxPerSecond(
      spec,
      measuredPixelsPerCharacter,
    );

    if (!highlightEnabled) {
      highlightLayoutRef.current = null;
      highlightRectCacheRef.current.clear();
      setHighlightPositionCount(1);
      activeHighlightRectsReadyRef.current = false;
      setActiveHighlightRects([]);
      return;
    }

    const layout = buildContinuousHighlightLayout({
      container: measureNode,
      direction,
      unit: rsvpHighlight.unit,
      size: highlightWindowSize,
      allowBoundaryCrossing: rsvpHighlight.allowBoundaryCrossing,
    });
    highlightLayoutRef.current = layout;
    highlightRectCacheRef.current.clear();
    const nextPositionCount = Math.max(1, layout?.ranges.length ?? 1);
    setHighlightPositionCount(nextPositionCount);
    if (!layout) {
      activeHighlightRectsReadyRef.current = false;
      setActiveHighlightRects([]);
      return;
    }
    contentLengthRef.current = layout.contentLength;
    cycleLengthRef.current = Math.max(1, layout.contentLength + loopGapPx);
    activeWindowStartIndexRef.current = Math.min(
      activeWindowStartIndexRef.current,
      nextPositionCount - 1,
    );
    const activeRange = layout.ranges[activeWindowStartIndexRef.current];
    activeHighlightRectsReadyRef.current = true;
    setActiveHighlightRects(
      activeRange
        ? getCachedHighlightRects(layout, activeWindowStartIndexRef.current)
        : [],
    );
  }, [
    direction,
    highlightEnabled,
    highlightWindowSize,
    loopGapPx,
    rsvpHighlight.allowBoundaryCrossing,
    rsvpHighlight.unit,
    getCachedHighlightRects,
    spec,
  ]);

  const syncActiveWindow = useCallback(() => {
    const layout = highlightLayoutRef.current;
    const totalWindows = layout?.ranges.length ?? highlightPositionCount;
    if (!highlightEnabled || totalWindows <= 1) {
      applyHighlightWindow(0);
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport || !layout) {
      applyHighlightWindow(0);
      return;
    }

    const focusPoint =
      direction === "horizontal"
        ? viewport.clientWidth / 2
        : viewport.clientHeight / 2;
    const contentLength = Math.max(1, contentLengthRef.current);
    const relativeFocus =
      ((offsetPxRef.current + focusPoint - measureStartRef.current) % contentLength +
      contentLength) %
      contentLength;
    const relativeTextOffset = Math.min(
      Math.max(0, layout.textLength - 1),
      (relativeFocus / contentLength) * Math.max(1, layout.textLength),
    );
    const nextIndex = findHighlightRangeIndexForOffset(
      layout.ranges,
      relativeTextOffset,
    );
    applyHighlightWindow(nextIndex);
  }, [
    applyHighlightWindow,
    direction,
    highlightEnabled,
    highlightPositionCount,
  ]);

  const applyTrackTransform = useCallback(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    const devicePixelRatio = window.devicePixelRatio || 1;
    const snappedOffset =
      Math.round(offsetPxRef.current * devicePixelRatio) / devicePixelRatio;
    track.style.transform =
      direction === "horizontal"
        ? `translateX(${-snappedOffset}px)`
        : `translateY(${-snappedOffset}px)`;
  }, [direction]);

  const resetContinuousFlowPosition = useCallback(() => {
    offsetPxRef.current = 0;
    lastTsRef.current = null;
    activeWindowStartIndexRef.current = 0;
    activeHighlightRectsReadyRef.current = false;
    highlightRectCacheRef.current.clear();
    applyTrackTransform();
  }, [applyTrackTransform]);

  useEffect(() => {
    const previousSignature = layoutSignatureRef.current;
    layoutSignatureRef.current = layoutSignature;
    if (previousSignature == null || previousSignature === layoutSignature) {
      return;
    }

    resetContinuousFlowPosition();
    const frameId = window.requestAnimationFrame(() => {
      measureContinuousLayout();
      syncActiveWindow();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [
    layoutSignature,
    measureContinuousLayout,
    resetContinuousFlowPosition,
    syncActiveWindow,
  ]);

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
      if (highlightEnabled && highlightTiedToFlow) {
        syncActiveWindow();
      }
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
  }, [
    applyTrackTransform,
    highlightEnabled,
    highlightTiedToFlow,
    spec.mode,
    spec.motion.autoplay,
    syncActiveWindow,
  ]);

  useEffect(() => {
    const updateLayout = () => {
      measureContinuousLayout();
      offsetPxRef.current %= Math.max(1, cycleLengthRef.current);
      applyTrackTransform();
      syncActiveWindow();
    };

    updateLayout();
    const measureNode = measureRef.current;
    if (!measureNode) {
      return;
    }
    const resizeObserver = new ResizeObserver(updateLayout);
    resizeObserver.observe(measureNode);
    if (measureNode.parentElement) {
      resizeObserver.observe(measureNode.parentElement);
    }
    window.addEventListener("resize", updateLayout);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateLayout);
    };
  }, [
    applyTrackTransform,
    direction,
    displayText,
    highlightWindowSize,
    loopGapPx,
    measureContinuousLayout,
    spec.motion.wrapVerticalText,
    spec.typography.alignment,
    spec.typography.fontFamily,
    spec.typography.fontSizePx,
    spec.typography.letterSpacingPx,
    spec.typography.lineHeight,
    spec.typography.wordSpacingPx,
    syncActiveWindow,
  ]);

  useEffect(() => {
    applyTrackTransform();
  }, [applyTrackTransform]);

  useEffect(() => {
    if (!highlightEnabled || highlightTiedToFlow || highlightPositionCount <= 1) {
      return;
    }

    const delayMs = Math.max(50, Math.round(1000 / effectiveJumpRateHz));
    const intervalId = window.setInterval(() => {
      applyHighlightWindow(
        (activeWindowStartIndexRef.current + 1) % highlightPositionCount,
      );
    }, delayMs);

    return () => window.clearInterval(intervalId);
  }, [
    applyHighlightWindow,
    effectiveJumpRateHz,
    highlightEnabled,
    highlightPositionCount,
    highlightTiedToFlow,
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

  useEffect(() => {
    if (spec.mode !== "continuous" || !highlightEnabled) {
      const frameId = window.requestAnimationFrame(() => {
        applyHighlightWindow(0);
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    const frameId = window.requestAnimationFrame(() => {
      measureContinuousLayout();
      syncActiveWindow();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [
    applyHighlightWindow,
    direction,
    displayText,
    highlightEnabled,
    highlightWindowSize,
    measureContinuousLayout,
    rsvpHighlight.size,
    rsvpHighlight.unit,
    syncActiveWindow,
    spec.mode,
  ]);

  useEffect(() => {
    resetContinuousFlowPosition();
    const frameId = window.requestAnimationFrame(() => {
      measureContinuousLayout();
      syncActiveWindow();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [
    measureContinuousLayout,
    resetContinuousFlowPosition,
    resetHighlightKey,
    syncActiveWindow,
  ]);

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

    const streamClassName =
      direction === "horizontal"
        ? "inline-block whitespace-nowrap"
        : spec.motion.wrapVerticalText
          ? "block w-full whitespace-pre-wrap break-words"
          : "block w-full whitespace-pre";

    return <span className={streamClassName}>{displayText}</span>;
  }, [
    displayText,
    direction,
    spec.motion.wrapVerticalText,
    spec.typography.fontSizePx,
    spec.typography.lineWidthPx,
    spec.typography.paragraphStaircase.enabled,
    spec.typography.paragraphStaircase.indentMode,
    spec.typography.paragraphStaircase.indentStepCh,
    spec.typography.paragraphStaircase.maxWidthCh,
    spec.typography.sentenceMarkers,
    useSentenceStructuredLayout,
  ]);

  const highlightOverlay = highlightEnabled && activeHighlightRects.length ? (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      {activeHighlightRects.map((rect, index) => (
        <span
          key={`${index}-${Math.round(rect.left)}-${Math.round(rect.top)}`}
          className="absolute block"
          data-continuous-highlight-rect="true"
          style={{
            ...highlightStyle,
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          }}
        />
      ))}
    </div>
  ) : null;

  const renderContinuousContent = (
    measurementRef?: RefObject<HTMLDivElement | null>,
  ) => (
    <div
      ref={measurementRef}
      className={`${contentClassName} relative`}
      style={contentStyle}
    >
      {highlightOverlay}
      <div
        className={
          direction === "horizontal"
            ? "relative z-10 inline-block"
            : "relative z-10"
        }
      >
        {contentChildren}
      </div>
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
            data-continuous-track="true"
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
            data-continuous-track="true"
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
