import { GET as RolesGET } from '@/app/api/roles/route';
import { GET as PermissionsGET } from '@/app/api/roles/permissions/route';

jest.mock('@/lib/auth/access', () => ({
  requireAdministrator: async () => ({ userId: 1 }),
}));

jest.mock('@/lib/services/RoleService', () => ({
  roleService: {
    listRoles: jest.fn(async () => ([{ id: 1, code: 'ADMIN', name: 'Administrador' }])),
    listPermissions: jest.fn(async () => (['admin.users.manage', 'menu.roles.view'])),
  }
}));

function makeReq(url: string) { return { url, nextUrl: new URL(url) } as any; }

describe('Roles API', () => {
  it('GET /api/roles devuelve roles', async () => {
    const res = await RolesGET(makeReq('http://localhost/api/roles'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.roles)).toBe(true);
  });

  it('GET /api/roles/permissions devuelve permisos', async () => {
    const res = await PermissionsGET(makeReq('http://localhost/api/roles/permissions'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.permissions)).toBe(true);
  });
});
