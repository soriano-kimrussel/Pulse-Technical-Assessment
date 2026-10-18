"use client";

import { useEffect, useRef } from "react";
import type { MediaState } from "@/lib/webrtc";
import {
  ChatIcon,
  EyeIcon,
  EyeOffIcon,
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  VideoIcon,
  VideoOffIcon,
} from "./icons";

export default function VideoPanel({
  localStream,
  remoteStream,
  local,
  remote,
  unread,
  onToggleMic,
  onToggleCam,
  onToggleReveal,
  onOpenChat,
  onEnd,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  local: MediaState;
  remote: MediaState | null;
  unread: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleReveal: () => void;
  onOpenChat: () => void;
  onEnd: () => void;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localRef.current && localRef.current.srcObject !== localStream) {
      localRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current && remoteRef.current.srcObject !== remoteStream) {
      remoteRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const remoteCamOff = remote?.cam === false;

  return (
    <section
      className="anim-fade-in absolute inset-0 z-30 overflow-hidden bg-black md:inset-y-3 md:left-3 md:right-[452px] md:rounded-[28px] md:border md:border-line"
      aria-label="Video call"
    >
      <video ref={remoteRef} autoPlay playsInline className="h-full w-full bg-[#06080e] object-cover" />

      {(!remoteStream || remoteCamOff) && (
        <div className="sky absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="orb mx-auto" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p className="mt-6 text-sm text-muted">
              {remoteCamOff ? "Stranger turned their camera off" : "Waiting for stranger’s video..."}
            </p>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 bg-gradient-to-b from-black/60 to-transparent p-4 pt-[max(env(safe-area-inset-top),16px)]">
        {remoteStream && remote && !remote.revealed && !remoteCamOff && (
          <span className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-ink">
            <EyeOffIcon size={14} className="text-accent" />
            Stranger is blurred until they choose to reveal
          </span>
        )}
        {remote?.revealed && !remoteCamOff && (
          <span className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-ink">
            <EyeIcon size={14} className="text-accent" />
            Stranger revealed
          </span>
        )}
        {remote && !remote.mic && (
          <span className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-ink">
            <MicOffIcon size={14} className="text-danger" />
            Muted
          </span>
        )}
      </div>

      <div className="absolute right-4 top-[max(calc(env(safe-area-inset-top)+56px),64px)] w-28 overflow-hidden rounded-2xl border border-white/15 bg-zinc-900 shadow-2xl sm:w-40">
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          className={`mirror aspect-[3/4] w-full object-cover transition ${local.cam ? "" : "opacity-0"}`}
        />
        {!local.cam && (
          <div className="absolute inset-0 grid place-items-center text-faint">
            <VideoOffIcon size={20} />
          </div>
        )}
        <span
          className={`absolute inset-x-1.5 bottom-1.5 rounded-full px-2 py-0.5 text-center text-[10px] font-medium ${
            local.revealed ? "bg-accent text-emerald-950" : "bg-black/70 text-ink"
          }`}
        >
          {local.revealed ? "They see you" : "Blurred for them"}
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/70 to-transparent p-4 pb-[max(env(safe-area-inset-bottom),20px)] pt-16">
        {!local.revealed && local.cam && (
          <p className="anim-fade-up glass rounded-full px-3 py-1.5 text-center text-[11px] text-muted">
            You start blurred, so they only see colours and shapes. Reveal when you&rsquo;re comfortable.
          </p>
        )}
        <div className="glass flex items-center gap-2 rounded-full p-2">
          <RoundButton
            onClick={onToggleMic}
            active={local.mic}
            label={local.mic ? "Mute microphone" : "Unmute microphone"}
          >
            {local.mic ? <MicIcon /> : <MicOffIcon />}
          </RoundButton>
          <RoundButton
            onClick={onToggleCam}
            active={local.cam}
            label={local.cam ? "Turn camera off" : "Turn camera on"}
          >
            {local.cam ? <VideoIcon /> : <VideoOffIcon />}
          </RoundButton>
          <button
            onClick={onToggleReveal}
            disabled={!local.cam}
            className={`flex h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold transition disabled:opacity-40 ${
              local.revealed ? "btn-ghost" : "btn-primary"
            }`}
            aria-pressed={local.revealed}
          >
            {local.revealed ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
            {local.revealed ? "Blur me" : "Reveal me"}
          </button>
          <button
            onClick={onOpenChat}
            className="btn-ghost relative grid h-12 w-12 place-items-center rounded-full md:hidden"
            aria-label="Open chat"
          >
            <ChatIcon />
            {unread && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-accent" />}
          </button>
          <button
            onClick={onEnd}
            className="grid h-12 w-12 place-items-center rounded-full bg-danger text-white transition hover:brightness-110"
            aria-label="End video call"
            title="End video"
          >
            <PhoneOffIcon />
          </button>
        </div>
      </div>
    </section>
  );
}

function RoundButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-12 w-12 place-items-center rounded-full transition ${
        active ? "btn-ghost" : "bg-white text-zinc-900 hover:bg-white/90"
      }`}
    >
      {children}
    </button>
  );
}
