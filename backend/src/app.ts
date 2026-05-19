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

const app  = express();
const http = createServer(app);
export const io = new SocketServer(http, {
  cors: { origin: process.env.CORS_ORIGIN || '*' },
});

// ── Security ──────────────────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
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
app.use(`${v1}/webhooks`,   webhookRoutes);
app.use(`${v1}/platform`,   platformRoutes);

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/', (_, res) => res.json({ status: 'ok', service: 'UniDuka API', version: '4.0.0' }));
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'UniDuka API', version: '4.0.0' }));

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
  socket.on('join_shop', (shopId: string) => socket.join(`shop:${shopId}`));
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
  http.listen(PORT, () => logger.info(`UniDuka API listening on :${PORT}`));
})();

export default app;
