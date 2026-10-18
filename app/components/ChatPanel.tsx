"use client";

import { useEffect, useRef, useState } from "react";
import type { Vibe } from "@/lib/vibes";
import { MAX_CHAT_LENGTH } from "@/lib/presence";
import { CloseIcon, SendIcon, ShieldIcon, VideoIcon } from "./icons";

export interface ChatMessage {
  id: number;
  from: "me" | "them" | "system";
  text: string;
  at: number;
}

const ICEBREAKERS = [
  "Hey 👋 what's the view like where you are?",
  "What are you listening to right now?",
  "Best thing that happened to you today?",
  "Tea, coffee, or something else?",
];

function timeLabel(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function ChatPanel({
  messages,
  connected,
  peerVibe,
  distance,
  remoteTyping,
  videoBusy,
  hiddenOnMobile,
  onSend,
  onTyping,
  onStartVideo,
  onBlock,
  onEnd,
  onCloseMobile,
}: {
  messages: ChatMessage[];
  connected: boolean;
  peerVibe: Vibe;
  distance: string | null;
  remoteTyping: boolean;
  videoBusy: boolean;
  hiddenOnMobile: boolean;
  onSend: (text: string) => void;
  onTyping: () => void;
  onStartVideo: () => void;
  onBlock: () => void;
  onEnd: () => void;
  onCloseMobile?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [confirmBlock, setConfirmBlock] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTypingSent = useRef(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, remoteTyping]);

  useEffect(() => {
    if (connected) inputRef.current?.focus({ preventScroll: true });
  }, [connected]);

  function send(text: string) {
    const clean = text.trim().slice(0, MAX_CHAT_LENGTH);
    if (!clean || !connected) return;
    onSend(clean);
    setDraft("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    send(draft);
  }

  function change(value: string) {
    setDraft(value);
    const now = Date.now();
    if (value && now - lastTypingSent.current > 2000) {
      lastTypingSent.current = now;
      onTyping();
    }
  }

  const hasChat = messages.some((m) => m.from !== "system");

  return (
    <aside
      className={`anim-slide-in-right absolute inset-0 z-40 flex flex-col bg-[var(--bg)] md:inset-y-3 md:left-auto md:right-3 md:w-[428px] md:rounded-[28px] md:bg-transparent ${
        hiddenOnMobile ? "hidden md:flex" : "flex"
      }`}
      aria-label="Chat with stranger"
    >
      <div className="glass-strong flex h-full flex-col overflow-hidden md:rounded-[28px]">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3 pt-[max(env(safe-area-inset-top),12px)]">
          <div className="relative grid h-10 w-10 shrink-0 place-items-center">
            <span
              className="absolute inset-0 rounded-full"
              style={{
                background: `color-mix(in srgb, ${peerVibe.color} 20%, transparent)`,
                boxShadow: `0 0 0 1px ${peerVibe.color}`,
              }}
            />
            {!connected && <span className="spin-ring" aria-hidden="true" />}
            <span className="relative text-lg" aria-hidden="true">
              {peerVibe.emoji}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">Stranger</p>
            <p className="flex items-center gap-1.5 truncate text-xs text-muted">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? "bg-accent" : "bg-amber-400"}`}
                aria-hidden="true"
              />
              {connected ? peerVibe.label : "Connecting peer-to-peer..."}
              {connected && distance ? ` · ${distance}` : ""}
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {onCloseMobile && (
              <button
                onClick={onCloseMobile}
                className="btn-ghost grid h-9 w-9 place-items-center rounded-full md:hidden"
                aria-label="Back to video"
              >
                <VideoIcon size={16} />
              </button>
            )}
            <button
              onClick={onStartVideo}
              disabled={!connected || videoBusy}
              className="btn-ghost grid h-9 w-9 place-items-center rounded-full disabled:opacity-35"
              aria-label="Start video call"
              title="Start video call"
            >
              <VideoIcon size={16} />
            </button>
            <button
              onClick={() => setConfirmBlock(true)}
              className="btn-ghost grid h-9 w-9 place-items-center rounded-full text-muted hover:text-danger"
              aria-label="Block stranger"
              title="Block"
            >
              <ShieldIcon size={16} />
            </button>
            <button
              onClick={onEnd}
              className="grid h-9 w-9 place-items-center rounded-full bg-danger/90 text-white transition hover:bg-danger"
              aria-label="Leave chat"
              title="Leave chat"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        </header>

        {confirmBlock && (
          <div className="anim-fade-in flex items-center gap-3 border-b border-line bg-danger/10 px-4 py-3 text-xs">
            <p className="flex-1 text-ink">
              Block this stranger? You&rsquo;ll both vanish from each other&rsquo;s map for the rest of the session.
            </p>
            <button onClick={() => setConfirmBlock(false)} className="btn-ghost rounded-full px-3 py-1.5">
              Cancel
            </button>
            <button
              onClick={onBlock}
              className="rounded-full bg-danger px-3 py-1.5 font-medium text-white hover:brightness-110"
            >
              Block
            </button>
          </div>
        )}

        <div className="flex-1 space-y-1.5 overflow-y-auto px-4 py-4" aria-live="polite">
          {!hasChat && (
            <div className="anim-fade-up mx-auto mt-6 max-w-xs text-center">
              <p className="text-3xl" aria-hidden="true">
                👋
              </p>
              <p className="mt-2 text-sm font-medium text-ink">
                {connected ? "You're connected. Say hi!" : "Opening a direct line..."}
              </p>
              <p className="mt-1 text-xs text-muted">
                Messages go straight to them, never through our servers, and vanish when you leave.
              </p>
              {connected && (
                <div className="mt-5 flex flex-col gap-2">
                  {ICEBREAKERS.map((t) => (
                    <button
                      key={t}
                      onClick={() => send(t)}
                      className="btn-ghost rounded-2xl px-3 py-2 text-left text-xs text-muted hover:text-ink"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {messages.map((m, i) => {
            if (m.from === "system") {
              return (
                <p key={m.id} className="bubble-in py-2 text-center text-[11px] text-faint">
                  {m.text}
                </p>
              );
            }
            const mine = m.from === "me";
            const prev = messages[i - 1];
            const grouped = prev && prev.from === m.from && m.at - prev.at < 60_000;
            return (
              <div
                key={m.id}
                className={`bubble-in flex ${mine ? "justify-end" : "justify-start"} ${grouped ? "" : "pt-2"}`}
              >
                <span
                  title={timeLabel(m.at)}
                  className={`max-w-[80%] whitespace-pre-wrap break-words px-3.5 py-2 text-sm leading-relaxed ${
                    mine
                      ? "rounded-[20px] rounded-br-md bg-gradient-to-br from-emerald-300 to-emerald-500 text-emerald-950"
                      : "rounded-[20px] rounded-bl-md bg-white/[0.07] text-ink"
                  }`}
                >
                  {m.text}
                </span>
              </div>
            );
          })}

          {remoteTyping && (
            <div className="bubble-in flex justify-start pt-2">
              <span className="typing rounded-[20px] rounded-bl-md bg-white/[0.07] px-3.5 py-3" aria-label="Stranger is typing">
                <span />
                <span />
                <span />
              </span>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={submit}
          className="flex items-center gap-2 border-t border-line p-3 pb-[max(env(safe-area-inset-bottom),12px)]"
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => change(e.target.value)}
            maxLength={MAX_CHAT_LENGTH}
            placeholder={connected ? "Write something kind..." : "Connecting..."}
            disabled={!connected}
            aria-label="Message"
            className="min-w-0 flex-1 rounded-full border border-line bg-white/[0.04] px-4 py-2.5 text-sm text-ink outline-none transition placeholder:text-faint focus:border-accent/60 focus:bg-white/[0.06] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!connected || !draft.trim()}
            className="btn-primary grid h-10 w-10 shrink-0 place-items-center rounded-full disabled:opacity-35"
            aria-label="Send"
          >
            <SendIcon size={17} />
          </button>
        </form>
      </div>
    </aside>
  );
}
