import { GET as AdminUsersGET, POST as AdminUsersPOST } from '@/app/api/admin-users/route';
import { PATCH as AdminUserPATCH } from '@/app/api/admin-users/[adminUserId]/route';
import { POST as ResetPasswordPOST } from '@/app/api/admin-users/[adminUserId]/reset-password/route';

jest.mock('@/lib/auth/session', () => ({
  SESSION_COOKIE_NAME: 'facturador_session',
  parseSessionCookie: async () => ({ role: 'admin', sub: '1', roles: ['ADMINISTRADOR'], permissions: ['admin.users.manage'] }),
}));

jest.mock('@/lib/services/AdminUserService', () => {
  const AdminUserService = jest.fn(() => ({
    listAdminDirectory: jest.fn(async () => ([{ id: 1, username: 'admin', displayName: 'Admin', roles: ['ADMINISTRADOR'], isActive: true }])),
    createAdminDirectoryEntry: jest.fn(async (data: any) => ({ id: 2, username: data.username, displayName: data.displayName ?? null })),
    updateAdminDirectoryEntry: jest.fn(async (id: number, data: any) => ({ id, username: 'admin', displayName: data.displayName ?? null })),
  }));
  return { AdminUserService, adminUserService: { resetAdminUserPassword: jest.fn(async () => ({ id: 1 })) } };
});

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

describe('Admin Users API', () => {
  it('GET /api/admin-users devuelve usuarios', async () => {
    const res = await AdminUsersGET(makeReq('http://localhost/api/admin-users'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.users)).toBe(true);
  });

  it('POST /api/admin-users crea un usuario', async () => {
    const res = await AdminUsersPOST(
      makeReqWithJson('http://localhost/api/admin-users', { username: 'newuser', password: '12345678', display_name: 'Nuevo', roles: ['ADMINISTRADOR'] })
    );
    expect([200,201]).toContain(res.status);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('PATCH /api/admin-users/[id] actualiza perfil', async () => {
    const res = await AdminUserPATCH(
      makeReqWithJson('http://localhost/api/admin-users/1', { display_name: 'Nuevo Nombre' }),
      { params: Promise.resolve({ adminUserId: '1' }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('POST /api/admin-users/[id]/reset-password resetea contraseña', async () => {
    const res = await ResetPasswordPOST(
      makeReqWithJson('http://localhost/api/admin-users/1/reset-password', { password: '12345678' }),
      { params: Promise.resolve({ adminUserId: '1' }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
