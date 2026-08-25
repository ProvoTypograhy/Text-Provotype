import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { ConditionSpec } from "@/lib/condition-spec";
import {
  buildContinuousHighlightLayout,
  getHighlightOverlayStyle,
  getTextRangeRects,
  type ContinuousHighlightLayout,
  type HighlightRect,
} from "@/lib/provotypographer/core";

export function StructuredHighlightedToken({
  children,
  unit,
  size,
  style,
  allowBoundaryCrossing,
  jumpRateHz,
  jumpDurationMs,
  limitToRsvpFlowSlice = false,
}: {
  children: ReactNode;
  unit: ConditionSpec["typography"]["rsvpHighlight"]["unit"];
  size: number;
  style: ConditionSpec["typography"]["rsvpHighlight"]["style"];
  allowBoundaryCrossing: boolean;
  jumpRateHz: number;
  jumpDurationMs?: number;
  limitToRsvpFlowSlice?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef<ContinuousHighlightLayout | null>(null);
  const activeIndexRef = useRef(0);
  const [positionCount, setPositionCount] = useState(1);
  const [activeRects, setActiveRects] = useState<HighlightRect[]>([]);
  const highlightStyle = getHighlightOverlayStyle(style);

  const applyRange = useCallback((index: number) => {
    const layout = layoutRef.current;
    if (!layout?.ranges.length) {
      activeIndexRef.current = 0;
      setActiveRects([]);
      return;
    }

    const nextIndex = Math.max(0, Math.min(layout.ranges.length - 1, index));
    const range = layout.ranges[nextIndex];
    activeIndexRef.current = nextIndex;
    setActiveRects(
      range
        ? getTextRangeRects({
            container: layout.container,
            entries: layout.entries,
            start: range.start,
            end: range.end,
          })
        : [],
    );
  }, []);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      layoutRef.current = null;
      setPositionCount(1);
      setActiveRects([]);
      return;
    }

    const layout = buildContinuousHighlightLayout({
      container,
      direction: "vertical",
      unit,
      size,
      allowBoundaryCrossing,
      limitToRsvpFlowSlice,
    });
    layoutRef.current = layout;
    const nextPositionCount = Math.max(1, layout?.ranges.length ?? 1);
    setPositionCount(nextPositionCount);
    applyRange(Math.min(activeIndexRef.current, nextPositionCount - 1));
  }, [allowBoundaryCrossing, applyRange, limitToRsvpFlowSlice, size, unit]);

  useLayoutEffect(() => {
    activeIndexRef.current = 0;
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    const frameId = window.requestAnimationFrame(measure);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frameId);
    };
  }, [children, measure]);

  useEffect(() => {
    activeIndexRef.current = 0;
    if (positionCount <= 1) {
      return;
    }

    if (jumpDurationMs != null && jumpDurationMs > 0) {
      let frameId = 0;
      let startTs: number | null = null;
      const tick = (timestamp: number) => {
        if (startTs == null) {
          startTs = timestamp;
        }
        const progress = Math.min(1, (timestamp - startTs) / jumpDurationMs);
        applyRange(
          Math.min(positionCount - 1, Math.floor(progress * positionCount)),
        );
        if (progress < 1) {
          frameId = window.requestAnimationFrame(tick);
        }
      };
      frameId = window.requestAnimationFrame(tick);
      return () => window.cancelAnimationFrame(frameId);
    }

    if (jumpRateHz <= 0) {
      return;
    }
    const intervalId = window.setInterval(() => {
      applyRange(Math.min(activeIndexRef.current + 1, positionCount - 1));
    }, Math.max(50, Math.round(1000 / jumpRateHz)));
    return () => window.clearInterval(intervalId);
  }, [applyRange, jumpDurationMs, jumpRateHz, positionCount]);

  return (
    <div ref={containerRef} className="relative">
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        {activeRects.map((rect, index) => (
          <span
            key={`${index}-${Math.round(rect.left)}-${Math.round(rect.top)}`}
            className="absolute block"
            data-rsvp-highlight-rect="true"
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
      <div className="relative z-10">{children}</div>
    </div>
  );
}
