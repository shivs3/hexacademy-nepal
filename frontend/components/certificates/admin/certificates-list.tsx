"use client";

import { Award, MoreHorizontal } from "lucide-react";
import { useState } from "react";

import { LoadError, Pager, SearchBox, TableSkeleton, th, theadClass } from "@/components/cms/admin/list-parts";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Select, Textarea } from "@/components/ui/input";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useApiResource, useDebounced } from "@/hooks/use-api-resource";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { CERTIFICATE_BADGE } from "@/lib/certificates";
import { formatDate } from "@/lib/utils";
import type { Paginated } from "@/types/accounts";
import type { AdminCertificate } from "@/types/certificates";

export function CertificatesList({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [revoking, setRevoking] = useState<AdminCertificate | null>(null);
  const [reinstating, setReinstating] = useState<AdminCertificate | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useDebounced(search);
  const { data, error, reload } = useApiResource<Paginated<AdminCertificate>>("/admin/certificates/issued/", { search: q, status, page });

  async function reinstate() {
    if (!reinstating) return;
    setBusy(true);
    try {
      await api.post(`/admin/certificates/issued/${reinstating.id}/reinstate/`);
      toast.success("Certificate reinstated.");
      setReinstating(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-end">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          label="Search certificates"
          placeholder="Number, name, email or course"
        />
        <Select
          aria-label="Status"
          className="sm:w-auto"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="valid">Valid</option>
          <option value="revoked">Revoked</option>
        </Select>
      </CardHeader>
      {error && (
        <div className="p-4">
          <LoadError message={error} onRetry={reload} />
        </div>
      )}
      {!data && !error ? (
        <TableSkeleton />
      ) : data && data.results.length === 0 ? (
        <EmptyState
          icon={Award}
          title="No certificates found"
          description={q || status ? "Try a different search." : "Certificates appear here once learners meet a course's certificate rule."}
        />
      ) : data ? (
        <>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className={theadClass}>
                <tr>
                  <th scope="col" className={th}>
                    Number
                  </th>
                  <th scope="col" className={th}>
                    Recipient
                  </th>
                  <th scope="col" className={th}>
                    Course
                  </th>
                  <th scope="col" className={th}>
                    Issued
                  </th>
                  <th scope="col" className={th}>
                    Status
                  </th>
                  <th scope="col" className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-mono text-xs">{c.number}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-navy">{c.recipient_name}</span>
                      <span className="block text-xs text-muted">{c.user.email}</span>
                    </td>
                    <td className="px-4 py-3">{c.course_title}</td>
                    <td className="px-4 py-3">{formatDate(c.issued_at)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={CERTIFICATE_BADGE[c.status].tone}>{CERTIFICATE_BADGE[c.status].label}</Badge>
                      {c.status === "revoked" && (
                        <span className="mt-1 block max-w-[14rem] text-xs text-muted" title={c.revoked_reason}>
                          {c.revoked_reason}
                          {c.revoked_by_name && ` · ${c.revoked_by_name}`}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Menu
                        trigger={
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${c.number}`}>
                            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        }
                      >
                        <MenuItem onSelect={() => window.open(`/api/v1/admin/certificates/issued/${c.id}/pdf/`, "_blank", "noopener")}>
                          Download PDF
                        </MenuItem>
                        <MenuItem onSelect={() => window.open(`/certificates/verify/${c.number}`, "_blank", "noopener")}>
                          Open verification page
                        </MenuItem>
                        {canManage && c.status === "valid" && (
                          <MenuItem danger onSelect={() => setRevoking(c)}>
                            Revoke
                          </MenuItem>
                        )}
                        {canManage && c.status === "revoked" && <MenuItem onSelect={() => setReinstating(c)}>Reinstate</MenuItem>}
                      </Menu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager data={data} onPage={setPage} />
        </>
      ) : null}
      {revoking && (
        <RevokeDialog
          certificate={revoking}
          onClose={() => setRevoking(null)}
          onDone={() => {
            setRevoking(null);
            toast.success("Certificate revoked. The verification page now shows it as revoked.");
            reload();
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(reinstating)}
        onOpenChange={(o) => !o && !busy && setReinstating(null)}
        title="Reinstate this certificate?"
        description="It becomes valid again on the public verification page."
        confirmLabel="Reinstate"
        loading={busy}
        onConfirm={reinstate}
      />
    </Card>
  );
}

export function RevokeDialog({ certificate, onClose, onDone }: { certificate: AdminCertificate; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!reason.trim()) {
      setError("Give a reason. It is kept in the audit log.");
      return;
    }
    setError(undefined);
    setFormError(null);
    setSaving(true);
    try {
      await api.post(`/admin/certificates/issued/${certificate.id}/revoke/`, {
        reason: reason.trim(),
      });
      onDone();
    } catch (err) {
      const fields = isApiError(err) ? err.fieldErrors() : {};
      setError(fields.reason);
      setFormError(fields.reason ? null : errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !saving && onClose()}
      title={`Revoke ${certificate.number}?`}
      description={`${certificate.recipient_name} · ${certificate.course_title}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} loading={saving}>
            Revoke
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <p className="text-sm text-muted">The certificate stays on record, but anyone verifying it will see that it was revoked.</p>
        <Field label="Reason" htmlFor="revoke-reason" error={error} required>
          <Textarea rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
