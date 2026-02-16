/**
 * Track per-domain SERP success to prioritize allowlist domains.
 */

import { promises as fs } from "fs";
import path from "path";
import { normalizeDomainToRoot } from "./domains";

type DomainStat = { success: number; total: number };
type DomainStatsFile = { domains: Record<string, DomainStat> };

const STATS_FILE = path.join(process.cwd(), "tmp", "serp-domain-stats.json");

async function loadStats(): Promise<DomainStatsFile> {
  try {
    await fs.mkdir(path.dirname(STATS_FILE), { recursive: true });
    const content = await fs.readFile(STATS_FILE, "utf-8");
    const data = JSON.parse(content) as DomainStatsFile;
    if (data && data.domains) return data;
  } catch {
    // ignore
  }
  return { domains: {} };
}

async function saveStats(stats: DomainStatsFile): Promise<void> {
  try {
    await fs.mkdir(path.dirname(STATS_FILE), { recursive: true });
    await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2), "utf-8");
  } catch {
    // ignore
  }
}

export async function recordDomainOutcome(domain: string, success: boolean): Promise<void> {
  const d = normalizeDomainToRoot(domain);
  if (!d) return;
  const stats = await loadStats();
  const current = stats.domains[d] ?? { success: 0, total: 0 };
  current.total += 1;
  if (success) current.success += 1;
  stats.domains[d] = current;
  await saveStats(stats);
}

export async function rankDomainsBySuccess(domains: string[]): Promise<string[]> {
  const normalized = domains.map(normalizeDomainToRoot).filter(Boolean);
  if (normalized.length === 0) return [];
  const stats = await loadStats();
  const hasAnyStats = normalized.some((d) => stats.domains[d]?.total);
  if (!hasAnyStats) return normalized;

  const indexed = normalized.map((d, idx) => {
    const s = stats.domains[d];
    const rate = s && s.total > 0 ? s.success / s.total : 0;
    return { domain: d, rate, idx };
  });
  indexed.sort((a, b) => {
    if (b.rate !== a.rate) return b.rate - a.rate;
    return a.idx - b.idx;
  });
  return indexed.map((d) => d.domain);
}
