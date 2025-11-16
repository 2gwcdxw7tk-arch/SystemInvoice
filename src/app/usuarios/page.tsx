"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2, Lock, Pencil, Plus, RefreshCw, Search, Shield, Unlock, UserCog } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { useSession } from "@/components/providers/session-provider";
import { isSessionAdministrator } from "@/lib/auth/session-roles";

const DATETIME_FORMATTER = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });
const DATE_FORMATTER = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });

type AdminUserEntry = {
  id: number;
  username: string;
  displayName: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  roles: string[];
};

type RoleDefinition = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

type UserFormState = {
  username: string;
  displayName: string;
  password: string;
  confirmPassword: string;
  isActive: boolean;
  roles: string[];
};

type PasswordFormState = {
  password: string;
  confirm: string;
};

const emptyUserForm: UserFormState = {
  username: "",
  displayName: "",
  password: "",
  confirmPassword: "",
  isActive: true,
  roles: [],
};

const emptyPasswordForm: PasswordFormState = {
  password: "",
  confirm: "",
};

function formatDate(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return DATETIME_FORMATTER.format(date);
}

function formatDateOnly(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return DATE_FORMATTER.format(date);
}

function toggleArrayValue(values: string[], value: string): string[] {
  const exists = values.includes(value);
  if (exists) {
    return values.filter((item) => item !== value);
  }
  return [...values, value];
}

