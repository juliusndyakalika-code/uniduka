import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';
import { screenFields } from '../../core/profanity';

const shop = (req: AuthRequest) => req.user!.shopId!;

/**
 * Money is stored as a float, so a balance that should be zero can land a
 * fraction either side of it. Half a shilling is below the smallest coin in
 * circulation, so anything inside that is settled.
 */
const EPS = 0.5;

interface LoanTotals {
  repayable: number;
  paid: number;
  outstanding: number;
  isSettled: boolean;
}

function totals(loan: { principal: number; interest: number }, payments: { amount: number }[]): LoanTotals {
  const repayable = loan.principal + loan.interest;
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const outstanding = Math.max(0, repayable - paid);
  return { repayable, paid, outstanding, isSettled: repayable - paid <= EPS };
}

/**
 * Every loan, with what is still owed on each.
 *
 * Deliberately returns settled loans too. A shop needs to show a lender what
 * was already repaid, and hiding a loan the moment it is cleared makes that
 * impossible.
 */
export async function listLoans(req: AuthRequest, res: Response) {
  const { status } = req.query as Record<string, string>;

  const loans = await prisma.loan.findMany({
    where: {
      shopId: shop(req),
      ...(status && ['ACTIVE', 'SETTLED', 'WRITTEN_OFF'].includes(status) && { status: status as never }),
    },
    include: { payments: { orderBy: { paidAt: 'desc' } } },
    orderBy: [{ status: 'asc' }, { receivedAt: 'desc' }],
  });

  const now = Date.now();
  const rows = loans.map(l => {
    const t = totals(l, l.payments);
    return {
      ...l,
      ...t,
      // Overdue is derived, never stored: a stored flag would need a nightly job
      // and would be wrong for the hours between the due date and that job.
      isOverdue: l.status === 'ACTIVE' && !!l.dueAt && l.dueAt.getTime() < now && t.outstanding > EPS,
    };
  });

  const active = rows.filter(l => l.status === 'ACTIVE');
  return R.ok(res, rows, {
    summary: {
      activeCount:  active.length,
      borrowed:     active.reduce((s, l) => s + l.principal, 0),
      outstanding:  active.reduce((s, l) => s + l.outstanding, 0),
      // What borrowing actually costs, across every loan ever taken. This is
      // the only part of a loan that is a real expense.
      interestTotal: rows.reduce((s, l) => s + l.interest, 0),
      overdueCount: active.filter(l => l.isOverdue).length,
    },
  });
}

export async function getLoan(req: AuthRequest, res: Response) {
  const loan = await prisma.loan.findFirst({
    where: { id: req.params.id, shopId: shop(req) },
    include: { payments: { orderBy: { paidAt: 'desc' } } },
  });
  if (!loan) return R.notFound(res, 'Loan not found');
  return R.ok(res, { ...loan, ...totals(loan, loan.payments) });
}

export async function createLoan(req: AuthRequest, res: Response) {
  const { lenderName, lenderPhone, principal, interest = 0, receivedAt, dueAt, purpose, note } = req.body ?? {};

  if (!lenderName || !String(lenderName).trim()) return R.badRequest(res, 'Who lent the money?');
  const amount = Number(principal);
  if (!Number.isFinite(amount) || amount <= 0) return R.badRequest(res, 'Enter the amount borrowed.');
  const extra = Number(interest) || 0;
  if (extra < 0) return R.badRequest(res, 'Interest cannot be negative.');

  // The lender's name goes on statements the shop may show them.
  const unclean = screenFields({ 'lender name': lenderName, purpose, note });
  if (unclean) return R.badRequest(res, unclean);

  const loan = await prisma.loan.create({
    data: {
      shopId: shop(req),
      lenderName: String(lenderName).trim(),
      lenderPhone: lenderPhone ? String(lenderPhone).trim() : undefined,
      principal: amount,
      interest: extra,
      receivedAt: receivedAt ? new Date(receivedAt) : undefined,
      dueAt: dueAt ? new Date(dueAt) : undefined,
      purpose, note,
      recordedById: req.user!.sub,
      recordedByName: await recorderName(req),
    },
    include: { payments: true },
  });
  return R.created(res, { ...loan, ...totals(loan, []) });
}

