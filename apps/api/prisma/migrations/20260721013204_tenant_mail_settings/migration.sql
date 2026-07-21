-- CreateTable
CREATE TABLE "TenantMailSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 587,
    "username" TEXT NOT NULL DEFAULT '',
    "passwordEnc" TEXT NOT NULL DEFAULT '',
    "fromName" TEXT,
    "fromEmail" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantMailSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantMailSetting_tenantId_key" ON "TenantMailSetting"("tenantId");

-- CreateIndex
CREATE INDEX "TenantMailSetting_tenantId_idx" ON "TenantMailSetting"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantMailSetting" ADD CONSTRAINT "TenantMailSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
