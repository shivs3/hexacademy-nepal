"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NUMBER_PATTERN, normalizeNumber } from "@/lib/certificates";

export function VerifyForm({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | undefined>();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const number = normalizeNumber(value);
    if (!NUMBER_PATTERN.test(number)) {
      setError("Enter the number exactly as printed, for example HXN-2026-7K3QZ9MA.");
      return;
    }
    setError(undefined);
    router.push(`/certificates/verify/${number}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-start" noValidate>
      <Field label="Certificate number" htmlFor="certificate-number" error={error} className="flex-1">
        <Input autoComplete="off" spellCheck={false} placeholder="HXN-2026-XXXXXXXX" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <Button type="submit" className="sm:mt-7">
        Verify
      </Button>
    </form>
  );
}
