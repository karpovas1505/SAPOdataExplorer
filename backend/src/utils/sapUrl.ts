import sapConfig from '../config/sap.config';

const MAX_URL_LENGTH = 2048;
const ALLOWED_PATH_PREFIX = '/sap/opu/odata/';
const SENSITIVE_HEADERS = new Set(['set-cookie', 'cookie', 'authorization', 'x-csrf-token']);

export class SapUrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SapUrlValidationError';
  }
}

function decodePath(pathname: string): string {
  let decoded = pathname;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      // Malformed percent-encoding is not a valid SAP path.
      throw new SapUrlValidationError('Invalid URL encoding');
    }
  }
  return decoded;
}

function getRawPath(value: string): string {
  const withoutOrigin = value.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
  return withoutOrigin.split(/[?#]/, 1)[0] || '';
}

function assertNoTraversal(rawPath: string): void {
  const decodedPath = decodePath(rawPath);
  if (decodedPath.split('/').some((segment) => segment === '..' || segment === '.')) {
    throw new SapUrlValidationError('Path traversal is not allowed');
  }
}

function assertSafePath(pathname: string): void {
  if (!pathname.startsWith(ALLOWED_PATH_PREFIX)) {
    throw new SapUrlValidationError(
      `Only SAP OData paths are allowed (${ALLOWED_PATH_PREFIX}...)`
    );
  }

  const decodedPath = decodePath(pathname);
  if (/[\u0000-\u001f\u007f\\]/.test(decodedPath)) {
    throw new SapUrlValidationError('Invalid characters in URL path');
  }
}

function parseAbsoluteUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new SapUrlValidationError('Invalid absolute URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SapUrlValidationError('Only HTTP and HTTPS URLs are allowed');
  }

  if (parsed.username || parsed.password) {
    throw new SapUrlValidationError('URLs with credentials are not allowed');
  }

  let base: URL;
  try {
    base = new URL(sapConfig.baseUrl);
  } catch {
    throw new SapUrlValidationError('SAP gateway URL is not configured');
  }

  if (parsed.origin.toLowerCase() !== base.origin.toLowerCase()) {
    throw new SapUrlValidationError(
      `Absolute URLs are only allowed for the configured SAP gateway (${base.origin})`
    );
  }

  assertSafePath(parsed.pathname);

  return new URL(`${parsed.pathname}${parsed.search}`, 'http://sap.local');
}

/**
 * Validates a user-supplied SAP URL and returns a relative path that can be
 * safely passed to an axios instance with the configured SAP base URL.
 *
 * Absolute URLs are accepted only when they point to the configured SAP
 * gateway. This prevents the backend from being used as an open proxy (SSRF).
 */
export function assertSafeSapODataUrl(value: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new SapUrlValidationError('URL is required');
  }

  const input = value.trim();
  if (input.length > MAX_URL_LENGTH) {
    throw new SapUrlValidationError('URL too long');
  }

  assertNoTraversal(getRawPath(input));

  if (/^https?:\/\//i.test(input)) {
    const parsed = parseAbsoluteUrl(input);
    return `${parsed.pathname}${parsed.search}`;
  }

  if (!input.startsWith('/') || input.startsWith('//')) {
    throw new SapUrlValidationError('URL must be an absolute path or a full SAP gateway URL');
  }

  const parsed = new URL(input, 'http://sap.local');
  assertSafePath(parsed.pathname);
  // Preserve the original path/query encoding expected by SAP.
  return input;
}

export function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(headers || {}).map(([key, value]) => [
      key,
      SENSITIVE_HEADERS.has(key.toLowerCase()) ? '<redacted>' : value,
    ])
  );
}
