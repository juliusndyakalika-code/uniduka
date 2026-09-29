import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { Prisma } from '@prisma/client';
import { prisma } from '../../core/prisma';
import { AuthRequest, JwtPayload } from '../../types';
import * as R from '../../utils/response';
import { logger } from '../../utils/logger';
import { screenFields } from '../../core/profanity';
import { normalizePhone, phoneVariants } from '../../utils/phone';
import { sendOtp, verifyOtp, smsReady, OTP_TTL_MINUTES } from '../../core/sms';
import { gateSend, gateCheck, recordFailure, clearAttempts } from './otp';
import { sendVerificationEmail, mailReady } from '../../core/mailer';
import crypto from 'crypto';

const SECRET      = process.env.JWT_SECRET         || 'uniduka-secret-change-in-prod';
const REFRESH_KEY = process.env.JWT_REFRESH_SECRET || 'uniduka-refresh-secret';
const ACCESS_TTL  = '20m';
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
    const { email, password, fullName, legalName, phone: rawPhone } = req.body;
    if (!email || !password || !fullName || !legalName) return R.badRequest(res, 'Missing required fields');

    // Both end up on receipts and invoices, so screen before the account exists.
    const unclean = screenFields({ 'business name': legalName, 'name': fullName });
    if (unclean) return R.badRequest(res, unclean);

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return R.conflict(res, 'Email already registered');

    // Phone is a login identifier — User.phone is unique and `login` accepts a
    // phone as the username — so a duplicate has to be refused. Match against
    // every stored format rather than just the normalised one: accounts created
    // before normalisation existed hold values like 0712345678, and checking
    // only +255712345678 would miss them and let the insert fail as a 500.
    const phone = rawPhone ? normalizePhone(rawPhone) : undefined;
    if (rawPhone) {
      const taken = await prisma.user.findFirst({
        where: { phone: { in: phoneVariants(rawPhone) } },
        select: { id: true },
      });
      if (taken) return R.conflict(res, 'That phone number is already registered');
    }

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

    // Both codes go out now, so the verification step that follows registration
    // finds them already sent rather than making the user ask. Fired without
    // await and without a catch that matters: neither a mail server nor an SMS
    // gateway is allowed to decide whether an account gets created, and both
    // codes can be resent from inside the app.
    void issueEmailCode(user.id, user.email ?? email, user.fullName)
      .catch((err) => logger.warn(`Registration email code failed: ${(err as Error).message}`));
    if (phone) {
      void gateSend(phone, 'verify')
        .then((gate) => (gate.allowed ? sendOtp(phone) : false))
        .catch((err) => logger.warn(`Registration phone code failed: ${(err as Error).message}`));
    }

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
      verification: {
        emailSent: mailReady,
        phoneSent: smsReady && Boolean(phone),
      },
    });
  } catch (err) {
    // Two people registering the same phone or email at the same moment both
    // clear the checks above, and whoever loses hits the unique index. So does
    // an OwnerAccount holding an email no User row carries. Either way it is a
    // 409 the form can show, not the opaque 500 the generic handler returns.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const field = (err.meta?.target as string[] | undefined)?.[0];
      const label = field === 'phone' ? 'phone number' : field === 'email' ? 'email' : 'account';
      return R.conflict(res, `That ${label} is already registered`);
    }
    next(err);
  }
}

// POST /api/v1/auth/login
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { username, password, totp } = req.body;
    const identifier = (username || '').trim();
    if (!identifier || !password) return R.badRequest(res, 'Username and password required');

    const variants = phoneVariants(identifier);

    const matches = await prisma.user.findMany({
      where: {
        OR: [
          { email: identifier },
          ...variants.map(p => ({ phone: p })),
        ],
      },
      include: { ownerAccount: true },
    });

    let user = matches.length === 1 ? matches[0] : null;
    if (matches.length > 1) {
      // Prefer exact email match to resolve ambiguity
      const byEmail = matches.find(u => u.email === identifier);
      if (byEmail) {
        user = byEmail;
      } else {
        return R.badRequest(res, 'Multiple accounts share this phone number. Please sign in with your email address instead.');
      }
    }
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

