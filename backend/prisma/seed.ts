import { PrismaClient, BusinessType, SubscriptionPlan, UserRole, InventoryModel, PricingMode, TaxMode } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding UniDuka…');

  // ── Platform admin (credentials from env, never hardcoded) ──────────────────
  const adminEmail    = process.env.PLATFORM_ADMIN_EMAIL    || 'admin@uniduka.com';
  const adminPassword = process.env.PLATFORM_ADMIN_PASSWORD || 'Admin@Uniduka2024!';
  const adminName     = process.env.PLATFORM_ADMIN_NAME     || 'Platform Administrator';

  // Dedicated internal account — never exposed to tenants
  const platformAccount = await prisma.ownerAccount.upsert({
    where:  { email: 'platform@internal.uniduka.com' },
    update: {},
    create: {
      legalName:          'UniDuka Platform',
      email:              'platform@internal.uniduka.com',
      subscriptionPlan:   SubscriptionPlan.ENTERPRISE,
      subscriptionActive: true,
    },
  });

  const adminHash = await bcrypt.hash(adminPassword, 12);
  await prisma.user.upsert({
    where:  { email: adminEmail },
    update: {},
    create: {
      ownerAccountId: platformAccount.id,
      fullName:       adminName,
      email:          adminEmail,
      passwordHash:   adminHash,
      role:           UserRole.PLATFORM_ADMIN,
    },
  });

  console.log(`✓ Platform admin: ${adminEmail}`);

  // ── Demo tenant data ────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Password123!', 12);

  const account = await prisma.ownerAccount.upsert({
    where: { email: 'demo@uniduka.com' },
    update: { subscriptionActive: true },
    create: {
      legalName: 'Demo Enterprises Ltd',
      email: 'demo@uniduka.com',
      subscriptionPlan: SubscriptionPlan.GROWTH,
      subscriptionActive: true,
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: 'owner@uniduka.com' },
    update: {},
    create: {
      ownerAccountId: account.id,
      fullName: 'Demo Owner',
      email: 'owner@uniduka.com',
      passwordHash,
      role: UserRole.ACCOUNT_OWNER,
    },
  });

  const shop = await prisma.shop.upsert({
    where: { id: 'demo-shop-001' },
    update: {},
    create: {
      id: 'demo-shop-001',
      ownerAccountId: account.id,
      tradingName: 'Demo Retail Store',
      legalName: 'Demo Enterprises Ltd',
      businessType: BusinessType.RETAIL_STORE,
      inventoryModel: InventoryModel.SKU_VARIANT,
      pricingMode: PricingMode.FIXED,
      taxMode: TaxMode.STANDARD_VAT,
      country: 'TZ',
      city: 'Dar es Salaam',
      currency: 'TZS',
      timezone: 'Africa/Dar_es_Salaam',
      wizardCompleted: true,
    },
  });

  await prisma.userShopAccess.upsert({
    where: { userId_shopId: { userId: owner.id, shopId: shop.id } },
    update: {},
    create: { userId: owner.id, shopId: shop.id, role: UserRole.ACCOUNT_OWNER },
  });

  await prisma.taxRule.upsert({
    where: { id: 'demo-tax-001' },
    update: {},
    create: {
      id: 'demo-tax-001',
      shopId: shop.id,
      name: 'VAT 16%',
      rate: 16,
      isDefault: true,
    },
  });

  const products = [
    { name: 'Coca-Cola 500ml', sku: 'COKE-500', sellPrice: 70, costPrice: 45, category: 'Beverages' },
    { name: 'Bread Loaf', sku: 'BREAD-001', sellPrice: 65, costPrice: 40, category: 'Bakery' },
    { name: 'Milk 500ml', sku: 'MILK-500', sellPrice: 60, costPrice: 38, category: 'Dairy' },
    { name: 'Sugar 1kg', sku: 'SUGAR-1KG', sellPrice: 180, costPrice: 120, category: 'Dry Goods' },
    { name: 'Cooking Oil 1L', sku: 'OIL-1L', sellPrice: 280, costPrice: 200, category: 'Dry Goods' },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { shopId_sku: { shopId: shop.id, sku: p.sku } },
      update: {},
      create: {
        shopId: shop.id,
        ...p,
        reorderPoint: 5,
      },
    });

    // Create inventory item with opening stock
    const existing = await prisma.inventoryItem.findFirst({ where: { productId: product.id, shopId: shop.id } });
    if (!existing) {
      await prisma.inventoryItem.create({
        data: {
          shopId: shop.id,
          productId: product.id,
          quantity: 50,
          costPrice: p.costPrice,
        },
      });
      await prisma.stockMovement.create({
        data: {
          shopId: shop.id,
          productId: product.id,
          type: 'ADJUSTMENT',
          quantity: 50,
          unitCost: p.costPrice,
          note: 'Opening stock',
        },
      });
    }
  }

  console.log(`✓ Account: ${account.email}`);
  console.log(`✓ Owner login: owner@uniduka.com / Password123!`);
  console.log(`✓ Shop: ${shop.tradingName}`);
  console.log(`✓ Products: ${products.length} seeded`);
  console.log('\nDone!');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
