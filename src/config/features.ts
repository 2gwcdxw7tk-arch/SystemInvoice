import { env } from "@/lib/env";

type FeatureKey = keyof typeof env.features;

type PublicFeatureMap = typeof env.publicFeatures;

export const getFeatureFlag = (flag: FeatureKey): boolean => env.features[flag];

export const isRestaurant = (): boolean => getFeatureFlag("isRestaurant");

export const isRetailMode = (): boolean => env.features.retailModeEnabled;

export const getPublicFeatures = (): PublicFeatureMap => env.publicFeatures;
