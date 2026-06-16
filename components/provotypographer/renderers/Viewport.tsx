import type { MouseEvent } from "react";

import type { ConditionSpec } from "@/lib/condition-spec";
import type { ViewportStep } from "@/lib/provotypographer/core";
import { ContinuousRsvpRenderer } from "./ContinuousRsvpRenderer";
import { RsvpRenderer } from "./RsvpRenderer";

export function Viewport({
  spec,
  viewportStep,
  rsvpToken,
  continuousText,
  highlightJumpRateHz,
  rsvpHighlightJumpDurationMs,
  resetContinuousHighlightKey,
  manualAdvanceEnabled,
  onManualAdvance,
  onViewportMouseMove,
  onViewportMouseLeave,
}: {
  spec: ConditionSpec;
  viewportStep: ViewportStep;
  rsvpToken: string;
  continuousText: string;
  highlightJumpRateHz: number;
  rsvpHighlightJumpDurationMs?: number;
  resetContinuousHighlightKey: number;
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
      style={{
        padding: spec.typography.viewportPaddingPx,
        color: spec.typography.fontColor,
        backgroundColor: spec.typography.backgroundColor,
      }}
      onClick={manualAdvanceEnabled ? onManualAdvance : undefined}
      onMouseMove={onViewportMouseMove}
      onMouseLeave={onViewportMouseLeave}
    >
      {spec.mode === "continuous" ? (
        <ContinuousRsvpRenderer
          spec={spec}
          rawText={continuousText}
          resetHighlightKey={resetContinuousHighlightKey}
        />
      ) : (
        <RsvpRenderer
          spec={spec}
          token={rsvpToken}
          viewportStep={viewportStep}
          jumpRateHz={highlightJumpRateHz}
          jumpDurationMs={rsvpHighlightJumpDurationMs}
        />
      )}
    </div>
  );
}

