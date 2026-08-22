import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';

import { connectDB } from './core/prisma';
import { connectRedis } from './core/redis';
import { logger } from './utils/logger';
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
 *   CORS_ORIGIN=https://mauzohalisi.dilikitaa.com,https://web-production-x.up.railway.app
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
      logger.warn(`CORS: blocked origin ${origin}`);
      cb(new Error('Origin not allowed'));
    };

export const io = new SocketServer(http, {
  cors: { origin: corsOrigin as never },
});

// ── Static files & APK download ──────────────────────────────────────────────
app.use(express.static('public'));
app.get('/uniduka.apk', (_req, res) => res.redirect('https://web-production-a0a00.up.railway.app/uniduka.apk'));

// ── Security ──────────────────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: corsOrigin as never, credentials: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false }));

// ── Parsers ───────────────────────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: (m) => logger.http(m.trim()) } }));

// ── Routes ────────────────────────────────────────────────────────────────────
const v1 = '/api/v1';
app.use(`${v1}/auth`,       authRoutes);
app.use(`${v1}/tenant`,     tenantRoutes);
app.use(`${v1}/shops`,      shopRoutes);
app.use(`${v1}/business`,   businessRoutes);
app.use(`${v1}/units`,      unitsRoutes);
// PUBLIC storefront — intentionally unauthenticated. Only serves shops that
// opted in via storefrontEnabled, and only their published products. Each
// endpoint carries its own rate limit (see storefront.routes.ts).
app.use(`${v1}/public`,     storefrontRoutes);
// All routes below this line require an active subscription
const subscriptionGate = [authenticate, requireActiveSubscription];
app.use(`${v1}/inventory`,    subscriptionGate, inventoryRoutes);
app.use(`${v1}/pos`,          subscriptionGate, posRoutes);
app.use(`${v1}/crm`,          subscriptionGate, crmRoutes);
app.use(`${v1}/loyalty`,      subscriptionGate, loyaltyRoutes);
app.use(`${v1}/appointments`,  subscriptionGate, apptRoutes);
app.use(`${v1}/reporting`,    subscriptionGate, reportingRoutes);
app.use(`${v1}/users`,        subscriptionGate, usersRoutes);
app.use(`${v1}/kds`,          subscriptionGate, kdsRoutes);
app.use(`${v1}/webhooks`,     webhookRoutes);
app.use(`${v1}/platform`,     platformRoutes);
app.use(`${v1}/consignment`,  subscriptionGate, consignmentRoutes);
app.use(`${v1}/timeclock`,    subscriptionGate, timeclockRoutes);
app.use(`${v1}/work-orders`,  subscriptionGate, workOrderRoutes);
app.use(`${v1}/hotel`,        subscriptionGate, hotelRoutes);
app.use(`${v1}/expenses`,     subscriptionGate, expensesRoutes);
app.use(`${v1}/orders`,       subscriptionGate, ordersRoutes);
app.use(`${v1}/invoices`,     subscriptionGate, invoicesRoutes);

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/', (_, res) => res.json({ status: 'ok', service: 'MauzoHalisi API', version: '4.0.0' }));
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'MauzoHalisi API', version: '4.0.0' }));

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(`Unhandled error: ${err.stack || err.message}`);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ── Socket.IO (KDS + real-time POS) ──────────────────────────────────────────
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);
  // Clients have historically emitted both spellings; accept either so a
  // mismatch can't silently leave a page out of its shop room.
  const join = (shopId: string) => { if (shopId) socket.join(`shop:${shopId}`); };
  socket.on('join_shop', join);
  socket.on('join:shop', join);
  socket.on('disconnect', () => logger.info(`Socket disconnected: ${socket.id}`));
});

// ── Boot ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

(async () => {
  await connectDB();
  await connectRedis().catch(() => logger.warn('Redis unavailable — continuing without cache'));
  http.listen(PORT, () => logger.info(`MauzoHalisi API listening on :${PORT}`));
})();

export default app;
