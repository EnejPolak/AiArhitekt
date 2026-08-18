import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, assertSafeHttpUrl, isBlockedIpAddress } from "./ssrf";
import { ReferenceError } from "./errors";

describe("product reference SSRF guards", () => {
  it("rejects non-http schemes and local names", () => {
    expect(() => assertSafeHttpUrl("file:///etc/passwd")).toThrow(ReferenceError);
    expect(() => assertSafeHttpUrl("data:image/jpeg;base64,aaaa")).toThrow(ReferenceError);
    expect(() => assertSafeHttpUrl("javascript:alert(1)")).toThrow(ReferenceError);
    expect(() => assertSafeHttpUrl("http://localhost/sofa.jpg")).toThrow(ReferenceError);
    expect(() => assertSafeHttpUrl("http://127.0.0.1/sofa.jpg")).toThrow(ReferenceError);
    expect(() => assertSafeHttpUrl("http://[::1]/sofa.jpg")).toThrow(ReferenceError);
    expect(() => assertSafeHttpUrl("http://169.254.169.254/latest/meta-data")).toThrow(
      ReferenceError
    );
    expect(() => assertSafeHttpUrl("http://10.0.0.4/sofa.jpg")).toThrow(ReferenceError);
    expect(() => assertSafeHttpUrl("http://192.168.1.9/sofa.jpg")).toThrow(ReferenceError);
    expect(() => assertSafeHttpUrl("http://172.16.1.4/sofa.jpg")).toThrow(ReferenceError);
    expect(() => assertSafeHttpUrl("https://user:pass@cdn.example/sofa.jpg")).toThrow(
      ReferenceError
    );
  });

  it("flags private and link-local IPs", () => {
    expect(isBlockedIpAddress("127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("10.1.2.3")).toBe(true);
    expect(isBlockedIpAddress("169.254.169.254")).toBe(true);
    expect(isBlockedIpAddress("100.64.1.1")).toBe(true);
    expect(isBlockedIpAddress("::1")).toBe(true);
    expect(isBlockedIpAddress("203.0.113.10")).toBe(false);
  });

  it("rejects hostnames that resolve to private addresses", async () => {
    await expect(
      assertPublicHttpUrl("https://cdn.example/sofa.jpg", async () => ({
        address: "10.0.0.8",
        family: 4,
      }))
    ).rejects.toBeInstanceOf(ReferenceError);

    await expect(
      assertPublicHttpUrl("https://cdn.example/sofa.jpg", async () => ({
        address: "203.0.113.10",
        family: 4,
      }))
    ).resolves.toMatchObject({ hostname: "cdn.example" });
  });
});
