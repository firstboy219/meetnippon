-- CreateEnum
CREATE TYPE "RoomAudience" AS ENUM ('BOTH', 'INTERNAL', 'EXTERNAL');

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN "audience" "RoomAudience" NOT NULL DEFAULT 'BOTH';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "passwordResetTokenHash" TEXT,
ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3);
