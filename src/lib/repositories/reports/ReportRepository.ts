import "server-only";

import type {
  SalesSummaryFilters,
  SalesSummaryResult,
  WaiterPerformanceFilters,
  WaiterPerformanceRow,
  TopItemsFilters,
  TopItemRow,
  InventoryMovementsFilters,
  InventoryMovementsResult,
  PurchasesReportFilters,
  PurchasesReportRow,
  InvoiceStatusFilters,
  InvoiceStatusResult,
} from "@/lib/db/reports";

import {
  getSalesSummaryReport,
  getWaiterPerformanceReport,
  getTopItemsReport,
  getInventoryMovementsReport,
  getPurchasesReport,
  getInvoiceStatusReport,
} from "@/lib/db/reports";

export interface IReportRepository {
  getSalesSummary(filters: SalesSummaryFilters): Promise<SalesSummaryResult>;
  getWaiterPerformance(filters: WaiterPerformanceFilters): Promise<WaiterPerformanceRow[]>;
  getTopItems(filters: TopItemsFilters): Promise<TopItemRow[]>;
  getInventoryMovements(filters: InventoryMovementsFilters): Promise<InventoryMovementsResult>;
  getPurchases(filters: PurchasesReportFilters): Promise<PurchasesReportRow[]>;
  getInvoiceStatus(filters: InvoiceStatusFilters): Promise<InvoiceStatusResult>;
}

export class ReportRepository implements IReportRepository {
  getSalesSummary(filters: SalesSummaryFilters): Promise<SalesSummaryResult> {
    return getSalesSummaryReport(filters);
  }

  getWaiterPerformance(filters: WaiterPerformanceFilters): Promise<WaiterPerformanceRow[]> {
    return getWaiterPerformanceReport(filters);
  }

  getTopItems(filters: TopItemsFilters): Promise<TopItemRow[]> {
    return getTopItemsReport(filters);
  }

  getInventoryMovements(filters: InventoryMovementsFilters): Promise<InventoryMovementsResult> {
    return getInventoryMovementsReport(filters);
  }

  getPurchases(filters: PurchasesReportFilters): Promise<PurchasesReportRow[]> {
    return getPurchasesReport(filters);
  }

  getInvoiceStatus(filters: InvoiceStatusFilters): Promise<InvoiceStatusResult> {
    return getInvoiceStatusReport(filters);
  }
}

export type {
  SalesSummaryFilters,
  SalesSummaryResult,
  WaiterPerformanceFilters,
  WaiterPerformanceRow,
  TopItemsFilters,
  TopItemRow,
  InventoryMovementsFilters,
  InventoryMovementsResult,
  PurchasesReportFilters,
  PurchasesReportRow,
  InvoiceStatusFilters,
  InvoiceStatusResult,
};
