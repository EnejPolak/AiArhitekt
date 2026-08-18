/**
 * Least-privilege GRANTs for trusted commerce/render tables (local Postgres).
 */
import { describe, expect, it } from "vitest";
import { localSupabaseApiUrl } from "@/lib/supabase/localUrl";
import { localHasColumnPrivilege, localHasTablePrivilege } from "@/lib/security/localPrivileges";

const LOCAL_URL = localSupabaseApiUrl();

function assertLocalOnly(url: string) {
  if (url.toLowerCase().includes("supabase.co") || !url.startsWith("http://127.0.0.1:")) {
    throw new Error("Refusing privilege tests against hosted Supabase.");
  }
}

describe("trusted table GRANTs (local)", () => {
  it("authenticated has SELECT only on project_room_renders", () => {
    assertLocalOnly(LOCAL_URL);
    expect(localHasTablePrivilege("authenticated", "project_room_renders", "SELECT")).toBe(true);
    expect(localHasTablePrivilege("authenticated", "project_room_renders", "INSERT")).toBe(false);
    expect(localHasTablePrivilege("authenticated", "project_room_renders", "UPDATE")).toBe(false);
    expect(localHasTablePrivilege("authenticated", "project_room_renders", "DELETE")).toBe(false);
    expect(localHasTablePrivilege("authenticated", "project_room_renders", "TRUNCATE")).toBe(false);
    expect(localHasTablePrivilege("anon", "project_room_renders", "SELECT")).toBe(false);
    expect(localHasTablePrivilege("service_role", "project_room_renders", "INSERT")).toBe(true);
    expect(localHasTablePrivilege("service_role", "project_room_renders", "UPDATE")).toBe(true);
  });

  it("authenticated cannot INSERT/UPDATE trusted commerce or reference rows", () => {
    assertLocalOnly(LOCAL_URL);
    expect(localHasTablePrivilege("authenticated", "project_product_discoveries", "SELECT")).toBe(
      true
    );
    expect(localHasTablePrivilege("authenticated", "project_product_discoveries", "DELETE")).toBe(
      true
    );
    expect(localHasTablePrivilege("authenticated", "project_product_discoveries", "INSERT")).toBe(
      false
    );
    expect(localHasTablePrivilege("authenticated", "project_product_discoveries", "UPDATE")).toBe(
      false
    );

    expect(localHasTablePrivilege("authenticated", "project_product_selections", "SELECT")).toBe(
      true
    );
    expect(localHasTablePrivilege("authenticated", "project_product_selections", "INSERT")).toBe(
      false
    );
    expect(localHasTablePrivilege("authenticated", "project_product_selections", "DELETE")).toBe(
      false
    );
    expect(localHasTablePrivilege("authenticated", "project_product_selections", "UPDATE")).toBe(
      false
    );
    expect(
      localHasColumnPrivilege(
        "authenticated",
        "project_product_selections",
        "is_confirmed",
        "UPDATE"
      )
    ).toBe(true);
    expect(
      localHasColumnPrivilege("authenticated", "project_product_selections", "price", "UPDATE")
    ).toBe(false);

    expect(
      localHasTablePrivilege("authenticated", "project_product_reference_assets", "SELECT")
    ).toBe(true);
    expect(
      localHasTablePrivilege("authenticated", "project_product_reference_assets", "DELETE")
    ).toBe(true);
    expect(
      localHasTablePrivilege("authenticated", "project_product_reference_assets", "INSERT")
    ).toBe(false);
    expect(
      localHasTablePrivilege("authenticated", "project_product_reference_assets", "UPDATE")
    ).toBe(false);
  });
});
