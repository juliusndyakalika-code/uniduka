import type { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma';
import { logger } from '../utils/logger';
import type { JwtPayload } from '../types';

/**
 * Authentication and authorisation for the realtime channel.
 *
 * The socket namespace previously accepted any connection: no token, an empty
 * token and a forged one were all let through, and `join_shop` joined whatever
 * shop id it was handed. Since `new` and `kds_update` carry live order data
 * for a shop, anyone who could guess a shop id could subscribe to another
 * tenant's sales as they happened. That is the realtime equivalent of the
 * cross-tenant leak the HTTP side already guards against, and it had none of
 * the same checks.
 *
 * Two rules, because one is not enough. The connection must carry a valid
 * token, and a join must be for a shop that token's account actually owns.
 * Authenticating alone would still let a real customer of one shop subscribe
 * to another.
 */

const SECRET = process.env.JWT_SECRET || 'uniduka-secret-change-in-prod';

/** What the socket knows about whoever opened it. */
export interface SocketPrincipal {
  userId: string;
  accountId: string;
  role: string;
}

type AuthedSocket = Socket & { principal?: SocketPrincipal };

/**
 * Shops an account may listen to, cached briefly.
 *
 * A join is a cheap, frequent action and this would otherwise be a database
 * round trip each time. Thirty seconds is short enough that a shop removed
 * from an account stops being joinable promptly, and long enough that
 * reconnect storms after a deploy do not become a query storm.
 */
const shopCache = new Map<string, { at: number; ids: Set<string> }>();
const CACHE_MS = 30_000;

async function shopsFor(accountId: string): Promise<Set<string>> {
  const hit = shopCache.get(accountId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ids;

  const rows = await prisma.shop.findMany({
    where:  { ownerAccountId: accountId },
    select: { id: true },
  });
  const ids = new Set(rows.map(r => r.id));
  shopCache.set(accountId, { at: Date.now(), ids });
  return ids;
}

/** Called when a shop is created or removed, so the next join sees it. */
export function invalidateShopCache(accountId: string) {
  shopCache.delete(accountId);
}

export function installSocketAuth(io: SocketServer) {
  /**
   * Rejected at connect time rather than at join time.
   *
   * Refusing the handshake means an unauthenticated client never holds an open
   * connection at all, instead of holding one and being refused later, which
   * is both cheaper and much easier to reason about.
   */
  io.use((socket: AuthedSocket, next) => {
    // The token may arrive in the auth payload, which is where the client puts
    // it, or as a bearer header for non-browser clients.
    const fromAuth = (socket.handshake.auth as { token?: string } | undefined)?.token;
    const header   = socket.handshake.headers.authorization;
    const token    = fromAuth || (header?.startsWith('Bearer ') ? header.slice(7) : undefined);

    if (!token) return next(new Error('UNAUTHENTICATED'));

    try {
      const payload = jwt.verify(token, SECRET) as JwtPayload;
      if (!payload?.sub || !payload.accountId) return next(new Error('UNAUTHENTICATED'));
      socket.principal = { userId: payload.sub, accountId: payload.accountId, role: payload.role };
      return next();
    } catch {
      // Expired and forged are answered identically. Which one it was is not
      // the client's business, and the client reconnects the same way either.
      return next(new Error('UNAUTHENTICATED'));
    }
  });

  io.on('connection', (socket: AuthedSocket) => {
    const who = socket.principal!;
    logger.info(`Socket connected: ${socket.id} (account ${who.accountId})`);

    /**
     * Join a shop room, if it belongs to the caller.
     *
     * The shop id from the client is a request, never a fact. A refusal is
     * reported back rather than silently ignored, which is how the assessment
     * found this: the old handler accepted every join without a word, so there
     * was nothing to distinguish a permitted join from a refused one.
     */
    const join = async (shopId: unknown) => {
      if (typeof shopId !== 'string' || !shopId) {
        socket.emit('join_error', { shopId, message: 'A shop id is required' });
        return;
      }
      try {
        const allowed = await shopsFor(who.accountId);
        if (!allowed.has(shopId)) {
          logger.warn(`Socket ${socket.id} (account ${who.accountId}) refused shop ${shopId}`);
          socket.emit('join_error', { shopId, message: 'Not permitted for this shop' });
          return;
        }
        socket.join(`shop:${shopId}`);
        socket.emit('joined', { shopId });
      } catch (err) {
        logger.error(`Socket join failed: ${(err as Error).message}`);
        socket.emit('join_error', { shopId, message: 'Could not join right now' });
      }
    };

    socket.on('join_shop', join);
    socket.on('join:shop', join);
    socket.on('disconnect', () => logger.info(`Socket disconnected: ${socket.id}`));
  });
}
