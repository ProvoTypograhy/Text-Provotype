import { conditionSpec, type ConditionSpec } from "@/lib/condition-spec";
import {
  formatTokenAsSentenceLines,
  splitAroundCenterCharacter,
  type ViewportStep,
} from "@/lib/provotypographer/core";
import { AnimatedHighlightedToken } from "./HighlightedToken";
import { SentenceStructuredRenderer } from "./SentenceStructuredRenderer";
import { StructuredHighlightedToken } from "./StructuredHighlightedToken";

export function RsvpRenderer({
  spec,
  token,
  viewportStep,
  jumpRateHz,
  jumpDurationMs,
  flowHighlightText,
  flowSliceTokenCount,
}: {
  spec: ConditionSpec;
  token: string;
  viewportStep: ViewportStep;
  jumpRateHz: number;
  jumpDurationMs?: number;
  flowHighlightText?: string;
  flowSliceTokenCount?: number;
}) {
  const alignment = spec.typography.alignment;
  const textAlign = alignment === "justify" ? "justify" : alignment;
  const rsvpHighlight =
    spec.typography.rsvpHighlight ?? conditionSpec.typography.rsvpHighlight;
  const highlightEnabled = spec.mode === "rsvp" && rsvpHighlight.enabled;
  const isSentenceOrParagraph =
    viewportStep.startsWith("sentence") || viewportStep.startsWith("paragraph");
  const useSentenceStructuredLayout =
    isSentenceOrParagraph &&
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
  const multilineFlowHighlightText =
    flowHighlightText == null
      ? undefined
      : viewportStep.startsWith("sentence")
        ? formatTokenAsSentenceLines(flowHighlightText)
        : flowHighlightText;
  const highlightUnit = rsvpHighlight.unit;
  const highlightSize = rsvpHighlight.size;
  const highlightStyle = rsvpHighlight.style;
  const allowBoundaryCrossing = rsvpHighlight.allowBoundaryCrossing;
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
              highlightEnabled ? (
                <StructuredHighlightedToken
                  key={`${token}-${highlightUnit}-${highlightSize}`}
                  unit={highlightUnit}
                  size={highlightSize}
                  style={highlightStyle}
                  allowBoundaryCrossing={allowBoundaryCrossing}
                  jumpRateHz={jumpRateHz}
                  jumpDurationMs={jumpDurationMs}
                  limitToRsvpFlowSlice={flowSliceTokenCount != null}
                >
                  <SentenceStructuredRenderer
                    token={token}
                    staircaseEnabled={spec.typography.paragraphStaircase.enabled}
                    indentStepCh={spec.typography.paragraphStaircase.indentStepCh}
                    indentMode={spec.typography.paragraphStaircase.indentMode}
                    maxWidthCh={spec.typography.paragraphStaircase.maxWidthCh}
                    fontSizePx={spec.typography.fontSizePx}
                    lineWidthPx={spec.typography.lineWidthPx}
                    sentenceMarkers={spec.typography.sentenceMarkers}
                    flowSliceTokenCount={flowSliceTokenCount}
                    flowSliceTokenUnit={spec.tokenization.unit}
                  />
                </StructuredHighlightedToken>
              ) : (
                <SentenceStructuredRenderer
                  token={token}
                  staircaseEnabled={spec.typography.paragraphStaircase.enabled}
                  indentStepCh={spec.typography.paragraphStaircase.indentStepCh}
                  indentMode={spec.typography.paragraphStaircase.indentMode}
                  maxWidthCh={spec.typography.paragraphStaircase.maxWidthCh}
                  fontSizePx={spec.typography.fontSizePx}
                  lineWidthPx={spec.typography.lineWidthPx}
                  sentenceMarkers={spec.typography.sentenceMarkers}
                  flowSliceTokenCount={flowSliceTokenCount}
                  flowSliceTokenUnit={spec.tokenization.unit}
                />
              )
            ) : (
              <div className="whitespace-pre-wrap">
                {highlightEnabled ? (
                  <AnimatedHighlightedToken
                    key={`${multilineToken}-${highlightUnit}-${highlightSize}`}
                    token={multilineToken}
                    unit={highlightUnit}
                    size={highlightSize}
                    style={highlightStyle}
                    allowBoundaryCrossing={allowBoundaryCrossing}
                    jumpRateHz={jumpRateHz}
                    jumpDurationMs={jumpDurationMs}
                    flowHighlightPrefixLength={
                      multilineFlowHighlightText?.length
                    }
                    preserveWhitespace
                  />
                ) : (
                  multilineToken
                )}
              </div>
            )
          ) : (
            highlightEnabled ? (
              <div className="col-span-3 text-center whitespace-pre">
                <AnimatedHighlightedToken
                  key={`${token}-${highlightUnit}-${highlightSize}`}
                  token={token}
                  unit={highlightUnit}
                  size={highlightSize}
                  style={highlightStyle}
                  allowBoundaryCrossing={allowBoundaryCrossing}
                  jumpRateHz={jumpRateHz}
                  jumpDurationMs={jumpDurationMs}
                  flowHighlightPrefixLength={flowHighlightText?.length}
                  centerAnchored
                />
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
