import { GET as NotifGET, POST as NotifPOST, PATCH as NotifPATCH } from '@/app/api/preferencias/notificaciones/route';

jest.mock('@/lib/services/NotificationChannelService', () => ({
  NotificationChannelService: jest.fn(() => ({
    listNotificationChannels: jest.fn(async () => ([{ id: 1, name: 'Canal', channelType: 'email', target: 'a@b.com' }])),
    upsertNotificationChannel: jest.fn(async (p: any) => ({ id: p.id ?? 2 })),
    setNotificationChannelStatus: jest.fn(async () => {}),
  })),
}));

describe('Preferencias Notificaciones API', () => {
  it('GET /api/preferencias/notificaciones', async () => {
    // @ts-expect-error NextRequest compatible shape
    const res = await NotifGET(new Request('http://localhost/api/preferencias/notificaciones'));
    expect(res.status).toBe(200);
  });

  it('POST /api/preferencias/notificaciones', async () => {
    const req = new Request('http://localhost/api/preferencias/notificaciones', { method: 'POST', body: JSON.stringify({ name: 'Canal 2', channelType: 'webhook', target: 'http://x' }) });
    // @ts-expect-error NextRequest compatible shape
    const res = await NotifPOST(req);
    expect([200,201]).toContain(res.status);
  });

  it('PATCH /api/preferencias/notificaciones', async () => {
    const req = new Request('http://localhost/api/preferencias/notificaciones', { method: 'PATCH', body: JSON.stringify({ id: 1, isActive: false }) });
    // @ts-expect-error NextRequest compatible shape
    const res = await NotifPATCH(req);
    expect(res.status).toBe(200);
  });
});