export default function UsuariosPage() {
  const { toast } = useToast();
  const session = useSession();
  const isAdmin = isSessionAdministrator(session);

  const [users, setUsers] = useState<AdminUserEntry[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<UserFormState>(emptyUserForm);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [savingUser, setSavingUser] = useState(false);

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(emptyPasswordForm);
  const [passwordTargetId, setPasswordTargetId] = useState<number | null>(null);
  const [resettingPassword, setResettingPassword] = useState(false);

  const [togglingUserId, setTogglingUserId] = useState<number | null>(null);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/admin-users?include_inactive=true", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("No se pudieron cargar los usuarios");
      }
      const data = (await res.json()) as { users?: AdminUserEntry[] };
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar los usuarios";
      toast({ variant: "error", title: "Usuarios", description: message });
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, [isAdmin, toast]);

  const loadRoles = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingRoles(true);
    try {
      const res = await fetch("/api/admin-users/roles?include_inactive=false", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("No se pudieron cargar los roles");
      }
      const data = (await res.json()) as { roles?: RoleDefinition[] };
      setRoles(Array.isArray(data.roles) ? data.roles : []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar los roles";
      toast({ variant: "error", title: "Usuarios", description: message });
      setRoles([]);
    } finally {
      setLoadingRoles(false);
    }
  }, [isAdmin, toast]);

  useEffect(() => {
    void loadUsers();
    void loadRoles();
  }, [loadUsers, loadRoles]);

  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((user) => user.isActive).length;
    const inactive = total - active;
    const withRoles = users.filter((user) => user.roles.length > 0).length;
    return { total, active, inactive, withRoles };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return users
      .filter((user) => (showInactive ? true : user.isActive))
      .filter((user) => {
        if (!term) return true;
        const haystack = [user.username, user.displayName ?? "", user.roles.join(" ")].join(" ").toLowerCase();
        return haystack.includes(term);
      })
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [users, searchTerm, showInactive]);

  if (!isAdmin) {
    return (
      <section className="space-y-8 pb-16">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Usuarios</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Esta sección está disponible únicamente para administradores.
          </p>
        </header>
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Solicita acceso a un administrador si necesitas realizar cambios en usuarios y roles.
            </p>
          </CardContent>
        </Card>
      </section>
    );
  }

  const openCreateModal = () => {
    setEditingUserId(null);
    setForm(emptyUserForm);
    setModalOpen(true);
  };

  const openEditModal = (user: AdminUserEntry) => {
    setEditingUserId(user.id);
    setForm({
      username: user.username,
      displayName: user.displayName ?? "",
      password: "",
      confirmPassword: "",
      isActive: user.isActive,
      roles: user.roles,
    });
    setModalOpen(true);
  };

  const openPasswordModal = (user: AdminUserEntry) => {
    setPasswordForm(emptyPasswordForm);
    setPasswordTargetId(user.id);
    setPasswordModalOpen(true);
  };

  const handleSaveUser = async () => {
    const username = form.username.trim();
    const displayName = form.displayName.trim();
    const rolesSelected = form.roles;

    if (!editingUserId && username.length < 4) {
      toast({ variant: "warning", title: "Usuarios", description: "Captura un usuario válido" });
      return;
    }

    if (!editingUserId) {
      if (form.password.trim().length < 8) {
        toast({ variant: "warning", title: "Usuarios", description: "La contraseña debe tener al menos 8 caracteres" });
        return;
      }
      if (form.password.trim() !== form.confirmPassword.trim()) {
        toast({ variant: "warning", title: "Usuarios", description: "La confirmación no coincide" });
        return;
      }
    }

    if (rolesSelected.length === 0) {
      toast({ variant: "warning", title: "Usuarios", description: "Selecciona al menos un rol" });
      return;
    }

    setSavingUser(true);
    try {
      const payload: Record<string, unknown> = {
        display_name: displayName,
        is_active: form.isActive,
        roles: rolesSelected,
      };

      let endpoint = "/api/admin-users";
      let method: "POST" | "PATCH" = "POST";
      if (editingUserId) {
        endpoint = `/api/admin-users/${editingUserId}`;
        method = "PATCH";
      } else {
        payload.username = username;
        payload.password = form.password.trim();
      }

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message ?? "No se pudo guardar el usuario");
      }

      toast({
        variant: "success",
        title: "Usuarios",
        description: editingUserId ? "Usuario actualizado" : "Usuario registrado",
      });
      setModalOpen(false);
      setForm(emptyUserForm);
      setEditingUserId(null);
      await loadUsers();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo guardar el usuario";
      toast({ variant: "error", title: "Usuarios", description: message });
    } finally {
      setSavingUser(false);
    }
  };

  const handleToggleActive = async (user: AdminUserEntry, targetState: boolean) => {
    setTogglingUserId(user.id);
    try {
      const res = await fetch(`/api/admin-users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: targetState }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message ?? "No se pudo actualizar el estado");
      }
      toast({
        variant: "success",
        title: "Usuarios",
        description: targetState ? "Usuario activado" : "Usuario desactivado",
      });
      await loadUsers();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar el estado";
      toast({ variant: "error", title: "Usuarios", description: message });
    } finally {
      setTogglingUserId(null);
    }
  };

  const handleResetPassword = async () => {
    if (!passwordTargetId) return;
    const password = passwordForm.password.trim();
    const confirm = passwordForm.confirm.trim();

    if (password.length < 8) {
      toast({ variant: "warning", title: "Usuarios", description: "La contraseña debe tener al menos 8 caracteres" });
      return;
    }
    if (password !== confirm) {
      toast({ variant: "warning", title: "Usuarios", description: "La confirmación no coincide" });
      return;
    }

    setResettingPassword(true);
    try {
      const res = await fetch(`/api/admin-users/${passwordTargetId}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message ?? "No se pudo actualizar la contraseña");
      }
      toast({ variant: "success", title: "Usuarios", description: "Contraseña actualizada" });
      setPasswordModalOpen(false);
      setPasswordTargetId(null);
      setPasswordForm(emptyPasswordForm);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar la contraseña";
      toast({ variant: "error", title: "Usuarios", description: message });
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <section className="space-y-10 pb-16">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Usuarios</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Administra cuentas administrativas, asigna roles y controla su estado de acceso.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-10 rounded-2xl px-4" onClick={() => void loadUsers()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refrescar
          </Button>
          <Button type="button" className="h-10 rounded-2xl px-4" onClick={openCreateModal} aria-label="Agregar nuevo usuario">
            <Plus className="mr-2 h-4 w-4" /> Nuevo usuario
          </Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase text-muted-foreground">Total de usuarios</CardTitle>
            <CardTitle className="text-3xl font-semibold text-foreground">{stats.total}</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Incluye cuentas activas e inactivas</CardDescription>
          </CardHeader>
        </Card>
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase text-muted-foreground">Activos</CardTitle>
            <CardTitle className="text-3xl font-semibold text-emerald-600">{stats.active}</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Con acceso al sistema</CardDescription>
          </CardHeader>
        </Card>
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase text-muted-foreground">Inactivos</CardTitle>
            <CardTitle className="text-3xl font-semibold text-amber-600">{stats.inactive}</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Pendientes de activación</CardDescription>
          </CardHeader>
        </Card>
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase text-muted-foreground">Con roles asignados</CardTitle>
            <CardTitle className="text-3xl font-semibold text-foreground">{stats.withRoles}</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Usuarios con permisos configurados</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Directorio</CardTitle>
          <CardDescription>Consulta y actualiza las cuentas administrativas del sistema.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar por usuario, nombre o rol"
                className="rounded-2xl border border-muted bg-background pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={showInactive ? "default" : "outline"}
                className="gap-2 rounded-2xl"
                onClick={() => setShowInactive((previous) => !previous)}
              >
                {showInactive ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                {showInactive ? "Mostrar solo activos" : "Incluir inactivos"}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Usuario</th>
                  <th className="px-3 py-2">Roles</th>
                  <th className="px-3 py-2">Último acceso</th>
                  <th className="px-3 py-2">Creado</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadingUsers ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando usuarios...
                      </span>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No se encontraron usuarios con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="align-top text-sm">
                      <td className="px-3 py-4">
                        <div className="font-semibold text-foreground">{user.username}</div>
                        <div className="text-xs text-muted-foreground">
                          {user.displayName ? user.displayName : "Sin nombre asignado"}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {user.roles.length > 0 ? (
                            user.roles.map((role) => (
                              <span
                                key={role}
                                className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                              >
                                {role}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">Sin roles</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-4 text-xs text-muted-foreground">
                        {user.lastLoginAt ? formatDate(user.lastLoginAt, "Sin acceso") : "Sin acceso"}
                      </td>
                      <td className="px-3 py-4 text-xs text-muted-foreground">
                        {formatDateOnly(user.createdAt, "Desconocido")}
                      </td>
                      <td className="px-3 py-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                            user.isActive
                              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border border-amber-200 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {user.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-2xl"
                            onClick={() => openEditModal(user)}
                          >
                            <Pencil className="mr-2 h-4 w-4" /> Editar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-2xl"
                            onClick={() => openPasswordModal(user)}
                          >
                            <KeyRound className="mr-2 h-4 w-4" /> Contraseña
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-2xl"
                            disabled={togglingUserId === user.id}
                            onClick={() => handleToggleActive(user, !user.isActive)}
                          >
                            {togglingUserId === user.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : user.isActive ? (
                              <Lock className="mr-2 h-4 w-4" />
                            ) : (
                              <Unlock className="mr-2 h-4 w-4" />
                            )}
                            {user.isActive ? "Desactivar" : "Activar"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          if (savingUser) return;
          setModalOpen(false);
          setEditingUserId(null);
          setForm(emptyUserForm);
        }}
        title={editingUserId ? "Editar usuario" : "Nuevo usuario"}
        description={editingUserId ? "Actualiza los datos y roles asignados." : "Registra un nuevo usuario administrativo."}
      >
        <div className="space-y-4">
          {!editingUserId ? (
            <div className="space-y-2">
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                placeholder="usuario@empresa.com"
                value={form.username}
                onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label>Usuario</Label>
              <Input value={form.username} disabled className="bg-muted/40" />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="display-name">Nombre para mostrar</Label>
            <Input
              id="display-name"
              placeholder="Nombre completo"
              value={form.displayName}
              onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
            />
          </div>

          {!editingUserId ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña temporal</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="********"
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar contraseña</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="********"
                  value={form.confirmPassword}
                  onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                />
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Roles asignados</Label>
            <div className="flex flex-wrap gap-2">
              {loadingRoles ? (
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando roles...
                </span>
              ) : roles.length === 0 ? (
                <span className="text-sm text-muted-foreground">No hay roles configurados</span>
              ) : (
                roles.map((role) => {
                  const selected = form.roles.includes(role.code);
                  return (
                    <Button
                      key={role.code}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      size="sm"
                      className="rounded-2xl"
                      onClick={() => setForm((prev) => ({ ...prev, roles: toggleArrayValue(prev.roles, role.code) }))}
                    >
                      <Shield className="mr-2 h-4 w-4" /> {role.code}
                    </Button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <input
                id="user-active"
                type="checkbox"
                className="h-4 w-4 rounded border-muted accent-primary"
                checked={form.isActive}
                onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              <Label htmlFor="user-active" className="text-sm font-medium">
                Usuario activo
              </Label>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => {
                if (savingUser) return;
                setModalOpen(false);
                setEditingUserId(null);
                setForm(emptyUserForm);
              }}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void handleSaveUser()} disabled={savingUser}>
                {savingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCog className="mr-2 h-4 w-4" />} {editingUserId ? "Guardar" : "Crear"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={passwordModalOpen}
        onClose={() => {
          if (resettingPassword) return;
          setPasswordModalOpen(false);
          setPasswordTargetId(null);
          setPasswordForm(emptyPasswordForm);
        }}
        title="Actualizar contraseña"
        description="Define una nueva contraseña para el usuario seleccionado."
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nueva contraseña</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="********"
              value={passwordForm.password}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, password: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-new-password">Confirmar contraseña</Label>
            <Input
              id="confirm-new-password"
              type="password"
              placeholder="********"
              value={passwordForm.confirm}
              onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirm: event.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (resettingPassword) return;
                setPasswordModalOpen(false);
                setPasswordTargetId(null);
                setPasswordForm(emptyPasswordForm);
              }}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleResetPassword()} disabled={resettingPassword}>
              {resettingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              Actualizar
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