// PATCH /api/v1/auth/me
export async function updateMe(req: AuthRequest, res: Response) {
  const { fullName, email, phone: rawPhone } = req.body;
  const phone = rawPhone ? normalizePhone(rawPhone) : rawPhone;
  if (email !== undefined && email !== '') {
    const conflict = await prisma.user.findFirst({ where: { email, NOT: { id: req.user!.sub } } });
    if (conflict) return R.conflict(res, 'Email already in use');
  }
  if (phone) {
    const conflict = await prisma.user.findFirst({ where: { phone, NOT: { id: req.user!.sub } } });
    if (conflict) return R.conflict(res, 'Phone number already in use');
  }
  const updated = await prisma.user.update({
    where: { id: req.user!.sub },
    data: {
      ...(fullName && { fullName }),
      ...(email !== undefined && { email: email || null }),
      ...(rawPhone !== undefined && { phone: phone || null }),
    },
    select: { id: true, fullName: true, email: true, phone: true },
  });
  return R.ok(res, updated);
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
  const secret = speakeasy.generateSecret({ name: `MauzoHalisi:${req.user!.sub}`, length: 20 });
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

// ─── PHONE VERIFICATION & PASSWORD RESET BY SMS ──────────────────────────────

/**
 * 429 with the wait, so a client can show "try again in N seconds".
 *
 * A cooldown and a cap are both refusals but they mean opposite things to the
 * person reading them. A cooldown says the code is already on its way; telling
 * them they have made too many attempts invites them to keep trying, which is
 * the behaviour the cooldown exists to stop.
 */
function throttled(res: Response, gate: { retryAfter?: number; reason?: 'cooldown' | 'capped' }) {
  if (gate.retryAfter) res.set('Retry-After', String(gate.retryAfter));
  return res.status(429).json({
    success: false,
    message: gate.reason === 'cooldown'
      ? 'A code was just sent. Please wait a moment before asking for another.'
      : 'Too many attempts. Please try again later.',
    retryAfter: gate.retryAfter ?? null,
    reason: gate.reason ?? 'capped',
  });
}

// POST /api/v1/auth/phone/send-otp — code to the signed-in user's own number
export async function sendPhoneOtp(req: AuthRequest, res: Response) {
  if (!smsReady) return R.badRequest(res, 'SMS is not configured');

  const user = await prisma.user.findUnique({
    where:  { id: req.user!.sub },
    select: { phone: true, phoneVerified: true },
  });
  if (!user?.phone) return R.badRequest(res, 'Add a phone number to your profile first');
  if (user.phoneVerified) return R.ok(res, { alreadyVerified: true });

  const gate = await gateSend(user.phone, 'verify');
  if (!gate.allowed) return throttled(res, gate);

  const sent = await sendOtp(user.phone);
  if (!sent) return R.serverError(res, 'Could not send the code. Please try again shortly.');

  // The number is echoed back masked so the user can tell they are about to
  // check the right handset without the full number appearing in a log or on a
  // shared screen.
  return R.ok(res, { sent: true, phone: maskPhone(user.phone), expiresInMinutes: OTP_TTL_MINUTES });
}

// POST /api/v1/auth/phone/verify — consume the code, mark the number reachable
export async function verifyPhoneOtp(req: AuthRequest, res: Response) {
  const { code } = req.body ?? {};
  if (!code) return R.badRequest(res, 'Enter the code we sent you');

  const user = await prisma.user.findUnique({
    where:  { id: req.user!.sub },
    select: { phone: true, phoneVerified: true },
  });
  if (!user?.phone) return R.badRequest(res, 'No phone number on this account');
  if (user.phoneVerified) return R.ok(res, { verified: true });

  const gate = await gateCheck(user.phone, 'verify');
  if (!gate.allowed) return throttled(res, gate);

  const good = await verifyOtp(user.phone, code);
  if (!good) {
    await recordFailure(user.phone, 'verify');
    return R.badRequest(res, 'That code is wrong or has expired');
  }

  await prisma.user.update({ where: { id: req.user!.sub }, data: { phoneVerified: true } });
  await clearAttempts(user.phone, 'verify');
  return R.ok(res, { verified: true });
}

// POST /api/v1/auth/password/forgot — start a reset with a code by SMS
export async function forgotPassword(req: Request, res: Response) {
  const { phone } = req.body ?? {};
  if (!phone) return R.badRequest(res, 'Enter your phone number');

  // The same answer is returned whether or not the number is registered.
  // Anything else turns this endpoint into a way to ask which phone numbers
  // hold accounts, which is worth more to an attacker than the reset itself.
  const generic = () => R.ok(res, {
    sent: true,
    message: 'If that number has an account, a code is on its way.',
    expiresInMinutes: OTP_TTL_MINUTES,
  });

  const user = await prisma.user.findFirst({
    where:  { phone: { in: phoneVariants(phone) }, isActive: true },
    select: { id: true, phone: true },
  });
  if (!user?.phone || !smsReady) return generic();

  // Throttled on the number given, not on the account found, so the cap still
  // applies to numbers that have no account.
  const gate = await gateSend(phone, 'reset');
  if (!gate.allowed) return throttled(res, gate);

  await sendOtp(user.phone);
  return generic();
}

// POST /api/v1/auth/password/reset — code plus new password, in one step
export async function resetPassword(req: Request, res: Response) {
  const { phone, code, password } = req.body ?? {};
  if (!phone || !code || !password) return R.badRequest(res, 'Phone, code and new password are all required');
  if (String(password).length < 8) return R.badRequest(res, 'Password must be at least 8 characters');

  const gate = await gateCheck(phone, 'reset');
  if (!gate.allowed) return throttled(res, gate);

  const user = await prisma.user.findFirst({
    where:  { phone: { in: phoneVariants(phone) }, isActive: true },
    select: { id: true, phone: true },
  });

  // A wrong code and an unknown number give the same refusal, for the same
  // reason the step before it does. The code is still checked when the account
  // exists, so a valid code cannot be traded for a hint either way.
  const wrong = () => R.badRequest(res, 'That code is wrong or has expired');
  if (!user?.phone) return wrong();

  const good = await verifyOtp(user.phone, code);
  if (!good) {
    await recordFailure(phone, 'reset');
    return wrong();
  }

  const passwordHash = await bcrypt.hash(String(password), 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await clearAttempts(phone, 'reset');

  // No session is issued here. Whoever held the code now has to sign in with
  // the password they just set, which keeps a single SMS from being a login.
  return R.ok(res, { reset: true });
}

/** +255712345678 → +255 712 ••• 678 */
function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length < 6) return '•••';
  return `${phone.slice(0, phone.length - 6)}•••${phone.slice(-3)}`;
}

