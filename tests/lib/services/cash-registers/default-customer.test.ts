import { filterEligibleDefaultCustomers, isDefaultCustomerEligible } from "@/lib/services/cash-registers/default-customer";

describe("default customer eligibility", () => {
  it("returns true only when payment term is CONTADO", () => {
    expect(isDefaultCustomerEligible({ paymentTermCode: "CONTADO" })).toBe(true);
    expect(isDefaultCustomerEligible({ paymentTermCode: "contado" })).toBe(true);
    expect(isDefaultCustomerEligible({ paymentTermCode: " credito " })).toBe(false);
    expect(isDefaultCustomerEligible({ paymentTermCode: "" })).toBe(false);
      expect(isDefaultCustomerEligible({ paymentTermCode: null } as any)).toBe(false);
    expect(isDefaultCustomerEligible(null)).toBe(false);
    expect(isDefaultCustomerEligible(undefined)).toBe(false);
  });

  it("filters a collection leaving only CONTADO customers", () => {
    const customers = [
      { paymentTermCode: "CONTADO", code: "CLI-001" },
      { paymentTermCode: "contado", code: "CLI-002" },
      { paymentTermCode: "CREDITO", code: "CLI-003" },
      { paymentTermCode: null, code: "CLI-004" },
    ];

    const filtered = filterEligibleDefaultCustomers(customers);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((item) => item.code)).toEqual(["CLI-001", "CLI-002"]);
  });
});
