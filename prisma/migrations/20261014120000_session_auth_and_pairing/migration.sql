DELETE FROM "Signal";
DELETE FROM "Presence";

ALTER TABLE "Presence" DROP COLUMN "busy",
ADD COLUMN     "tokenHash" TEXT NOT NULL,
ADD COLUMN     "vibe" TEXT NOT NULL DEFAULT 'chat',
ADD COLUMN     "peerId" TEXT,
ADD COLUMN     "pendingTo" TEXT,
ADD COLUMN     "blocked" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "Presence_peerId_idx" ON "Presence"("peerId");

CREATE INDEX "Presence_pendingTo_idx" ON "Presence"("pendingTo");

CREATE INDEX "Signal_createdAt_idx" ON "Signal"("createdAt");
