-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'APPROVER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('EN', 'ID');

-- CreateEnum
CREATE TYPE "Presence" AS ENUM ('AVAILABLE', 'BUSY', 'DND', 'AWAY', 'OFFLINE');

-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('PENDING', 'VERIFIED');

-- CreateEnum
CREATE TYPE "AccessMode" AS ENUM ('SUBDOMAIN', 'SHARED_URL');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('ROOM', 'DESK');

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PolicyScope" AS ENUM ('TENANT', 'CATEGORY', 'ROOM');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('OFFLINE', 'ONLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'WAITLIST');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CallbackStatus" AS ENUM ('NONE', 'PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('PROCESSING', 'READY', 'EXPIRED', 'NONE');

-- CreateEnum
CREATE TYPE "WorkLocation" AS ENUM ('OFFICE', 'WFH', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "EmailTemplateType" AS ENUM ('INVITATION', 'REMINDER', 'CANCELLATION');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantDomain" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" "DomainStatus" NOT NULL DEFAULT 'PENDING',
    "verificationToken" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantBranding" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "displayName" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#0E6E55',
    "accentColor" TEXT NOT NULL DEFAULT '#E4572E',
    "logoUrl" TEXT,
    "loginBgUrl" TEXT,
    "accessMode" "AccessMode" NOT NULL DEFAULT 'SHARED_URL',
    "subdomain" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantBranding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubdomainRedirect" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "oldSubdomain" TEXT NOT NULL,
    "newSubdomain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubdomainRedirect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantFeatureFlag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantFeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "EmailTemplateType" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'default',
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "allowedCategories" JSONB NOT NULL DEFAULT '[]',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'EMPLOYEE',
    "department" TEXT,
    "languagePref" "Language" NOT NULL DEFAULT 'EN',
    "presence" "Presence" NOT NULL DEFAULT 'OFFLINE',
    "presenceManual" BOOLEAN NOT NULL DEFAULT false,
    "presenceLocked" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficeLocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "geofenceRadiusM" INTEGER NOT NULL DEFAULT 150,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "officeLocationId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "siteContacts" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "imageUrl" TEXT,
    "pins" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "floorId" TEXT,
    "type" "ResourceType" NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "facilities" JSONB NOT NULL DEFAULT '[]',
    "zone" TEXT,
    "status" "ResourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scope" "PolicyScope" NOT NULL,
    "category" TEXT,
    "resourceId" TEXT,
    "rules" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "BookingType" NOT NULL DEFAULT 'OFFLINE',
    "meetingLink" TEXT,
    "resourceId" TEXT,
    "principalId" TEXT NOT NULL,
    "bookerId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "participants" JSONB NOT NULL DEFAULT '[]',
    "reminders" JSONB NOT NULL DEFAULT '[]',
    "recordingRequested" BOOLEAN NOT NULL DEFAULT false,
    "recurringGroupId" TEXT,
    "checkInToken" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalStep" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "approverId" TEXT,
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalApprovalTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "requesterName" TEXT,
    "sourcePlatform" TEXT,
    "approverEmail" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "callbackUrl" TEXT,
    "callbackStatus" "CallbackStatus" NOT NULL DEFAULT 'NONE',
    "callbackAttempts" INTEGER NOT NULL DEFAULT 0,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalApprovalTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recording" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "status" "RecordingStatus" NOT NULL DEFAULT 'NONE',
    "mediaUrl" TEXT,
    "transcript" TEXT,
    "retentionUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "readBy" JSONB NOT NULL DEFAULT '[]',
    "reactions" JSONB NOT NULL DEFAULT '[]',
    "cardData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "deepLink" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkLocationLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "location" "WorkLocation" NOT NULL DEFAULT 'UNKNOWN',
    "officeName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkLocationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "TenantDomain_domain_key" ON "TenantDomain"("domain");

-- CreateIndex
CREATE INDEX "TenantDomain_tenantId_idx" ON "TenantDomain"("tenantId");

-- CreateIndex
CREATE INDEX "TenantDomain_domain_idx" ON "TenantDomain"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "TenantBranding_tenantId_key" ON "TenantBranding"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantBranding_subdomain_key" ON "TenantBranding"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "SubdomainRedirect_oldSubdomain_key" ON "SubdomainRedirect"("oldSubdomain");

-- CreateIndex
CREATE INDEX "SubdomainRedirect_tenantId_idx" ON "SubdomainRedirect"("tenantId");

-- CreateIndex
CREATE INDEX "TenantFeatureFlag_tenantId_idx" ON "TenantFeatureFlag"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantFeatureFlag_tenantId_key_key" ON "TenantFeatureFlag"("tenantId", "key");

-- CreateIndex
CREATE INDEX "EmailTemplate_tenantId_idx" ON "EmailTemplate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_tenantId_type_key" ON "EmailTemplate"("tenantId", "type");

-- CreateIndex
CREATE INDEX "TenantApiKey_tenantId_idx" ON "TenantApiKey"("tenantId");

-- CreateIndex
CREATE INDEX "TenantApiKey_keyPrefix_idx" ON "TenantApiKey"("keyPrefix");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "User_tenantId_department_idx" ON "User"("tenantId", "department");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "OfficeLocation_tenantId_idx" ON "OfficeLocation"("tenantId");

-- CreateIndex
CREATE INDEX "Building_tenantId_idx" ON "Building"("tenantId");

-- CreateIndex
CREATE INDEX "Building_officeLocationId_idx" ON "Building"("officeLocationId");

-- CreateIndex
CREATE INDEX "Floor_tenantId_idx" ON "Floor"("tenantId");

-- CreateIndex
CREATE INDEX "Floor_buildingId_idx" ON "Floor"("buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "FloorPlan_floorId_key" ON "FloorPlan"("floorId");

-- CreateIndex
CREATE INDEX "FloorPlan_tenantId_idx" ON "FloorPlan"("tenantId");

-- CreateIndex
CREATE INDEX "Resource_tenantId_idx" ON "Resource"("tenantId");

-- CreateIndex
CREATE INDEX "Resource_tenantId_type_idx" ON "Resource"("tenantId", "type");

-- CreateIndex
CREATE INDEX "Resource_tenantId_category_idx" ON "Resource"("tenantId", "category");

-- CreateIndex
CREATE INDEX "BookingPolicy_tenantId_idx" ON "BookingPolicy"("tenantId");

-- CreateIndex
CREATE INDEX "BookingPolicy_tenantId_scope_idx" ON "BookingPolicy"("tenantId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "BookingPolicy_tenantId_scope_category_resourceId_key" ON "BookingPolicy"("tenantId", "scope", "category", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_checkInToken_key" ON "Booking"("checkInToken");

-- CreateIndex
CREATE INDEX "Booking_tenantId_idx" ON "Booking"("tenantId");

-- CreateIndex
CREATE INDEX "Booking_tenantId_resourceId_startTime_idx" ON "Booking"("tenantId", "resourceId", "startTime");

-- CreateIndex
CREATE INDEX "Booking_tenantId_principalId_idx" ON "Booking"("tenantId", "principalId");

-- CreateIndex
CREATE INDEX "Booking_recurringGroupId_idx" ON "Booking"("recurringGroupId");

-- CreateIndex
CREATE INDEX "ApprovalStep_tenantId_idx" ON "ApprovalStep"("tenantId");

-- CreateIndex
CREATE INDEX "ApprovalStep_bookingId_idx" ON "ApprovalStep"("bookingId");

-- CreateIndex
CREATE INDEX "ExternalApprovalTask_tenantId_idx" ON "ExternalApprovalTask"("tenantId");

-- CreateIndex
CREATE INDEX "ExternalApprovalTask_tenantId_category_idx" ON "ExternalApprovalTask"("tenantId", "category");

-- CreateIndex
CREATE INDEX "ExternalApprovalTask_tenantId_approverEmail_idx" ON "ExternalApprovalTask"("tenantId", "approverEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Recording_bookingId_key" ON "Recording"("bookingId");

-- CreateIndex
CREATE INDEX "Recording_tenantId_idx" ON "Recording"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatConversation_bookingId_key" ON "ChatConversation"("bookingId");

-- CreateIndex
CREATE INDEX "ChatConversation_tenantId_idx" ON "ChatConversation"("tenantId");

-- CreateIndex
CREATE INDEX "ChatMember_tenantId_idx" ON "ChatMember"("tenantId");

-- CreateIndex
CREATE INDEX "ChatMember_userId_idx" ON "ChatMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMember_conversationId_userId_key" ON "ChatMember"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "ChatMessage_tenantId_idx" ON "ChatMessage"("tenantId");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_tenantId_idx" ON "Notification"("tenantId");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "WorkLocationLog_tenantId_day_idx" ON "WorkLocationLog"("tenantId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "WorkLocationLog_userId_day_key" ON "WorkLocationLog"("userId", "day");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entity_idx" ON "AuditLog"("tenantId", "entity");

-- AddForeignKey
ALTER TABLE "TenantDomain" ADD CONSTRAINT "TenantDomain_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantBranding" ADD CONSTRAINT "TenantBranding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubdomainRedirect" ADD CONSTRAINT "SubdomainRedirect_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantFeatureFlag" ADD CONSTRAINT "TenantFeatureFlag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantApiKey" ADD CONSTRAINT "TenantApiKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeLocation" ADD CONSTRAINT "OfficeLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_officeLocationId_fkey" FOREIGN KEY ("officeLocationId") REFERENCES "OfficeLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorPlan" ADD CONSTRAINT "FloorPlan_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPolicy" ADD CONSTRAINT "BookingPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPolicy" ADD CONSTRAINT "BookingPolicy_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_bookerId_fkey" FOREIGN KEY ("bookerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalApprovalTask" ADD CONSTRAINT "ExternalApprovalTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLocationLog" ADD CONSTRAINT "WorkLocationLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLocationLog" ADD CONSTRAINT "WorkLocationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
