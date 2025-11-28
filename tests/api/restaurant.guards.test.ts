import type { NextRequest } from 'next/server';

type RequestInitWithJson = RequestInit & { jsonBody?: unknown };

const applyRetailEnvMock = () => {
  jest.doMock('@/lib/env', () => {
    const actual = jest.requireActual<typeof import('@/lib/env')>('@/lib/env');
    return {
      env: {
        ...actual.env,
        features: { ...actual.env.features, isRestaurant: false, retailModeEnabled: true },
        publicFeatures: { ...actual.env.publicFeatures, isRestaurant: false, retailModeEnabled: true },
      },
    };
  });
};

const mockAdminSession = () => {
  jest.doMock('@/lib/auth/session', () => ({
    SESSION_COOKIE_NAME: 'facturador_session',
    parseSessionCookie: async () => ({ role: 'admin', sub: 'admin-1' }),
  }));
};

const mockWaiterSession = () => {
  jest.doMock('@/lib/auth/session', () => ({
    SESSION_COOKIE_NAME: 'facturador_session',
    parseSessionCookie: async () => ({ role: 'waiter', sub: 'waiter-10' }),
  }));
};

const mockTableService = () => {
  jest.doMock('@/lib/services/TableService', () => ({
    listAvailableTables: jest.fn(async () => []),
    listTableAdminSnapshots: jest.fn(async () => []),
    createTableDefinition: jest.fn(async () => ({ id: 'T1' })),
    listWaiterTables: jest.fn(async () => []),
    reserveTable: jest.fn(),
    releaseTableReservation: jest.fn(),
  }));
};

const mockWaiterService = () => {
  jest.doMock('@/lib/services/WaiterService', () => ({
    waiterService: {
      listWaiterDirectory: jest.fn(async () => []),
      createWaiterDirectoryEntry: jest.fn(async () => ({})),
    },
  }));
};

const buildNextRequest = (url: string, init: RequestInitWithJson = {}): NextRequest => {
  const { jsonBody, headers, ...rest } = init;
  const finalInit: RequestInit = {
    headers: jsonBody !== undefined ? { 'Content-Type': 'application/json', ...(headers || {}) } : headers,
    ...rest,
  };
  if (jsonBody !== undefined) {
    finalInit.body = JSON.stringify(jsonBody);
  }
  const request = new Request(url, finalInit) as unknown as NextRequest;
  (request as any).cookies = {
    get: () => ({ value: 'session-token' }),
  };
  (request as any).nextUrl = new URL(url);
  return request;
};

describe('Guards de restaurante en modo retail', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('GET /api/tables responde 403 cuando la función restaurante está deshabilitada', async () => {
    applyRetailEnvMock();
    mockAdminSession();
    mockTableService();

    const { RESTAURANT_DISABLED_MESSAGE } = await import('@/lib/features/guards');
    const { GET: TablesGET } = await import('@/app/api/tables/route');

    const response = await TablesGET(buildNextRequest('http://localhost/api/tables'));
    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload).toEqual(expect.objectContaining({ message: RESTAURANT_DISABLED_MESSAGE }));
  });

  it('GET /api/meseros/tables responde 403 en modo retail', async () => {
    applyRetailEnvMock();
    mockWaiterSession();
    mockTableService();

    const { RESTAURANT_DISABLED_MESSAGE } = await import('@/lib/features/guards');
    const { GET: WaiterTablesGET } = await import('@/app/api/meseros/tables/route');

    const response = await WaiterTablesGET(buildNextRequest('http://localhost/api/meseros/tables'));
    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload).toEqual(expect.objectContaining({ message: RESTAURANT_DISABLED_MESSAGE }));
  });

  it('POST /api/waiters responde 403 cuando se usa en modo retail', async () => {
    applyRetailEnvMock();
    mockWaiterService();

    const { RESTAURANT_DISABLED_MESSAGE } = await import('@/lib/features/guards');
    const { POST: WaitersPOST } = await import('@/app/api/waiters/route');

    const response = await WaitersPOST(
      buildNextRequest('http://localhost/api/waiters', {
        method: 'POST',
        jsonBody: {
          code: 'WT-01',
          full_name: 'Mesero Prueba',
          phone: null,
          email: null,
          pin: '1234',
        },
      })
    );
    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload).toEqual(expect.objectContaining({ message: RESTAURANT_DISABLED_MESSAGE }));
  });
});
