// One-shot seed script — run via Railway, then remove
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ownerAccounts = [
  {
    id: 'cmp46mna20000cxgw81eclapd',
    legalName: 'Demo Enterprises Ltd',
    email: 'demo@uniduka.com',
    phone: null,
    subscriptionPlan: 'STARTER',
    billingCycle: 'monthly',
    isActive: true,
    subscriptionActive: true,
    subscriptionExpiresAt: new Date('2026-06-17T17:17:39.866Z'),
    createdAt: new Date('2026-05-13T14:56:07.515Z'),
    updatedAt: new Date('2026-05-18T17:17:39.879Z'),
  },
  {
    id: 'cmp56w0e00000yjg3s68yyh6n',
    legalName: 'UniDuka Platform',
    email: 'platform@internal.uniduka.com',
    phone: null,
    subscriptionPlan: 'ENTERPRISE',
    billingCycle: 'monthly',
    isActive: true,
    subscriptionActive: true,
    subscriptionExpiresAt: new Date('2026-06-17T17:17:39.866Z'),
    createdAt: new Date('2026-05-14T07:51:10.585Z'),
    updatedAt: new Date('2026-05-18T17:17:39.879Z'),
  },
  {
    id: 'cmp5hzko20000ad883a9l91ni',
    legalName: 'Lee shop',
    email: 'lee@gmail.com',
    phone: '+255764628075',
    subscriptionPlan: 'STARTER',
    billingCycle: 'monthly',
    isActive: true,
    subscriptionActive: true,
    subscriptionExpiresAt: new Date('2026-06-17T17:17:39.866Z'),
    createdAt: new Date('2026-05-14T13:01:52.611Z'),
    updatedAt: new Date('2026-05-18T17:17:39.879Z'),
  },
  {
    id: 'cmpbh38z60000sdhv4pls9472',
    legalName: 'Niyo General Supplies',
    email: 'niyo@gmail.com',
    phone: '+255764628075',
    subscriptionPlan: 'STARTER',
    billingCycle: 'monthly',
    isActive: true,
    subscriptionActive: true,
    subscriptionExpiresAt: new Date('2026-06-17T17:23:21.522Z'),
    createdAt: new Date('2026-05-18T17:23:21.522Z'),
    updatedAt: new Date('2026-05-18T17:23:21.522Z'),
  },
];

