import type {
  JoinResponse,
  PollResponse,
  SignalResult,
  SignalType,
} from "@/lib/types";
import type { VibeId } from "@/lib/vibes";

export class ApiError extends Error {
  constructor(public status: number) {
    super(`request failed: ${status}`);
  }
}

function authHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function join(
  lat: number,
  lng: number,
  vibe: VibeId,
): Promise<JoinResponse> {
  const res = await fetch("/api/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng, vibe }),
  });
  if (!res.ok) throw new ApiError(res.status);
  return res.json();
}

export async function poll(token: string): Promise<PollResponse> {
  const res = await fetch("/api/poll", {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError(res.status);
  return res.json();
}

export async function sendSignal(
  token: string,
  toId: string,
  type: SignalType,
  payload?: string,
): Promise<SignalResult> {
  try {
    const res = await fetch("/api/signal", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ toId, type, payload }),
    });
    const data = (await res.json().catch(() => ({}))) as Partial<SignalResult>;
    return {
      ok: res.ok,
      status: res.status,
      autoDeclined: data.autoDeclined,
      error: data.error,
    };
  } catch {
    return { ok: false, status: 0, error: "network" };
  }
}

export async function block(token: string, targetId: string): Promise<void> {
  await fetch("/api/block", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ targetId }),
  }).catch(() => {});
}

export async function stats(): Promise<{ online: number; conversations: number } | null> {
  try {
    const res = await fetch("/api/stats", { cache: "no-store" });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

export function leave(token: string): void {
  const body = JSON.stringify({ token });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/leave", body);
  } else {
    void fetch("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  }
}
