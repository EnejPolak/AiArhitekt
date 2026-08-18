import { lookup as dnsLookup } from "node:dns/promises";
import { ReferenceError, referenceErrorMessage } from "./errors";

export type AddressLookup = (
  hostname: string
) => Promise<{ address: string; family: number }>;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google.com",
]);

function ipv4FromParts(parts: number[]): number {
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    nums.push(n);
  }
  return nums;
}

function isBlockedIpv4(parts: number[]): boolean {
  const ip = ipv4FromParts(parts);
  const inRange = (base: number, bits: number) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ip & mask) === (base & mask);
  };
  return (
    inRange(ipv4FromParts([0, 0, 0, 0]), 8) ||
    inRange(ipv4FromParts([10, 0, 0, 0]), 8) ||
    inRange(ipv4FromParts([127, 0, 0, 0]), 8) ||
    inRange(ipv4FromParts([169, 254, 0, 0]), 16) ||
    inRange(ipv4FromParts([172, 16, 0, 0]), 12) ||
    inRange(ipv4FromParts([192, 168, 0, 0]), 16) ||
    inRange(ipv4FromParts([100, 64, 0, 0]), 10)
  );
}

function expandIpv6(hostname: string): number[] | null {
  const raw = hostname.trim().toLowerCase();
  if (!raw.includes(":")) return null;
  if (raw.startsWith("::ffff:")) {
    const mapped = parseIpv4(raw.slice(7));
    if (mapped) {
      return isBlockedIpv4(mapped) ? [0, 0, 0, 0, 0, 0xffff, 0x7f00, 1] : null;
    }
  }
  const halves = raw.split("::");
  if (halves.length > 2) return null;
  const parseGroup = (chunk: string) => chunk.split(":").filter(Boolean);
  const head = parseGroup(halves[0] ?? "");
  const tail = halves.length === 2 ? parseGroup(halves[1] ?? "") : [];
  if (head.concat(tail).some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [
    ...head,
    ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => "0"),
    ...tail,
  ];
  if (groups.length !== 8) return null;
  return groups.map((g) => Number.parseInt(g, 16));
}

function isBlockedIpv6(groups: number[]): boolean {
  const isZero = groups.every((g) => g === 0);
  if (isZero) return true;
  if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0) {
    if (groups[5] === 0 && groups[6] === 0 && groups[7] === 1) return true;
    if (groups[5] === 0xffff) {
      const mapped = [
        (groups[6] >> 8) & 0xff,
        groups[6] & 0xff,
        (groups[7] >> 8) & 0xff,
        groups[7] & 0xff,
      ];
      return isBlockedIpv4(mapped);
    }
  }
  const first = groups[0];
  if ((first & 0xfe00) === 0xfc00) return true;
  if ((first & 0xffc0) === 0xfe80) return true;
  return false;
}

export function isBlockedIpAddress(address: string): boolean {
  const v4 = parseIpv4(address);
  if (v4) return isBlockedIpv4(v4);
  const v6 = expandIpv6(address.replace(/^\[|\]$/g, ""));
  if (v6) return isBlockedIpv6(v6);
  return false;
}

function hostnameLooksLocal(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  return false;
}

export function assertSafeHttpUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ReferenceError("unsafe_url", referenceErrorMessage("unsafe_url"));
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ReferenceError("unsafe_url", referenceErrorMessage("unsafe_url"));
  }
  if (parsed.username || parsed.password) {
    throw new ReferenceError("unsafe_url", referenceErrorMessage("unsafe_url"));
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (hostnameLooksLocal(hostname) || isBlockedIpAddress(hostname)) {
    throw new ReferenceError("unsafe_url", referenceErrorMessage("unsafe_url"));
  }
  return parsed;
}

export async function assertPublicHttpUrl(
  raw: string,
  lookup: AddressLookup = defaultLookup
): Promise<URL> {
  const parsed = assertSafeHttpUrl(raw);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (parseIpv4(hostname) || expandIpv6(hostname)) {
    if (isBlockedIpAddress(hostname)) {
      throw new ReferenceError("unsafe_url", referenceErrorMessage("unsafe_url"));
    }
    return parsed;
  }
  let resolved: { address: string; family: number };
  try {
    resolved = await lookup(hostname);
  } catch {
    throw new ReferenceError("unsafe_url", referenceErrorMessage("unsafe_url"));
  }
  if (!resolved?.address || isBlockedIpAddress(resolved.address)) {
    throw new ReferenceError("unsafe_url", referenceErrorMessage("unsafe_url"));
  }
  return parsed;
}

export async function defaultLookup(hostname: string): Promise<{ address: string; family: number }> {
  return dnsLookup(hostname, { verbatim: true });
}
