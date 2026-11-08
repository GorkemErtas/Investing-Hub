import { createHash } from "node:crypto";
export const hash = (text: string) =>
  createHash("sha256").update(text).digest("hex");

export const evidenceStages = [
  "missing_candidate",
  "missing_grounding_chunks",
  "missing_grounding_supports",
  "missing_search_entry_point",
  "response_content",
  "search_suggestions",
  "json_parse",
  "review_schema",
  "report_schema",
  "source_url",
  "source_metadata",
  "source_identity",
  "citation_offset",
  "citation_reference",
  "review_fingerprint",
  "review_identity",
  "unsafe_review",
  "unsupported_structured_claims",
] as const;
export type EvidenceStage = (typeof evidenceStages)[number];
export interface GroundingDiagnostic {
  chunks: number;
  supports: number;
  searchEntryPoint: boolean;
}
type SafeCategory =
  | Lowercase<FutureError["code"]>
  | "bad_request"
  | "unauthenticated"
  | "permission_denied"
  | "not_found"
  | "rate_limited"
  | "server_error"
  | "sdk_or_network_error";
export class FutureError extends Error {
  stage: EvidenceStage | null = null;
  grounding: GroundingDiagnostic | null = null;
  constructor(
    public code:
      | "STORAGE"
      | "BUSY"
      | "BUDGET"
      | "COOLDOWN"
      | "TIMEOUT"
      | "PROVIDER"
      | "INSUFFICIENT_EVIDENCE"
      | "PERMISSION_REQUIRED",
    public httpStatus: number | null = null,
    public elapsedMs: number | null = null,
    public category: SafeCategory = code.toLowerCase() as SafeCategory,
    public retryAfterSeconds = 0,
  ) {
    super(code);
  }
}
export function insufficient(stage: EvidenceStage): FutureError {
  const error = new FutureError("INSUFFICIENT_EVIDENCE");
  error.stage = stage;
  return error;
}
export function failure(
  error: unknown,
  elapsedMs: number | null = null,
): FutureError {
  if (error instanceof FutureError) return error;
  const raw =
    error && typeof error === "object"
      ? (error as { status?: number; name?: string })
      : {};
  const status =
    typeof raw.status === "number" &&
    Number.isInteger(raw.status) &&
    raw.status >= 400 &&
    raw.status <= 599
      ? raw.status
      : null;
  const category =
    raw.name === "AbortError" || raw.name === "TimeoutError"
      ? "timeout"
      : status === 400
        ? "bad_request"
        : status === 401
          ? "unauthenticated"
          : status === 403
            ? "permission_denied"
            : status === 404
              ? "not_found"
              : status === 429
                ? "rate_limited"
                : status && status >= 500
                  ? "server_error"
                  : "sdk_or_network_error";
  return new FutureError(
    category === "timeout" ? "TIMEOUT" : "PROVIDER",
    status,
    elapsedMs,
    category,
    status === 429 ? 3600 : 0,
  );
}
