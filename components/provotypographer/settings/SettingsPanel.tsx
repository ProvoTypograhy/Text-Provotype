import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { conditionSpec, type ConditionSpec } from "@/lib/condition-spec";
import {
  FONT_FAMILY_OPTIONS,
  HIGHLIGHT_JUMP_RATE_MAX,
  HIGHLIGHT_JUMP_RATE_MIN,
  VIEWPORT_SIZE_MAX_PERCENT,
  VIEWPORT_SIZE_MIN_PERCENT,
  VIEWPORT_STEP_LABELS,
  clamp,
  getStepIndex,
  getTokenizationFromViewportStep,
  getViewportStepsForMode,
  type LogEntry,
  type ViewportStep,
} from "@/lib/provotypographer/core";
import {
  LEXICAL_BASELINE_MAX_MS,
  LEXICAL_BASELINE_MIN_MS,
} from "@/lib/provotypographer/lexical-timing";

type SettingsPanelProps = {
  text: string;
  setText: Dispatch<SetStateAction<string>>;
  spec: ConditionSpec;
  setSpec: Dispatch<SetStateAction<ConditionSpec>>;
  viewportStep: ViewportStep;
  applyViewportStep: (step: ViewportStep) => void;
  effectiveAdvanceStep: number;
  maxAdvanceStep: number;
  setAdvanceStep: Dispatch<SetStateAction<number>>;
  viewportWidthPercent: number;
  setViewportWidthPercent: Dispatch<SetStateAction<number>>;
  viewportHeightPercent: number;
  setViewportHeightPercent: Dispatch<SetStateAction<number>>;
  setAutoplay: (autoplay: boolean) => void;
  rsvpIndexRef: MutableRefObject<number>;
  setRsvpIndex: Dispatch<SetStateAction<number>>;
  appendLog: (entry: LogEntry) => void;
  safeRsvpIndex: number;
  rsvpTokens: string[];
  canManualAdvance: boolean;
  speechVoices: SpeechSynthesisVoice[];
  setResetContinuousHighlightKey: Dispatch<SetStateAction<number>>;
  rsvpHighlight: ConditionSpec["typography"]["rsvpHighlight"];
  effectiveHighlightJumpRateHz: number;
  highlightStep: ViewportStep;
  allowedHighlightSteps: readonly ViewportStep[];
  highlightStepIndex: number;
  setIsSpecModalOpen: Dispatch<SetStateAction<boolean>>;
  lexicalTimingStatus: string;
};

