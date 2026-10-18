import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyPrivacyOffset, isValidLatLng } from "@/lib/geo";
import { newSession } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { error, json, readJson, withErrors } from "@/lib/http";
import { DEFAULT_VIBE, isVibeId } from "@/lib/vibes";
import type { JoinResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withErrors(async (request: NextRequest) => {
  if (!rateLimit(`join:${clientIp(request)}`, 20, 60_000)) {
    return error("too many requests", 429);
  }

  const body = await readJson(request, 1024);
  if (!body) return error("invalid body", 400);

  const { lat, lng, vibe } = body;
  if (!isValidLatLng(lat, lng)) {
    return error("invalid coordinates", 400);
  }
  if (vibe !== undefined && !isVibeId(vibe)) {
    return error("invalid vibe", 400);
  }

  const session = newSession();
  const offset = applyPrivacyOffset(lat as number, lng as number);

  await prisma.presence.create({
    data: {
      id: session.id,
      tokenHash: session.tokenHash,
      lat: offset.lat,
      lng: offset.lng,
      vibe: vibe ?? DEFAULT_VIBE,
      lastSeen: new Date(),
    },
  });

  const response: JoinResponse = {
    id: session.id,
    token: session.token,
    lat: offset.lat,
    lng: offset.lng,
  };
  return json(response);
});
