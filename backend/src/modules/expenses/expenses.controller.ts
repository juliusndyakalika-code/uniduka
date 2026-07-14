import { Response } from 'express';
import { ExpenseCategory } from '@prisma/client';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';

const shop = (req: AuthRequest) => req.user!.shopId!;

const CATEGORIES = Object.values(ExpenseCategory);

// Build the incurredAt date filter from ?from & ?to (YYYY-MM-DD)
function dateRange(req: AuthRequest): { gte?: Date; lte?: Date } | undefined {
  const { from, to } = req.query as Record<string, string>;
  if (!from && !to) return undefined;
  return {
    ...(from && { gte: new Date(`${from}T00:00:00.000Z`) }),
    ...(to && { lte: new Date(`${to}T23:59:59.999Z`) }),
  };
}

export async function listExpenses(req: AuthRequest, res: Response) {
  const { category, page = '1', limit = '100' } = req.query as Record<string, string>;
  const skip = (Number(page) - 1) * Number(limit);
  const range = dateRange(req);

  const where = {
    shopId: shop(req),
    ...(category && CATEGORIES.includes(category as ExpenseCategory) && { category: category as ExpenseCategory }),
    ...(range && { incurredAt: range }),
  };

  const [expenses, total, agg] = await Promise.all([
    prisma.expense.findMany({ where, skip, take: Number(limit), orderBy: { incurredAt: 'desc' }, select: { id: true, category: true, description: true, amount: true, paymentMethod: true, reference: true, vendor: true, incurredAt: true, createdAt: true, recordedByName: true, recordedById: true } }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({ where, _sum: { amount: true } }),
  ]);

  // Per-category totals for the same filter window
  const grouped = await prisma.expense.groupBy({
    by: ['category'],
    where,
    _sum: { amount: true },
    _count: true,
  });
  const byCategory = grouped
    .map(g => ({ category: g.category, total: g._sum.amount ?? 0, count: g._count }))
    .sort((a, b) => b.total - a.total);

  return R.ok(res, { expenses, totalAmount: agg._sum.amount ?? 0, byCategory }, {
    total, page: Number(page), limit: Number(limit),
  });
}

export async function createExpense(req: AuthRequest, res: Response) {
  const { category, description, amount, paymentMethod, reference, vendor, incurredAt } = req.body ?? {};

  if (!description || !String(description).trim()) return R.badRequest(res, 'Description is required');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return R.badRequest(res, 'Amount must be greater than zero');
  if (category && !CATEGORIES.includes(category)) return R.badRequest(res, 'Invalid category');

  const recorder = await prisma.user.findUnique({ where: { id: req.user!.sub }, select: { fullName: true } });

  const expense = await prisma.expense.create({
    data: {
      shopId:         shop(req),
      category:       category ?? 'OTHER',
      description:    String(description).trim(),
      amount:         amt,
      paymentMethod:  paymentMethod || null,
      reference:      reference || null,
      vendor:         vendor || null,
      incurredAt:     incurredAt ? new Date(incurredAt) : new Date(),
      recordedById:   req.user!.sub,
      recordedByName: recorder?.fullName ?? null,
    },
  });
  return R.created(res, expense);
}

export async function updateExpense(req: AuthRequest, res: Response) {
  const { category, description, amount, paymentMethod, reference, vendor, incurredAt } = req.body ?? {};

  if (amount !== undefined) {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return R.badRequest(res, 'Amount must be greater than zero');
  }
  if (category && !CATEGORIES.includes(category)) return R.badRequest(res, 'Invalid category');

  const r = await prisma.expense.updateMany({
    where: { id: req.params.id, shopId: shop(req) },
    data: {
      ...(category !== undefined && { category }),
      ...(description !== undefined && { description: String(description).trim() }),
      ...(amount !== undefined && { amount: Number(amount) }),
      ...(paymentMethod !== undefined && { paymentMethod: paymentMethod || null }),
      ...(reference !== undefined && { reference: reference || null }),
      ...(vendor !== undefined && { vendor: vendor || null }),
      ...(incurredAt !== undefined && { incurredAt: new Date(incurredAt) }),
    },
  });
  if (!r.count) return R.notFound(res);
  return R.ok(res, { message: 'Updated' });
}

export async function deleteExpense(req: AuthRequest, res: Response) {
  const r = await prisma.expense.deleteMany({ where: { id: req.params.id, shopId: shop(req) } });
  if (!r.count) return R.notFound(res);
  return R.noContent(res);
}
