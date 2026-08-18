"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/session";
import { getProjectById } from "@/lib/projects/queries";
import { MVP_PROJECT_TYPE } from "@/lib/projects/types";
import { projectIdInputSchema } from "@/lib/projects/schema";
import { createPersistClient } from "@/lib/supabase/persist";
import { acquireProductReferenceAsset } from "@/lib/references/acquire";
import { discoverProjectProducts, loadCurrentProductDiscovery } from "./discover";
import { DiscoveryError, discoveryErrorMessage } from "./errors";
import { getOwnedSelection, setSelectionConfirmed } from "./queries";
import type { ProductDiscoveryView, ProductSelectionView } from "./types";
import { getProjectRoomPreferences } from "@/lib/project-preferences/queries";
import { projectRoomPreferencesToShoppingPreferences } from "@/lib/project-preferences/adapter";
import { EMPTY_PROJECT_ROOM_PREFERENCES } from "@/lib/project-preferences/types";
import {
  DEFAULT_DISCOVERY_RADIUS_KM,
  MAX_DISCOVERY_RADIUS_KM,
  MAX_LOCATION_INPUT_LENGTH,
  MIN_LOCATION_INPUT_LENGTH,
} from "./constants";

export type DiscoveryActionOk = {
  ok: true;
  discovery: ProductDiscoveryView;
  selections: ProductSelectionView[];
  reused: boolean;
};

export type DiscoveryActionFail = { ok: false; code: string; message: string };

export type DiscoveryActionResult = DiscoveryActionOk | DiscoveryActionFail;

export type LoadDiscoveryActionResult =
  | { ok: true; discovery: ProductDiscoveryView | null; selections: ProductSelectionView[] }
  | DiscoveryActionFail;

const discoverInputSchema = z.object({
  projectId: projectIdInputSchema.shape.projectId,
  locationInput: z
    .string()
    .trim()
    .min(MIN_LOCATION_INPUT_LENGTH)
    .max(MAX_LOCATION_INPUT_LENGTH),
  radiusKm: z.number().int().min(1).max(MAX_DISCOVERY_RADIUS_KM).optional(),
  refresh: z.boolean().optional(),
});

const confirmInputSchema = z.object({
  selectionId: z.string().uuid(),
  confirmed: z.boolean(),
});

function fail(
  code: DiscoveryError["code"],
  message?: string
): DiscoveryActionFail {
  return { ok: false, code, message: message ?? discoveryErrorMessage(code) };
}

function fromCaught(error: unknown): DiscoveryActionFail {
  if (error instanceof DiscoveryError) {
    return fail(error.code, error.message);
  }
  return fail("failed");
}

async function requireOwnedRoomProject(projectId: string) {
  const user = await getVerifiedUser();
  if (!user) throw new DiscoveryError("unauthenticated", discoveryErrorMessage("unauthenticated"));
  const supabase = await createClient();
  const project = await getProjectById(supabase, projectId);
  if (!project) throw new DiscoveryError("not_found", discoveryErrorMessage("not_found"));
  if (project.project_type !== MVP_PROJECT_TYPE) {
    throw new DiscoveryError("invalid_input", discoveryErrorMessage("invalid_input"));
  }
  return { supabase, project };
}

export async function loadProductDiscovery(input: {
  projectId: string;
}): Promise<LoadDiscoveryActionResult> {
  const parsed = projectIdInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");

  try {
    const { supabase } = await requireOwnedRoomProject(parsed.data.projectId);
    const loaded = await loadCurrentProductDiscovery(supabase, parsed.data.projectId);
    return {
      ok: true,
      discovery: loaded?.discovery ?? null,
      selections: loaded?.selections ?? [],
    };
  } catch (error) {
    return fromCaught(error);
  }
}

export async function discoverProjectProductsAction(input: {
  projectId: string;
  locationInput: string;
  radiusKm?: number;
  refresh?: boolean;
}): Promise<DiscoveryActionResult> {
  const parsed = discoverInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");

  try {
    const { supabase, project } = await requireOwnedRoomProject(parsed.data.projectId);
    const persistClient = createPersistClient();
    const stored = await getProjectRoomPreferences(supabase, parsed.data.projectId);
    const preferences = projectRoomPreferencesToShoppingPreferences(
      stored ?? EMPTY_PROJECT_ROOM_PREFERENCES
    );
    const result = await discoverProjectProducts(
      supabase,
      parsed.data.projectId,
      parsed.data.locationInput,
      {
        force: Boolean(parsed.data.refresh),
        radiusKm: parsed.data.radiusKm ?? DEFAULT_DISCOVERY_RADIUS_KM,
        ownerUserId: project.user_id,
        persistClient,
        preferences,
      }
    );
    return {
      ok: true,
      discovery: result.discovery,
      selections: result.selections,
      reused: result.reused,
    };
  } catch (error) {
    return fromCaught(error);
  }
}

export async function setProductConfirmed(input: {
  selectionId: string;
  confirmed: boolean;
}): Promise<
  | { ok: true; selection: ProductSelectionView }
  | DiscoveryActionFail
> {
  const parsed = confirmInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");

  try {
    const user = await getVerifiedUser();
    if (!user) return fail("unauthenticated");
    const supabase = await createClient();
    const existing = await getOwnedSelection(supabase, parsed.data.selectionId);
    if (!existing) return fail("not_found");

    const project = await getProjectById(supabase, existing.projectId);
    if (!project) return fail("not_found");
    if (project.project_type !== MVP_PROJECT_TYPE) return fail("invalid_input");

    const selection = await setSelectionConfirmed(
      supabase,
      parsed.data.selectionId,
      parsed.data.confirmed
    );

    if (
      selection.isConfirmed &&
      selection.hasReferenceImage &&
      selection.productImageUrl
    ) {
      try {
        await acquireProductReferenceAsset({
          persistClient: createPersistClient(),
          ownerUserId: user.id,
          projectId: selection.projectId,
          selectionId: selection.id,
          sourceImageUrl: selection.productImageUrl,
        });
      } catch {
        // Confirmation is the user action. A failed retailer fetch does not un-confirm.
      }
    }

    return { ok: true, selection };
  } catch (error) {
    return fromCaught(error);
  }
}
