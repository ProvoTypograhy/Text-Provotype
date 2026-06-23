export type ConditionSpec = {
  version: "0.1";
  mode: "rsvp" | "continuous";
  window: { width: number; height: number };
  tokenization: { unit: "char" | "word" | "chunk" | "sentence" | "paragraph"; chunkSize: number };
  typography: {
    fontFamily: string;
    fontColor: string;
    backgroundColor: string;
    fontSizePx: number;
    lineHeight: number;
    useViewportWidth: boolean;
    lineWidthPx: number;
    viewportPaddingPx: number;
    alignment: "left" | "center" | "right" | "justify";
    letterSpacingPx: number;
    wordSpacingPx: number;
    paragraphStaircase: {
      enabled: boolean;
      indentStepCh: number;
      indentMode: "sentence" | "line";
      maxWidthCh: number;
    };
    sentenceMarkers: {
      enabled: boolean;
      position: "both" | "start" | "end";
      variationMode: "shape" | "color" | "both";
      mode: "sentence" | "line";
      sizeEm: number;
      gapCh: number;
    };
    rsvpHighlight: {
      enabled: boolean;
      unit: "char" | "word" | "sentence" | "paragraph";
      size: number;
      style: "bold" | "background" | "outline";
      mode: "jump";
      jumpRateHz: number;
      tieToFlow: boolean;
      allowBoundaryCrossing: boolean;
    };
    variableAxes?: Record<string, number>;
  };
  motion: {
    autoplay: boolean;
    speed: { unit: "cps" | "pxps"; value: number };
    rateControl: {
      enabled: boolean;
      source: "mouseY";
      minCps: number;
      maxCps: number;
      invert: boolean;
      resetOnLeave: boolean;
    };
    direction: "vertical" | "horizontal";
    wrapVerticalText: boolean;
    progression: "continuous" | "step";
    pauseAtPunctuation: { enabled: boolean; delayMs: number };
  };
};

export const conditionSpec: ConditionSpec = {
  version: "0.1",
  mode: "rsvp",
  window: { width: 1280, height: 720 },
  tokenization: { unit: "word", chunkSize: 1 },
  typography: {
    fontFamily: "Geist",
    fontColor: "#171717",
    backgroundColor: "#ffffff",
    fontSizePx: 20,
    lineHeight: 1.4,
    useViewportWidth: true,
    lineWidthPx: 720,
    viewportPaddingPx: 16,
    alignment: "center",
    letterSpacingPx: 0,
    wordSpacingPx: 0,
    paragraphStaircase: {
      enabled: false,
      indentStepCh: 2,
      indentMode: "sentence",
      maxWidthCh: 0,
    },
    sentenceMarkers: {
      enabled: false,
      position: "both",
      variationMode: "both",
      mode: "sentence",
      sizeEm: 0.9,
      gapCh: 0.6,
    },
    rsvpHighlight: {
      enabled: false,
      unit: "char",
      size: 1,
      style: "background",
      mode: "jump",
      jumpRateHz: 4,
      tieToFlow: true,
      allowBoundaryCrossing: false,
    },
    variableAxes: { wght: 450, wdth: 100, opsz: 36 },
  },
  motion: {
    autoplay: true,
    speed: { unit: "cps", value: 10 },
    rateControl: {
      enabled: false,
      source: "mouseY",
      minCps: 8,
      maxCps: 60,
      invert: true,
      resetOnLeave: true,
    },
    direction: "horizontal",
    wrapVerticalText: true,
    progression: "step",
    pauseAtPunctuation: { enabled: false, delayMs: 250 },
  },
};

export const conditionSpecJson = JSON.stringify(conditionSpec, null, 2);
