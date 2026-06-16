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

export function AnimatedHighlightedToken({
  token,
  unit,
  size,
  style,
  jumpRateHz,
  jumpDurationMs,
  preserveWhitespace = false,
}: {
  token: string;
  unit: ConditionSpec["typography"]["rsvpHighlight"]["unit"];
  size: number;
  style: ConditionSpec["typography"]["rsvpHighlight"]["style"];
  jumpRateHz: number;
  jumpDurationMs?: number;
  preserveWhitespace?: boolean;
}) {
  const [jumpIndex, setJumpIndex] = useState(0);
  const positionCount = getHighlightPositionCount(token, unit, size);

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
      preserveWhitespace={preserveWhitespace}
      jumpIndex={jumpIndex}
    />
  );
}
