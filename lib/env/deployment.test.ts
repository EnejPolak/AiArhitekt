import { afterEach, describe, expect, it } from "vitest";
import {
  getDeploymentEnv,
  isDebugApiAllowed,
  isProductionDeployment,
} from "./deployment";

const KEYS = [
  "VERCEL_ENV",
  "VERCEL_TARGET_ENV",
  "APP_DEPLOYMENT_ENV",
  "API_DEBUG_ENABLED",
  "NODE_ENV",
] as const;

const snapshot: Record<string, string | undefined> = {};

function saveEnv() {
  for (const key of KEYS) {
    snapshot[key] = process.env[key];
  }
}

function restoreEnv() {
  for (const key of KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearGatingEnv() {
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_TARGET_ENV;
  delete process.env.APP_DEPLOYMENT_ENV;
  delete process.env.API_DEBUG_ENABLED;
}

describe("deployment env", () => {
  saveEnv();
  afterEach(() => {
    restoreEnv();
  });

  it("treats VERCEL_ENV=production as production even when NODE_ENV is development", () => {
    clearGatingEnv();
    process.env.NODE_ENV = "development";
    process.env.VERCEL_ENV = "production";
    expect(getDeploymentEnv()).toBe("production");
    expect(isProductionDeployment()).toBe(true);
  });

  it("treats VERCEL_TARGET_ENV=production as production", () => {
    clearGatingEnv();
    process.env.VERCEL_TARGET_ENV = "production";
    expect(getDeploymentEnv()).toBe("production");
  });

  it("maps Vercel preview and development labels", () => {
    clearGatingEnv();
    process.env.VERCEL_ENV = "preview";
    expect(getDeploymentEnv()).toBe("preview");
    process.env.VERCEL_ENV = "development";
    expect(getDeploymentEnv()).toBe("development");
  });

  it("uses APP_DEPLOYMENT_ENV for non-Vercel production hosts", () => {
    clearGatingEnv();
    process.env.APP_DEPLOYMENT_ENV = "production";
    expect(isProductionDeployment()).toBe(true);
  });

  it("does not treat NODE_ENV=production alone as a production deployment", () => {
    clearGatingEnv();
    process.env.NODE_ENV = "production";
    expect(getDeploymentEnv()).toBe("local");
    expect(isProductionDeployment()).toBe(false);
  });
});

describe("isDebugApiAllowed", () => {
  saveEnv();
  afterEach(() => {
    restoreEnv();
  });

  it("always disables debug APIs in production even if API_DEBUG_ENABLED is true", () => {
    clearGatingEnv();
    process.env.VERCEL_ENV = "production";
    process.env.API_DEBUG_ENABLED = "true";
    expect(isDebugApiAllowed()).toBe(false);
  });

  it("allows debug APIs on preview only when explicitly enabled", () => {
    clearGatingEnv();
    process.env.VERCEL_ENV = "preview";
    expect(isDebugApiAllowed()).toBe(false);
    process.env.API_DEBUG_ENABLED = "true";
    expect(isDebugApiAllowed()).toBe(true);
  });

  it("allows debug APIs locally when API_DEBUG_ENABLED is true/1/yes", () => {
    clearGatingEnv();
    process.env.API_DEBUG_ENABLED = "true";
    expect(isDebugApiAllowed()).toBe(true);
    process.env.API_DEBUG_ENABLED = "1";
    expect(isDebugApiAllowed()).toBe(true);
    process.env.API_DEBUG_ENABLED = "yes";
    expect(isDebugApiAllowed()).toBe(true);
    process.env.API_DEBUG_ENABLED = "false";
    expect(isDebugApiAllowed()).toBe(false);
  });

  it("rejects debug APIs when the flag is unset", () => {
    clearGatingEnv();
    expect(isDebugApiAllowed()).toBe(false);
  });
});
