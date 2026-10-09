import { Router, Response } from 'express';
import { AuthRequest } from '../../types';
import { authenticate } from '../../middleware/auth';
import { clientErrorLimiter } from '../../core/limiter';
import { logger } from '../../utils/logger';

/**
 * Errors from the browser, so a broken screen on a till is visible in the
 * admin portal instead of being known only to whoever was standing at it.
 *
 * Signed-in users only. An open endpoint would let anyone write whatever
 * they liked into the error log, and enough distinct junk would push real
 * errors out under the hard cap. Reports are rate limited per user and
 * truncated, then logged through the ordinary logger, which groups and masks
 * them like any other error.
 */

const router = Router();

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v : '').slice(0, n);

router.post('/', authenticate, clientErrorLimiter, (req: AuthRequest, res: Response) => {
  const message = clip(req.body?.message, 500);
  if (!message) return res.status(204).end();

  // Only the path. Query strings can carry search terms and ids.
  const where = clip(req.body?.path, 200).split('?')[0];
  const kind = clip(req.body?.kind, 20) || 'error';
  const stack = clip(req.body?.stack, 4000);

  logger.error(`[web ${kind}] ${message}${where ? ` at ${where}` : ''}${stack ? `\n${stack}` : ''}`);
  res.status(204).end();
});

export default router;
