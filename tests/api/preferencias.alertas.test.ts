import { GET as AlertsGET, POST as AlertsPOST, PATCH as AlertsPATCH } from '@/app/api/preferencias/alertas/route';

jest.mock('@/lib/services/InventoryAlertService', () => {
  class InventoryAlertService {
    listInventoryAlerts = jest.fn(async () => ([{ id: 1, name: 'Bajo stock', threshold: 5 }]))
    upsertInventoryAlert = jest.fn(async (p: any) => ({ id: p.id ?? 2 }))
    setInventoryAlertStatus = jest.fn(async () => {})
  }
  return { InventoryAlertService };
});

describe('Preferencias Alertas API', () => {
  it('GET /api/preferencias/alertas', async () => {
    // @ts-expect-error NextRequest compatible shape
    const res = await AlertsGET(new Request('http://localhost/api/preferencias/alertas'));
    expect(res.status).toBe(200);
  });

  it('POST /api/preferencias/alertas', async () => {
    const req = new Request('http://localhost/api/preferencias/alertas', { method: 'POST', body: JSON.stringify({ name: 'Alerta', threshold: 1 }) });
    // @ts-expect-error NextRequest compatible shape
    const res = await AlertsPOST(req);
    expect([200,201]).toContain(res.status);
  });

  it('PATCH /api/preferencias/alertas', async () => {
    const req = new Request('http://localhost/api/preferencias/alertas', { method: 'PATCH', body: JSON.stringify({ id: 1, isActive: true }) });
    // @ts-expect-error NextRequest compatible shape
    const res = await AlertsPATCH(req);
    expect(res.status).toBe(200);
  });
});
