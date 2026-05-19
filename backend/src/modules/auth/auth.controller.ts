import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { prisma } from '../../core/prisma';
import { AuthRequest, JwtPayload } from '../../types';
import * as R from '../../utils/response';

const SECRET      = process.env.JWT_SECRET         || 'uniduka-secret-change-in-prod';
const REFRESH_KEY = process.env.JWT_REFRESH_SECRET || 'uniduka-refresh-secret';
const ACCESS_TTL  = '15m';
const REFRESH_TTL = '7d';

function signAccess(payload: Omit<JwtPayload, 'iat' | 'exp'>) {
  return jwt.sign(payload, SECRET, { expiresIn: ACCESS_TTL });
}
function signRefresh(userId: string) {
  return jwt.sign({ sub: userId }, REFRESH_KEY, { expiresIn: REFRESH_TTL });
}

// POST /api/v1/auth/register — creates owner account + first user
export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password, fullName, legalName, phone } = req.body;
    if (!email || !password || !fullName || !legalName) return R.badRequest(res, 'Missing required fields');

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return R.conflict(res, 'Email already registered');

    const passwordHash = await bcrypt.hash(password, 12);

    // STARTER plan → 30-day free trial; higher plans need admin activation
    const trialExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const account = await prisma.ownerAccount.create({
      data: {
        legalName, email, phone,
        subscriptionPlan:     'STARTER',
        subscriptionActive:   true,
        subscriptionExpiresAt: trialExpiry,
        users: {
          create: { email, passwordHash, fullName, phone, role: 'ACCOUNT_OWNER' },
        },
      },
      include: { users: true },
    });

    const user = account.users[0];
    const accessToken  = signAccess({ sub: user.id, accountId: account.id, role: user.role });
    const refreshToken = signRefresh(user.id);
    const daysRemaining = account.subscriptionExpiresAt
      ? Math.max(0, Math.ceil((account.subscriptionExpiresAt.getTime() - Date.now()) / 86_400_000))
      : null;

    return R.created(res, {
      accessToken, refreshToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
      account: {
        id: account.id, legalName: account.legalName,
        plan: account.subscriptionPlan, subscriptionActive: account.subscriptionActive,
        subscriptionExpiresAt: account.subscriptionExpiresAt?.toISOString() ?? null,
        daysRemaining,
      },
    });
  } catch (err) { next(err); }
}

// POST /api/v1/auth/login
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password, totp } = req.body;
    if (!email || !password) return R.badRequest(res, 'Email and password required');

    const user = await prisma.user.findUnique({ where: { email }, include: { ownerAccount: true } });
    if (!user || !user.isActive) return R.unauthorized(res, 'Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return R.unauthorized(res, 'Invalid credentials');

    if (user.twoFaEnabled) {
      if (!totp) return res.status(200).json({ success: true, require2fa: true });
      const ok = speakeasy.totp.verify({ secret: user.twoFaSecret!, encoding: 'base32', token: totp });
      if (!ok) return R.unauthorized(res, 'Invalid 2FA code');
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const shopAccess = await prisma.userShopAccess.findFirst({ where: { userId: user.id } });
    const accessToken  = signAccess({ sub: user.id, accountId: user.ownerAccountId, role: user.role, shopId: shopAccess?.shopId });
    const refreshToken = signRefresh(user.id);

    const acct = user.ownerAccount;
    const expiresAt = acct?.subscriptionExpiresAt ?? null;
    const daysRemaining = expiresAt
      ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000))
      : null;

    return R.ok(res, {
      accessToken, refreshToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
      account: {
        id:                   user.ownerAccountId,
        legalName:            acct?.legalName ?? '',
        plan:                 acct?.subscriptionPlan ?? 'STARTER',
        subscriptionActive:   acct?.subscriptionActive ?? false,
        subscriptionExpiresAt: expiresAt?.toISOString() ?? null,
        daysRemaining,
      },
      shopId: shopAccess?.shopId,
    });
  } catch (err) { next(err); }
}

// POST /api/v1/auth/refresh
export async function refresh(req: Request, res: Response) {
  const { refreshToken } = req.body;
  if (!refreshToken) return R.badRequest(res, 'Refresh token required');
  try {
    const payload = jwt.verify(refreshToken, REFRESH_KEY) as { sub: string };
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) return R.unauthorized(res);
    const shopAccess = await prisma.userShopAccess.findFirst({ where: { userId: user.id } });
    const newAccess = signAccess({ sub: user.id, accountId: user.ownerAccountId, role: user.role, shopId: shopAccess?.shopId });
    return R.ok(res, { accessToken: newAccess });
  } catch {
    return R.unauthorized(res, 'Invalid refresh token');
  }
}

// GET /api/v1/auth/me
export async function me(req: AuthRequest, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { id: true, email: true, fullName: true, phone: true, avatarUrl: true, role: true, twoFaEnabled: true, lastLoginAt: true, ownerAccount: { select: { id: true, legalName: true, subscriptionPlan: true } } },
  });
  if (!user) return R.notFound(res, 'User not found');
  return R.ok(res, user);
}

// PUT /api/v1/auth/password
export async function changePassword(req: AuthRequest, res: Response) {
  const { currentPassword, newPassword } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) return R.notFound(res);
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return R.badRequest(res, 'Current password incorrect');
  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
  return R.ok(res, { message: 'Password updated' });
}

// POST /api/v1/auth/2fa/setup
export async function setup2fa(req: AuthRequest, res: Response) {
  const secret = speakeasy.generateSecret({ name: `UniDuka:${req.user!.sub}`, length: 20 });
  await prisma.user.update({ where: { id: req.user!.sub }, data: { twoFaSecret: secret.base32 } });
  const qr = await QRCode.toDataURL(secret.otpauth_url!);
  return R.ok(res, { secret: secret.base32, qr });
}

// POST /api/v1/auth/2fa/verify
export async function verify2fa(req: AuthRequest, res: Response) {
  const { totp } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user?.twoFaSecret) return R.badRequest(res, '2FA not set up');
  const ok = speakeasy.totp.verify({ secret: user.twoFaSecret, encoding: 'base32', token: totp });
  if (!ok) return R.badRequest(res, 'Invalid TOTP code');
  await prisma.user.update({ where: { id: user.id }, data: { twoFaEnabled: true } });
  return R.ok(res, { message: '2FA enabled' });
}

// POST /api/v1/auth/2fa/disable
export async function disable2fa(req: AuthRequest, res: Response) {
  await prisma.user.update({ where: { id: req.user!.sub }, data: { twoFaEnabled: false, twoFaSecret: null } });
  return R.ok(res, { message: '2FA disabled' });
}
