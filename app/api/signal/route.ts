import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, bearerToken, isSessionId } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { error, json, readJson, withErrors } from "@/lib/http";
import { MAILBOX_LIMIT, MAX_PAYLOAD } from "@/lib/presence";
import { SIGNAL_TYPES, type SignalType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withErrors(async (request: NextRequest) => {
  const me = await authenticate(bearerToken(request));
  if (!me) return error("unauthorized", 401);

  if (!rateLimit(`signal:${me.id}`, 120, 10_000)) {
    return error("too many requests", 429);
  }

  const body = await readJson(request, MAX_PAYLOAD + 1024);
  if (!body) return error("invalid body", 400);

  const { toId, type, payload } = body;
  if (!isSessionId(toId) || toId === me.id) {
    return error("invalid recipient", 400);
  }
  if (typeof type !== "string" || !SIGNAL_TYPES.includes(type as SignalType)) {
    return error("invalid type", 400);
  }
  if (
    payload !== undefined &&
    payload !== null &&
    (typeof payload !== "string" || payload.length > MAX_PAYLOAD)
  ) {
    return error("invalid payload", 400);
  }

  const signalType = type as SignalType;
  const payloadStr = typeof payload === "string" ? payload : null;
  const target = await prisma.presence.findUnique({
    where: { id: toId },
    select: { id: true, peerId: true, pendingTo: true, blocked: true },
  });

  const deliver = async (from: string, to: string, t: SignalType, p: string | null = null) => {
    await prisma.signal.create({
      data: { fromId: from, toId: to, type: t, payload: p },
    });
  };

  switch (signalType) {
    case "request": {
      if (me.peerId || me.pendingTo) {
        return error("already in a connection", 409);
      }
      if (!rateLimit(`request:${me.id}`, 10, 60_000)) {
        return error("too many requests", 429);
      }
      const unavailable =
        !target ||
        target.peerId !== null ||
        target.pendingTo !== null ||
        target.blocked.includes(me.id) ||
        me.blocked.includes(toId);
      if (unavailable) {
        await deliver(toId, me.id, "decline");
        return json({ ok: true, autoDeclined: true });
      }
      if (!(await hasMailboxRoom(toId))) return error("recipient busy", 429);

      const claimed = await prisma.presence.updateMany({
        where: { id: me.id, peerId: null, pendingTo: null },
        data: { pendingTo: toId },
      });
      if (claimed.count === 0) return error("already in a connection", 409);
      await deliver(me.id, toId, "request");
      return json({ ok: true });
    }

    case "accept": {
      if (!target || target.pendingTo !== me.id) {
        return error("no pending request", 409);
      }
      if (me.peerId || me.pendingTo) {
        return error("already in a connection", 409);
      }
      const requester = await prisma.presence.updateMany({
        where: { id: toId, pendingTo: me.id, peerId: null },
        data: { pendingTo: null, peerId: me.id },
      });
      if (requester.count === 0) return error("no pending request", 409);
      const self = await prisma.presence.updateMany({
        where: { id: me.id, peerId: null, pendingTo: null },
        data: { peerId: toId },
      });
      if (self.count === 0) {
        await prisma.presence.updateMany({
          where: { id: toId, peerId: me.id },
          data: { peerId: null },
        });
        await deliver(me.id, toId, "decline");
        return error("already in a connection", 409);
      }
      await deliver(me.id, toId, "accept");
      return json({ ok: true });
    }

    case "decline": {
      if (!target || target.pendingTo !== me.id) {
        return json({ ok: true, ignored: true });
      }
      await prisma.presence.updateMany({
        where: { id: toId, pendingTo: me.id },
        data: { pendingTo: null },
      });
      await deliver(me.id, toId, "decline");
      return json({ ok: true });
    }

    case "end": {
      if (me.peerId === toId) {
        await prisma.presence.updateMany({
          where: {
            OR: [
              { id: me.id, peerId: toId },
              { id: toId, peerId: me.id },
            ],
          },
          data: { peerId: null },
        });
      } else if (me.pendingTo === toId) {
        await prisma.presence.updateMany({
          where: { id: me.id, pendingTo: toId },
          data: { pendingTo: null },
        });
      } else {
        return json({ ok: true, ignored: true });
      }
      if (target) await deliver(me.id, toId, "end");
      return json({ ok: true });
    }

    case "offer":
    case "answer":
    case "ice": {
      if (!target || me.peerId !== toId || target.peerId !== me.id) {
        return error("not connected", 403);
      }
      if (!payloadStr) return error("missing payload", 400);
      if (!(await hasMailboxRoom(toId))) return error("recipient busy", 429);
      await deliver(me.id, toId, signalType, payloadStr);
      return json({ ok: true });
    }
  }
});

async function hasMailboxRoom(toId: string): Promise<boolean> {
  const pending = await prisma.signal.count({ where: { toId } });
  return pending < MAILBOX_LIMIT;
}