export function SettingsPanel({
  text,
  setText,
  spec,
  setSpec,
  viewportStep,
  applyViewportStep,
  effectiveAdvanceStep,
  maxAdvanceStep,
  setAdvanceStep,
  viewportWidthPercent,
  setViewportWidthPercent,
  viewportHeightPercent,
  setViewportHeightPercent,
  setAutoplay,
  rsvpIndexRef,
  setRsvpIndex,
  appendLog,
  safeRsvpIndex,
  rsvpTokens,
  canManualAdvance,
  speechVoices,
  setResetContinuousHighlightKey,
  rsvpHighlight,
  effectiveHighlightJumpRateHz,
  highlightStep,
  allowedHighlightSteps,
  highlightStepIndex,
  setIsSpecModalOpen,
  lexicalTimingStatus,
}: SettingsPanelProps) {
  return (
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
                              disabled={spec.motion.rsvpLexicalTiming.enabled}
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
                              disabled={
                                !spec.motion.rateControl.enabled ||
                                spec.motion.rsvpLexicalTiming.enabled
                              }
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
                                  disabled={spec.motion.rsvpLexicalTiming.enabled}
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
                                  checked={spec.motion.rsvpLexicalTiming.enabled}
                                  onChange={(e) =>
                                    setSpec((prev) => ({
                                      ...prev,
                                      motion: {
                                        ...prev.motion,
                                        rsvpLexicalTiming: {
                                          ...prev.motion.rsvpLexicalTiming,
                                          enabled: e.target.checked,
                                        },
                                      },
                                    }))
                                  }
                                />
                                Lexical timing
                              </label>
                              <label className="flex flex-col gap-1">
                                Baseline fixation (ms):{" "}
                                {Math.round(
                                  spec.motion.rsvpLexicalTiming.baselineFixationMs,
                                )}
                                <input
                                  className="w-full"
                                  type="range"
                                  min={LEXICAL_BASELINE_MIN_MS}
                                  max={LEXICAL_BASELINE_MAX_MS}
                                  step={1}
                                  disabled={!spec.motion.rsvpLexicalTiming.enabled}
                                  value={spec.motion.rsvpLexicalTiming.baselineFixationMs}
                                  onChange={(e) =>
                                    setSpec((prev) => ({
                                      ...prev,
                                      motion: {
                                        ...prev.motion,
                                        rsvpLexicalTiming: {
                                          ...prev.motion.rsvpLexicalTiming,
                                          baselineFixationMs: clamp(
                                            Number(e.target.value) ||
                                              conditionSpec.motion.rsvpLexicalTiming
                                                .baselineFixationMs,
                                            LEXICAL_BASELINE_MIN_MS,
                                            LEXICAL_BASELINE_MAX_MS,
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
                                  disabled={!spec.motion.rsvpLexicalTiming.enabled}
                                  checked={spec.motion.rsvpLexicalTiming.includeSaccade}
                                  onChange={(e) =>
                                    setSpec((prev) => ({
                                      ...prev,
                                      motion: {
                                        ...prev.motion,
                                        rsvpLexicalTiming: {
                                          ...prev.motion.rsvpLexicalTiming,
                                          includeSaccade: e.target.checked,
                                        },
                                      },
                                    }))
                                  }
                                />
                                Add 30 ms saccade
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
                              <label className="flex items-center gap-2 pt-6">
                                <input
                                  type="checkbox"
                                  checked={spec.motion.readAloud.enabled}
                                  onChange={(e) =>
                                    setSpec((prev) => ({
                                      ...prev,
                                      motion: {
                                        ...prev.motion,
                                        readAloud: {
                                          ...prev.motion.readAloud,
                                          enabled: e.target.checked,
                                        },
                                      },
                                    }))
                                  }
                                />
                                Read words aloud
                              </label>
                              <label className="flex flex-col gap-1">
                                Read-Aloud Voice
                                <select
                                  className="rounded border border-zinc-300 px-2 py-1"
                                  disabled={!spec.motion.readAloud.enabled}
                                  value={spec.motion.readAloud.voiceURI}
                                  onChange={(e) =>
                                    setSpec((prev) => ({
                                      ...prev,
                                      motion: {
                                        ...prev.motion,
                                        readAloud: {
                                          ...prev.motion.readAloud,
                                          voiceURI: e.target.value,
                                        },
                                      },
                                    }))
                                  }
                                >
                                  <option value="">Default English voice</option>
                                  {speechVoices.map((voice) => (
                                    <option
                                      key={`${voice.voiceURI}-${voice.lang}`}
                                      value={voice.voiceURI}
                                    >
                                      {voice.name} ({voice.lang})
                                      {voice.default ? " default" : ""}
                                    </option>
                                  ))}
                                </select>
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
                            {lexicalTimingStatus ? (
                              <p className="text-xs text-zinc-600" role="status">
                                {lexicalTimingStatus}
                              </p>
                            ) : null}
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
                              Font Family
                              <select
                                className="rounded border border-zinc-300 px-2 py-1"
                                value={spec.typography.fontFamily}
                                onChange={(e) =>
                                  setSpec((prev) => ({
                                    ...prev,
                                    typography: {
                                      ...prev.typography,
                                      fontFamily: e.target.value,
                                    },
                                  }))
                                }
                              >
                                {FONT_FAMILY_OPTIONS.map((option) => (
                                  <option key={option.label} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="flex flex-col gap-1">
                              Font Color
                              <span className="flex items-center gap-2">
                                <input
                                  className="h-9 w-12 rounded border border-zinc-300"
                                  type="color"
                                  value={spec.typography.fontColor}
                                  onChange={(e) =>
                                    setSpec((prev) => ({
                                      ...prev,
                                      typography: {
                                        ...prev.typography,
                                        fontColor: e.target.value,
                                      },
                                    }))
                                  }
                                />
                                <span className="font-mono text-xs text-zinc-600">
                                  {spec.typography.fontColor}
                                </span>
                              </span>
                            </label>
                            <label className="flex flex-col gap-1">
                              Background Color
                              <span className="flex items-center gap-2">
                                <input
                                  className="h-9 w-12 rounded border border-zinc-300"
                                  type="color"
                                  value={spec.typography.backgroundColor}
                                  onChange={(e) =>
                                    setSpec((prev) => ({
                                      ...prev,
                                      typography: {
                                        ...prev.typography,
                                        backgroundColor: e.target.value,
                                      },
                                    }))
                                  }
                                />
                                <span className="font-mono text-xs text-zinc-600">
                                  {spec.typography.backgroundColor}
                                </span>
                              </span>
                            </label>
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
                              <label className="flex items-center gap-2 self-end">
                                <input
                                  type="checkbox"
                                  disabled={!rsvpHighlight.enabled}
                                  checked={rsvpHighlight.allowBoundaryCrossing}
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
                                          allowBoundaryCrossing: e.target.checked,
                                        },
                                      },
                                    }))
                                  }
                                />
                                <span>Allow sentence-boundary highlight</span>
                              </label>
                            </div>
                            {spec.mode === "continuous" ? (
                              <div className="flex flex-wrap items-center gap-3">
                                <label className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    disabled={!rsvpHighlight.enabled}
                                    checked={rsvpHighlight.tieToFlow}
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
                                            tieToFlow: e.target.checked,
                                          },
                                        },
                                      }))
                                    }
                                  />
                                  <span>Lock Highlight To Flow</span>
                                </label>
                                <button
                                  type="button"
                                  className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={!rsvpHighlight.enabled}
                                  onClick={() =>
                                    setResetContinuousHighlightKey((prev) => prev + 1)
                                  }
                                >
                                  Reset Highlight Position
                                </button>
                              </div>
                            ) : null}
                            {spec.mode !== "continuous" || !rsvpHighlight.tieToFlow ? (
                              <label className="flex flex-col gap-1">
                                Highlight Jump Rate: {effectiveHighlightJumpRateHz.toFixed(2)} steps/sec
                                <input
                                  className="w-full"
                                  type="range"
                                  min={HIGHLIGHT_JUMP_RATE_MIN}
                                  max={HIGHLIGHT_JUMP_RATE_MAX}
                                  step={0.25}
                                  disabled={!rsvpHighlight.enabled}
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
                            ) : null}
                            {spec.mode === "continuous" ? (
                              <p className="text-xs text-zinc-500">
                                With flow lock on, jump highlight speed is derived from the moving text.
                                Turn it off to run highlight independently and use Reset Highlight to resync.
                              </p>
                            ) : null}
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
  );
}
