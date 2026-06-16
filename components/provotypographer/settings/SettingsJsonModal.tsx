import type { ChangeEvent, RefObject } from "react";

import type { SettingsJson } from "@/lib/provotypographer/core";

function SettingsActionIcon({
  name,
}: {
  name: "download" | "upload" | "link" | "reset";
}) {
  const commonProps = {
    className: "h-4 w-4",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };

  if (name === "download") {
    return (
      <svg {...commonProps}>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
    );
  }

  if (name === "upload") {
    return (
      <svg {...commonProps}>
        <path d="M12 21V9" />
        <path d="m7 14 5-5 5 5" />
        <path d="M5 3h14" />
      </svg>
    );
  }

  if (name === "link") {
    return (
      <svg {...commonProps}>
        <path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
        <path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 3v6h6" />
    </svg>
  );
}

export function SettingsJsonModal({
  isOpen,
  settingsName,
  settingsPayload,
  settingsModalError,
  settingsModalStatus,
  shareLinkFallback,
  settingsFileInputRef,
  onClose,
  onSettingsNameChange,
  onDownloadSettings,
  onCopyShareLink,
  onResetDefaults,
  onSettingsFileChange,
}: {
  isOpen: boolean;
  settingsName: string;
  settingsPayload: SettingsJson;
  settingsModalError: string;
  settingsModalStatus: string;
  shareLinkFallback: string;
  settingsFileInputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onSettingsNameChange: (value: string) => void;
  onDownloadSettings: () => void;
  onCopyShareLink: () => void;
  onResetDefaults: () => void;
  onSettingsFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-3xl rounded border border-zinc-300 bg-white p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">ConditionSpec</h2>
          <button
            type="button"
            className="rounded border border-zinc-300 px-2 py-1 text-xs"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="mb-3 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto_auto_auto]">
          <label className="flex flex-col gap-1 text-sm">
            Name
            <input
              type="text"
              className="rounded border border-zinc-300 px-2 py-1"
              value={settingsName}
              onChange={(event) => onSettingsNameChange(event.target.value)}
            />
          </label>
          <div className="flex flex-col gap-1 self-end">
            <span className="text-xs text-zinc-500">File</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded border border-zinc-300 px-3 py-1 text-sm"
                onClick={onDownloadSettings}
              >
                <SettingsActionIcon name="download" />
                <span>Download JSON</span>
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded border border-zinc-300 px-3 py-1 text-sm"
                onClick={() => settingsFileInputRef.current?.click()}
              >
                <SettingsActionIcon name="upload" />
                <span>Upload JSON</span>
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1 self-end">
            <span className="text-xs text-zinc-500">Share</span>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded border border-zinc-300 px-3 py-1 text-sm"
              onClick={onCopyShareLink}
            >
              <SettingsActionIcon name="link" />
              <span>Copy Share Link</span>
            </button>
          </div>
          <div className="flex flex-col gap-1 self-end">
            <span className="text-xs text-zinc-500">Defaults</span>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded border border-zinc-300 px-3 py-1 text-sm"
              onClick={onResetDefaults}
            >
              <SettingsActionIcon name="reset" />
              <span>Reset Defaults</span>
            </button>
          </div>
          <input
            ref={settingsFileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onSettingsFileChange}
          />
        </div>
        {settingsModalError ? (
          <p className="mb-3 text-xs text-red-600">{settingsModalError}</p>
        ) : null}
        {settingsModalStatus ? (
          <p className="mb-3 text-xs text-zinc-600">{settingsModalStatus}</p>
        ) : null}
        {shareLinkFallback ? (
          <label className="mb-3 flex flex-col gap-1 text-xs text-zinc-600">
            Share Link
            <textarea
              className="min-h-20 rounded border border-zinc-300 p-2 font-mono text-xs text-zinc-900"
              readOnly
              value={shareLinkFallback}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
        ) : null}
        <pre className="max-h-[70vh] overflow-auto rounded border border-zinc-200 p-3 text-xs">
          {JSON.stringify(settingsPayload, null, 2)}
        </pre>
      </div>
    </div>
  );
}
