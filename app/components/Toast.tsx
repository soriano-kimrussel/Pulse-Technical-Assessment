"use client";

export default function Toast({ text }: { text: string }) {
  return (
    <div
      key={text}
      role="status"
      className="glass-strong anim-drop-in pointer-events-none absolute left-1/2 top-20 z-[60] max-w-[90vw] rounded-full px-4 py-2.5 text-center text-sm text-ink"
    >
      {text}
    </div>
  );
}
