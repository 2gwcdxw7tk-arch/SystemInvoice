// Mock services used by login
jest.mock('@/lib/services/AdminUserService', () => ({
  adminUserService: {
    verifyAdminCredentials: jest.fn(async (username: string, password: string) => {
      if (username === 'admin@demo.test' && password === 'Secret!') {
        return {
          success: true,
          user: { id: 1, username: 'admin@demo.test', displayName: 'Admin Demo' },
          context: { roles: ['ADMINISTRADOR'], permissions: ['cash.register.open'], cashRegisters: [], defaultCashRegister: null },
          message: 'Acceso concedido'
        };
      }
      return { success: false, message: 'Credenciales no válidas' };
    })
  }
}));

jest.mock('@/lib/services/WaiterService', () => ({
  waiterService: {
    verifyWaiterPin: jest.fn(async (pin: string) => {
      if (pin === '1234') return { success: true, waiter: { id: 10, code: 'W-10', fullName: 'Mesero 10' }, message: 'OK' };
      return { success: false, message: 'PIN no válido' };
    })
  }
}));

// Fully mock auth/session to avoid importing `jose` (ESM)
jest.mock('@/lib/auth/session', () => ({
  SESSION_COOKIE_NAME: 'facturador_session',
  SESSION_DURATION_MS: 1000 * 60 * 60 * 12,
  createSessionCookie: jest.fn(async () => ({ value: 'mock.jwt.token', expires: new Date(Date.now() + 3600000) })),
  createEmptySessionCookie: jest.fn(() => ({ value: '', expires: new Date(0) })),
}));

function makeReq(url: string, body: any, headers: Record<string, string> = {}) {
  return {
    url,
    nextUrl: new URL(url),
    headers: new Map(Object.entries(headers)),
    json: async () => body,
  } as any;
}

describe('POST /api/login', () => {
  const baseUrl = 'http://localhost/api/login';
  // Import the route after mocks are set up
  const { POST: LoginPOST } = require('@/app/api/login/route');

  it('admin: login exitoso y setea cookie', async () => {
    const req = makeReq(baseUrl, { role: 'admin', username: 'admin@demo.test', password: 'Secret!' }, { 'user-agent': 'jest' });
    const res = await LoginPOST(req);
    expect([200, 201]).toContain(res.status);
    // The cookie header should be set
    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie.toLowerCase()).toContain('facturador_session');
  });

  it('admin: credenciales inválidas => 401', async () => {
    const req = makeReq(baseUrl, { role: 'admin', username: 'admin@demo.test', password: 'nope' });
    const res = await LoginPOST(req);
    expect(res.status).toBe(401);
  });

  it('waiter: login con pin', async () => {
    const req = makeReq(baseUrl, { role: 'waiter', pin: '1234' });
    const res = await LoginPOST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('payload inválido => 400', async () => {
    const req = makeReq(baseUrl, { role: 'waiter' });
    const res = await LoginPOST(req);
    expect(res.status).toBe(400);
  });
});
