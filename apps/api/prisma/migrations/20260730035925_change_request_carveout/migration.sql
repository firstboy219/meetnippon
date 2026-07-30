-- AlterTable
ALTER TABLE "BookingChangeRequest"
  ADD COLUMN "requestedStartTime" TIMESTAMP(3),
  ADD COLUMN "requestedEndTime" TIMESTAMP(3),
  ADD COLUMN "draftTitle" TEXT,
  ADD COLUMN "draftDescription" TEXT,
  ADD COLUMN "draftType" "BookingType" NOT NULL DEFAULT 'OFFLINE',
  ADD COLUMN "draftMeetingLink" TEXT,
  ADD COLUMN "draftStartTime" TIMESTAMP(3),
  ADD COLUMN "draftEndTime" TIMESTAMP(3),
  ADD COLUMN "draftParticipants" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "draftNotify" BOOLEAN NOT NULL DEFAULT true;

-- Backfill any pre-existing rows (the old "propose to move their meeting"
-- shape, from before this feature became a carve-out negotiation). Closed
-- out as REJECTED rather than left in a shape the new UI cannot render, or
-- silently deleted — the requester is told to resubmit if still needed.
UPDATE "BookingChangeRequest" bcr
SET
  "requestedStartTime" = COALESCE(bcr."proposedStartTime", b."startTime"),
  "requestedEndTime"   = COALESCE(bcr."proposedEndTime", b."endTime"),
  "draftStartTime"     = COALESCE(bcr."proposedStartTime", b."startTime"),
  "draftEndTime"       = COALESCE(bcr."proposedEndTime", b."endTime"),
  "draftTitle"         = b."title",
  "status"             = 'REJECTED',
  "decisionNote"       = 'Automatically closed — submitted before a feature change and could not be carried forward. Please submit a new request if you still need this room time.',
  "decidedAt"          = NOW()
FROM "Booking" b
WHERE b.id = bcr."bookingId" AND bcr."requestedStartTime" IS NULL;

-- AlterTable
ALTER TABLE "BookingChangeRequest"
  ALTER COLUMN "requestedStartTime" SET NOT NULL,
  ALTER COLUMN "requestedEndTime" SET NOT NULL,
  ALTER COLUMN "draftTitle" SET NOT NULL,
  ALTER COLUMN "draftStartTime" SET NOT NULL,
  ALTER COLUMN "draftEndTime" SET NOT NULL,
  DROP COLUMN "proposedStartTime",
  DROP COLUMN "proposedEndTime";