export async function updateLoan(req: AuthRequest, res: Response) {
  const { lenderName, lenderPhone, principal, interest, receivedAt, dueAt, purpose, note, status } = req.body ?? {};

  const existing = await prisma.loan.findFirst({
    where: { id: req.params.id, shopId: shop(req) },
    include: { payments: true },
  });
  if (!existing) return R.notFound(res, 'Loan not found');

  const unclean = screenFields({ 'lender name': lenderName, purpose, note });
  if (unclean) return R.badRequest(res, unclean);

  // Changing the amounts must not leave a loan claiming more was repaid than is
  // owed, which would show a negative balance on the shop's own statement.
  const newPrincipal = principal !== undefined ? Number(principal) : existing.principal;
  const newInterest  = interest  !== undefined ? Number(interest)  : existing.interest;
  if (!Number.isFinite(newPrincipal) || newPrincipal <= 0) return R.badRequest(res, 'Enter the amount borrowed.');
  if (!Number.isFinite(newInterest) || newInterest < 0)    return R.badRequest(res, 'Interest cannot be negative.');

  const alreadyPaid = existing.payments.reduce((s, p) => s + p.amount, 0);
  if (newPrincipal + newInterest < alreadyPaid - EPS) {
    return R.badRequest(res, `Repayments already total ${alreadyPaid.toLocaleString()}. The loan cannot be less than that.`);
  }

  const loan = await prisma.loan.update({
    where: { id: existing.id },
    data: {
      ...(lenderName  !== undefined && { lenderName: String(lenderName).trim() }),
      ...(lenderPhone !== undefined && { lenderPhone }),
      ...(principal   !== undefined && { principal: newPrincipal }),
      ...(interest    !== undefined && { interest: newInterest }),
      ...(receivedAt  !== undefined && { receivedAt: new Date(receivedAt) }),
      ...(dueAt       !== undefined && { dueAt: dueAt ? new Date(dueAt) : null }),
      ...(purpose     !== undefined && { purpose }),
      ...(note        !== undefined && { note }),
      ...(status      !== undefined && { status }),
    },
    include: { payments: { orderBy: { paidAt: 'desc' } } },
  });

  await syncStatus(loan.id);
  const fresh = await prisma.loan.findUnique({ where: { id: loan.id }, include: { payments: true } });
  return R.ok(res, { ...fresh!, ...totals(fresh!, fresh!.payments) });
}

/**
 * Record a repayment, in part or in full.
 *
 * Overpayment is rejected rather than absorbed. A number larger than the
 * balance is a typo far more often than a gift from the lender, and silently
 * accepting it leaves the shop's record disagreeing with the lender's.
 */
export async function addPayment(req: AuthRequest, res: Response) {
  const { amount, paymentMethod, reference, paidAt, note, payInFull } = req.body ?? {};

  const loan = await prisma.loan.findFirst({
    where: { id: req.params.id, shopId: shop(req) },
    include: { payments: true },
  });
  if (!loan) return R.notFound(res, 'Loan not found');

  const t = totals(loan, loan.payments);
  if (t.isSettled) return R.badRequest(res, 'This loan is already fully repaid.');

  // "Pay it off" is the common case and should not require the shop to work out
  // the remaining balance themselves.
  const value = payInFull ? t.outstanding : Number(amount);
  if (!Number.isFinite(value) || value <= 0) return R.badRequest(res, 'Enter the amount being repaid.');
  if (value > t.outstanding + EPS) {
    return R.badRequest(res, `Only ${t.outstanding.toLocaleString()} is still owed on this loan.`);
  }

  await prisma.loanPayment.create({
    data: {
      loanId: loan.id,
      shopId: loan.shopId,
      amount: value,
      paymentMethod, reference, note,
      paidAt: paidAt ? new Date(paidAt) : undefined,
      recordedById: req.user!.sub,
      recordedByName: await recorderName(req),
    },
  });

  await syncStatus(loan.id);
  const fresh = await prisma.loan.findUnique({
    where: { id: loan.id },
    include: { payments: { orderBy: { paidAt: 'desc' } } },
  });
  return R.created(res, { ...fresh!, ...totals(fresh!, fresh!.payments) });
}

export async function deletePayment(req: AuthRequest, res: Response) {
  const payment = await prisma.loanPayment.findFirst({
    where: { id: req.params.paymentId, shopId: shop(req), loanId: req.params.id },
  });
  if (!payment) return R.notFound(res, 'Repayment not found');

  await prisma.loanPayment.delete({ where: { id: payment.id } });
  // Removing a repayment can reopen a loan that had been marked settled.
  await syncStatus(payment.loanId);
  return R.ok(res, { removed: true });
}

export async function deleteLoan(req: AuthRequest, res: Response) {
  const loan = await prisma.loan.findFirst({
    where: { id: req.params.id, shopId: shop(req) },
    include: { payments: true },
  });
  if (!loan) return R.notFound(res, 'Loan not found');

  // A loan with repayments against it is a financial record, not a draft. Mark
  // it written off instead, which keeps the history the shop may need to show.
  if (loan.payments.length > 0) {
    return R.badRequest(res, 'This loan has repayments recorded. Mark it written off instead of deleting it.');
  }

  await prisma.loan.delete({ where: { id: loan.id } });
  return R.ok(res, { deleted: true });
}

/**
 * The name of whoever is logging this, snapshotted onto the row.
 *
 * The token carries the user id but not the name, and the name is stored rather
 * than joined so the record still reads correctly after that staff member is
 * removed from the shop.
 */
async function recorderName(req: AuthRequest): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { fullName: true },
  });
  return user?.fullName ?? null;
}

/** Keep status in step with the balance, in both directions. */
async function syncStatus(loanId: string) {
  const loan = await prisma.loan.findUnique({ where: { id: loanId }, include: { payments: true } });
  if (!loan || loan.status === 'WRITTEN_OFF') return;

  const { isSettled } = totals(loan, loan.payments);
  if (isSettled && loan.status !== 'SETTLED') {
    await prisma.loan.update({ where: { id: loanId }, data: { status: 'SETTLED', settledAt: new Date() } });
  } else if (!isSettled && loan.status === 'SETTLED') {
    await prisma.loan.update({ where: { id: loanId }, data: { status: 'ACTIVE', settledAt: null } });
  }
}
