const truthy = new Set(["1", "true", "yes", "on"]);
const falsy = new Set(["0", "false", "no", "off"]);

const parseFlag = (value: string | undefined, defaultValue: boolean) => {
  if (typeof value !== "string") {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (truthy.has(normalized)) {
    return true;
  }
  if (falsy.has(normalized)) {
    return false;
  }
  return defaultValue;
};

const restaurantEnabled = parseFlag(process.env.NEXT_PUBLIC_ES_RESTAURANTE, true);

export const publicFeatures = {
  isRestaurant: restaurantEnabled,
  retailModeEnabled: !restaurantEnabled,
} as const;

export const isRestaurantMode = (): boolean => publicFeatures.isRestaurant;

export const isRetailModeEnabled = (): boolean => publicFeatures.retailModeEnabled;
