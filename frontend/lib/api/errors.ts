export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown> | unknown[];
  };
};

/** Error thrown by the API clients; mirrors the backend error envelope. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown> | unknown[];

  constructor(status: number, code: string, message: string, details?: ApiErrorBody["error"]["details"]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field-level messages from DRF validation errors, flattened to strings. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (!this.details || Array.isArray(this.details)) return out;
    // Nested serializer errors ({items: [{}, {label: ["…"]}]}) become dotted keys ("items.1.label").
    const walk = (value: unknown, key: string) => {
      if (typeof value === "string") {
        if (!(key in out)) out[key] = value;
      } else if (Array.isArray(value)) {
        if (value.length && value.every((v) => typeof v === "string")) walk(value[0], key);
        else value.forEach((v, i) => walk(v, `${key}.${i}`));
      } else if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) walk(v, key ? `${key}.${k}` : k);
      }
    };
    walk(this.details, "");
    return out;
  }
}

export async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // non-JSON (e.g. proxy error page)
  }
  if (body && typeof body === "object" && "error" in body) {
    const { code, message, details } = (body as ApiErrorBody).error;
    return new ApiError(response.status, code, message, details);
  }
  const fallback =
    response.status >= 500
      ? "The server is unavailable right now. Please try again shortly."
      : `Request failed (${response.status}).`;
  return new ApiError(response.status, "http_error", fallback);
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export function errorMessage(value: unknown): string {
  if (isApiError(value)) return value.message;
  if (value instanceof TypeError) return "Network error. Check your connection and try again.";
  return "Something went wrong. Please try again.";
}
