import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";

import type { ConditionSpec } from "@/lib/condition-spec";
import {
  buildParagraphStaircaseLines,
  getApproximateStaircaseWidthCh,
  getMarkerVariantIndex,
  getSentenceMarkerAppearance,
  renderLineRectsFromElement,
  splitParagraphIntoSentences,
  splitTokenIntoParagraphs,
  type RenderedLineRect,
} from "@/lib/provotypographer/core";

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

export function SentenceStructuredRenderer({
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
