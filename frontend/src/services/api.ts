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

export interface ExportPdfRequest {
  root: string;
  path: string;
  base_revision: string;
  title: string;
  page: "A4" | "Letter";
  size_pt: number;
  lines: string[];
}

/** A PDF converted from legacy fonts (TECH_SPEC §6.10). */
export interface LegacyDocument {
  pages: { number: number; lines: string[] }[];
  /** Fonts used for text; table is empty when the font has none. */
  fonts: { name: string; table: string; bytes: number }[];
  /** Codes with no table entry, kept in the text as ‹XX›. */
  unmapped: { font: string; code: string; count: number }[];
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
  if (body instanceof Blob) {
    init.body = body;
    init.headers = { "Content-Type": body.type || "application/octet-stream" };
  } else if (body !== undefined) {
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
  exportPdf: (req: ExportPdfRequest) =>
    call<{ revision: string }>("POST", "/api/export/pdf", req).then(
      (r) => r.revision,
    ),
  /** Shows the folder picker on this computer; null when cancelled. */
  pickFolder: (start: string) =>
    call<{ root: string; name: string } | undefined>(
      "POST",
      "/api/folders/pick",
      { start },
    ).then((r) => r ?? null),
  /** Converts a PDF typeset with legacy fonts; nothing is stored. */
  importLegacyPdf: (pdf: Blob) =>
    call<LegacyDocument>("POST", "/api/import/legacy-pdf", pdf),
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
  shutdown: () => call<{ status: string }>("POST", "/api/shutdown"),
  deleteSnapshot: (key: string) =>
    call<void>("DELETE", `/api/recovery/${q(key)}`),
};
