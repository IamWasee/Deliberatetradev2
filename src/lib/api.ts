/* Server-score bridge. When VITE_API_BASE is configured (production with
   the Express backend in server/), authoritative scores are fetched; the
   client never computes-or-sends a score it wants the server to accept —
   it only DISPLAYS what the server returns. Without a backend, views fall
   back to the local mirror and label it clearly. */
import { useEffect, useState } from "react";

const BASE = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE ?? "";

export interface ServerScores {
  process?: { score: number; components: Record<string, number> };
  readiness?: {
    score: number; stage: string; feedback: string[];
    gates: { id: string; label: string; pass: boolean; detail: string }[];
    components: { key: string; label: string; value: number }[];
  };
}

export const hasBackend = (): boolean => BASE.length > 0;

export function useServerScores(): { scores: ServerScores | null; source: "server" | "local" } {
  const [scores, setScores] = useState<ServerScores | null>(null);

  useEffect(() => {
    if (!BASE) return;
    let live = true;
    const load = async () => {
      try {
        const [p, r] = await Promise.all([
          fetch(`${BASE}/api/scores/process`, { credentials: "include" }).then((x) => (x.ok ? x.json() : null)),
          fetch(`${BASE}/api/scores/readiness`, { credentials: "include" }).then((x) => (x.ok ? x.json() : null)),
        ]);
        if (live) setScores({ process: p ?? undefined, readiness: r ?? undefined });
      } catch {
        /* offline → keep local estimates */
      }
    };
    load();
    const iv = setInterval(load, 30_000);
    return () => { live = false; clearInterval(iv); };
  }, []);

  return { scores, source: BASE && scores ? "server" : "local" };
}
