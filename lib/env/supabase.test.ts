import { afterEach, describe, expect, it } from "vitest";
import {
  MissingSupabaseConfigError,
  getAppOrigin,
  getSupabasePublicConfig,
} from "./supabase";

const KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "VERCEL_URL",
] as const;

const snapshot: Record<string, string | undefined> = {};

describe("getSupabasePublicConfig", () => {
  afterEach(() => {
    for (const key of KEYS) {
      const value = snapshot[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function save() {
    for (const key of KEYS) snapshot[key] = process.env[key];
  }

  it("throws when URL or publishable key is missing", () => {
    save();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(() => getSupabasePublicConfig()).toThrow(MissingSupabaseConfigError);
  });

  it("returns trimmed public config", () => {
    save();
    process.env.NEXT_PUBLIC_SUPABASE_URL = " http://127.0.0.1:54321 ";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = " sb_publishable_test ";
    expect(getSupabasePublicConfig()).toEqual({
      url: "http://127.0.0.1:54321",
      publishableKey: "sb_publishable_test",
    });
  });
});

describe("getAppOrigin", () => {
  afterEach(() => {
    for (const key of KEYS) {
      const value = snapshot[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("prefers NEXT_PUBLIC_SITE_URL over VERCEL_URL", () => {
    for (const key of KEYS) snapshot[key] = process.env[key];
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example/";
    process.env.VERCEL_URL = "preview.vercel.app";
    expect(getAppOrigin()).toBe("https://app.example");
  });
});
