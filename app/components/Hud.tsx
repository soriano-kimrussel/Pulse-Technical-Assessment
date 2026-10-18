"use client";

import { useState } from "react";
import type { PeerDot } from "@/lib/types";
import { getVibe, VIBES, type VibeId } from "@/lib/vibes";
import { CrosshairIcon, LogoutIcon, ShuffleIcon } from "./icons";

export default function Hud({
  peers,
  myVibe,
  filter,
  onFilter,
  onLeave,
  onRecenter,
  onSurprise,
  canConnect,
  inChat,
}: {
  peers: PeerDot[];
  myVibe: VibeId;
  filter: VibeId | null;
  onFilter: (v: VibeId | null) => void;
  onLeave: () => void;
  onRecenter: () => void;
  onSurprise: () => void;
  canConnect: boolean;
  inChat: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const talking = peers.filter((p) => p.busy).length;
  const available = peers.filter((p) => !p.busy && (filter === null || p.vibe === filter));
  const counts = new Map<VibeId, number>();
  for (const p of peers) counts.set(p.vibe, (counts.get(p.vibe) ?? 0) + 1);
  const mine = getVibe(myVibe);

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <>
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3 sm:p-4 ${
          inChat ? "md:pr-[452px]" : ""
        }`}
      >
        <div className="glass anim-fade-up pointer-events-auto flex items-center gap-3 rounded-full py-2 pl-3 pr-4">
          <span className="live-dot" aria-hidden="true" />
          <span className="text-gradient text-sm font-semibold tracking-tight">Pulse</span>
          <span className="h-4 w-px bg-line" aria-hidden="true" />
          <span className="text-xs text-muted" aria-live="polite">
            <span className="font-medium text-ink">{peers.length}</span>{" "}
            {peers.length === 1 ? "other" : "others"} online
            {talking > 1 && (
              <span className="hidden sm:inline">
                {" · "}
                <span className="font-medium text-ink">{Math.floor(talking / 2)}</span> talking
              </span>
            )}
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <span
            className="glass anim-fade-up hidden items-center gap-1.5 rounded-full px-3 py-2 text-xs text-muted sm:flex"
            title="Your vibe"
          >
            <span aria-hidden="true">{mine.emoji}</span>
            {mine.label}
          </span>
          <button
            onClick={onLeave}
            className="glass anim-fade-up flex items-center gap-1.5 rounded-full px-3 py-2 text-xs text-muted transition hover:text-ink"
          >
            <LogoutIcon size={14} />
            Leave
          </button>
        </div>
      </div>

      {peers.length === 0 && !inChat && (
        <div className="pointer-events-none absolute inset-x-0 top-20 z-10 flex justify-center px-4">
          <div className="glass anim-fade-up pointer-events-auto max-w-sm rounded-2xl px-5 py-4 text-center">
            <p className="text-sm font-medium text-ink">It&rsquo;s quiet out there right now</p>
            <p className="mt-1 text-xs text-muted">
              New dots appear the moment someone joins. Bring a friend to break the silence.
            </p>
            <button onClick={copyInvite} className="btn-ghost mt-3 rounded-full px-4 py-1.5 text-xs">
              {copied ? "Link copied ✓" : "Copy invite link"}
            </button>
          </div>
        </div>
      )}

      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 p-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:p-4 ${
          inChat ? "hidden md:flex md:pr-[452px]" : ""
        }`}
      >
        <div className="flex w-full max-w-2xl items-end justify-between gap-2">
          <div className="glass anim-fade-up pointer-events-auto no-scrollbar flex min-w-0 gap-1 overflow-x-auto rounded-full p-1">
            <FilterChip active={filter === null} onClick={() => onFilter(null)}>
              All <span className="text-faint">{peers.length}</span>
            </FilterChip>
            {VIBES.map((v) => (
              <FilterChip
                key={v.id}
                active={filter === v.id}
                color={v.color}
                onClick={() => onFilter(filter === v.id ? null : v.id)}
                title={v.label}
              >
                <span aria-hidden="true">{v.emoji}</span>
                <span className="sr-only">{v.label}</span>
                <span className="text-faint">{counts.get(v.id) ?? 0}</span>
              </FilterChip>
            ))}
          </div>
          <button
            onClick={onRecenter}
            className="glass anim-fade-up pointer-events-auto grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition hover:text-ink"
            aria-label="Center on me"
            title="Center on me"
          >
            <CrosshairIcon size={17} />
          </button>
        </div>

        {canConnect && available.length > 0 && (
          <button
            onClick={onSurprise}
            className="btn-primary anim-fade-up pointer-events-auto flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold"
          >
            <ShuffleIcon size={16} />
            Surprise me
          </button>
        )}
        {canConnect && peers.length > 0 && (
          <p className="pointer-events-none text-[11px] text-faint">or tap any glowing dot</p>
        )}
      </div>
    </>
  );
}

function FilterChip({
  active,
  color,
  onClick,
  title,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
        active ? "bg-white/10 text-ink" : "text-muted hover:text-ink"
      }`}
      style={active && color ? { boxShadow: `inset 0 0 0 1px ${color}` } : undefined}
    >
      {children}
    </button>
  );
}
