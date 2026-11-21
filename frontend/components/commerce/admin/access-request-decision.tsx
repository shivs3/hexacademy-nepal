"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatPrice } from "@/lib/catalog";
import type { AdminAccessRequest } from "@/types/access";

export type Decision = "approve" | "reject";

/** Approve (grants the course or exam) or reject (note required) one request. */
export function AccessRequestDecision({
  request,
  decision,
  onClose,
  onDone,
}: {
  request: AdminAccessRequest | null;
  decision: Decision;
  onClose: () => void;
  onDone: (updated: AdminAccessRequest) => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const approving = decision === "approve";

  function close() {
    setNote("");
    setError(null);
    onClose();
  }

  async function submit() {
    if (!request) return;
    if (!approving && !note.trim()) {
      setError("Tell the learner why, for example that no payment was found.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await api.post<AdminAccessRequest>(`/admin/commerce/requests/${request.id}/${decision}/`, {
        note: note.trim(),
      });
      setNote("");
      onDone(updated);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => !open && close()}
      title={approving ? "Approve and add access" : "Reject request"}
      description={
        request
          ? approving
            ? `${request.user.full_name || request.user.email} gets ${request.item_title} (${formatPrice(request.price)}) on their account right away.`
            : `${request.item_title} for ${request.user.full_name || request.user.email}. The learner sees your note.`
          : undefined
      }
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={busy}>
            Back
          </Button>
          <Button variant={approving ? "primary" : "danger"} onClick={submit} loading={busy}>
            {approving ? "Approve" : "Reject"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {approving && (
          <p className="text-sm text-body">Only approve once you have confirmed the payment yourself.</p>
        )}
        <Field
          label={approving ? "Note to the learner (optional)" : "Reason (shown to the learner)"}
          htmlFor="decision-note"
          required={!approving}
        >
          <Textarea id="decision-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Dialog>
  );
}
