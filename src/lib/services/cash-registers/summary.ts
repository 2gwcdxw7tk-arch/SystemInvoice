import { CashRegisterClosureSummary, CashRegisterPaymentBreakdown, CashRegisterSessionRecord, ExpectedPayment, ReportedPayment } from "./types";

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

export function buildClosureSummary(params: {
  session: CashRegisterSessionRecord;
  closingUserId: number;
  closingAmount: number;
  closingAt: Date;
  closingNotes: string | null;
  expectedPayments: ExpectedPayment[];
  reportedPayments: ReportedPayment[];
  totalInvoices: number;
}): CashRegisterClosureSummary {
  const expectedMap = new Map<string, { amount: number; txCount: number }>();
  for (const payment of params.expectedPayments) {
    const key = payment.method.trim().toUpperCase();
    expectedMap.set(key, {
      amount: roundCurrency(payment.amount),
      txCount: payment.txCount,
    });
  }

  const reportedMap = new Map<string, { amount: number; txCount: number }>();
  for (const payment of params.reportedPayments) {
    const key = payment.method.trim().toUpperCase();
    const base = reportedMap.get(key) ?? { amount: 0, txCount: 0 };
    reportedMap.set(key, {
      amount: roundCurrency(base.amount + payment.reportedAmount),
      txCount: base.txCount + payment.txCount,
    });
  }

  const breakdown: CashRegisterPaymentBreakdown[] = [];
  const allKeys = new Set<string>([...expectedMap.keys(), ...reportedMap.keys()]);
  for (const key of allKeys) {
    const expected = expectedMap.get(key) ?? { amount: 0, txCount: 0 };
    const reported = reportedMap.get(key) ?? { amount: 0, txCount: 0 };
    const difference = roundCurrency(reported.amount - expected.amount);
    breakdown.push({
      method: key,
      expectedAmount: expected.amount,
      reportedAmount: reported.amount,
      differenceAmount: difference,
      transactionCount: Math.max(expected.txCount, reported.txCount),
    });
  }

  breakdown.sort((a, b) => a.method.localeCompare(b.method));

  const expectedTotal = breakdown.reduce((acc, cur) => acc + cur.expectedAmount, 0);
  const reportedTotal = breakdown.reduce((acc, cur) => acc + cur.reportedAmount, 0);

  return {
    sessionId: params.session.id,
    sessionIdRaw: params.session.idRaw,
    cashRegister: params.session.cashRegister,
    openedByAdminId: params.session.adminUserId,
    openingAmount: params.session.openingAmount,
    openingAt: params.session.openingAt,
    closingByAdminId: params.closingUserId,
    closingAmount: roundCurrency(params.closingAmount),
    closingAt: params.closingAt.toISOString(),
    closingNotes: params.closingNotes,
    expectedTotalAmount: roundCurrency(expectedTotal),
    reportedTotalAmount: roundCurrency(reportedTotal),
    differenceTotalAmount: roundCurrency(reportedTotal - expectedTotal),
    totalInvoices: params.totalInvoices,
    payments: breakdown,
  };
}
