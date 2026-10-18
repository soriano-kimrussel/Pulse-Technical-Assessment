"use client";

import { useEffect } from "react";
import type { Vibe } from "@/lib/vibes";

export default function ConnectionPrompt({
  title,
  subtitle,
  vibe,
  icon,
  acceptLabel,
  declineLabel,
  countdownMs,
  onAccept,
  onDecline,
}: {
  title: string;
  subtitle?: string;
  vibe?: Vibe;
  icon?: React.ReactNode;
  acceptLabel: string;
  declineLabel: string;
  countdownMs?: number;
  onAccept: () => void;
  onDecline: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDecline();
      if (e.key === "Enter" && !(e.target instanceof HTMLInputElement)) onAccept();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAccept, onDecline]);

  const color = vibe?.color ?? "var(--accent)";

  return (
    <div
      className="anim-fade-in absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-6 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-title"
    >
      <div className="glass-strong anim-pop-in relative w-full max-w-sm overflow-hidden rounded-[28px] p-7 text-center">
        <div
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full opacity-40 blur-3xl"
          style={{ background: color }}
          aria-hidden="true"
        />
        <div className="relative mx-auto grid h-16 w-16 place-items-center">
          <span
            className="absolute inset-0 rounded-full"
            style={{ background: `color-mix(in srgb, ${color} 22%, transparent)`, boxShadow: `0 0 0 1px ${color}` }}
          />
          <span className="pulse-dot__ring" style={{ inset: 0, borderColor: color }} aria-hidden="true" />
          <span className="relative text-2xl">{icon ?? vibe?.emoji}</span>
        </div>

        <h2 id="prompt-title" className="relative mt-4 text-lg font-semibold text-ink">
          {title}
        </h2>
        {subtitle && <p className="relative mt-1 text-sm text-muted">{subtitle}</p>}

        <div className="relative mt-6 flex gap-3">
          <button
            onClick={onDecline}
            className="btn-ghost flex-1 rounded-2xl px-4 py-3 text-sm font-medium text-muted"
          >
            {declineLabel}
          </button>
          <button
            onClick={onAccept}
            autoFocus
            className="btn-primary flex-1 rounded-2xl px-4 py-3 text-sm font-semibold"
          >
            {acceptLabel}
          </button>
        </div>

        {countdownMs !== undefined && (
          <div className="relative mt-5 h-1 overflow-hidden rounded-full bg-white/5" aria-hidden="true">
            <div
              className="countdown h-full rounded-full"
              style={{ background: color, ["--duration" as string]: `${countdownMs}ms` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
