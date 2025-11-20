import { toCentralClosedDate, toCentralEndOfDay } from "@/lib/utils/date";

describe("date utils", () => {
  test("toCentralClosedDate clamps date-only strings to Central America midnight", () => {
    const result = toCentralClosedDate("2025-11-20");
    expect(result.toISOString()).toBe("2025-11-20T06:00:00.000Z");
  });

  test("toCentralClosedDate normalizes timestamps to their Central America day", () => {
    const result = toCentralClosedDate("2025-11-20T18:30:00Z");
    expect(result.toISOString()).toBe("2025-11-20T06:00:00.000Z");
  });

  test("toCentralEndOfDay returns the last millisecond of the Central America day", () => {
    const result = toCentralEndOfDay("2025-11-20");
    expect(result.toISOString()).toBe("2025-11-21T05:59:59.999Z");
  });
});
