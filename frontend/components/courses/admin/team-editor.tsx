"use client";

import { ArrowDown, ArrowUp, Plus, Users, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Checkbox, Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useApiResource, useDebounced } from "@/hooks/use-api-resource";
import { useUnsavedWarning } from "@/hooks/use-unsaved-warning";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { TEAM_ROLE_LABELS, type AdminCourse, type TeamCandidate, type TeamMember, type TeamRole } from "@/types/catalog-admin";

const MAX_TEAM = 12;

function toInput(team: TeamMember[]) {
  return team.map((m) => ({ user: m.user_id, role: m.role, is_public: m.is_public }));
}

/** Catalog managers choose who teaches a course; instructors on the team can edit it, assistants can view it. */
export function TeamEditor({ courseId, team, onSaved }: { courseId: number; team: TeamMember[]; onSaved: (course: AdminCourse) => void }) {
  const toast = useToast();
  const [members, setMembers] = useState<TeamMember[]>(team);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = useDebounced(search);
  const candidates = useApiResource<TeamCandidate[]>("/admin/catalog/team-candidates/", { search: q });
  const dirty = JSON.stringify(toInput(members)) !== JSON.stringify(toInput(team));
  useUnsavedWarning(dirty);

  const patch = (i: number, change: Partial<TeamMember>) => setMembers((ms) => ms.map((m, j) => (j === i ? { ...m, ...change } : m)));
  const move = (from: number, to: number) =>
    setMembers((ms) => {
      const next = [...ms];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const course = await api.put<AdminCourse>(`/admin/catalog/courses/${courseId}/team/`, { members: toInput(members) });
      setMembers(course.team);
      onSaved(course);
      toast.success("Teaching team saved.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const available = (candidates.data ?? []).filter((c) => !members.some((m) => m.user_id === c.id));
  const hasInstructor = members.some((m) => m.role === "instructor");

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Teaching team</CardTitle>
          <Button onClick={save} disabled={!dirty} loading={saving}>
            Save team
          </Button>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          {error && <Alert tone="danger">{error}</Alert>}
          {members.length > 0 && !hasInstructor && <Alert tone="warning">Nobody on the team can edit this course. Add an instructor.</Alert>}
          {members.length === 0 ? (
            <EmptyState icon={Users} title="No one teaches this course yet" description="Add instructors and teaching assistants from the list." />
          ) : (
            <ol className="flex flex-col divide-y divide-line rounded-lg border border-line">
              {members.map((m, i) => (
                <li key={m.user_id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-navy">{m.full_name || m.email}</p>
                    <p className="truncate text-xs text-muted">{m.email}</p>
                  </div>
                  <Select aria-label={`Role of ${m.full_name || m.email}`} value={m.role} onChange={(e) => patch(i, { role: e.target.value as TeamRole })} className="sm:w-48">
                    {Object.entries(TEAM_ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  <Label className="flex items-center gap-2 whitespace-nowrap font-normal">
                    <Checkbox checked={m.is_public} onChange={(e) => patch(i, { is_public: e.target.checked })} />
                    Show on course page
                  </Label>
                  <div className="flex">
                    <Button type="button" variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move ${m.full_name || m.email} up`}>
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" disabled={i === members.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move ${m.full_name || m.email} down`}>
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="text-danger" onClick={() => setMembers((ms) => ms.filter((_, j) => j !== i))} aria-label={`Remove ${m.full_name || m.email}`}>
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <p className="text-xs text-muted">
            {members.length} of {MAX_TEAM}. Instructors can edit the course content and curriculum; teaching assistants can view it and follow learners&apos; progress.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add people</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email" aria-label="Search staff" />
          {candidates.error ? (
            <p className="text-xs text-danger">{candidates.error}</p>
          ) : !candidates.data ? (
            <p className="text-xs text-muted">Loading…</p>
          ) : available.length === 0 ? (
            <p className="text-xs text-muted">{q ? "No matches." : "Only accounts with the instructor or teaching assistant role are listed."}</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto rounded-md border border-line">
              {available.map((c) => (
                <li key={c.id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    disabled={members.length >= MAX_TEAM}
                    onClick={() => setMembers((ms) => [...ms, { user_id: c.id, full_name: c.full_name, email: c.email, role: "instructor", is_public: true }])}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-teal-50 focus-visible:bg-teal-50 focus-visible:outline-none disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{c.full_name || c.email}</span>
                      <span className="block truncate text-xs text-muted">{c.email}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
