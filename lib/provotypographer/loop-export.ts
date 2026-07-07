export type LoopExportResult = {
  blob: Blob;
  extension: "mp4" | "webm";
  mimeType: string;
};

export type LoopExportInput = {
  viewportNode: HTMLElement;
};

export type LoopExportOptions = {
  durationMs?: number;
  fps?: number;
  maxDimensionPx?: number;
  onProgress?: (progress: { elapsedMs: number; durationMs: number }) => void;
  onBeforeCapture?: () => Promise<void> | void;
  onCaptureReady?: () => Promise<void> | void;
  expectMotion?: boolean;
};

type MimeCandidate = {
  mimeType: string;
  extension: "mp4" | "webm";
};

type CropTargetConstructor = {
  fromElement: (element: Element) => Promise<unknown>;
};

type BrowserCaptureTrack = MediaStreamTrack & {
  cropTo?: (cropTarget: unknown) => Promise<void>;
};

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: unknown) => void,
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const MIME_CANDIDATES: MimeCandidate[] = [
  { mimeType: "video/mp4;codecs=h264", extension: "mp4" },
  { mimeType: "video/mp4", extension: "mp4" },
  { mimeType: "video/webm;codecs=vp9", extension: "webm" },
  { mimeType: "video/webm;codecs=vp8", extension: "webm" },
  { mimeType: "video/webm", extension: "webm" },
];

const failedMimeTypes = new Set<string>();

function getSupportedMimeTypes() {
  if (typeof MediaRecorder === "undefined") {
    return [];
  }

  return MIME_CANDIDATES.filter(
    (candidate) =>
      !failedMimeTypes.has(candidate.mimeType) &&
      MediaRecorder.isTypeSupported(candidate.mimeType),
  );
}

function getDisplayMediaOptions(fps: number): DisplayMediaStreamOptions {
  return {
    video: {
      frameRate: { ideal: fps },
      displaySurface: "browser",
      cursor: "never",
    },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
  } as DisplayMediaStreamOptions;
}

function getCropTargetConstructor() {
  const maybeWindow = window as typeof window & {
    CropTarget?: CropTargetConstructor;
  };
  return maybeWindow.CropTarget;
}

async function cropStreamToViewport(
  stream: MediaStream,
  viewportNode: HTMLElement,
) {
  const [track] = stream.getVideoTracks();
  const browserTrack = track as BrowserCaptureTrack | undefined;
  const settings = track?.getSettings() as MediaTrackSettings & {
    displaySurface?: string;
  };
  const CropTarget = getCropTargetConstructor();

  if (!CropTarget?.fromElement || !browserTrack?.cropTo) {
    throw new Error(
      "This browser does not support viewport-only Region Capture. Use Chrome desktop and choose this tab.",
    );
  }

  if (
    settings.displaySurface &&
    settings.displaySurface !== "browser"
  ) {
    throw new Error("Choose this browser tab to export the exact viewport.");
  }

  const cropTarget = await CropTarget.fromElement(viewportNode);
  await browserTrack.cropTo(cropTarget);
}

function waitForVideoReady(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("Timed out while preparing the captured tab."));
    }, 5000);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadedmetadata", handleLoaded);
      video.removeEventListener("error", handleError);
    };
    const handleLoaded = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Failed to read the captured tab stream."));
    };

    video.addEventListener("loadedmetadata", handleLoaded);
    video.addEventListener("error", handleError);
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      cleanup();
      resolve();
    }
  });
}

function waitForRecorderStop(recorder: MediaRecorder) {
  return new Promise<void>((resolve, reject) => {
    recorder.addEventListener(
      "error",
      () => reject(new Error("Video recording failed.")),
      { once: true },
    );
    recorder.addEventListener("stop", () => resolve(), { once: true });
  });
}

function waitForAnimationFrame() {
  return new Promise<number>((resolve) => {
    window.requestAnimationFrame(resolve);
  });
}

async function waitForPaintFrames(count = 2) {
  for (let index = 0; index < count; index += 1) {
    await waitForAnimationFrame();
  }
}

function waitForCapturedVideoFrame(video: HTMLVideoElement, timeoutMs = 5000) {
  const videoWithFrameCallback = video as VideoWithFrameCallback;
  if (!videoWithFrameCallback.requestVideoFrameCallback) {
    return waitForPaintFrames(2);
  }

  return new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out while waiting for the captured viewport frame."));
    }, timeoutMs);
    let frameCallbackId: number | null = null;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      if (
        frameCallbackId != null &&
        videoWithFrameCallback.cancelVideoFrameCallback
      ) {
        videoWithFrameCallback.cancelVideoFrameCallback(frameCallbackId);
      }
    };

    frameCallbackId = videoWithFrameCallback.requestVideoFrameCallback(() => {
      cleanup();
      resolve();
    });
  });
}

