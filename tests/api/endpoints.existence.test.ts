import fs from 'fs';
import path from 'path';

// Evitar dependencias ESM (jose) y lógica de auth real en imports transitivos
jest.mock('@/lib/auth/session', () => ({
  SESSION_COOKIE_NAME: 'facturador_session',
  parseSessionCookie: async () => ({ sub: '1', roles: ['ADMINISTRADOR'], permissions: [] }),
  verifyReportAccessToken: async () => ({ reportType: 'opening', sessionId: 1, requesterId: 1, scope: 'admin' }),
}));
jest.mock('@/lib/auth/access', () => ({
  requireFacturacionAccess: async () => ({ userId: 1 }),
  requireAdminAccess: async () => ({ userId: 1 }),
}));

// Verifica que todos los route.ts bajo src/app/api exporten algún método HTTP válido
const API_DIR = path.resolve(process.cwd(), 'src', 'app', 'api');

function getAllRouteFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllRouteFiles(full));
    } else if (entry.isFile() && entry.name === 'route.ts') {
      files.push(full);
    }
  }
  return files;
}

describe('API endpoints exports', () => {
  const routeFiles = getAllRouteFiles(API_DIR);

  it('should find route files', () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  it.each(routeFiles)('%s exports HTTP handlers', async (file) => {
    const mod = await import(file.replace(/\\/g, '/'));
    const httpKeys = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];
    const hasAny = httpKeys.some((k) => typeof mod[k] === 'function');
    expect(hasAny).toBe(true);
  });
});
