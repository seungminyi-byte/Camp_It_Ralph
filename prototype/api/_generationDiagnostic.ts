import { isRecord, type ErrorCode } from './_http.js';

type Phase = 'request' | 'config' | 'gate' | 'upstream_fetch' | 'upstream_http' | 'upstream_sse';
type ErrorLocation = 'none' | 'top_level' | 'choice' | 'finish_reason';
type ErrorShape = 'missing' | 'object' | 'null' | 'other';

// Exact values from OpenRouter's typed error contract. Never trim or prefix-match metadata.
const ERROR_TYPES = new Set([
  'context_length_exceeded', 'max_tokens_exceeded', 'token_limit_exceeded', 'string_too_long',
  'authentication', 'permission_denied', 'payment_required', 'rate_limit_exceeded',
  'provider_overloaded', 'provider_unavailable', 'invalid_request', 'invalid_prompt',
  'not_found', 'precondition_failed', 'payload_too_large', 'unprocessable',
  'content_policy_violation', 'refusal', 'invalid_image', 'image_too_large', 'image_too_small',
  'unsupported_image_format', 'image_not_found', 'image_download_failed', 'server', 'timeout', 'unmapped',
]);
const LOCAL_CODES = new Set<ErrorCode>([
  'BAD_REQUEST', 'PAYLOAD_TOO_LARGE', 'UNSUPPORTED_MEDIA_TYPE', 'METHOD_NOT_ALLOWED',
  'NOT_FOUND', 'SERVER_UNAVAILABLE', 'UPSTREAM_INVALID', 'UPSTREAM_UNAVAILABLE',
  'UPSTREAM_TIMEOUT', 'REQUEST_CANCELLED', 'DUPLICATE_REQUEST', 'RATE_LIMITED',
  'UPSTREAM_EMPTY', 'UPSTREAM_INCOMPLETE', 'OUTPUT_TOO_LARGE',
]);
const numericCode = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;

/** Request-local, server-only observation. Raw input and upstream objects are never retained. */
export class GenerationDiagnostic {
  private readonly requestAtUtc = new Date().toISOString();
  private readonly startedAt = performance.now();
  private phase: Phase = 'request';
  private upstreamHttpStatus: number | null = null;
  private upstreamCode: number | null = null;
  private upstreamErrorType = 'unknown';
  private errorLocation: ErrorLocation = 'none';
  private errorShape: ErrorShape = 'missing';
  private requestedModels: string[] = [];
  private terminal = false;
  private readonly allowedModels: ReadonlySet<string>;

  constructor(allowedModels: ReadonlySet<string>) { this.allowedModels = allowedModels; }

  enter(phase: Phase) { this.phase = phase; }
  selectModels(models: readonly string[]) {
    this.requestedModels = models.filter((model) => this.allowedModels.has(model)).slice(0, this.allowedModels.size);
  }
  response(status: number) { this.upstreamHttpStatus = numericCode(status); }
  upstreamError(location: ErrorLocation, error: unknown) {
    this.errorLocation = location;
    this.errorShape = error === undefined ? 'missing' : error === null ? 'null' : isRecord(error) ? 'object' : 'other';
    this.upstreamCode = isRecord(error) ? numericCode(error.code) : null;
    const errorType = isRecord(error) && isRecord(error.metadata) ? error.metadata.error_type : undefined;
    this.upstreamErrorType = typeof errorType === 'string' && ERROR_TYPES.has(errorType) ? errorType : 'unknown';
  }
  complete() { this.terminal = true; }
  fail(code: ErrorCode, textEmitted = false) {
    if (this.terminal) return;
    this.terminal = true;
    // Logging and serialization failures must not affect response or lifecycle cleanup.
    try {
      const elapsed = performance.now() - this.startedAt;
      const record = {
        event: 'ai_generation_failure',
        requestAtUtc: this.requestAtUtc,
        elapsedMs: Number.isFinite(elapsed) ? Math.min(86_400_000, Math.max(0, Math.floor(elapsed))) : 0,
        phase: this.phase,
        localCode: LOCAL_CODES.has(code) ? code : 'UPSTREAM_UNAVAILABLE',
        upstreamHttpStatus: this.upstreamHttpStatus,
        upstreamCode: this.upstreamCode,
        upstreamErrorType: this.upstreamErrorType,
        errorLocation: this.errorLocation,
        errorShape: this.errorShape,
        requestedModels: this.requestedModels,
        textEmitted,
      };
      console.error(JSON.stringify(record));
    } catch { /* Diagnostics are best effort and have no effect on generation. */ }
  }
}
