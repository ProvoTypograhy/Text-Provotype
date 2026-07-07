"use client";

import {
  type ChangeEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { conditionSpec, type ConditionSpec } from "@/lib/condition-spec";
import {
  DEFAULT_TEXT_PATH,
  HIGHLIGHT_JUMP_RATE_MAX,
  HIGHLIGHT_JUMP_RATE_MIN,
  MIN_SETTINGS_WIDTH,
  MIN_VIEWPORT_WIDTH,
  RSVP_STEPS,
  SHARE_HASH_PREFIX,
  SHARE_URL_MAX_LENGTH,
  SPEED_MAX_CPS,
  SPEED_MIN_CPS,
  VIEWPORT_SIZE_MAX_PERCENT,
  VIEWPORT_SIZE_MIN_PERCENT,
  buildShareUrlFromEncodedPayload,
  clamp,
  decodeSharePayload,
  encodeSharePayload,
  endsWithPausePunctuation,
  getAdvanceCharacterCount,
  getHighlightPositionCount,
  getHighlightSegments,
  getRsvpDisplayToken,
  getStepIndex,
  getTokenizationFromViewportStep,
  getViewportStepFromTokenization,
  getViewportStepsForMode,
  getViewportTokenCount,
  isHexColor,
  normalizeFontFamily,
  sanitizeSettingsName,
  tokenizeText,
  type LogEntry,
  type SettingsJson,
  type SharePayloadV1,
  type ViewportStep,
} from "@/lib/provotypographer/core";
import { exportViewportLoop } from "@/lib/provotypographer/loop-export";
import { Viewport } from "./renderers/Viewport";
import { SettingsPanel } from "./settings/SettingsPanel";
import { SettingsJsonModal } from "./settings/SettingsJsonModal";

const LOOP_EXPORT_DURATION_SECONDS_DEFAULT = 5;
const LOOP_EXPORT_DURATION_SECONDS_MIN = 1;
const LOOP_EXPORT_DURATION_SECONDS_MAX = 60;
const READ_ALOUD_BASELINE_CPS = 14;
const READ_ALOUD_TIMING_BUFFER = 0.82;

function getReadAloudRate(value: string, availableMs?: number) {
  if (availableMs == null || availableMs <= 0) {
    return 1;
  }

  const normalizedLength = Math.max(1, value.replace(/\s+/g, " ").trim().length);
  const availableSeconds = Math.max(0.05, (availableMs / 1000) * READ_ALOUD_TIMING_BUFFER);
  const targetCps = normalizedLength / availableSeconds;
  return clamp(targetCps / READ_ALOUD_BASELINE_CPS, 0.1, 10);
}

function waitForPaintFrames(count = 2) {
  return new Promise<void>((resolve) => {
    let remainingFrames = count;
    const tick = () => {
      remainingFrames -= 1;
      if (remainingFrames <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });
}

export function ProvotypographerApp() {
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
  const [settingsModalStatus, setSettingsModalStatus] = useState("");
  const [shareLinkFallback, setShareLinkFallback] = useState("");
  const [loopExportError, setLoopExportError] = useState("");
  const [loopExportStatus, setLoopExportStatus] = useState("");
  const [isLoopExporting, setIsLoopExporting] = useState(false);
  const [isLoopCaptureActive, setIsLoopCaptureActive] = useState(false);
  const [speechVoices, setSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [loopExportDurationSeconds, setLoopExportDurationSeconds] = useState(
    String(LOOP_EXPORT_DURATION_SECONDS_DEFAULT),
  );
  const [text, setText] = useState("");
  const [resetContinuousHighlightKey, setResetContinuousHighlightKey] = useState(0);
  const logsRef = useRef<LogEntry[]>([]);
  const rsvpIndexRef = useRef(0);
  const baseSpeedBeforeMouseRef = useRef<number | null>(null);
  const sharedTextLoadedRef = useRef(false);
  const splitViewRef = useRef<HTMLDivElement | null>(null);
  const viewportAreaRef = useRef<HTMLDivElement | null>(null);
  const exportViewportRef = useRef<HTMLDivElement | null>(null);
  const loopCaptureRepaintRef = useRef<HTMLDivElement | null>(null);
  const loopCaptureRepaintFrameRef = useRef<number | null>(null);
  const readAloudTimeoutsRef = useRef<number[]>([]);
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

  const clearReadAloudSchedule = useCallback((cancelSpeech = true) => {
    readAloudTimeoutsRef.current.forEach((timeoutId) =>
      window.clearTimeout(timeoutId),
    );
    readAloudTimeoutsRef.current = [];

    if (
      cancelSpeech &&
      typeof window !== "undefined" &&
      "speechSynthesis" in window
    ) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const speakReadAloudText = useCallback((value: string, availableMs?: number) => {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) {
      return;
    }

    const normalizedValue = value.replace(/\s+/g, " ").trim();
    if (!normalizedValue) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(normalizedValue);
    const selectedVoice = window.speechSynthesis
      .getVoices()
      .find((voice) => voice.voiceURI === spec.motion.readAloud.voiceURI);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    utterance.rate = getReadAloudRate(normalizedValue, availableMs);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [spec.motion.readAloud.voiceURI]);

  useEffect(() => {
    let cancelled = false;

    const loadDefaultText = async () => {
      try {
        const response = await fetch(DEFAULT_TEXT_PATH);
        if (!response.ok) {
          return;
        }
        const loadedText = await response.text();
        if (!cancelled && !sharedTextLoadedRef.current) {
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

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
      return;
    }

    const loadVoices = () => {
      setSpeechVoices(window.speechSynthesis.getVoices());
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () =>
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  // rsvp size comes from viewport step
  // keep base tokens ungrouped so counts dont multiply
  const rsvpChunkSize = 1;
  const rsvpTokens = useMemo(
    () => tokenizeText(text, spec.tokenization.unit, rsvpChunkSize),
    [rsvpChunkSize, spec.tokenization.unit, text],
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
  const currentRsvpAdvanceCharCount = useMemo(
    () =>
      getAdvanceCharacterCount(
        rsvpTokens,
        safeRsvpIndex,
        effectiveAdvanceStep,
        spec.tokenization.unit,
      ),
    [
      effectiveAdvanceStep,
      rsvpTokens,
      safeRsvpIndex,
      spec.tokenization.unit,
    ],
  );
  const currentRsvpTokenDurationMs = useMemo(() => {
    if (spec.mode !== "rsvp" || !spec.motion.autoplay || !currentRsvpToken) {
      return undefined;
    }

    const speedValue = Math.max(1, spec.motion.speed.value);
    const msPerToken = Math.max(
      20,
      Math.round((currentRsvpAdvanceCharCount * 1000) / speedValue),
    );
    const extraDelay =
      spec.motion.pauseAtPunctuation.enabled &&
      endsWithPausePunctuation(currentRsvpToken)
        ? Math.max(0, spec.motion.pauseAtPunctuation.delayMs)
        : 0;
    return msPerToken + extraDelay;
  }, [
    currentRsvpAdvanceCharCount,
    currentRsvpToken,
    spec.mode,
    spec.motion.autoplay,
    spec.motion.pauseAtPunctuation.delayMs,
    spec.motion.pauseAtPunctuation.enabled,
    spec.motion.speed.value,
  ]);
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
    clearReadAloudSchedule();

    if (
      !spec.motion.readAloud.enabled ||
      spec.mode !== "rsvp" ||
      !spec.motion.autoplay ||
      !currentRsvpToken
    ) {
      return;
    }

    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) {
      return;
    }

    if (!rsvpHighlight.enabled) {
      speakReadAloudText(currentRsvpToken, currentRsvpTokenDurationMs);
      return () => clearReadAloudSchedule();
    }

    const positionCount = getHighlightPositionCount(
      currentRsvpToken,
      rsvpHighlight.unit,
      rsvpHighlight.size,
      rsvpHighlight.allowBoundaryCrossing,
    );
    const fallbackStepMs = Math.max(
      50,
      Math.round(1000 / effectiveHighlightJumpRateHz),
    );
    const readAloudSegments = Array.from({ length: positionCount }, (_, jumpIndex) => {
      const { highlight } = getHighlightSegments(
        currentRsvpToken,
        rsvpHighlight.unit,
        rsvpHighlight.size,
        jumpIndex,
        rsvpHighlight.allowBoundaryCrossing,
      );
      return (highlight || currentRsvpToken).replace(/\s+/g, " ").trim();
    }).filter((segment, index, segments) => {
      return segment && segment !== segments[index - 1];
    });
    const stepMs =
      currentRsvpTokenDurationMs != null && readAloudSegments.length > 0
        ? Math.max(50, currentRsvpTokenDurationMs / readAloudSegments.length)
        : fallbackStepMs;

    readAloudSegments.forEach((segment, index) => {
      const timeoutId = window.setTimeout(() => {
        speakReadAloudText(segment, stepMs);
      }, Math.round(index * stepMs));
      readAloudTimeoutsRef.current.push(timeoutId);
    });

    return () => clearReadAloudSchedule();
  }, [
    clearReadAloudSchedule,
    currentRsvpToken,
    currentRsvpTokenDurationMs,
    effectiveHighlightJumpRateHz,
    rsvpHighlight.allowBoundaryCrossing,
    rsvpHighlight.enabled,
    rsvpHighlight.size,
    rsvpHighlight.unit,
    speakReadAloudText,
    spec.mode,
    spec.motion.autoplay,
    spec.motion.readAloud.enabled,
  ]);

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
      const minCps = Math.max(
        1,
        Math.min(
          spec.motion.rateControl.minCps,
          spec.motion.rateControl.maxCps,
        ),
      );
      const maxCps = Math.max(minCps, spec.motion.rateControl.maxCps);
      const mapped = spec.motion.rateControl.invert ? 1 - yNorm : yNorm;
      const nextCps = clamp(
        Math.round(minCps + mapped * (maxCps - minCps)),
        minCps,
        maxCps,
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
    [
      spec.motion.rateControl.enabled,
      spec.motion.rateControl.invert,
      spec.motion.rateControl.maxCps,
      spec.motion.rateControl.minCps,
      spec.motion.speed.value,
    ],
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

  const getLoopExportDurationSeconds = useCallback(() => {
    const durationSeconds = Number(loopExportDurationSeconds);

    if (!Number.isFinite(durationSeconds)) {
      return LOOP_EXPORT_DURATION_SECONDS_DEFAULT;
    }

    return clamp(
      Math.round(durationSeconds),
      LOOP_EXPORT_DURATION_SECONDS_MIN,
      LOOP_EXPORT_DURATION_SECONDS_MAX,
    );
  }, [loopExportDurationSeconds]);

  const handleLoopExportDurationChange = useCallback((value: string) => {
    if (value === "") {
      setLoopExportDurationSeconds(value);
      return;
    }

    const durationSeconds = Number(value);

    if (!Number.isFinite(durationSeconds)) {
      return;
    }

    setLoopExportDurationSeconds(
      String(
        clamp(
          Math.round(durationSeconds),
          LOOP_EXPORT_DURATION_SECONDS_MIN,
          LOOP_EXPORT_DURATION_SECONDS_MAX,
        ),
      ),
    );
  }, []);

  const handleLoopExportDurationBlur = useCallback(() => {
    setLoopExportDurationSeconds(String(getLoopExportDurationSeconds()));
  }, [getLoopExportDurationSeconds]);

  const startLoopCaptureRepaintTick = useCallback(() => {
    if (loopCaptureRepaintFrameRef.current != null) {
      window.cancelAnimationFrame(loopCaptureRepaintFrameRef.current);
    }

    let frameIndex = 0;
    const tick = () => {
      frameIndex += 1;
      const node = loopCaptureRepaintRef.current;
      if (node) {
        node.style.backgroundColor =
          frameIndex % 2 === 0
            ? "rgba(0,0,0,0.01)"
            : "rgba(255,255,255,0.01)";
      }
      loopCaptureRepaintFrameRef.current = window.requestAnimationFrame(tick);
    };

    loopCaptureRepaintFrameRef.current = window.requestAnimationFrame(tick);
  }, []);

  const stopLoopCaptureRepaintTick = useCallback(() => {
    if (loopCaptureRepaintFrameRef.current != null) {
      window.cancelAnimationFrame(loopCaptureRepaintFrameRef.current);
      loopCaptureRepaintFrameRef.current = null;
    }

    const node = loopCaptureRepaintRef.current;
    if (node) {
      node.style.backgroundColor = "rgba(0,0,0,0)";
    }
  }, []);

  const handleExportLoop = useCallback(async () => {
    const node = exportViewportRef.current;
    const durationSeconds = getLoopExportDurationSeconds();

    setLoopExportDurationSeconds(String(durationSeconds));

    if (!node) {
      setLoopExportError("The viewport is not ready to export.");
      setLoopExportStatus("");
      return;
    }

    try {
      setIsLoopExporting(true);
      setIsLoopCaptureActive(true);
      setLoopExportError("");
      setLoopExportStatus("Choose this tab to record the exact viewport.");
      setIsSpecModalOpen(false);
      startLoopCaptureRepaintTick();

      const result = await exportViewportLoop(
        {
          viewportNode: node,
        },
        {
          durationMs: durationSeconds * 1000,
          fps: 30,
          expectMotion: spec.motion.autoplay,
          onBeforeCapture: () => waitForPaintFrames(2),
          onProgress: ({ elapsedMs, durationMs }) => {
            setLoopExportStatus(
              `Recording exact viewport ${Math.ceil(elapsedMs / 1000)}/${Math.ceil(
                durationMs / 1000,
              )}s...`,
            );
          },
        },
      );
      const safeName = sanitizeSettingsName(settingsName) || "condition-spec";
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeName}-loop.${result.extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setLoopExportStatus("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to export loop.";
      setLoopExportError(message);
      setLoopExportStatus("");
    } finally {
      stopLoopCaptureRepaintTick();
      setIsLoopExporting(false);
      setIsLoopCaptureActive(false);
      setIsSpecModalOpen(true);
    }
  }, [
    getLoopExportDurationSeconds,
    settingsName,
    spec.motion.autoplay,
    startLoopCaptureRepaintTick,
    stopLoopCaptureRepaintTick,
  ]);

  const handleCopyShareLink = useCallback(async () => {
    try {
      const payloadWithText: SharePayloadV1 = {
        version: 1,
        settings: settingsPayload,
        text,
      };
      let encodedPayload = await encodeSharePayload(payloadWithText);
      let shareUrl = buildShareUrlFromEncodedPayload(encodedPayload);
      let omittedText = false;

      if (shareUrl.length > SHARE_URL_MAX_LENGTH) {
        omittedText = true;
        encodedPayload = await encodeSharePayload({
          version: 1,
          settings: settingsPayload,
        });
        shareUrl = buildShareUrlFromEncodedPayload(encodedPayload);
      }

      setSettingsModalError("");
      setSettingsModalStatus(
        omittedText
          ? "Share link copied. Text was omitted because it was too long for a reliable URL."
          : "Share link copied.",
      );
      setShareLinkFallback("");

      if (!navigator.clipboard?.writeText) {
        setShareLinkFallback(shareUrl);
        setSettingsModalStatus(
          omittedText
            ? "Share link generated below. Text was omitted because it was too long for a reliable URL."
            : "Share link generated below.",
        );
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to generate share link.";
      setSettingsModalError(message);
      setSettingsModalStatus("");
    }
  }, [settingsPayload, text]);

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
    setSettingsModalStatus("");
    setShareLinkFallback("");
    setLoopExportError("");
    setLoopExportStatus("");
  }, []);

  const handleImportSettingsText = useCallback(async (raw: string) => {
    const numberOrDefault = (value: unknown, fallback: number) => {
      const nextValue = Number(value);
      return Number.isFinite(nextValue) ? nextValue : fallback;
    };
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
        readAloud?: Partial<ConditionSpec["motion"]["readAloud"]>;
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
        fontFamily: normalizeFontFamily(parsed.typography?.fontFamily),
        fontColor: isHexColor(parsed.typography?.fontColor)
          ? parsed.typography.fontColor
          : conditionSpec.typography.fontColor,
        backgroundColor: isHexColor(parsed.typography?.backgroundColor)
          ? parsed.typography.backgroundColor
          : conditionSpec.typography.backgroundColor,
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
            numberOrDefault(
              parsed.typography?.paragraphStaircase?.indentStepCh,
              conditionSpec.typography.paragraphStaircase.indentStepCh,
            ),
          ),
          indentMode:
            parsed.typography?.paragraphStaircase?.indentMode === "line" ||
            parsed.typography?.paragraphStaircase?.indentMode === "sentence"
              ? parsed.typography.paragraphStaircase.indentMode
              : conditionSpec.typography.paragraphStaircase.indentMode,
          maxWidthCh: Math.max(
            0,
            numberOrDefault(
              parsed.typography?.paragraphStaircase?.maxWidthCh,
              conditionSpec.typography.paragraphStaircase.maxWidthCh,
            ),
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
            numberOrDefault(
              parsed.typography?.sentenceMarkers?.gapCh,
              conditionSpec.typography.sentenceMarkers.gapCh,
            ),
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
          mode: "jump",
          jumpRateHz: clamp(
            Number(parsed.typography?.rsvpHighlight?.jumpRateHz) ||
              conditionSpec.typography.rsvpHighlight.jumpRateHz,
            HIGHLIGHT_JUMP_RATE_MIN,
            HIGHLIGHT_JUMP_RATE_MAX,
          ),
          tieToFlow:
            typeof parsed.typography?.rsvpHighlight?.tieToFlow === "boolean"
              ? parsed.typography.rsvpHighlight.tieToFlow
              : conditionSpec.typography.rsvpHighlight.tieToFlow,
          allowBoundaryCrossing:
            typeof parsed.typography?.rsvpHighlight?.allowBoundaryCrossing ===
            "boolean"
              ? parsed.typography.rsvpHighlight.allowBoundaryCrossing
              : conditionSpec.typography.rsvpHighlight.allowBoundaryCrossing,
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
        readAloud: {
          ...conditionSpec.motion.readAloud,
          ...parsed.motion?.readAloud,
          enabled:
            typeof parsed.motion?.readAloud?.enabled === "boolean"
              ? parsed.motion.readAloud.enabled
              : conditionSpec.motion.readAloud.enabled,
          voiceURI:
            typeof parsed.motion?.readAloud?.voiceURI === "string"
              ? parsed.motion.readAloud.voiceURI
              : conditionSpec.motion.readAloud.voiceURI,
        },
        rateControl: {
          ...conditionSpec.motion.rateControl,
          ...parsed.motion?.rateControl,
          source: "mouseY",
          invert: true,
          minCps: Math.max(
            1,
            numberOrDefault(
              parsed.motion?.rateControl?.minCps,
              conditionSpec.motion.rateControl.minCps,
            ),
          ),
          maxCps: Math.max(
            1,
            numberOrDefault(
              parsed.motion?.rateControl?.maxCps,
              conditionSpec.motion.rateControl.maxCps,
            ),
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
    setSettingsModalStatus("");
    setShareLinkFallback("");
  }, []);

  const handleUploadSettingsFile = useCallback(
    async (file: File) => {
      await handleImportSettingsText(await file.text());
    },
    [handleImportSettingsText],
  );

  useEffect(() => {
    let cancelled = false;

    const loadSharedPayload = async () => {
      const hash = window.location.hash.slice(1);
      if (!hash.startsWith(SHARE_HASH_PREFIX)) {
        return;
      }

      try {
        const payload = await decodeSharePayload(
          hash.slice(SHARE_HASH_PREFIX.length),
        );
        if (cancelled) {
          return;
        }
        await handleImportSettingsText(JSON.stringify(payload.settings));
        if (typeof payload.text === "string") {
          sharedTextLoadedRef.current = true;
          setText(payload.text);
        }
        setSettingsModalError("");
        setSettingsModalStatus("Shared settings loaded.");
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "Failed to load share link.";
        setSettingsModalError(message);
        setSettingsModalStatus("");
      }
    };

    void loadSharedPayload();
    return () => {
      cancelled = true;
    };
  }, [handleImportSettingsText]);

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
                  ref={exportViewportRef}
                  className={`relative h-full w-full overflow-hidden ${
                    isLoopCaptureActive ? "cursor-none [&_*]:cursor-none" : ""
                  }`}
                >
                  <div
                    ref={loopCaptureRepaintRef}
                    className="pointer-events-none absolute left-0 top-0 z-[1] h-px w-px"
                    data-loop-capture-repaint="true"
                    aria-hidden="true"
                  />
                  <div
                    className="absolute left-1/2 top-1/2"
                    style={{
                      width: `${10000 / viewportWidthPercent}%`,
                      height: `${10000 / viewportHeightPercent}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <div className="relative h-full w-full">
                      <Viewport
                        spec={spec}
                        viewportStep={viewportStep}
                        rsvpToken={currentRsvpToken}
                        continuousText={text}
                        highlightJumpRateHz={effectiveHighlightJumpRateHz}
                        resetContinuousHighlightKey={resetContinuousHighlightKey}
                        rsvpHighlightJumpDurationMs={currentRsvpTokenDurationMs}
                        manualAdvanceEnabled={canManualAdvance}
                        onManualAdvance={() => advanceRsvp("manual")}
                        onViewportMouseMove={handleViewportMouseMove}
                        onViewportMouseLeave={handleViewportMouseLeave}
                      />
                    </div>
                  </div>
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
                      if (isLoopExporting) {
                        return;
                      }
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
                  if (isLoopExporting) {
                    return;
                  }
                  setIsResizingPanel(true);
                }}
              />
              <aside
                className="shrink-0 overflow-y-auto p-4"
                style={{ width: settingsWidth }}
              >
                <SettingsPanel
                  text={text}
                  setText={setText}
                  spec={spec}
                  setSpec={setSpec}
                  viewportStep={viewportStep}
                  applyViewportStep={applyViewportStep}
                  effectiveAdvanceStep={effectiveAdvanceStep}
                  maxAdvanceStep={maxAdvanceStep}
                  setAdvanceStep={setAdvanceStep}
                  viewportWidthPercent={viewportWidthPercent}
                  setViewportWidthPercent={setViewportWidthPercent}
                  viewportHeightPercent={viewportHeightPercent}
                  setViewportHeightPercent={setViewportHeightPercent}
                  setAutoplay={setAutoplay}
                  rsvpIndexRef={rsvpIndexRef}
                  setRsvpIndex={setRsvpIndex}
                  appendLog={appendLog}
                  safeRsvpIndex={safeRsvpIndex}
                  rsvpTokens={rsvpTokens}
                  canManualAdvance={canManualAdvance}
                  speechVoices={speechVoices}
                  setResetContinuousHighlightKey={setResetContinuousHighlightKey}
                  rsvpHighlight={rsvpHighlight}
                  effectiveHighlightJumpRateHz={effectiveHighlightJumpRateHz}
                  highlightStep={highlightStep}
                  allowedHighlightSteps={allowedHighlightSteps}
                  highlightStepIndex={highlightStepIndex}
                  setIsSpecModalOpen={setIsSpecModalOpen}
                />
              </aside>
            </>
          ) : null}
        </div>
      </div>

      <SettingsJsonModal
        isOpen={isSpecModalOpen}
        settingsName={settingsName}
        settingsPayload={settingsPayload}
        loopExportDurationSeconds={loopExportDurationSeconds}
        loopExportDurationSecondsMin={LOOP_EXPORT_DURATION_SECONDS_MIN}
        loopExportDurationSecondsMax={LOOP_EXPORT_DURATION_SECONDS_MAX}
        settingsModalError={settingsModalError}
        settingsModalStatus={settingsModalStatus}
        shareLinkFallback={shareLinkFallback}
        loopExportError={loopExportError}
        loopExportStatus={loopExportStatus}
        isLoopExporting={isLoopExporting}
        settingsFileInputRef={settingsFileInputRef}
        onClose={() => setIsSpecModalOpen(false)}
        onSettingsNameChange={setSettingsName}
        onLoopExportDurationChange={handleLoopExportDurationChange}
        onLoopExportDurationBlur={handleLoopExportDurationBlur}
        onDownloadSettings={handleDownloadSettings}
        onExportLoop={() => void handleExportLoop()}
        onCopyShareLink={() => void handleCopyShareLink()}
        onResetDefaults={handleResetDefaults}
        onSettingsFileChange={handleSettingsFileChange}
      />
    </main>
  );
}
