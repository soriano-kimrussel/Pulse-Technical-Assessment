export const VIBES = [
  { id: "chat", emoji: "💬", label: "Just chatting", color: "#34d399" },
  { id: "music", emoji: "🎧", label: "Music talk", color: "#a78bfa" },
  { id: "language", emoji: "🗣️", label: "Language swap", color: "#60a5fa" },
  { id: "listen", emoji: "🫶", label: "Need a listener", color: "#f472b6" },
  { id: "nightowl", emoji: "🌙", label: "Night owl", color: "#fbbf24" },
  { id: "travel", emoji: "✈️", label: "Travel stories", color: "#22d3ee" },
] as const;

export type VibeId = (typeof VIBES)[number]["id"];
export type Vibe = (typeof VIBES)[number];

export const DEFAULT_VIBE: VibeId = "chat";

export function isVibeId(v: unknown): v is VibeId {
  return typeof v === "string" && VIBES.some((x) => x.id === v);
}

export function getVibe(id: string | null | undefined): Vibe {
  return VIBES.find((v) => v.id === id) ?? VIBES[0];
}
