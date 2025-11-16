"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, Loader2, Plus, Shield, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { useSession } from "@/components/providers/session-provider";
import { hasSessionPermission, isSessionAdministrator } from "@/lib/auth/session-roles";

type RoleSummary = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string | null;
};

type PermissionDefinition = {
  code: string;
  name: string;
  description: string | null;
};

type RoleFormState = {
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  permissions: Set<string>;
};

const emptyFormState = (): RoleFormState => ({
  code: "",
  name: "",
  description: "",
  isActive: true,
  permissions: new Set(),
});

function groupPermissions(definitions: PermissionDefinition[]): Record<string, PermissionDefinition[]> {
  return definitions.reduce<Record<string, PermissionDefinition[]>>((groups, definition) => {
    const [group] = definition.code.split(".");
    if (!groups[group]) {
      groups[group] = [];
    }
    groups[group].push(definition);
    return groups;
  }, {});
}

export default function RolesPage() {
  const session = useSession();
  const { toast } = useToast();

  const isAdmin = isSessionAdministrator(session);
  const canManage = isAdmin || hasSessionPermission(session, "admin.users.manage");

  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [permissions, setPermissions] = useState<PermissionDefinition[]>([]);
  const [loadingPermissions, setLoadingPermissions] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
  const [form, setForm] = useState<RoleFormState>(emptyFormState);
  const [saving, setSaving] = useState(false);
  const [removingRoleId, setRemovingRoleId] = useState<number | null>(null);

  const groupedPermissions = useMemo(() => groupPermissions(permissions), [permissions]);

  useEffect(() => {
    if (!canManage) {
      setRoles([]);
      setPermissions([]);
      return;
    }

    const loadRoles = async () => {
      setLoadingRoles(true);
      try {
        const res = await fetch("/api/roles?include_inactive=true", { cache: "no-store" });
        if (!res.ok) {
          throw new Error("No se pudieron consultar los roles");
        }
        const data = (await res.json()) as { roles?: RoleSummary[] };
        setRoles(Array.isArray(data.roles) ? data.roles : []);
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudieron consultar los roles";
        toast({ variant: "error", title: "Roles", description: message });
      } finally {
        setLoadingRoles(false);
      }
    };

    const loadPermissions = async () => {
      setLoadingPermissions(true);
      try {
        const res = await fetch("/api/roles/permissions", { cache: "no-store" });
        if (!res.ok) {
          throw new Error("No se pudieron consultar los permisos");
        }
        const data = (await res.json()) as { permissions?: PermissionDefinition[] };
        setPermissions(Array.isArray(data.permissions) ? data.permissions : []);
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudieron consultar los permisos";
        toast({ variant: "error", title: "Roles", description: message });
      } finally {
        setLoadingPermissions(false);
      }
    };

    void loadRoles();
    void loadPermissions();
  }, [canManage, toast]);

  const openCreateModal = () => {
    setEditingRoleId(null);
    setForm(emptyFormState());
    setModalOpen(true);
  };

  const openEditModal = (role: RoleSummary) => {
    const permissionsSet = new Set(role.permissions.map((permission) => permission.trim().toLowerCase()));
    setEditingRoleId(role.id);
    setForm({
      code: role.code,
      name: role.name,
      description: role.description ?? "",
      isActive: role.isActive,
      permissions: permissionsSet,
    });
    setModalOpen(true);
  };

  const togglePermission = (permissionCode: string) => {
    setForm((prev) => {
      const nextPermissions = new Set(prev.permissions);
      const normalized = permissionCode.trim().toLowerCase();
      if (nextPermissions.has(normalized)) {
        nextPermissions.delete(normalized);
      } else {
        nextPermissions.add(normalized);
      }
      return { ...prev, permissions: nextPermissions };
    });
  };

  const handleSaveRole = async () => {
    const code = form.code.trim().toUpperCase();
    const name = form.name.trim();
    const description = form.description.trim();
    const permissionCodes = Array.from(form.permissions);

    if (!name || (!editingRoleId && !code)) {
      toast({ variant: "warning", title: "Roles", description: "Captura un código y nombre válidos" });
      return;
    }

    if (permissionCodes.length === 0) {
      toast({ variant: "warning", title: "Roles", description: "Selecciona al menos un permiso" });
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        description: description.length > 0 ? description : null,
        is_active: form.isActive,
        permissions: permissionCodes,
      };

      let endpoint = "/api/roles";
      let method: "POST" | "PATCH" = "POST";

      if (editingRoleId) {
        endpoint = `/api/roles/${editingRoleId}`;
        method = "PATCH";
        delete payload.code;
      } else {
        payload.code = code;
      }

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message ?? "No se pudo guardar el rol");
      }

      toast({ variant: "success", title: "Roles", description: editingRoleId ? "Rol actualizado" : "Rol creado" });
      setModalOpen(false);
      setForm(emptyFormState());
      setEditingRoleId(null);

      const updatedRoles = await fetch("/api/roles?include_inactive=true", { cache: "no-store" })
        .then((response) => response.json().catch(() => ({})))
        .then((payload) => (Array.isArray(payload.roles) ? (payload.roles as RoleSummary[]) : []))
        .catch(() => roles);
      setRoles(updatedRoles);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar el rol";
      toast({ variant: "error", title: "Roles", description: message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (roleId: number) => {
    setRemovingRoleId(roleId);
    try {
      const res = await fetch(`/api/roles/${roleId}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message ?? "No se pudo eliminar el rol");
      }

      toast({ variant: "success", title: "Roles", description: "Rol eliminado" });
      setRoles((prev) => prev.filter((role) => role.id !== roleId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo eliminar el rol";
      toast({ variant: "error", title: "Roles", description: message });
    } finally {
      setRemovingRoleId(null);
    }
  };

  if (!canManage) {
    return (
      <section className="space-y-8 pb-16">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Roles y permisos</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Esta sección está disponible únicamente para administradores.
          </p>
        </header>
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">Solicita acceso a un administrador si necesitas gestionar roles.</p>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-10 pb-16">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Roles y permisos</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Crea y administra roles, asigna permisos granulares y controla el acceso al sistema.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="h-10 rounded-2xl px-4" onClick={openCreateModal} disabled={loadingRoles || loadingPermissions}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo rol
          </Button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase text-muted-foreground">Roles activos</CardTitle>
            <CardTitle className="text-3xl font-semibold text-foreground">{roles.filter((role) => role.isActive).length}</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Roles actualmente habilitados</CardDescription>
          </CardHeader>
        </Card>
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase text-muted-foreground">Permisos disponibles</CardTitle>
            <CardTitle className="text-3xl font-semibold text-foreground">{permissions.length}</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Permisos configurables en la plataforma</CardDescription>
          </CardHeader>
        </Card>
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase text-muted-foreground">Roles totales</CardTitle>
            <CardTitle className="text-3xl font-semibold text-foreground">{roles.length}</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Incluye roles activos e inactivos</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="space-y-4">
        {loadingRoles ? (
          <div className="flex items-center justify-center rounded-3xl border bg-background/80 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : roles.length === 0 ? (
          <Card className="rounded-3xl border bg-background/95 shadow-sm">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Shield className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Aún no hay roles registrados. Crea el primero para comenzar.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {roles.map((role) => (
              <Card key={role.id} className="flex flex-col justify-between rounded-3xl border bg-background/95 shadow-sm">
                <CardHeader className="space-y-2 pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold text-foreground">{role.name}</CardTitle>
                    {role.isActive ? (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Activo
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                        <X className="h-3.5 w-3.5" /> Inactivo
                      </span>
                    )}
                  </div>
                  <CardDescription className="text-xs uppercase text-muted-foreground">{role.code}</CardDescription>
                  {role.description ? (
                    <p className="text-sm text-muted-foreground">{role.description}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin descripción</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Permisos</p>
                    <ul className="mt-2 flex flex-wrap gap-2 text-sm text-muted-foreground">
                      {role.permissions.map((permission) => (
                        <li key={permission} className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                          {permission}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="h-9 flex-1 rounded-2xl" onClick={() => openEditModal(role)}>
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9 w-24 rounded-2xl text-red-500"
                      onClick={() => handleDeleteRole(role.id)}
                      disabled={removingRoleId === role.id}
                      aria-label={`Eliminar rol ${role.name}`}
                    >
                      {removingRoleId === role.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingRoleId ? "Editar rol" : "Nuevo rol"}>
        <div className="space-y-4">
          {!editingRoleId && (
            <div className="space-y-2">
              <Label htmlFor="role-code">Código</Label>
              <Input
                id="role-code"
                value={form.code}
                onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
                placeholder="ADMINISTRADOR"
                maxLength={40}
                disabled={saving}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="role-name">Nombre</Label>
            <Input
              id="role-name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Administrador"
              maxLength={120}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-description">Descripción</Label>
            <Input
              id="role-description"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Describe el alcance de este rol"
              maxLength={250}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label>Estado</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={form.isActive ? "default" : "outline"}
                className="h-9 flex-1 rounded-2xl"
                onClick={() => setForm((prev) => ({ ...prev, isActive: true }))}
                disabled={saving}
              >
                Activo
              </Button>
              <Button
                type="button"
                variant={!form.isActive ? "default" : "outline"}
                className="h-9 flex-1 rounded-2xl"
                onClick={() => setForm((prev) => ({ ...prev, isActive: false }))}
                disabled={saving}
              >
                Inactivo
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Permisos</Label>
              {loadingPermissions && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="space-y-4">
              {Object.keys(groupedPermissions)
                .sort()
                .map((group) => (
                  <div key={group} className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{group}</p>
                    <div className="flex flex-wrap gap-2">
                      {groupedPermissions[group].map((permission) => {
                        const normalized = permission.code.trim().toLowerCase();
                        const selected = form.permissions.has(normalized);
                        return (
                          <Button
                            key={permission.code}
                            type="button"
                            variant={selected ? "default" : "outline"}
                            className="h-9 rounded-2xl px-3"
                            onClick={() => togglePermission(permission.code)}
                            disabled={saving}
                          >
                            {selected ? <Check className="mr-2 h-4 w-4" /> : <Shield className="mr-2 h-4 w-4" />}
                            <span className="text-sm">{permission.code}</span>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" className="h-9 rounded-2xl" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" className="h-9 rounded-2xl" onClick={handleSaveRole} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Guardar cambios
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
