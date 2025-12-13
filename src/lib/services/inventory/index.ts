/**
 * @fileoverview Barrel export for inventory services.
 * 
 * The InventoryService is currently a monolithic service (1500+ lines).
 * This module provides shared utilities and types for future refactoring.
 * 
 * ## Future Refactoring Plan
 * 
 * The InventoryService could be split into:
 * - PurchaseService: registerPurchase, listPurchases
 * - ConsumptionService: registerConsumption, listConsumptions
 * - TransferService: registerTransfer, listTransfers
 * - StockQueryService: getStockSummary, listKardex
 * - DocumentService: getTransactionDocument, listTransactionHeaders
 * 
 * For now, we export shared utilities that can be used across these services.
 */

// Shared utilities
export * from "./utils";

// Re-export main service (will be refactored in future phases)
// Note: Import directly from InventoryService.ts for now to avoid circular deps
