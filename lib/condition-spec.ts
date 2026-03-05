export type ConditionSpec = {
  version: "0.1";
  mode: "rsvp" | "continuous";
  window: { width: number; height: number };
  tokenization: { unit: "char" | "word" | "chunk" | "sentence" | "paragraph"; chunkSize: number };
  typography: {
    fontFamily: string;
    fontSizePx: number;
    lineHeight: number;
    useViewportWidth: boolean;
    lineWidthPx: number;
    viewportPaddingPx: number;
    alignment: "left" | "center" | "right" | "justify";
    letterSpacingPx: number;
    wordSpacingPx: number;
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
    fontSizePx: 36,
    lineHeight: 1.4,
    useViewportWidth: true,
    lineWidthPx: 720,
    viewportPaddingPx: 16,
    alignment: "center",
    letterSpacingPx: 0,
    wordSpacingPx: 0,
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
