"use client";

import { useEffect, useState } from "react";
import { stats } from "@/lib/api";
import { DEFAULT_VIBE, VIBES, type VibeId } from "@/lib/vibes";
import { LockIcon, PinIcon, SparkIcon } from "./icons";

export default function EntryGate({
  onEnter,
  notice,
}: {
  onEnter: (lat: number, lng: number, vibe: VibeId) => Promise<void>;
  notice?: string | null;
}) {
  const [status, setStatus] = useState<"idle" | "locating" | "joining" | "error">("idle");
  const [error, setError] = useState<string>("");
  const [vibe, setVibe] = useState<VibeId>(DEFAULT_VIBE);
  const [live, setLive] = useState<{ online: number; conversations: number } | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const s = await stats();
      if (active && s) setLive(s);
    };
    void load();
    const t = setInterval(load, 10_000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  function enter() {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setError("Your browser doesn't support location access.");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setStatus("joining");
        try {
          await onEnter(pos.coords.latitude, pos.coords.longitude, vibe);
        } catch {
          setStatus("error");
          setError("Couldn't reach Pulse. Check your connection and try again.");
        }
      },
      (err) => {
        setStatus("error");
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Pulse needs your location to drop your dot on the globe. Allow it in your browser and try again."
            : "Couldn't get your location. Please try again.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  const busy = status === "locating" || status === "joining";

  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center overflow-y-auto p-4 sm:items-center sm:p-6">
      <div className="glass-strong anim-fade-up my-auto w-full max-w-md rounded-[28px] p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <div className="orb shrink-0 scale-75" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <h1 className="text-gradient text-4xl font-semibold tracking-tight">Pulse</h1>
            <p className="mt-0.5 text-sm text-muted">A living globe of anonymous strangers.</p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2 text-xs text-muted" aria-live="polite">
          <span className="live-dot" aria-hidden="true" />
          {live ? (
            <span>
              <span className="font-medium text-ink">{live.online}</span> online now
              {live.conversations > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-ink">{live.conversations}</span>{" "}
                  {live.conversations === 1 ? "conversation" : "conversations"} happening
                </>
              )}
            </span>
          ) : (
            <span>Listening for heartbeats...</span>
          )}
        </div>

        <fieldset className="mt-6">
          <legend className="text-sm font-medium text-ink">What are you in the mood for?</legend>
          <p className="mt-0.5 text-xs text-faint">Your vibe colours your dot so the right people find you.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {VIBES.map((v) => {
              const selected = v.id === vibe;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVibe(v.id)}
                  aria-pressed={selected}
                  className="btn-ghost flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-sm"
                  style={
                    selected
                      ? {
                          borderColor: v.color,
                          background: `color-mix(in srgb, ${v.color} 14%, transparent)`,
                          boxShadow: `0 0 24px -8px ${v.color}`,
                        }
                      : undefined
                  }
                >
                  <span className="text-lg leading-none" aria-hidden="true">
                    {v.emoji}
                  </span>
                  <span className={selected ? "text-ink" : "text-muted"}>{v.label}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <button
          onClick={enter}
          disabled={busy}
          className="btn-primary mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-base font-semibold disabled:opacity-70"
        >
          {status === "locating"
            ? "Finding you..."
            : status === "joining"
              ? "Dropping your dot..."
              : "Enter Pulse"}
        </button>

        {(status === "error" || notice) && (
          <p role="alert" className="anim-fade-in mt-3 text-center text-sm text-danger">
            {status === "error" ? error : notice}
          </p>
        )}

        <ul className="mt-6 space-y-2.5 border-t border-line pt-5 text-xs text-muted">
          <li className="flex items-center gap-2.5">
            <PinIcon size={15} className="shrink-0 text-accent" />
            Your dot lands 1-3 km from you, never on your doorstep.
          </li>
          <li className="flex items-center gap-2.5">
            <LockIcon size={15} className="shrink-0 text-accent" />
            Chat and video go peer-to-peer. The server never sees them.
          </li>
          <li className="flex items-center gap-2.5">
            <SparkIcon size={15} className="shrink-0 text-accent" />
            No sign-up, no history. Close the tab and you&rsquo;re gone.
          </li>
        </ul>
      </div>
    </div>
  );
}
