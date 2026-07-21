-- AlterTable
ALTER TABLE "ChatMember" ADD COLUMN     "lastNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "lastReadAt" TIMESTAMP(3);
