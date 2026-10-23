"use client";

import { Search, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Alert, Badge, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Checkbox, Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatDate } from "@/lib/utils";
import type { AdminUser, Paginated, RoleInfo, RoleSlug } from "@/types/accounts";

type Filters = { search: string; role: string; is_active: string; page: number };

export function UserDirectory({
  currentUserId,
  canManageStatus,
  canAssignRoles,
}: {
  currentUserId: number;
  canManageStatus: boolean;
  canAssignRoles: boolean;
}) {
  const toast = useToast();
  const [filters, setFilters] = useState<Filters>({ search: "", role: "", is_active: "", page: 1 });
  const [searchInput, setSearchInput] = useState("");
  const [data, setData] = useState<Paginated<AdminUser> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [statusTarget, setStatusTarget] = useState<AdminUser | null>(null);
  const [rolesTarget, setRolesTarget] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<RoleInfo[]>("/admin/roles/").then(setRoles).catch(() => setRoles([]));
  }, []);

  // Debounce the search box into the filters.
  useEffect(() => {
    const t = window.setTimeout(() => setFilters((f) => (f.search === searchInput ? f : { ...f, search: searchInput, page: 1 })), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .get<Paginated<AdminUser>>("/admin/users/", {
        query: { search: filters.search, role: filters.role, is_active: filters.is_active, page: filters.page },
        signal: controller.signal,
      })
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      });
    return () => controller.abort();
  }, [filters, reloadKey]);

  function replaceUser(updated: AdminUser) {
    setData((d) => (d ? { ...d, results: d.results.map((u) => (u.id === updated.id ? updated : u)) } : d));
  }

  async function toggleStatus() {
    if (!statusTarget) return;
    setBusy(true);
    try {
      const updated = await api.post<AdminUser>(`/admin/users/${statusTarget.id}/status/`, {
        is_active: !statusTarget.is_active,
      });
      replaceUser(updated);
      toast.success(updated.is_active ? "Account reactivated." : "Account deactivated and signed out.");
      setStatusTarget(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const roleName = (slug: string) => roles.find((r) => r.slug === slug)?.name ?? slug.replace(/_/g, " ");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <Input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, email or phone"
            aria-label="Search users"
            className="pl-9"
          />
        </div>
        <Select
          aria-label="Filter by role"
          value={filters.role}
          onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value, page: 1 }))}
          className="sm:w-48"
        >
          <option value="">All roles</option>
          <option value="super_admin">Super admin</option>
          {roles.map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by status"
          value={filters.is_active}
          onChange={(e) => setFilters((f) => ({ ...f, is_active: e.target.value, page: 1 }))}
          className="sm:w-40"
        >
          <option value="">Any status</option>
          <option value="true">Active</option>
          <option value="false">Deactivated</option>
        </Select>
      </div>

      {error && (
        <Alert tone="danger">
          {error}{" "}
          <button className="font-medium underline" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </button>
        </Alert>
      )}

      {!data && !error ? (
        <Card className="flex flex-col gap-3 p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </Card>
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Users} title="No users match these filters" />
      ) : data ? (
        <Card className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b border-line bg-page text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">User</th>
                  <th scope="col" className="px-4 py-3 font-medium">Roles</th>
                  <th scope="col" className="px-4 py-3 font-medium">Joined</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((u) => {
                  const isSelf = u.id === currentUserId;
                  const isSuper = u.roles.includes("super_admin");
                  return (
                    <tr key={u.id} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium text-navy">{u.full_name}</p>
                        <p className="text-xs text-muted">{u.email}</p>
                        {!u.email_verified && <p className="mt-0.5 text-xs text-warning">Email not verified</p>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.length === 0 && <span className="text-xs text-muted">None</span>}
                          {u.roles.map((r) => (
                            <Badge key={r} tone={r === "super_admin" ? "navy" : r === "student" ? "neutral" : "teal"}>
                              {r === "super_admin" ? "Super admin" : roleName(r)}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDate(u.date_joined)}</td>
                      <td className="px-4 py-3">
                        {u.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {canAssignRoles && !isSelf && !isSuper && (
                            <Button size="sm" variant="outline" onClick={() => setRolesTarget(u)}>
                              Roles
                            </Button>
                          )}
                          {canManageStatus && !isSelf && !isSuper && (
                            <Button size="sm" variant={u.is_active ? "ghost" : "outline"} onClick={() => setStatusTarget(u)}>
                              {u.is_active ? "Deactivate" : "Reactivate"}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3 text-sm text-muted">
            <span>
              {data.count} user{data.count === 1 ? "" : "s"} · page {data.page} of {Math.max(data.total_pages, 1)}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={!data.previous} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={!data.next} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>
                Next
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <ConfirmDialog
        open={statusTarget !== null}
        onOpenChange={(o) => !o && setStatusTarget(null)}
        title={statusTarget?.is_active ? "Deactivate account?" : "Reactivate account?"}
        description={
          statusTarget?.is_active
            ? `${statusTarget.email} will be signed out everywhere and will not be able to sign in until reactivated.`
            : `${statusTarget?.email ?? ""} will be able to sign in again.`
        }
        confirmLabel={statusTarget?.is_active ? "Deactivate" : "Reactivate"}
        tone={statusTarget?.is_active ? "danger" : "primary"}
        loading={busy}
        onConfirm={toggleStatus}
      />

      {rolesTarget && (
        <RolesDialog
          key={rolesTarget.id}
          user={rolesTarget}
          roles={roles}
          onClose={() => setRolesTarget(null)}
          onSaved={(u) => {
            replaceUser(u);
            setRolesTarget(null);
            toast.success("Roles updated.");
          }}
        />
      )}
    </div>
  );
}

function RolesDialog({
  user,
  roles,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  roles: RoleInfo[];
  onClose: () => void;
  onSaved: (u: AdminUser) => void;
}) {
  const [selected, setSelected] = useState<Set<RoleSlug>>(new Set(user.roles));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(slug: RoleSlug) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.put<AdminUser>(`/admin/users/${user.id}/roles/`, { roles: [...selected] });
      onSaved(updated);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Assign roles"
      description={`Roles for ${user.email}. Changes are recorded in the audit log.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Save roles
          </Button>
        </>
      }
    >
      {error && (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      )}
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Roles</legend>
        {roles.map((r) => (
          <label key={r.slug} className="flex items-start gap-3 rounded-md border border-line p-3 hover:bg-page">
            <Checkbox checked={selected.has(r.slug)} onChange={() => toggle(r.slug)} className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium text-navy">{r.name}</span>
              <span className="block text-xs text-muted">{r.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </Dialog>
  );
}
