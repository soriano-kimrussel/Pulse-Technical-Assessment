import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, bearerToken } from "@/lib/auth";
import { removeSessions } from "@/lib/sessions";
import { error, json, withErrors } from "@/lib/http";
import { STALE_MS, SIGNAL_TTL_MS } from "@/lib/presence";
import { getVibe } from "@/lib/vibes";
import type { PollResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrors(async (request: NextRequest) => {
  const me = await authenticate(bearerToken(request));
  if (!me) return error("unauthorized", 401);

  const now = Date.now();
  const staleCutoff = new Date(now - STALE_MS);
  const signalCutoff = new Date(now - SIGNAL_TTL_MS);

  const beat = await prisma.presence.updateMany({
    where: { id: me.id },
    data: { lastSeen: new Date(now) },
  });
  if (beat.count === 0) return error("unauthorized", 401);

  const stale = await prisma.presence.findMany({
    where: { lastSeen: { lt: staleCutoff } },
    select: { id: true },
  });
  await removeSessions(stale.map((s) => s.id));
  await prisma.signal.deleteMany({ where: { createdAt: { lt: signalCutoff } } });

  const peers = await prisma.presence.findMany({
    where: {
      id: { not: me.id, notIn: me.blocked },
      lastSeen: { gte: staleCutoff },
      NOT: { blocked: { has: me.id } },
    },
    select: { id: true, lat: true, lng: true, peerId: true, vibe: true },
  });

  const inbox = await prisma.signal.findMany({
    where: { toId: me.id },
    orderBy: { createdAt: "asc" },
  });
  if (inbox.length > 0) {
    await prisma.signal.deleteMany({
      where: { id: { in: inbox.map((s) => s.id) } },
    });
  }

  const response: PollResponse = {
    self: { peerId: me.peerId, pendingTo: me.pendingTo },
    peers: peers.map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      busy: p.peerId !== null,
      vibe: getVibe(p.vibe).id,
    })),
    signals: inbox.map((s) => ({
      id: s.id,
      fromId: s.fromId,
      toId: s.toId,
      type: s.type as PollResponse["signals"][number]["type"],
      payload: s.payload,
      createdAt: s.createdAt.toISOString(),
    })),
  };

  return json(response);
});
