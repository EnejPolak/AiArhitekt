import { afterEach, describe, expect, it } from "vitest";
import {
  InvalidProductionConfigError,
  assertHostedSupabaseUrl,
  assertProductionSiteUrl,
  assertRuntimeConfig,
  parsePublicHttpUrl,
} from "./productionConfig";

const KEYS = [
  "VERCEL_ENV",
  "VERCEL_TARGET_ENV",
  "APP_DEPLOYMENT_ENV",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_SITE_URL",
] as const;

const snapshot: Record<string, string | undefined> = {};

function save() {
  for (const key of KEYS) snapshot[key] = process.env[key];
}

function restore() {
  for (const key of KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function hostedEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcd.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  process.env.NEXT_PUBLIC_SITE_URL = "https://app.example";
}

describe("production config validation", () => {
  save();
  afterEach(restore);

  it("accepts local loopback URLs when parsing", () => {
    const parsed = parsePublicHttpUrl("http://127.0.0.1:54421", "NEXT_PUBLIC_SUPABASE_URL");
    expect(parsed.hostname).toBe("127.0.0.1");
    expect(parsed.port).toBe("54421");
  });

  it("rejects malformed URLs", () => {
    expect(() => parsePublicHttpUrl("not-a-url", "NEXT_PUBLIC_SUPABASE_URL")).toThrow(
      InvalidProductionConfigError
    );
  });

  it("rejects localhost Supabase URLs in production and preview", () => {
    expect(() => assertHostedSupabaseUrl("http://127.0.0.1:54421", "production")).toThrow(
      /localhost/
    );
    expect(() => assertHostedSupabaseUrl("http://localhost:54321", "preview")).toThrow(/localhost/);
  });

  it("allows localhost Supabase URLs in local/development", () => {
    expect(() => assertHostedSupabaseUrl("http://127.0.0.1:54421", "local")).not.toThrow();
    expect(() => assertHostedSupabaseUrl("http://127.0.0.1:54421", "development")).not.toThrow();
  });

  it("requires a public https site URL in production", () => {
    expect(() => assertProductionSiteUrl(undefined, "production")).toThrow(/missing/);
    expect(() => assertProductionSiteUrl("http://localhost:3000", "production")).toThrow(
      /localhost/
    );
    expect(assertProductionSiteUrl("https://app.example/", "production")).toBe("https://app.example");
  });

  it("does not require site URL locally", () => {
    expect(assertProductionSiteUrl(undefined, "local")).toBeNull();
  });

  it("fails production runtime when required vars are missing", () => {
    delete process.env.VERCEL_ENV;
    process.env.APP_DEPLOYMENT_ENV = "production";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(() => assertRuntimeConfig()).toThrow(InvalidProductionConfigError);
  });

  it("fails production runtime when Supabase URL is loopback", () => {
    process.env.APP_DEPLOYMENT_ENV = "production";
    hostedEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54421";
    expect(() => assertRuntimeConfig()).toThrow(/localhost/);
  });

  it("accepts a complete hosted production config", () => {
    process.env.APP_DEPLOYMENT_ENV = "production";
    hostedEnv();
    expect(() => assertRuntimeConfig()).not.toThrow();
  });

  it("does not throw for local development with loopback Supabase", () => {
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_TARGET_ENV;
    delete process.env.APP_DEPLOYMENT_ENV;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54421";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "local-publishable";
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(() => assertRuntimeConfig()).not.toThrow();
  });
});