// ─── EMAIL VERIFICATION ──────────────────────────────────────────────────────

/** How long an email code stays usable. Matches the SMS side deliberately. */
const EMAIL_CODE_TTL_MS = 30 * 60_000;
/** Wrong guesses against one issued code before it is burned. */
const EMAIL_CODE_MAX_ATTEMPTS = 5;

/**
 * A six digit code from the CSPRNG.
 *
 * Math.random is not used here. It is seeded predictably and is not meant to
 * resist anyone trying to guess its next output, which is the whole job.
 */
function sixDigits(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

const hashCode = (code: string) => crypto.createHash('sha256').update(code).digest('hex');

/**
 * Issue and send a fresh email code.
 *
 * Any code still outstanding for the user is consumed first, so only the most
 * recent message works. Without that, every resend would leave another live
 * code behind and asking for five would give an attacker five chances instead
 * of one.
 */
async function issueEmailCode(userId: string, email: string, name?: string): Promise<boolean> {
  const code = sixDigits();
  await prisma.$transaction([
    prisma.emailVerification.updateMany({
      where: { userId, consumedAt: null },
      data:  { consumedAt: new Date() },
    }),
    prisma.emailVerification.create({
      data: {
        userId,
        email: email.trim().toLowerCase(),
        codeHash: hashCode(code),
        expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS),
      },
    }),
  ]);
  return sendVerificationEmail(email, code, name);
}

