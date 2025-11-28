import { env } from "@/lib/env";

export const RESTAURANT_DISABLED_MESSAGE = "Funcionalidad deshabilitada para modo retail";

export const assertRestaurantFeatureEnabled = (): void => {
  if (!env.features.isRestaurant) {
    throw new Error(RESTAURANT_DISABLED_MESSAGE);
  }
};

export const isRestaurantFeatureEnabled = (): boolean => env.features.isRestaurant;
