/**
 * @fileoverview Feature guards for mode-specific functionality.
 * 
 * Use these guards to protect code that should only run in a specific mode.
 * - Restaurant mode: Mesas, meseros, comandas, login por PIN
 * - Retail mode: CXC, clientes, documentos, crédito
 */
import { env } from "@/lib/env";

// ---------------------
// Restaurant Mode Guards
// ---------------------

export const RESTAURANT_DISABLED_MESSAGE = "Funcionalidad deshabilitada para modo retail";

/**
 * Throws if the system is NOT in restaurant mode.
 * Use this to protect restaurant-only functionality.
 */
export const assertRestaurantFeatureEnabled = (): void => {
  if (!env.features.isRestaurant) {
    throw new Error(RESTAURANT_DISABLED_MESSAGE);
  }
};

/**
 * Returns true if restaurant mode is enabled.
 */
export const isRestaurantFeatureEnabled = (): boolean => env.features.isRestaurant;

// ---------------------
// Retail Mode Guards
// ---------------------

export const RETAIL_DISABLED_MESSAGE = "El módulo de Cuentas por Cobrar no está disponible en modo restaurante";

/**
 * Throws if the system is NOT in retail mode.
 * Use this to protect CXC/retail-only functionality.
 */
export const assertRetailFeatureEnabled = (): void => {
  if (!env.features.retailModeEnabled) {
    throw new Error(RETAIL_DISABLED_MESSAGE);
  }
};

/**
 * Returns true if retail mode (CXC) is enabled.
 */
export const isRetailFeatureEnabled = (): boolean => env.features.retailModeEnabled;

// ---------------------
// Combined Check
// ---------------------

/**
 * Returns the current mode name.
 */
export const getCurrentMode = (): "restaurant" | "retail" => {
  return env.features.isRestaurant ? "restaurant" : "retail";
};

/**
 * Checks if a feature scope matches the current mode.
 */
export const isFeatureScopeEnabled = (scope: "restaurant" | "retail"): boolean => {
  if (scope === "restaurant") {
    return env.features.isRestaurant;
  }
  return env.features.retailModeEnabled;
};