// POST /api/v1/auth/email/send-otp — code to the signed-in user's address
export async function sendEmailOtp(req: AuthRequest, res: Response) {
  if (!mailReady) return R.badRequest(res, 'Email is not configured');

  const user = await prisma.user.findUnique({
    where:  { id: req.user!.sub },
    select: { email: true, fullName: true, emailVerified: true },
  });
  if (!user?.email) return R.badRequest(res, 'No email address on this account');
  if (user.emailVerified) return R.ok(res, { alreadyVerified: true });

  const gate = await gateSend(user.email, 'email');
  if (!gate.allowed) return throttled(res, gate);

  const sent = await issueEmailCode(req.user!.sub, user.email, user.fullName);
  if (!sent) return R.serverError(res, 'Could not send the code. Please try again shortly.');

  return R.ok(res, { sent: true, email: maskEmail(user.email), expiresInMinutes: 30 });
}

// POST /api/v1/auth/email/verify — consume the code, mark the address confirmed
export async function verifyEmailOtp(req: AuthRequest, res: Response) {
  const { code } = req.body ?? {};
  if (!code) return R.badRequest(res, 'Enter the code we emailed you');

  const user = await prisma.user.findUnique({
    where:  { id: req.user!.sub },
    select: { email: true, emailVerified: true },
  });
  if (!user?.email) return R.badRequest(res, 'No email address on this account');
  if (user.emailVerified) return R.ok(res, { verified: true });

  const gate = await gateCheck(user.email, 'email');
  if (!gate.allowed) return throttled(res, gate);

  const wrong = () => R.badRequest(res, 'That code is wrong or has expired');

  const pending = await prisma.emailVerification.findFirst({
    where:   { userId: req.user!.sub, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!pending) return wrong();

  // The code was issued for whatever address was on the account then. If the
  // address has changed since, that code must not confirm the new one.
  if (pending.email !== user.email.trim().toLowerCase()) return wrong();

  if (pending.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
    await prisma.emailVerification.update({
      where: { id: pending.id }, data: { consumedAt: new Date() },
    });
    return wrong();
  }

  // Compared as fixed-length hex digests under timingSafeEqual, so the
  // comparison itself tells an attacker nothing about how much of a guess was
  // right.
  const supplied = Buffer.from(hashCode(String(code).trim()), 'hex');
  const stored   = Buffer.from(pending.codeHash, 'hex');
  const match    = supplied.length === stored.length && crypto.timingSafeEqual(supplied, stored);

  if (!match) {
    await prisma.emailVerification.update({
      where: { id: pending.id }, data: { attempts: { increment: 1 } },
    });
    await recordFailure(user.email, 'email');
    return wrong();
  }

  await prisma.$transaction([
    prisma.emailVerification.update({ where: { id: pending.id }, data: { consumedAt: new Date() } }),
    prisma.user.update({ where: { id: req.user!.sub }, data: { emailVerified: true } }),
  ]);
  await clearAttempts(user.email, 'email');
  return R.ok(res, { verified: true });
}

// GET /api/v1/auth/verification — what still needs confirming
export async function verificationStatus(req: AuthRequest, res: Response) {
  const user = await prisma.user.findUnique({
    where:  { id: req.user!.sub },
    select: { email: true, phone: true, emailVerified: true, phoneVerified: true },
  });
  if (!user) return R.notFound(res, 'User not found');

  return R.ok(res, {
    email: {
      address:   user.email ? maskEmail(user.email) : null,
      verified:  user.emailVerified,
      available: mailReady && Boolean(user.email),
    },
    phone: {
      number:    user.phone ? maskPhone(user.phone) : null,
      verified:  user.phoneVerified,
      available: smsReady && Boolean(user.phone),
    },
  });
}

/** asha@example.com → a••••@example.com */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '•••';
  const head = local.slice(0, 1);
  return `${head}${'•'.repeat(Math.max(1, local.length - 1))}@${domain}`;
}
