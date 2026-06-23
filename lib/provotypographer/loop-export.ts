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
  onCaptureReady?: () => Promise<void> | void;
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
  let elapsedMs = 0;

  while (elapsedMs < durationMs) {
    await waitForAnimationFrame();
    elapsedMs = performance.now() - startedAt;
    onProgress?.({
      elapsedMs: Math.min(elapsedMs, durationMs),
      durationMs,
    });
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
    onCaptureReady,
  }: LoopExportOptions = {},
): Promise<LoopExportResult> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("This browser does not support exact tab capture.");
  }

  const supportedMimeTypes = getSupportedMimeTypes();
  if (!supportedMimeTypes.length) {
    throw new Error("This browser does not support video recording.");
  }

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
    await waitForAnimationFrame();

    for (const supportedMimeType of supportedMimeTypes) {
      const blob = await recordStream({
        stream: displayStream,
        mimeCandidate: supportedMimeType,
        durationMs,
        onProgress,
      });

      if (blob.size > 0) {
        return {
          blob,
          extension: supportedMimeType.extension,
          mimeType: supportedMimeType.mimeType,
        };
      }

      failedMimeTypes.add(supportedMimeType.mimeType);
    }
  } finally {
    displayStream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }

  throw new Error("This browser could not create a playable video loop.");
}
