import { describe, expect, it } from "vitest";
import { searchLocaleFromCountryCode } from "./country";

describe("country → search locale", () => {
  it("maps SI to sl", () => {
    expect(searchLocaleFromCountryCode("SI")).toBe("sl");
    expect(searchLocaleFromCountryCode("si")).toBe("sl");
  });

  it("maps unknown or missing country to en", () => {
    expect(searchLocaleFromCountryCode(null)).toBe("en");
    expect(searchLocaleFromCountryCode(undefined)).toBe("en");
    expect(searchLocaleFromCountryCode("")).toBe("en");
    expect(searchLocaleFromCountryCode("DE")).toBe("en");
    expect(searchLocaleFromCountryCode("US")).toBe("en");
  });
});
