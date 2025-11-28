describe("CollectionLogService (mock)", () => {
  const loadServices = async () => {
    jest.resetModules();
    process.env.MOCK_DATA = "true";
    const { collectionLogService } = await import("@/lib/services/cxc/CollectionLogService");
    const { mockCxcStore } = await import("@/lib/services/cxc/mock-data");
    return { collectionLogService, mockCxcStore };
  };

  afterAll(() => {
    process.env.MOCK_DATA = "false";
    jest.resetModules();
  });

  it("crea y lista gestiones por cliente", async () => {
    const { collectionLogService, mockCxcStore } = await loadServices();
    expect(mockCxcStore.collectionLogs).toHaveLength(0);

    const created = await collectionLogService.create({
      customerId: 2,
      contactMethod: "Llamada",
      outcome: "Prometió pagar mañana",
    });

    expect(created.id).toBeGreaterThan(0);
    expect(created.customerId).toBe(2);
    expect(mockCxcStore.collectionLogs).toHaveLength(1);

    const list = await collectionLogService.list({ customerId: 2 });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(created.id);
  });

  it("elimina gestiones existentes", async () => {
    const { collectionLogService, mockCxcStore } = await loadServices();
    const log = await collectionLogService.create({ customerId: 2, notes: "Seguimiento" });
    expect(mockCxcStore.collectionLogs).toHaveLength(1);

    await collectionLogService.delete(log.id);
    expect(mockCxcStore.collectionLogs).toHaveLength(0);
  });

  it("valida que el documento pertenezca al cliente", async () => {
    const { collectionLogService } = await loadServices();

    await expect(
      collectionLogService.create({
        customerId: 2,
        documentId: 1,
        notes: "Seguimiento",
      }),
    ).resolves.toBeTruthy();

    await expect(
      collectionLogService.create({
        customerId: 1,
        documentId: 1,
        notes: "Otro seguimiento",
      }),
    ).rejects.toThrow(/no pertenece al cliente/i);
  });
});