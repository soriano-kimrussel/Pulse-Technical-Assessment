import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, bearerToken, isSessionId } from "@/lib/auth";
import { error, json, readJson, withErrors } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BLOCKED = 200;

export const POST = withErrors(async (request: NextRequest) => {
  const me = await authenticate(bearerToken(request));
  if (!me) return error("unauthorized", 401);

  const body = await readJson(request, 1024);
  const targetId = body?.targetId;
  if (!isSessionId(targetId) || targetId === me.id) {
    return error("invalid target", 400);
  }

  if (!me.blocked.includes(targetId) && me.blocked.length < MAX_BLOCKED) {
    await prisma.presence.update({
      where: { id: me.id },
      data: { blocked: { push: targetId } },
    });
  }

  if (me.peerId === targetId || me.pendingTo === targetId) {
    await prisma.presence.updateMany({
      where: { id: me.id },
      data: { peerId: null, pendingTo: null },
    });
  }
  const freed = await prisma.presence.updateMany({
    where: { id: targetId, OR: [{ peerId: me.id }, { pendingTo: me.id }] },
    data: { peerId: null, pendingTo: null },
  });
  if (freed.count > 0 || me.peerId === targetId || me.pendingTo === targetId) {
    await prisma.signal.create({
      data: { fromId: me.id, toId: targetId, type: "end" },
    });
  }

  return json({ ok: true });
});
