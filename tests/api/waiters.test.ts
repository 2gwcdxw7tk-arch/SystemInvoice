import { GET as WaitersGET, POST as WaitersPOST } from '@/app/api/waiters/route';
import { PATCH as WaiterPATCH } from '@/app/api/waiters/[waiterId]/route';
import { POST as ResetPinPOST } from '@/app/api/waiters/[waiterId]/reset-pin/route';
import { GET as MeGET } from '@/app/api/meseros/me/route';

jest.mock('@/lib/auth/session', () => ({
  SESSION_COOKIE_NAME: 'facturador_session',
  parseSessionCookie: async () => ({ role: 'admin', sub: '1' }),
}));

jest.mock('@/lib/services/WaiterService', () => ({
  waiterService: {
    listWaiterDirectory: jest.fn(async () => ([{ id: 1, code: 'W-01', fullName: 'Mesero 1', isActive: true }])),
    createWaiterDirectoryEntry: jest.fn(async (p: any) => ({ id: 2, code: p.code, fullName: p.fullName })),
    updateWaiterDirectoryEntry: jest.fn(async (id: number, p: any) => ({ id, code: 'W-01', fullName: p.fullName ?? 'Mesero 1' })),
    resetWaiterPin: jest.fn(async () => ({ id: 1 })),
    getWaiterById: jest.fn(async (id: number) => ({ id, code: 'W-01', fullName: 'Mesero 1' })),
    verifyWaiterPin: jest.fn(async () => ({ success: true })),
  }
}));

function makeReq(url: string) {
  return { url, nextUrl: new URL(url), cookies: { get: () => ({ value: 'dummy' }) } } as any;
}

function makeReqWithJson(url: string, body: any) {
  return {
    url,
    nextUrl: new URL(url),
    cookies: { get: () => ({ value: 'dummy' }) },
    json: async () => body,
  } as any;
}

describe('Waiters API', () => {
  it('GET /api/waiters', async () => {
    const res = await WaitersGET(makeReq('http://localhost/api/waiters'));
    expect(res.status).toBe(200);
  });

  it('POST /api/waiters', async () => {
    const res = await WaitersPOST(
      makeReqWithJson('http://localhost/api/waiters', { code: 'W-02', full_name: 'Mesero 2', pin: '1234' })
    );
    expect([200,201]).toContain(res.status);
  });

  it('PATCH /api/waiters/[id]', async () => {
    const res = await WaiterPATCH(
      makeReqWithJson('http://localhost/api/waiters/1', { full_name: 'Actualizado' }),
      { params: Promise.resolve({ waiterId: '1' }) }
    );
    expect(res.status).toBe(200);
  });

  it('POST /api/waiters/[id]/reset-pin', async () => {
    const res = await ResetPinPOST(
      makeReqWithJson('http://localhost/api/waiters/1/reset-pin', { pin: '9999' }),
      { params: Promise.resolve({ waiterId: '1' }) }
    );
    expect(res.status).toBe(200);
  });
});

describe('Meseros ME API', () => {
  it('GET /api/meseros/me', async () => {
    // override to waiter role for this test
    const sessionMod = require('@/lib/auth/session');
    sessionMod.parseSessionCookie = async () => ({ role: 'waiter', sub: '1' });
    const res = await MeGET(makeReq('http://localhost/api/meseros/me'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