const users = [
  {
    id: 'cmp46mna90002cxgwnpokvtn9',
    email: 'owner@uniduka.com',
    passwordHash: '$2a$12$7YV81frLe7dHSlA5vy2tn./oym1xHViq/gL0Ma7mifnsrY3MBAdWK',
    fullName: 'Demo Owner',
    phone: null,
    role: 'ACCOUNT_OWNER',
    twoFaEnabled: false,
    isActive: true,
    ownerAccountId: 'cmp46mna20000cxgw81eclapd',
    createdAt: new Date('2026-05-13T14:56:07.521Z'),
    updatedAt: new Date('2026-05-19T10:22:50.294Z'),
  },
  {
    id: 'cmp56w0ky0002yjg37z4ijy92',
    email: 'admin@uniduka.com',
    passwordHash: '$2a$12$SaK0tkHJchMM1eIRzM/PvOicRSWnFWs.5aqE75PVkyWBRctjda8WS',
    fullName: 'Platform Administrator',
    phone: null,
    role: 'PLATFORM_ADMIN',
    twoFaEnabled: false,
    isActive: true,
    ownerAccountId: 'cmp56w0e00000yjg3s68yyh6n',
    createdAt: new Date('2026-05-14T07:51:10.834Z'),
    updatedAt: new Date('2026-05-19T06:02:18.217Z'),
  },
  {
    id: 'cmp5hzko20001ad88k4gpjyef',
    email: 'lee@gmail.com',
    passwordHash: '$2a$12$gv9CCBi/jlL.vkDsomX72u9Qt5pOLizpYEh6IOYLj6GZrqPowrnkm',
    fullName: 'Jully Lee',
    phone: '+255764628075',
    role: 'ACCOUNT_OWNER',
    twoFaEnabled: false,
    isActive: true,
    ownerAccountId: 'cmp5hzko20000ad883a9l91ni',
    createdAt: new Date('2026-05-14T13:01:52.611Z'),
    updatedAt: new Date('2026-05-14T15:15:06.286Z'),
  },
  {
    id: 'cmpb3867x0001g2c2h44rfpa6',
    email: 'cashier@gmail.com',
    passwordHash: '$2a$12$JCzorgI8Ggh4rBPNm3oPO.qma00Xl6A7WZ.R8f3AVOqtYVuLAOdQm',
    fullName: 'cashier',
    phone: null,
    role: 'CASHIER',
    twoFaEnabled: false,
    isActive: true,
    ownerAccountId: 'cmp46mna20000cxgw81eclapd',
    createdAt: new Date('2026-05-18T10:55:16.605Z'),
    updatedAt: new Date('2026-05-19T09:44:54.792Z'),
  },
  {
    id: 'cmpb3tpe80005g2c2lk5mexum',
    email: 'inventory@gmail.com',
    passwordHash: '$2a$12$ncy2e1.8h1xZS2.4T6N5d.A34QqlockI3QvB8.A1CCQwuz.SQcG.y',
    fullName: 'inventory',
    phone: null,
    role: 'INVENTORY_STAFF',
    twoFaEnabled: false,
    isActive: true,
    ownerAccountId: 'cmp46mna20000cxgw81eclapd',
    createdAt: new Date('2026-05-18T11:12:01.233Z'),
    updatedAt: new Date('2026-05-18T16:03:48.34Z'),
  },
  {
    id: 'cmpbh38z60001sdhv3u6g8duz',
    email: 'niyo@gmail.com',
    passwordHash: '$2a$12$ZNq8tAQX/x/TU5fUE4DAOeHtC1Wh3myP6/99XRPRi8.3bx3xQabqe',
    fullName: 'Julius Joh',
    phone: '+255764628075',
    role: 'ACCOUNT_OWNER',
    twoFaEnabled: false,
    isActive: true,
    ownerAccountId: 'cmpbh38z60000sdhv4pls9472',
    createdAt: new Date('2026-05-18T17:23:21.522Z'),
    updatedAt: new Date('2026-05-18T17:37:43.566Z'),
  },
  {
    id: 'cmpbhbbr7000nsdhvxt6ubjf4',
    email: 'johcashier@gmail.com',
    passwordHash: '$2a$12$RPVrIo.kNNIuNnU1zzVZUup/LxJHkDyQLXyJgfTghYFYuurFTEXu2',
    fullName: 'Joh Joh',
    phone: null,
    role: 'CASHIER',
    twoFaEnabled: false,
    isActive: true,
    ownerAccountId: 'cmpbh38z60000sdhv4pls9472',
    createdAt: new Date('2026-05-18T17:29:38.371Z'),
    updatedAt: new Date('2026-05-19T06:30:06.598Z'),
  },
  {
    id: 'cmpbhn90i00014sj3kcaxqk1r',
    email: 'inventoryniyo@gmail.com',
    passwordHash: '$2a$12$ORT/mS6YGkYVhmBCi8eym.CHpzcCMhGidCVAF8hUeuwKoHDEId7DC',
    fullName: 'Jully Lee',
    phone: null,
    role: 'INVENTORY_STAFF',
    twoFaEnabled: false,
    isActive: true,
    ownerAccountId: 'cmpbh38z60000sdhv4pls9472',
    createdAt: new Date('2026-05-18T17:38:54.69Z'),
    updatedAt: new Date('2026-05-18T17:54:50.7Z'),
  },
];

async function main() {
  console.log('Seeding owner accounts...');
  for (const acct of ownerAccounts) {
    await prisma.ownerAccount.upsert({
      where: { id: acct.id },
      update: {},
      create: acct,
    });
    console.log(`  ✓ ${acct.legalName} (${acct.email})`);
  }

  console.log('Seeding users...');
  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: user,
    });
    console.log(`  ✓ ${user.fullName} (${user.email}) [${user.role}]`);
  }

  console.log('Done!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
