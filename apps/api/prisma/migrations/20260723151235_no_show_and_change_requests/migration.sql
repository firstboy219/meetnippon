-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "noShowAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BookingChangeRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "proposedStartTime" TIMESTAMP(3),
    "proposedEndTime" TIMESTAMP(3),
    "note" TEXT,
    "status" "ApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingChangeRequest_tenantId_idx" ON "BookingChangeRequest"("tenantId");

-- CreateIndex
CREATE INDEX "BookingChangeRequest_tenantId_bookingId_idx" ON "BookingChangeRequest"("tenantId", "bookingId");

-- CreateIndex
CREATE INDEX "BookingChangeRequest_tenantId_requesterId_idx" ON "BookingChangeRequest"("tenantId", "requesterId");

-- AddForeignKey
ALTER TABLE "BookingChangeRequest" ADD CONSTRAINT "BookingChangeRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingChangeRequest" ADD CONSTRAINT "BookingChangeRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingChangeRequest" ADD CONSTRAINT "BookingChangeRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
