export type IngestAuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

function configuredIngestToken(): string | null {
  const token = process.env.ARC_INGEST_TOKEN?.trim();
  return token && token.length > 0 ? token : null;
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

export function authorizeIngestRequest(request: Request): IngestAuthResult {
  const expectedToken = configuredIngestToken();

  if (!expectedToken) {
    return {
      ok: false,
      status: 503,
      error: 'ARC_INGEST_TOKEN is not configured; refusing agent ingest writes.',
    };
  }

  if (bearerToken(request) !== expectedToken) {
    return {
      ok: false,
      status: 401,
      error: 'Missing or invalid bearer token.',
    };
  }

  return { ok: true };
}
