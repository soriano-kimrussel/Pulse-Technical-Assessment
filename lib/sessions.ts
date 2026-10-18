import { prisma } from "@/lib/prisma";
import type { SignalType } from "@/lib/types";

export async function removeSessions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const removed = new Set(ids);

  const [partners, requesters, leaving] = await Promise.all([
    prisma.presence.findMany({
      where: { peerId: { in: ids } },
      select: { id: true, peerId: true },
    }),
    prisma.presence.findMany({
      where: { pendingTo: { in: ids } },
      select: { id: true, pendingTo: true },
    }),
    prisma.presence.findMany({
      where: { id: { in: ids }, pendingTo: { not: null } },
      select: { id: true, pendingTo: true },
    }),
  ]);

  await prisma.presence.updateMany({
    where: { peerId: { in: ids } },
    data: { peerId: null },
  });
  await prisma.presence.updateMany({
    where: { pendingTo: { in: ids } },
    data: { pendingTo: null },
  });
  await prisma.signal.deleteMany({
    where: { OR: [{ toId: { in: ids } }, { fromId: { in: ids } }] },
  });
  await prisma.presence.deleteMany({ where: { id: { in: ids } } });

  const notices: { fromId: string; toId: string; type: SignalType }[] = [
    ...partners
      .filter((p) => !removed.has(p.id))
      .map((p) => ({ fromId: p.peerId!, toId: p.id, type: "end" as const })),
    ...requesters
      .filter((p) => !removed.has(p.id))
      .map((p) => ({ fromId: p.pendingTo!, toId: p.id, type: "decline" as const })),
    ...leaving
      .filter((p) => !removed.has(p.pendingTo!))
      .map((p) => ({ fromId: p.id, toId: p.pendingTo!, type: "end" as const })),
  ];
  if (notices.length > 0) {
    await prisma.signal.createMany({ data: notices });
  }
}
