import { GET as HealthGET } from '@/app/api/health/route';

// Mock de env para forzar modo mock
jest.mock('@/lib/env', () => ({
  env: { useMockData: true }
}));

// Asegurar que no se hagan queries reales
jest.mock('@/lib/db/postgres', () => ({
  query: jest.fn()
}));

describe('GET /api/health', () => {
  it('returns ok with db=true in mock mode', async () => {
    const res = await HealthGET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ status: 'ok', db: true });
    expect(typeof json.timestamp).toBe('string');
  });
});
