/**
 * Seed — idempotent. Creates the pilot tenant (PT Nipsea) with branding and an
 * initial ADMIN, plus a minimal location hierarchy and one room + one desk so
 * later phases have something to book. Uses the raw client (unscoped) on purpose.
 *
 * Dev credentials are printed at the end; override via SEED_ADMIN_PASSWORD.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'nipsea' },
    update: {},
    create: { name: 'PT Nipsea', slug: 'nipsea', isActive: true },
  });

  await prisma.tenantBranding.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      displayName: 'Nipsea Booking',
      primaryColor: '#0E6E55',
      accentColor: '#E4572E',
      accessMode: 'SHARED_URL',
      subdomain: 'nipsea',
    },
  });

  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@nipsea.co.id' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@nipsea.co.id',
      fullName: 'Nipsea Admin',
      role: 'ADMIN',
      languagePref: 'EN',
      passwordHash,
      isActive: true,
    },
  });

  const office = await prisma.officeLocation.upsert({
    where: { id: `seed-office-${tenant.id}` },
    update: {},
    create: {
      id: `seed-office-${tenant.id}`,
      tenantId: tenant.id,
      name: 'HQ Jakarta',
      address: 'Jakarta, Indonesia',
    },
  });

  const building = await prisma.building.upsert({
    where: { id: `seed-bldg-${tenant.id}` },
    update: {},
    create: {
      id: `seed-bldg-${tenant.id}`,
      tenantId: tenant.id,
      officeLocationId: office.id,
      name: 'Main Tower',
    },
  });

  const floor = await prisma.floor.upsert({
    where: { id: `seed-floor-${tenant.id}` },
    update: {},
    create: {
      id: `seed-floor-${tenant.id}`,
      tenantId: tenant.id,
      buildingId: building.id,
      name: 'Level 5',
    },
  });

  await prisma.resource.upsert({
    where: { id: `seed-room-${tenant.id}` },
    update: {},
    create: {
      id: `seed-room-${tenant.id}`,
      tenantId: tenant.id,
      floorId: floor.id,
      type: 'ROOM',
      name: 'Sakura Meeting Room',
      category: 'Standard Room',
      capacity: 8,
      facilities: ['Projector', 'Video Conference', 'Whiteboard'],
    },
  });

  await prisma.resource.upsert({
    where: { id: `seed-desk-${tenant.id}` },
    update: {},
    create: {
      id: `seed-desk-${tenant.id}`,
      tenantId: tenant.id,
      floorId: floor.id,
      type: 'DESK',
      name: 'Hot Desk A1',
      zone: 'North Wing',
      capacity: 1,
    },
  });

  console.log('✔ Seed complete');
  console.log(`  Tenant : ${tenant.name} (slug=${tenant.slug})`);
  console.log(`  Admin  : ${admin.email} / ${adminPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
