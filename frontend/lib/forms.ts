import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import { errorMessage, isApiError } from "@/lib/api/errors";

/**
 * Copies DRF field errors onto matching form fields. Returns the message to
 * show as a form-level alert (non-field errors or the generic message).
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string | null {
  if (!isApiError(error)) return errorMessage(error);
  const fieldErrors = error.fieldErrors();
  let matched = false;
  for (const field of fields) {
    const message = fieldErrors[field];
    if (message) {
      setError(field, { type: "server", message });
      matched = true;
    }
  }
  const nonField = fieldErrors.non_field_errors;
  if (nonField) return nonField;
  return matched ? null : error.message;
}
