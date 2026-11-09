// SPDX-License-Identifier: GPL-3.0-or-later

export interface Health {
  app: string;
  version: string;
}

export async function fetchHealth(): Promise<Health> {
  const resp = await fetch("/api/health");
  if (!resp.ok) {
    throw new Error(`health check failed: ${resp.status}`);
  }
  return (await resp.json()) as Health;
}
