"use client";

import type { Vibe } from "@/lib/vibes";

export default function RequestingCard({
  vibe,
  distance,
  timeoutMs,
  onCancel,
}: {
  vibe: Vibe;
  distance: string | null;
  timeoutMs: number;
  onCancel: () => void;
}) {
  return (
    <div className="anim-drop-in absolute left-1/2 top-20 z-30 w-[min(92vw,380px)]">
      <div className="glass-strong overflow-hidden rounded-3xl">
        <div className="flex items-center gap-4 p-4">
          <div className="relative grid h-12 w-12 shrink-0 place-items-center">
            <span
              className="absolute inset-0 rounded-full"
              style={{ background: `color-mix(in srgb, ${vibe.color} 20%, transparent)` }}
            />
            <span className="spin-ring" aria-hidden="true" />
            <span className="relative text-xl" aria-hidden="true">
              {vibe.emoji}
            </span>
          </div>
          <div className="min-w-0 flex-1" aria-live="polite">
            <p className="text-sm font-medium text-ink">Knocking...</p>
            <p className="truncate text-xs text-muted">
              {vibe.label} stranger{distance ? ` · ${distance}` : ""}
            </p>
          </div>
          <button onClick={onCancel} className="btn-ghost rounded-full px-3.5 py-1.5 text-xs">
            Cancel
          </button>
        </div>
        <div className="h-0.5 bg-white/5" aria-hidden="true">
          <div
            className="countdown h-full"
            style={{ background: vibe.color, ["--duration" as string]: `${timeoutMs}ms` }}
          />
        </div>
      </div>
    </div>
  );
}
