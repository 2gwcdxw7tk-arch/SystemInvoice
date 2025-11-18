import { PATCH as RolePATCH, DELETE as RoleDELETE } from '@/app/api/roles/[roleId]/route';

jest.mock('@/lib/auth/access', () => ({
  requireAdministrator: async () => ({ userId: 1 }),
}));

jest.mock('@/lib/services/RoleService', () => ({
  roleService: {
    updateRole: jest.fn(async (id: number, p: any) => ({ id, name: p.name ?? 'ROL', isActive: p.isActive ?? true, permissions: p.permissionCodes ?? [] })),
    deleteRole: jest.fn(async () => {}),
  }
}));

describe('Role by ID API', () => {
  it('PATCH /api/roles/[id] actualiza', async () => {
    const req = new Request('http://localhost/api/roles/1', { method: 'PATCH', body: JSON.stringify({ name: 'Nuevo' }) });
    // @ts-expect-error NextRequest compatible shape
    const res = await RolePATCH(req, { params: Promise.resolve({ roleId: '1' }) });
    expect(res.status).toBe(200);
  });

  it('DELETE /api/roles/[id] elimina', async () => {
    // @ts-expect-error NextRequest compatible shape
    const res = await RoleDELETE(new Request('http://localhost/api/roles/1', { method: 'DELETE' }), { params: Promise.resolve({ roleId: '1' }) });
    expect(res.status).toBe(200);
  });
});
