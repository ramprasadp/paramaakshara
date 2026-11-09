// SPDX-License-Identifier: GPL-3.0-or-later

// Calls to the daemon (TECH_SPEC §9.3). Requests are same-origin, so the
// session cookie is sent automatically.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly currentRevision?: string,
  ) {
    super(message);
  }
}

export interface ClientConfig {
  roots: string[];
  max_document_bytes: number;
  recovery_interval_seconds: number;
  editor: {
    input_scheme: string;
    output_script: string;
    tamil_convention: string;
    vedic_tradition: string;
    digits: string;
  };
}

export interface Entry {
  path: string;
  size: number;
  modified: string;
}

export interface OpenedDocument {
  content: string;
  revision: string;
  bom: boolean;
  line_ending: "lf" | "crlf";
}

export interface SaveRequest {
  root: string;
  path: string;
  base_revision: string;
  content: string;
  bom: boolean;
  line_ending: "lf" | "crlf";
}

export interface Snapshot {
  key: string;
  saved_at: string;
  name: string;
  root?: string;
  path?: string;
  base_revision?: string;
  project?: unknown;
}

async function call<T>(
  method: string,
  url: string,
  body?: unknown,
  keepalive = false,
): Promise<T> {
  const init: RequestInit = { method, keepalive };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  let resp: Response;
  try {
    resp = await fetch(url, init);
  } catch {
    throw new ApiError(
      0,
      "unreachable",
      "Paramaakshara is not running. Start it again and reload this page.",
    );
  }
  if (resp.status === 204) return undefined as T;
  const data = (await resp.json().catch(() => ({}))) as {
    error?: { code: string; message: string; current_revision?: string };
  };
  if (!resp.ok) {
    const e = data.error ?? {
      code: "internal",
      message: `HTTP ${resp.status}`,
    };
    throw new ApiError(resp.status, e.code, e.message, e.current_revision);
  }
  return data as T;
}

const q = encodeURIComponent;

export const api = {
  config: () => call<ClientConfig>("GET", "/api/config"),
  list: (root: string) =>
    call<{ entries: Entry[] }>("GET", `/api/documents?root=${q(root)}`).then(
      (r) => r.entries,
    ),
  open: (root: string, path: string) =>
    call<OpenedDocument>(
      "GET",
      `/api/document?root=${q(root)}&path=${q(path)}`,
    ),
  save: (req: SaveRequest) =>
    call<{ revision: string }>("PUT", "/api/document", req).then(
      (r) => r.revision,
    ),
  snapshots: () =>
    call<{ snapshots: Snapshot[] }>("GET", "/api/recovery").then(
      (r) => r.snapshots,
    ),
  snapshot: (key: string) => call<Snapshot>("GET", `/api/recovery/${q(key)}`),
  putSnapshot: (
    key: string,
    s: Omit<Snapshot, "key" | "saved_at">,
    keepalive = false,
  ) => call<void>("PUT", `/api/recovery/${q(key)}`, s, keepalive),
  deleteSnapshot: (key: string) =>
    call<void>("DELETE", `/api/recovery/${q(key)}`),
};
