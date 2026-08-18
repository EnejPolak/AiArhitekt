import { createHash } from "node:crypto";
import {
  canonicalShoppingPreferences,
  shoppingPreferenceCanonicalJson,
  type ShoppingPreferenceInput,
  type ShoppingPreferenceSnapshot,
} from "./preferences";

export function shoppingPreferenceFingerprint(input?: ShoppingPreferenceInput | null): {
  snapshot: ShoppingPreferenceSnapshot;
  hash: string;
} {
  const snapshot = canonicalShoppingPreferences(input);
  const hash = createHash("sha256").update(shoppingPreferenceCanonicalJson(input)).digest("hex");
  return { snapshot, hash };
}

export function shoppingPreferenceHash(input?: ShoppingPreferenceInput | null): string {
  return shoppingPreferenceFingerprint(input).hash;
}

export const EMPTY_SHOPPING_PREFERENCE_HASH = shoppingPreferenceHash(null);
