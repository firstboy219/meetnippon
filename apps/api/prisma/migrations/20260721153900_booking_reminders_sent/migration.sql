-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "remindersSent" JSONB NOT NULL DEFAULT '[]';
