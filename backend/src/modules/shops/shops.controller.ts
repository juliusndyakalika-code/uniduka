import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, JwtPayload } from '../../types';
import { prisma } from '../../core/prisma';
import { loadBusinessProfile } from '../business-types/business.profiles';
import * as R from '../../utils/response';

const SECRET = process.env.JWT_SECRET || 'uniduka-secret-change-in-prod';

export async function listShops(req: AuthRequest, res: Response) {
  const shops = await prisma.shop.findMany({
    where: { ownerAccountId: req.user!.accountId },
    include: { shopModules: true, _count: { select: { products: true, customers: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return R.ok(res, shops);
}

export async function getShop(req: AuthRequest, res: Response) {
  const shop = await prisma.shop.findFirst({
    where: { id: req.params.id, ownerAccountId: req.user!.accountId },
    include: { shopModules: true, unitProfiles: true, taxRules: true, loyaltyProgram: true },
  });
  if (!shop) return R.notFound(res, 'Shop not found');
  return R.ok(res, shop);
}

export async function createShop(req: AuthRequest, res: Response) {
  const { tradingName, legalName, businessType, country, city, region, timezone, currency, addressLine1 } = req.body;
  if (!tradingName || !businessType) return R.badRequest(res, 'tradingName and businessType are required');

  const profile = loadBusinessProfile(businessType);
  if (!profile) return R.badRequest(res, 'Invalid businessType');

  const shop = await prisma.shop.create({
    data: {
      ownerAccountId: req.user!.accountId,
      tradingName, legalName,
      businessType, country: country || 'TZ',
      city, region, addressLine1,
      timezone: timezone || 'Africa/Dar_es_Salaam',
      currency: currency || 'TZS',
      inventoryModel: profile.inventoryModel,
      pricingMode:    profile.pricingMode,
      taxMode:        profile.taxMode,
      shopModules: {
        create: profile.modules.map(m => ({ moduleKey: m.key, enabled: true, required: m.required })),
      },
    },
    include: { shopModules: true },
  });

  // Seed default unit profiles
  await prisma.unitProfile.createMany({
    data: profile.units.map(u => ({ ...u, shopId: shop.id })),
    skipDuplicates: true,
  });

  // Seed default tax rule
  await prisma.taxRule.create({
    data: { shopId: shop.id, name: 'Standard Tax', rate: 16, isDefault: true },
  });

  // Give the creating user access to the new shop
  await prisma.userShopAccess.upsert({
    where: { userId_shopId: { userId: req.user!.sub, shopId: shop.id } },
    update: {},
    create: { userId: req.user!.sub, shopId: shop.id, role: req.user!.role },
  });

  // Return a fresh token that includes the new shopId so the client can start using it immediately
  const newToken = jwt.sign(
    { sub: req.user!.sub, accountId: req.user!.accountId, role: req.user!.role, shopId: shop.id } as JwtPayload,
    SECRET,
    { expiresIn: '15m' },
  );

  return R.created(res, { shop, accessToken: newToken });
}

// Slugs that would collide with real app routes or look official.
const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'login', 'register', 'dashboard', 'pos', 'inventory',
  'reports', 'settings', 'platform', 'support', 'help', 'about', 'pricing',
  'mauzosmart', 'uniduka', 's', 'public', 'www', 'shop', 'store',
]);

/**
 * Normalise a user-typed slug to a safe public URL segment.
 *
 * Order matters: accents are folded to ASCII before filtering (so "Café" gives
 * "cafe", not "caf"), and separators are converted to hyphens before unknown
 * characters are stripped (so "MAMA_DUKA" gives "mama-duka", not "mamaduka").
 */
export function normaliseSlug(raw: string): string {
  return String(raw)
    .toLowerCase()
    .trim()
    .normalize('NFD')                 // é → e + combining accent
    .replace(/[̀-ͯ]/g, '')  // drop the combining accents
    .replace(/[\s_-]+/g, '-')         // spaces/underscores/hyphens → single hyphen
    .replace(/[^a-z0-9-]/g, '')       // drop anything still not URL-safe
    .replace(/-+/g, '-')              // collapse runs left by removals
    .slice(0, 48)
    .replace(/^-+|-+$/g, '');         // trim after slicing, so truncation can't leave a trailing hyphen
}

export async function updateShop(req: AuthRequest, res: Response) {
  const {
    tradingName, legalName, phone, contactEmail, logoUrl, addressLine1, city, region,
    currency, timezone, isActive, tin, vrn, mobileMoneyProviders, autoPrintReceipts,
    // Storefront
    storefrontEnabled, slug, storefrontBio, storefrontBanner,
    acceptsDelivery, acceptsPickup, deliveryFee, deliveryNote, minOrderValue, orderPhone,
  } = req.body;

  // The slug is a public URL and globally unique, so validate before writing.
  let slugValue: string | undefined;
  if (slug !== undefined) {
    const clean = normaliseSlug(slug);
    if (!clean) return R.badRequest(res, 'Storefront link must contain letters or numbers');
    if (clean.length < 3) return R.badRequest(res, 'Storefront link must be at least 3 characters');
    if (RESERVED_SLUGS.has(clean)) return R.badRequest(res, `"${clean}" is reserved. Please choose another link.`);
    const taken = await prisma.shop.findFirst({
      where: { slug: clean, id: { not: req.params.id } },
      select: { id: true },
    });
    if (taken) return R.badRequest(res, `"${clean}" is already taken. Please choose another link.`);
    slugValue = clean;
  }

  // A storefront with no link would be unreachable, so require one to enable it.
  if (storefrontEnabled === true) {
    const current = await prisma.shop.findFirst({
      where: { id: req.params.id, ownerAccountId: req.user!.accountId },
      select: { slug: true },
    });
    if (!slugValue && !current?.slug) {
      return R.badRequest(res, 'Set a storefront link before opening your shop online');
    }
  }

  const shop = await prisma.shop.updateMany({
    where: { id: req.params.id, ownerAccountId: req.user!.accountId },
    data: {
      tradingName, legalName, phone, contactEmail, logoUrl, addressLine1, city, region, currency, timezone, tin, vrn,
      ...(isActive !== undefined && { isActive }),
      ...(mobileMoneyProviders !== undefined && { mobileMoneyProviders }),
      ...(autoPrintReceipts !== undefined && { autoPrintReceipts }),
      ...(slugValue !== undefined && { slug: slugValue }),
      ...(storefrontEnabled !== undefined && { storefrontEnabled }),
      ...(storefrontBio !== undefined && { storefrontBio }),
      ...(storefrontBanner !== undefined && { storefrontBanner }),
      ...(acceptsDelivery !== undefined && { acceptsDelivery }),
      ...(acceptsPickup !== undefined && { acceptsPickup }),
      ...(deliveryFee !== undefined && { deliveryFee: Number(deliveryFee) || 0 }),
      ...(deliveryNote !== undefined && { deliveryNote }),
      ...(minOrderValue !== undefined && { minOrderValue: Number(minOrderValue) || 0 }),
      ...(orderPhone !== undefined && { orderPhone }),
    },
  });
  if (!shop.count) return R.notFound(res, 'Shop not found');
  return R.ok(res, { message: 'Shop updated' });
}

export async function deleteShop(req: AuthRequest, res: Response) {
  await prisma.shop.deleteMany({ where: { id: req.params.id, ownerAccountId: req.user!.accountId } });
  return R.noContent(res);
}

export async function getShopConfig(req: AuthRequest, res: Response) {
  const shop = await prisma.shop.findFirst({
    where: { id: req.params.id, ownerAccountId: req.user!.accountId },
    include: { shopModules: true, unitProfiles: true, taxRules: true, discountRules: true, loyaltyProgram: { include: { tiers: true } } },
  });
  if (!shop) return R.notFound(res);
  const profile = loadBusinessProfile(shop.businessType);
  return R.ok(res, { shop, profile });
}

export async function completeWizardStep(req: AuthRequest, res: Response) {
  const { step, data } = req.body;
  const shopId = req.params.id;

  // Apply step data to shop
  if (step === 4 && data?.units) {
    await prisma.unitProfile.deleteMany({ where: { shopId } });
    await prisma.unitProfile.createMany({ data: data.units.map((u: object) => ({ ...u, shopId })) });
  }
  if (step === 5 && data?.modules) {
    for (const m of data.modules) {
      await prisma.shopModule.upsert({
        where: { shopId_moduleKey: { shopId, moduleKey: m.key } },
        update: { enabled: m.enabled },
        create: { shopId, moduleKey: m.key, enabled: m.enabled, required: m.required || false },
      });
    }
  }
  if (step === 6 && data?.taxRules) {
    for (const t of data.taxRules) {
      await prisma.taxRule.upsert({
        where: { id: t.id || 'new' },
        update: { name: t.name, rate: t.rate, isDefault: t.isDefault },
        create: { shopId, name: t.name, rate: t.rate, isDefault: t.isDefault || false },
      });
    }
  }
  if (step === 8) {
    await prisma.shop.update({ where: { id: shopId }, data: { wizardCompleted: true, configScore: 60 } });
  }

  return R.ok(res, { step, applied: true });
}

export async function deleteTaxRule(req: AuthRequest, res: Response) {
  const shop = await prisma.shop.findFirst({ where: { id: req.params.shopId, ownerAccountId: req.user!.accountId }, select: { id: true } });
  if (!shop) return R.notFound(res, 'Shop not found');
  await prisma.taxRule.deleteMany({ where: { id: req.params.ruleId, shopId: req.params.shopId } });
  return R.noContent(res);
}

// POST /shops/active — switches active shop context, returns new token
export async function setActiveShop(req: AuthRequest, res: Response) {
  const { shopId } = req.body;

  // Allow if the user has an explicit access record OR the shop belongs to their account
  const [access, shop] = await Promise.all([
    prisma.userShopAccess.findUnique({
      where: { userId_shopId: { userId: req.user!.sub, shopId } },
    }),
    prisma.shop.findFirst({
      where: { id: shopId, ownerAccountId: req.user!.accountId },
      select: { id: true },
    }),
  ]);

  if (!access && !shop) return R.forbidden(res, 'No access to this shop');

  const newToken = jwt.sign(
    { sub: req.user!.sub, accountId: req.user!.accountId, role: access?.role || req.user!.role, shopId } as JwtPayload,
    SECRET,
    { expiresIn: '15m' }
  );
  return R.ok(res, { accessToken: newToken, shopId });
}
