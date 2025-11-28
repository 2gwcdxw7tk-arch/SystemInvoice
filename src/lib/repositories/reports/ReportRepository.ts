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
  CxcSummaryFilters,
  CxcSummaryResult,
  CxcDueAnalysisFilters,
  CxcDueAnalysisResult,
  CxcAgingFilters,
  CxcAgingResult,
  CxcStatementFilters,
  CxcStatementResult,
} from "@/lib/db/reports";

import {
  getSalesSummaryReport,
  getWaiterPerformanceReport,
  getTopItemsReport,
  getInventoryMovementsReport,
  getPurchasesReport,
  getInvoiceStatusReport,
  getCxcSummaryReport,
  getCxcDueAnalysisReport,
  getCxcAgingReport,
  getCxcStatementReport,
} from "@/lib/db/reports";

export interface IReportRepository {
  getSalesSummary(filters: SalesSummaryFilters): Promise<SalesSummaryResult>;
  getWaiterPerformance(filters: WaiterPerformanceFilters): Promise<WaiterPerformanceRow[]>;
  getTopItems(filters: TopItemsFilters): Promise<TopItemRow[]>;
  getInventoryMovements(filters: InventoryMovementsFilters): Promise<InventoryMovementsResult>;
  getPurchases(filters: PurchasesReportFilters): Promise<PurchasesReportRow[]>;
  getInvoiceStatus(filters: InvoiceStatusFilters): Promise<InvoiceStatusResult>;
  getCxcSummary(filters: CxcSummaryFilters): Promise<CxcSummaryResult>;
  getCxcDueAnalysis(filters: CxcDueAnalysisFilters): Promise<CxcDueAnalysisResult>;
  getCxcAging(filters: CxcAgingFilters): Promise<CxcAgingResult>;
  getCxcStatement(filters: CxcStatementFilters): Promise<CxcStatementResult>;
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

  getCxcSummary(filters: CxcSummaryFilters): Promise<CxcSummaryResult> {
    return getCxcSummaryReport(filters);
  }

  getCxcDueAnalysis(filters: CxcDueAnalysisFilters): Promise<CxcDueAnalysisResult> {
    return getCxcDueAnalysisReport(filters);
  }

  getCxcAging(filters: CxcAgingFilters): Promise<CxcAgingResult> {
    return getCxcAgingReport(filters);
  }

  getCxcStatement(filters: CxcStatementFilters): Promise<CxcStatementResult> {
    return getCxcStatementReport(filters);
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
  CxcSummaryFilters,
  CxcSummaryResult,
  CxcDueAnalysisFilters,
  CxcDueAnalysisResult,
  CxcAgingFilters,
  CxcAgingResult,
  CxcStatementFilters,
  CxcStatementResult,
};
