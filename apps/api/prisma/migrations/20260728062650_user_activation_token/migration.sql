-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "activationTokenHash" TEXT;
