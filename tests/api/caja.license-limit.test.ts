describe('Límites licenciados de cajas', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.MOCK_DATA = 'true';
  });

  afterEach(() => {
    delete process.env.LICENSE_MAX_CASH_REGISTERS;
    process.env.MOCK_DATA = 'false';
    jest.resetModules();
  });

  it('rechaza crear cajas activas cuando el límite está agotado', async () => {
    process.env.LICENSE_MAX_CASH_REGISTERS = '1';
    const { cashRegisterService } = await import('@/lib/services/CashRegisterService');

    await expect(
      cashRegisterService.createCashRegister({
        code: 'CAJA-02',
        name: 'Caja secundaria',
        warehouseCode: 'PRINCIPAL',
      })
    ).rejects.toThrow('Se alcanzó el tope de cajas licenciadas (1)');
  });

  it('bloquea aperturas de sesión adicionales cuando se supera el tope', async () => {
    process.env.LICENSE_MAX_CASH_REGISTERS = '5';
    const { cashRegisterService } = await import('@/lib/services/CashRegisterService');
    const service = cashRegisterService;

    await service.createCashRegister({
      code: 'CAJA-02',
      name: 'Caja auxiliar',
      warehouseCode: 'PRINCIPAL',
    });

    const { env } = await import('@/lib/env');
    (env as any).licenses.maxCashRegisters = 1;
    (env as any).licenses.hasCashRegisterLimit = true;

    await service.openCashRegisterSession({
      adminUserId: 101,
      cashRegisterCode: 'CAJA-02',
      openingAmount: 0,
      allowUnassigned: true,
    });

    await expect(
      service.openCashRegisterSession({
        adminUserId: 102,
        cashRegisterCode: 'CAJA-01',
        openingAmount: 0,
        allowUnassigned: true,
      })
    ).rejects.toThrow('Se alcanzó el tope de cajas licenciadas (1)');
  });
});
