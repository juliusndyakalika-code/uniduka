import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';

import { connectDB } from './core/prisma';
import { startNoticeScheduler } from './core/notices';
import { startReportScheduler } from './core/reportScheduler';
import { connectRedis } from './core/redis';
import { globalLimiter } from './core/limiter';
import { installSocketAuth } from './core/socketAuth';
import { logger } from './utils/logger';
import { asyncRoutes } from './utils/asyncRoutes';
import { authenticate } from './middleware/auth';
import { requireActiveSubscription } from './middleware/subscription';

import authRoutes       from './modules/auth/auth.routes';
import tenantRoutes     from './modules/tenant/tenant.routes';
import shopRoutes       from './modules/shops/shops.routes';
import businessRoutes   from './modules/business-types/business.routes';
import unitsRoutes      from './modules/units/units.routes';
import inventoryRoutes  from './modules/inventory/inventory.routes';
import posRoutes        from './modules/pos/pos.routes';
import crmRoutes        from './modules/crm/crm.routes';
import loyaltyRoutes    from './modules/loyalty/loyalty.routes';
import apptRoutes       from './modules/appointments/appointments.routes';
import reportingRoutes  from './modules/reporting/reporting.routes';
import usersRoutes      from './modules/users/users.routes';
import kdsRoutes        from './modules/kds/kds.routes';
import webhookRoutes    from './modules/webhooks/webhooks.routes';
import platformRoutes   from './modules/platform/platform.routes';
import consignmentRoutes from './modules/consignment/consignment.routes';
import timeclockRoutes  from './modules/timeclock/timeclock.routes';
import workOrderRoutes  from './modules/work-orders/workOrders.routes';
import hotelRoutes      from './modules/hotel/hotel.routes';
import expensesRoutes   from './modules/expenses/expenses.routes';
import storefrontRoutes from './modules/storefront/storefront.routes';
import ordersRoutes     from './modules/orders/orders.routes';
import invoicesRoutes   from './modules/invoices/invoices.routes';
import notificationRoutes from './modules/notifications/notifications.routes';
import loansRoutes     from './modules/loans/loans.routes';
import billingRoutes   from './modules/billing/billing.routes';

const app  = express();
const http = createServer(app);

/**
 * Browser origins allowed to call this API.
 *
 * CORS_ORIGIN takes a comma-separated list, not a single value: while a domain
 * is being moved, the old address and the new one are both live, and a single
 * origin would lock out whichever is not named. Leave it unset to allow any
 * origin — convenient locally, worth tightening once the domain is settled.
 *
 *   CORS_ORIGIN=https://mauzohalisi.com,https://www.mauzohalisi.com
 */
const allowedOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map(s => s.trim().replace(/\/$/, ''))   // tolerate a trailing slash
  .filter(Boolean);

type OriginCallback = (err: Error | null, allow?: boolean) => void;

const corsOrigin = allowedOrigins.length === 0
  ? '*'
  : (origin: string | undefined, cb: OriginCallback) => {
      // No Origin header on same-origin navigations, curl, and server-to-server
      // calls — those are not the cross-site requests CORS exists to police.
      if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ''))) return cb(null, true);

      // Withhold permission rather than raising. Passing an Error here sends it
      // to the global handler, which logged "Unhandled error" and answered 500 —
      // so any bot probing from a random origin looked like a server fault and
      // buried real errors in the log.
      //
      // CORS is enforced by the browser: with no Access-Control-Allow-Origin
      // header the browser refuses to expose the response, which is the whole
      // mechanism. It was never a server-side guard — Origin is trivially forged
      // by anything that is not a browser, so authentication does the real work.
      logger.warn(`CORS: origin not allowed — ${origin}`);
      cb(null, false);
    };

export const io = new SocketServer(http, {
  cors: { origin: corsOrigin as never },
});

// ── Static files & APK download ──────────────────────────────────────────────
app.use(express.static('public'));
// Android build download. The target is configurable so it does not have to be
// redeployed when the file moves; /uniduka.apk stays as a redirect because
// links to it may already be shared.
const APK_URL = process.env.APK_URL || 'https://mauzohalisi.com/mauzohalisi.apk';
app.get('/mauzohalisi.apk', (_req, res) => res.redirect(APK_URL));
app.get('/uniduka.apk',     (_req, res) => res.redirect(301, '/mauzohalisi.apk'));

// ── Security ──────────────────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: corsOrigin as never, credentials: true }));
// Backed by Redis so the ceiling is the number configured rather than that
// number multiplied by however many replicas happen to be running. The old
// in-process counter answered identical requests with a mix of 200 and 429
// depending on which instance took them.
app.use(globalLimiter);

// ── Parsers ───────────────────────────────────────────────────────────────────
// The refresh token arrives as a cookie now, so it has to be parsed.
app.use(cookieParser());
app.use(compression());
app.use(express.json({
  limit: '2mb',
  // Keep the raw bytes. SplashPay signs the body it sent, and re-serialising
  // the parsed object changes key order and whitespace, so the HMAC would
  // never match. Costs one buffer reference per request.
  verify: (req, _res, buf) => { (req as express.Request & { rawBody?: Buffer }).rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: (m) => logger.http(m.trim()) } }));

