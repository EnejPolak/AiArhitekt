/**
 * Product category / identity checks beyond image association.
 * A correct thumbnail does not rescue a wrong product class.
 */

export function outdoorStorageConflictsIndoorRequirement(input: {
  productTitle: string;
  itemSpec?: string | null;
  productUrl?: string | null;
  requirementKey?: string | null;
}): boolean {
  const key = (input.requirementKey ?? "").toLowerCase();
  const spec = (input.itemSpec ?? "").toLowerCase();
  const isStorageSlot =
    key.includes(":storage:") || /\bstorage\b|omar(?:a|e)\b|cabinet|sideboard|commode/.test(spec);
  if (!isStorageSlot) return false;

  const identity = `${input.productTitle} ${input.productUrl ?? ""}`.toLowerCase();
  return /biohort|garden\s*shed|vrtn(?:a|i)\b|omara za opremo|gerätehaus|tuinkast|outdoor\s+storage|garden\s+storage|Gerätehaus/i.test(
    identity
  );
}

export function selectionConflictsRequirementCategory(input: {
  productTitle: string;
  itemSpec?: string | null;
  productUrl?: string | null;
  requirementKey?: string | null;
}): boolean {
  return outdoorStorageConflictsIndoorRequirement(input);
}
