import type { AppEnv } from "@/lib/env";

describe("env feature flags", () => {
  const ORIGINAL_ENV = { ...process.env };

  const loadEnv = async (): Promise<AppEnv> => {
    return (await import("@/lib/env")).env;
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("interprets NEXT_PUBLIC_ES_RESTAURANTE=false como modo retail", async () => {
    process.env.NEXT_PUBLIC_ES_RESTAURANTE = "false";
    const env = await loadEnv();
    expect(env.features.isRestaurant).toBe(false);
    expect(env.features.retailModeEnabled).toBe(true);
  });

  it("interpreta valores truthy como modo restaurante", async () => {
    process.env.NEXT_PUBLIC_ES_RESTAURANTE = "yes";
    const env = await loadEnv();
    expect(env.features.isRestaurant).toBe(true);
    expect(env.features.retailModeEnabled).toBe(false);
  });

  it("acepta valores falsy alternos como 0", async () => {
    process.env.NEXT_PUBLIC_ES_RESTAURANTE = "0";
    const env = await loadEnv();
    expect(env.features.isRestaurant).toBe(false);
    expect(env.features.retailModeEnabled).toBe(true);
  });
});
