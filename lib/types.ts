import type { VibeId } from "@/lib/vibes";

export type SignalType =
  | "request" 
  | "accept" 
  | "decline" 
  | "offer" 
  | "answer" 
  | "ice" 
  | "end"; 

export const SIGNAL_TYPES: readonly SignalType[] = [
  "request",
  "accept",
  "decline",
  "offer",
  "answer",
  "ice",
  "end",
];

export interface PeerDot {
  id: string;
  lat: number;
  lng: number;
  busy: boolean;
  vibe: VibeId;
}

export interface SignalMsg {
  id: string;
  fromId: string;
  toId: string;
  type: SignalType;
  payload: string | null;
  createdAt: string;
}

export interface PollResponse {
  peers: PeerDot[];
  signals: SignalMsg[];
  self: { peerId: string | null; pendingTo: string | null };
}

export interface JoinResponse {
  id: string;
  token: string;
  lat: number;
  lng: number;
}

export interface SignalResult {
  ok: boolean;
  status: number;
  autoDeclined?: boolean;
  error?: string;
}
