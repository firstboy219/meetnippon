-- CreateTable
CREATE TABLE "HiddenMenuItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "menuKey" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HiddenMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HiddenMenuItem_tenantId_idx" ON "HiddenMenuItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HiddenMenuItem_tenantId_menuKey_role_key" ON "HiddenMenuItem"("tenantId", "menuKey", "role");

-- AddForeignKey
ALTER TABLE "HiddenMenuItem" ADD CONSTRAINT "HiddenMenuItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
