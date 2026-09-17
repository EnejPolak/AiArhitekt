/** Next.js may cache GET fetch() by URL and reuse a PostgREST error across sessions. */
export async function supabaseNoStoreFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  const response = await fetch(input, { ...init, headers, cache: "no-store" });
  if (process.env.NODE_ENV !== "production") {
    logRestDiagnostic(input, { ...init, headers }, response.status);
  }
  return response;
}

function logRestDiagnostic(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  status: number
): void {
  let path = "";
  try {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : typeof Request !== "undefined" && input instanceof Request
            ? input.url
            : "";
    path = new URL(raw).pathname;
  } catch {
    return;
  }
  if (!path.startsWith("/rest/")) return;
  const auth = new Headers(init?.headers).get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const isJwt = bearer.startsWith("eyJ");
  let iatMinusNowSec: number | null = null;
  if (isJwt) {
    try {
      const segment = bearer.split(".")[1] || "";
      const padded = segment + "=".repeat((4 - (segment.length % 4)) % 4);
      const payload = JSON.parse(Buffer.from(padded, "base64url").toString("utf8")) as {
        iat?: number;
      };
      if (typeof payload.iat === "number") {
        iatMinusNowSec = payload.iat - Math.floor(Date.now() / 1000);
      }
    } catch {
      iatMinusNowSec = null;
    }
  }
  console.info(
    "[supabase-fetch]",
    JSON.stringify({
      path,
      status,
      authJwt: isJwt,
      iatMinusNowSec,
    })
  );
}

