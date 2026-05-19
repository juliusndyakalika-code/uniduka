import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';
import crypto from 'crypto';

const shop = (req: AuthRequest) => req.user!.shopId!;

export async function listWebhooks(req: AuthRequest, res: Response) {
  return R.ok(res, await prisma.webhook.findMany({ where: { shopId: shop(req) } }));
}
export async function createWebhook(req: AuthRequest, res: Response) {
  const { url, events } = req.body;
  const secret = crypto.randomBytes(32).toString('hex');
  return R.created(res, await prisma.webhook.create({ data: { shopId: shop(req), url, events, secret } }));
}
export async function deleteWebhook(req: AuthRequest, res: Response) {
  await prisma.webhook.deleteMany({ where: { id: req.params.id, shopId: shop(req) } });
  return R.noContent(res);
}