function waitForRecordedVideoPlayable(blob: Blob) {
  return new Promise<void>((resolve, reject) => {
    if (blob.size === 0) {
      reject(new Error("Recorded video was empty."));
      return;
    }

    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Recorded video was not playable."));
    }, 5000);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.pause();
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("playing", handlePlayable);
      video.removeEventListener("timeupdate", handlePlayable);
      video.removeEventListener("error", handleError);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };

    const handlePlayable = () => {
      cleanup();
      resolve();
    };
    const handleLoadedMetadata = () => {
      if (!video.videoWidth || !video.videoHeight) {
        cleanup();
        reject(new Error("Recorded video had no visible frames."));
        return;
      }

      void video.play().catch((error: unknown) => {
        cleanup();
        reject(
          error instanceof Error
            ? error
            : new Error("Recorded video could not be played."),
        );
      });
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Recorded video could not be loaded."));
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("playing", handlePlayable);
    video.addEventListener("timeupdate", handlePlayable);
    video.addEventListener("error", handleError);
    video.src = url;
    video.load();
  });
}

function readVideoFrame(video: HTMLVideoElement) {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) {
    throw new Error("Captured viewport had no visible frames.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Could not inspect captured viewport frames.");
  }

  context.drawImage(video, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

function framesDiffer(
  firstFrame: Uint8ClampedArray,
  nextFrame: Uint8ClampedArray,
) {
  if (firstFrame.length !== nextFrame.length) {
    return true;
  }

  const sentinelPixelDelta =
    Math.abs(firstFrame[0] - nextFrame[0]) +
    Math.abs(firstFrame[1] - nextFrame[1]) +
    Math.abs(firstFrame[2] - nextFrame[2]);
  if (sentinelPixelDelta >= 2) {
    return true;
  }

  let changedPixels = 0;
  let totalDelta = 0;
  for (let index = 0; index < firstFrame.length; index += 4) {
    const pixelDelta =
      Math.abs(firstFrame[index] - nextFrame[index]) +
      Math.abs(firstFrame[index + 1] - nextFrame[index + 1]) +
      Math.abs(firstFrame[index + 2] - nextFrame[index + 2]);
    if (pixelDelta > 0) {
      changedPixels += 1;
      totalDelta += pixelDelta;
    }
    if (changedPixels >= 64 && totalDelta >= 1024) {
      return true;
    }
  }

  return false;
}

function getStaticCaptureError() {
  return new Error(
    "Captured viewport stayed static; export was canceled to avoid downloading a frozen autoplay loop.",
  );
}

async function validateCapturedMotion(video: HTMLVideoElement) {
  const firstFrame = readVideoFrame(video);

  try {
    for (let index = 0; index < 8; index += 1) {
      await waitForCapturedVideoFrame(video, 1000);
      if (framesDiffer(firstFrame, readVideoFrame(video))) {
        return;
      }
    }
  } catch {
    throw getStaticCaptureError();
  }

  throw getStaticCaptureError();
}

async function recordStream({
  stream,
  mimeCandidate,
  durationMs,
  onProgress,
}: {
  stream: MediaStream;
  mimeCandidate: MimeCandidate;
  durationMs: number;
  onProgress?: LoopExportOptions["onProgress"];
}) {
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType: mimeCandidate.mimeType,
  });
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  });

  const stopPromise = waitForRecorderStop(recorder);
  recorder.start(1000);
  const startedAt = performance.now();
  let lastProgressAt = startedAt - 250;
  let elapsedMs = 0;

  while (elapsedMs < durationMs) {
    await waitForAnimationFrame();
    const now = performance.now();
    elapsedMs = now - startedAt;
    if (now - lastProgressAt >= 250 || elapsedMs >= durationMs) {
      lastProgressAt = now;
      onProgress?.({
        elapsedMs: Math.min(elapsedMs, durationMs),
        durationMs,
      });
    }
  }

  if (recorder.state === "recording") {
    recorder.requestData();
    recorder.stop();
  }
  await stopPromise;

  return new Blob(chunks, { type: mimeCandidate.mimeType });
}

export async function exportViewportLoop(
  { viewportNode }: LoopExportInput,
  {
    durationMs = 5000,
    fps = 30,
    onProgress,
    onBeforeCapture,
    onCaptureReady,
    expectMotion = false,
  }: LoopExportOptions = {},
): Promise<LoopExportResult> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("This browser does not support exact tab capture.");
  }

  const supportedMimeTypes = getSupportedMimeTypes();
  if (!supportedMimeTypes.length) {
    throw new Error("This browser does not support video recording.");
  }

  await onBeforeCapture?.();

  let displayStream: MediaStream;
  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia(
      getDisplayMediaOptions(fps),
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      throw new Error("Export canceled.");
    }
    throw error;
  }

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = displayStream;

  try {
    await cropStreamToViewport(displayStream, viewportNode);
    await waitForVideoReady(video);
    await video.play();
    await onCaptureReady?.();
    try {
      await waitForCapturedVideoFrame(video);
    } catch (error) {
      if (expectMotion) {
        throw getStaticCaptureError();
      }
      throw error;
    }
    if (expectMotion) {
      await validateCapturedMotion(video);
    }

    for (const supportedMimeType of supportedMimeTypes) {
      const blob = await recordStream({
        stream: displayStream,
        mimeCandidate: supportedMimeType,
        durationMs,
        onProgress,
      });

      try {
        await waitForRecordedVideoPlayable(blob);
        return {
          blob,
          extension: supportedMimeType.extension,
          mimeType: supportedMimeType.mimeType,
        };
      } catch {
        failedMimeTypes.add(supportedMimeType.mimeType);
      }
    }
  } finally {
    displayStream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }

  throw new Error("This browser could not create a playable video loop.");
}