// ── Routes ────────────────────────────────────────────────────────────────────
const v1 = '/api/v1';
app.use(`${v1}/auth`,       asyncRoutes(authRoutes));
app.use(`${v1}/tenant`,     asyncRoutes(tenantRoutes));
app.use(`${v1}/shops`,      asyncRoutes(shopRoutes));
app.use(`${v1}/business`,   asyncRoutes(businessRoutes));
app.use(`${v1}/units`,      asyncRoutes(unitsRoutes));
// PUBLIC storefront — intentionally unauthenticated. Only serves shops that
// opted in via storefrontEnabled, and only their published products. Each
// endpoint carries its own rate limit (see storefront.routes.ts).
app.use(`${v1}/public`,     asyncRoutes(storefrontRoutes));
// All routes below this line require an active subscription
const subscriptionGate = [authenticate, requireActiveSubscription];
app.use(`${v1}/inventory`,    subscriptionGate, asyncRoutes(inventoryRoutes));
app.use(`${v1}/pos`,          subscriptionGate, asyncRoutes(posRoutes));
app.use(`${v1}/crm`,          subscriptionGate, asyncRoutes(crmRoutes));
app.use(`${v1}/loyalty`,      subscriptionGate, asyncRoutes(loyaltyRoutes));
app.use(`${v1}/appointments`,  subscriptionGate, asyncRoutes(apptRoutes));
app.use(`${v1}/reporting`,    subscriptionGate, asyncRoutes(reportingRoutes));
app.use(`${v1}/users`,        subscriptionGate, asyncRoutes(usersRoutes));
app.use(`${v1}/kds`,          subscriptionGate, asyncRoutes(kdsRoutes));
app.use(`${v1}/webhooks`,     asyncRoutes(webhookRoutes));
app.use(`${v1}/platform`,     asyncRoutes(platformRoutes));
app.use(`${v1}/consignment`,  subscriptionGate, asyncRoutes(consignmentRoutes));
app.use(`${v1}/timeclock`,    subscriptionGate, asyncRoutes(timeclockRoutes));
app.use(`${v1}/work-orders`,  subscriptionGate, asyncRoutes(workOrderRoutes));
app.use(`${v1}/hotel`,        subscriptionGate, asyncRoutes(hotelRoutes));
app.use(`${v1}/expenses`,     subscriptionGate, asyncRoutes(expensesRoutes));
app.use(`${v1}/orders`,       subscriptionGate, asyncRoutes(ordersRoutes));
app.use(`${v1}/invoices`,     subscriptionGate, asyncRoutes(invoicesRoutes));
app.use(`${v1}/notifications`, subscriptionGate, asyncRoutes(notificationRoutes));
app.use(`${v1}/loans`,         subscriptionGate, asyncRoutes(loansRoutes));
// Deliberately not behind subscriptionGate: an expired account has to be able
// to reach the page that renews it.
app.use(`${v1}/billing`,       asyncRoutes(billingRoutes));

// ── Health ────────────────────────────────────────────────────────────────────
// Deliberately says nothing but "up". The exact version told an unauthenticated
// caller which published vulnerabilities to go looking for, and a health check
// needs none of it. The build is still identifiable internally through Railway.
app.get('/',       (_, res) => res.json({ status: 'ok' }));
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // A body the parser could not read is the caller's mistake, not ours. It
  // was answering 500, which is wrong on its face and also fills the error
  // logs with noise that hides real incidents.
  const syntax = err as Error & { status?: number; type?: string };
  if (syntax instanceof SyntaxError && syntax.status === 400 && 'body' in syntax) {
    return res.status(400).json({ success: false, message: 'Malformed JSON in request body' });
  }
  // Likewise for a body over the limit, which express-json raises the same way.
  if (syntax.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request body too large' });
  }

  logger.error(`Unhandled error: ${err.stack || err.message}`);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ── Socket.IO (KDS + real-time POS) ──────────────────────────────────────────
// Authentication and per-shop authorisation for the realtime channel. The
// namespace used to accept any connection and join any shop id, which meant a
// stranger could subscribe to another tenant's live orders.
installSocketAuth(io);

// ── Boot ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  // Deliberately does not exit. Handlers are wrapped by asyncRoutes, so a
  // rejection arriving here is a bug somewhere off the request path — and
  // taking the API down for every shop is a worse answer to it than a log
  // line. uncaughtException still exits, because that really is unknown state.
  logger.error(`Unhandled rejection: ${reason instanceof Error ? reason.stack : String(reason)}`);
});

(async () => {
  await connectDB();
  await connectRedis().catch(() => logger.warn('Redis unavailable — continuing without cache'));
  http.listen(PORT, () => {
    logger.info(`MauzoHalisi API listening on :${PORT}`);
    startNoticeScheduler();
    startReportScheduler();
  });
})();

export default app;
