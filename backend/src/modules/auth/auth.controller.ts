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
import { checkAccountLock, recordLoginFailure, clearLoginFailures } from '../../core/limiter';
import { issueRefresh, rotateRefresh, revokeCurrent, revokeAll } from '../../core/session';

const SECRET      = process.env.JWT_SECRET         || 'uniduka-secret-change-in-prod';
const ACCESS_TTL  = '20m';

function signAccess(payload: Omit<JwtPayload, 'iat' | 'exp'>) {
  return jwt.sign(payload, SECRET, { expiresIn: ACCESS_TTL });
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

    // The code goes out now, so the verification step that follows registration
    // finds it already sent rather than making the user ask. Fired without
    // await: an SMS gateway is not allowed to decide whether an account gets
    // created, and the code can be resent from the same screen.
    if (phone) {
      void gateSend(phone, 'verify')
        .then((gate) => (gate.allowed ? sendOtp(phone) : false))
        .catch((err) => logger.warn(`Registration phone code failed: ${(err as Error).message}`));
    }

    const accessToken = signAccess({ sub: user.id, accountId: account.id, role: user.role });
    // Set as an httpOnly cookie rather than returned, so no script on the page
    // can read it.
    await issueRefresh(res, req, user.id);
    const daysRemaining = account.subscriptionExpiresAt
      ? Math.max(0, Math.ceil((account.subscriptionExpiresAt.getTime() - Date.now()) / 86_400_000))
      : null;

    return R.created(res, {
      accessToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role,
              phoneVerified: user.phoneVerified ?? false, hasPhone: Boolean(user.phone) },
      account: {
        id: account.id, legalName: account.legalName,
        plan: account.subscriptionPlan, subscriptionActive: account.subscriptionActive,
        subscriptionExpiresAt: account.subscriptionExpiresAt?.toISOString() ?? null,
        daysRemaining,
      },
      verification: {
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

    // Checked before the password is compared, so a locked identity costs an
    // attacker a lookup rather than a bcrypt round. Keyed on the username,
    // which is the half they cannot rotate: spraying works by staying under a
    // per-IP limit while walking many accounts, and only this sees that.
    const lock = await checkAccountLock(identifier);
    if (lock.locked) {
      res.set('Retry-After', String(lock.retryAfter));
      return res.status(429).json({
        success: false,
        message: 'Too many failed attempts on this account. Try again shortly.',
        retryAfter: lock.retryAfter,
      });
    }

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
    if (!user || !user.isActive) {
      // Counted even when no such user exists, so the lock cannot be used to
      // tell a real account from an imaginary one by how it behaves.
      await recordLoginFailure(identifier);
      return R.unauthorized(res, 'Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await recordLoginFailure(identifier);
      return R.unauthorized(res, 'Invalid credentials');
    }

    if (user.twoFaEnabled) {
      if (!totp) return res.status(200).json({ success: true, require2fa: true });
      const ok = speakeasy.totp.verify({ secret: user.twoFaSecret!, encoding: 'base32', token: totp });
      if (!ok) return R.unauthorized(res, 'Invalid 2FA code');
    }

    // Getting in clears the counter, so a few fumbled attempts do not follow
    // someone into their next session.
    await clearLoginFailures(identifier);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const shopAccess = await prisma.userShopAccess.findFirst({ where: { userId: user.id } });
    const accessToken = signAccess({ sub: user.id, accountId: user.ownerAccountId, role: user.role, shopId: shopAccess?.shopId });
    await issueRefresh(res, req, user.id);

    const acct = user.ownerAccount;
    const expiresAt = acct?.subscriptionExpiresAt ?? null;
    const daysRemaining = expiresAt
      ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000))
      : null;

    return R.ok(res, {
      accessToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role,
              phoneVerified: user.phoneVerified ?? false, hasPhone: Boolean(user.phone) },
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
/**
 * Exchange the refresh cookie for a new access token.
 *
 * The token is no longer read from the body, because it is no longer given to
 * the page: it lives in an httpOnly cookie that script cannot reach, which is
 * the point of the change. It rotates on every use, and a spent one being
 * presented again revokes every session for that user.
 */
export async function refresh(req: Request, res: Response) {
  const result = await rotateRefresh(req, res);
  if (!result.ok) {
    return R.unauthorized(res, result.reuse
      // Said plainly, because the honest client in this situation is the one
      // that was logged out, and it deserves to know why.
      ? 'Your session was ended for security reasons. Please sign in again.'
      : 'Session expired. Please sign in again.');
  }

  const user = await prisma.user.findUnique({ where: { id: result.userId! } });
  if (!user || !user.isActive) return R.unauthorized(res);

  const shopAccess = await prisma.userShopAccess.findFirst({ where: { userId: user.id } });
  const accessToken = signAccess({
    sub: user.id, accountId: user.ownerAccountId, role: user.role, shopId: shopAccess?.shopId,
  });
  return R.ok(res, { accessToken });
}

/**
 * Sign out.
 *
 * There was no server-side sign out at all: the client dropped its copy and
 * the refresh token stayed valid for its full week. This revokes it.
 */
export async function logout(req: Request, res: Response) {
  await revokeCurrent(req, res);
  return R.ok(res, { signedOut: true });
}

/** Sign out everywhere, which is what someone does after a scare. */
export async function logoutAll(req: AuthRequest, res: Response) {
  await revokeAll(req.user!.sub);
  await revokeCurrent(req, res);
  return R.ok(res, { signedOut: true });
}

// GET /api/v1/auth/me
export async function me(req: AuthRequest, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { id: true, email: true, fullName: true, phone: true, phoneVerified: true, emailVerified: true, avatarUrl: true, role: true, twoFaEnabled: true, lastLoginAt: true, ownerAccount: { select: { id: true, legalName: true, subscriptionPlan: true } } },
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
/**
 * Find the one account a reset may target.
 *
 * Both the username and the phone must be given, and both must point at the
 * same account. Knowing somebody's phone number is easy — it is on their shop
 * sign — so on its own it was enough to start a reset and put a live code on
 * their handset. Requiring the username as well means an attacker needs two
 * facts, and the owner is not pestered by codes they did not ask for.
 *
 * Returns null for every kind of miss, because the caller must not be able to
 * tell them apart.
 */
async function accountForReset(username: string, phone: string) {
  const variants = phoneVariants(phone);
  const id = String(username).trim();

  // Resolved from the username alone. An OR across both fields would let a
  // wrong username through whenever the phone happened to match, which is
  // the whole requirement undone: the phone is the thing an attacker already
  // knows. The username identifies the account; the phone must then agree.
  const idVariants = phoneVariants(id);
  const user = await prisma.user.findFirst({
    where: {
      isActive: true,
      OR: [{ email: { equals: id, mode: 'insensitive' } }, ...idVariants.map(p => ({ phone: p }))],
    },
    select: { id: true, email: true, phone: true },
  });
  if (!user) return { user: null, why: 'no account for that username' };
  if (!user.phone) return { user: null, why: 'account has no phone number on file' };
  if (!variants.includes(user.phone)) return { user: null, why: 'phone does not match that username' };
  return { user, why: '' };
}

export async function forgotPassword(req: Request, res: Response) {
  const { username, phone } = req.body ?? {};
  if (!phone) return R.badRequest(res, 'Enter your phone number');
  if (!username) return R.badRequest(res, 'Enter the email or phone you sign in with');

  // The same answer is returned whether or not the pair matches an account.
  // Anything else turns this endpoint into a way to ask which phone numbers
  // hold accounts, which is worth more to an attacker than the reset itself.
  const generic = () => R.ok(res, {
    sent: true,
    message: 'If those details match an account, a code is on its way.',
    expiresInMinutes: OTP_TTL_MINUTES,
  });

  const { user, why } = await accountForReset(username, phone);
  if (!user?.phone) {
    // Logged, not returned. "No code arrived" is otherwise indistinguishable
    // from "we never sent one", and support cannot tell the owner which.
    logger.info(`Password reset not sent: ${why}`);
    return generic();
  }
  if (!smsReady) {
    logger.error('Password reset not sent: SMS is not configured');
    return generic();
  }

  // Throttled on the number given, not on the account found, so the cap still
  // applies to numbers that have no account.
  const gate = await gateSend(phone, 'reset');
  if (!gate.allowed) return throttled(res, gate);

  // The result matters. Discarding it made a gateway rejection look exactly
  // like a delivered code, which is the state this flow was stuck in.
  const sent = await sendOtp(user.phone);
  if (!sent) logger.error(`Password reset SMS rejected by the gateway for user ${user.id}`);
  else logger.info(`Password reset code sent to user ${user.id}`);

  return generic();
}

export async function resetPassword(req: Request, res: Response) {
  const { username, phone, code, password } = req.body ?? {};
  if (!phone || !code || !password) return R.badRequest(res, 'Phone, code and new password are all required');
  if (!username) return R.badRequest(res, 'Enter the email or phone you sign in with');
  if (String(password).length < 8) return R.badRequest(res, 'Password must be at least 8 characters');

  const gate = await gateCheck(phone, 'reset');
  if (!gate.allowed) return throttled(res, gate);

  // The same pairing as the step that sent the code. Checking it only on the
  // way out would let a code issued for one account be spent on another.
  const { user } = await accountForReset(username, phone);

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

// GET /api/v1/auth/verification — what still needs confirming
export async function verificationStatus(req: AuthRequest, res: Response) {
  const user = await prisma.user.findUnique({
    where:  { id: req.user!.sub },
    select: { phone: true, phoneVerified: true },
  });
  if (!user) return R.notFound(res, 'User not found');

  // Phone only. Email confirmation was removed: it could not be delivered from
  // this host anyway, since Railway blocks outbound SMTP below the Pro plan,
  // and an unverifiable address on screen is worse than none.
  return R.ok(res, {
    phone: {
      number:    user.phone ? maskPhone(user.phone) : null,
      verified:  user.phoneVerified,
      available: smsReady && Boolean(user.phone),
    },
  });
}

