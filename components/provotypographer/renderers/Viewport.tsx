import type { MouseEvent } from "react";

import type { ConditionSpec } from "@/lib/condition-spec";
import type { ViewportStep } from "@/lib/provotypographer/core";
import { ContinuousRsvpRenderer } from "./ContinuousRsvpRenderer";
import { RsvpRenderer } from "./RsvpRenderer";

export function Viewport({
  spec,
  viewportStep,
  rsvpToken,
  overlappingRsvpTokens,
  rsvpBlank,
  continuousText,
  highlightJumpRateHz,
  rsvpHighlightJumpDurationMs,
  rsvpFlowHighlightText,
  rsvpFlowSliceTokenCount,
  resetContinuousHighlightKey,
  manualAdvanceEnabled,
  onManualAdvance,
  onViewportMouseMove,
  onViewportMouseLeave,
}: {
  spec: ConditionSpec;
  viewportStep: ViewportStep;
  rsvpToken: string;
  overlappingRsvpTokens: string[];
  rsvpBlank: boolean;
  continuousText: string;
  highlightJumpRateHz: number;
  rsvpHighlightJumpDurationMs?: number;
  rsvpFlowHighlightText?: string;
  rsvpFlowSliceTokenCount?: number;
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
        <div className="relative h-full w-full">
          {!rsvpBlank ? (
            <div className="absolute inset-0">
              <RsvpRenderer
                spec={spec}
                token={rsvpToken}
                viewportStep={viewportStep}
                jumpRateHz={highlightJumpRateHz}
                jumpDurationMs={rsvpHighlightJumpDurationMs}
                flowHighlightText={rsvpFlowHighlightText}
                flowSliceTokenCount={rsvpFlowSliceTokenCount}
              />
            </div>
          ) : null}
          {overlappingRsvpTokens.map((token, index) => (
            <div
              key={`${token}-${index}`}
              className="pointer-events-none absolute inset-0"
              aria-hidden="true"
            >
              <RsvpRenderer
                spec={spec}
                token={token}
                viewportStep={viewportStep}
                jumpRateHz={highlightJumpRateHz}
                jumpDurationMs={rsvpHighlightJumpDurationMs}
                flowHighlightText={rsvpFlowHighlightText}
                flowSliceTokenCount={rsvpFlowSliceTokenCount}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
