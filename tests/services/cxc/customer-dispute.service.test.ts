describe("CustomerDisputeService (mock)", () => {
  const loadServices = async () => {
    jest.resetModules();
    process.env.MOCK_DATA = "true";
    const { customerDisputeService } = await import("@/lib/services/cxc/CustomerDisputeService");
    const { mockCxcStore } = await import("@/lib/services/cxc/mock-data");
    return { customerDisputeService, mockCxcStore };
  };

  afterAll(() => {
    process.env.MOCK_DATA = "false";
    jest.resetModules();
  });

  it("crea disputas y las lista por estatus", async () => {
    const { customerDisputeService } = await loadServices();

    const dispute = await customerDisputeService.create({
      customerId: 2,
      documentId: 1,
      description: "Producto defectuoso",
      status: "OPEN",
    });

    expect(dispute.id).toBeGreaterThan(0);
    expect(dispute.status).toBe("OPEN");

    const all = await customerDisputeService.list({ customerId: 2 });
    expect(all).toHaveLength(1);

    const filtered = await customerDisputeService.list({ customerId: 2, statuses: ["RESOLVED"] });
    expect(filtered).toHaveLength(0);
  });

  it("actualiza el estado y notas de la disputa", async () => {
    const { customerDisputeService } = await loadServices();
    const dispute = await customerDisputeService.create({ customerId: 2, description: "Reclamo" });

    const updated = await customerDisputeService.update({
      id: dispute.id,
      status: "RESOLVED",
      resolutionNotes: "Se aplicó nota de crédito",
    });

    expect(updated.status).toBe("RESOLVED");
    expect(updated.resolutionNotes).toMatch(/nota de crédito/i);
  });

  it("rechaza re-asociar la disputa a documentos de otro cliente", async () => {
    const { customerDisputeService } = await loadServices();
    const dispute = await customerDisputeService.create({ customerId: 2, documentId: 1, description: "Conflicto" });

    await expect(
      customerDisputeService.update({
        id: dispute.id,
        documentId: 999,
      }),
    ).rejects.toThrow(/no existe/i);

    await expect(
      customerDisputeService.update({
        id: dispute.id,
        documentId: 1,
      }),
    ).resolves.toBeTruthy();
  });
});