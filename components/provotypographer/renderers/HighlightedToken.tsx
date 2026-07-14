import { useEffect, useState } from "react";

import type { ConditionSpec } from "@/lib/condition-spec";
import {
  getHighlightPositionCount,
  getHighlightSegments,
  getHighlightSpanStyle,
} from "@/lib/provotypographer/core";

export function HighlightedToken({
  token,
  unit,
  size,
  style,
  allowBoundaryCrossing,
  preserveWhitespace = false,
  jumpIndex,
  centerAnchored = false,
}: {
  token: string;
  unit: ConditionSpec["typography"]["rsvpHighlight"]["unit"];
  size: number;
  style: ConditionSpec["typography"]["rsvpHighlight"]["style"];
  allowBoundaryCrossing: boolean;
  preserveWhitespace?: boolean;
  jumpIndex?: number;
  centerAnchored?: boolean;
}) {
  const { before, highlight, after } = getHighlightSegments(
    token,
    unit,
    size,
    jumpIndex,
    allowBoundaryCrossing,
  );
  const highlightStyle = getHighlightSpanStyle(style);
  if (centerAnchored) {
    const characters = Array.from(token);
    const highlightStart = Array.from(before).length;
    const highlightEnd = highlightStart + Array.from(highlight).length;
    const centerIndex = Math.floor(characters.length / 2);
    const renderRange = (start: number, end: number) => {
      const highlightedStart = Math.min(
        end,
        Math.max(start, highlightStart),
      );
      const highlightedEnd = Math.min(end, Math.max(start, highlightEnd));
      return (
        <>
          {characters.slice(start, highlightedStart).join("")}
          {highlightedStart < highlightedEnd ? (
            <span style={highlightStyle}>
              {characters.slice(highlightedStart, highlightedEnd).join("")}
            </span>
          ) : null}
          {characters.slice(Math.max(start, highlightedEnd), end).join("")}
        </>
      );
    };

    return (
      <span
        className={`grid grid-cols-[1fr_auto_1fr] items-center ${preserveWhitespace ? "whitespace-pre-wrap" : "whitespace-pre"}`}
      >
        <span className="justify-self-end text-right">
          {renderRange(0, centerIndex)}
        </span>
        <span>{renderRange(centerIndex, centerIndex + 1)}</span>
        <span className="text-left">
          {renderRange(centerIndex + 1, characters.length)}
        </span>
      </span>
    );
  }
  return (
    <span className={preserveWhitespace ? "whitespace-pre-wrap" : undefined}>
      <span>{before}</span>
      {highlight ? <span style={highlightStyle}>{highlight}</span> : null}
      <span>{after}</span>
    </span>
  );
}

export function AnimatedHighlightedToken({
  token,
  unit,
  size,
  style,
  allowBoundaryCrossing,
  jumpRateHz,
  jumpDurationMs,
  preserveWhitespace = false,
  centerAnchored = false,
}: {
  token: string;
  unit: ConditionSpec["typography"]["rsvpHighlight"]["unit"];
  size: number;
  style: ConditionSpec["typography"]["rsvpHighlight"]["style"];
  allowBoundaryCrossing: boolean;
  jumpRateHz: number;
  jumpDurationMs?: number;
  preserveWhitespace?: boolean;
  centerAnchored?: boolean;
}) {
  const [jumpIndex, setJumpIndex] = useState(0);
  const positionCount = getHighlightPositionCount(
    token,
    unit,
    size,
    allowBoundaryCrossing,
  );

  useEffect(() => {
    if (positionCount <= 1) {
      return;
    }

    if (jumpDurationMs != null && jumpDurationMs > 0) {
      let frameId = 0;
      let startTs: number | null = null;

      const tick = (ts: number) => {
        if (startTs == null) {
          startTs = ts;
        }
        const elapsed = ts - startTs;
        const progress = Math.min(1, elapsed / jumpDurationMs);
        const nextIndex = Math.min(
          positionCount - 1,
          Math.floor(progress * positionCount),
        );
        setJumpIndex((prev) => (prev === nextIndex ? prev : nextIndex));

        if (progress < 1) {
          frameId = window.requestAnimationFrame(tick);
        }
      };

      frameId = window.requestAnimationFrame(tick);
      return () => window.cancelAnimationFrame(frameId);
    }

    if (positionCount <= 1 || jumpRateHz <= 0) {
      return;
    }

    const delayMs = Math.max(50, Math.round(1000 / jumpRateHz));
    const intervalId = window.setInterval(() => {
      setJumpIndex((prev) => Math.min(prev + 1, positionCount - 1));
    }, delayMs);

    return () => window.clearInterval(intervalId);
  }, [jumpDurationMs, jumpRateHz, positionCount]);

  return (
    <HighlightedToken
      token={token}
      unit={unit}
      size={size}
      style={style}
      allowBoundaryCrossing={allowBoundaryCrossing}
      preserveWhitespace={preserveWhitespace}
      jumpIndex={jumpIndex}
      centerAnchored={centerAnchored}
    />
  );
}
