import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { error, json, withErrors } from "@/lib/http";
import { STALE_MS } from "@/lib/presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrors(async (request: NextRequest) => {
  if (!rateLimit(`stats:${clientIp(request)}`, 30, 60_000)) {
    return error("too many requests", 429);
  }
  const since = new Date(Date.now() - STALE_MS);
  const [online, connected] = await Promise.all([
    prisma.presence.count({ where: { lastSeen: { gte: since } } }),
    prisma.presence.count({
      where: { lastSeen: { gte: since }, peerId: { not: null } },
    }),
  ]);
  return json({ online, conversations: Math.floor(connected / 2) });
});
