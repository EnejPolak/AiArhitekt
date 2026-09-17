/**
 * Server-side Step C model routing.
 * Luna-primary is experimental and default-off. Targeted recovery stays Terra.
 */
import type { OpenAiUsageDiagnostics } from "./sources";
import { OPENAI_PRODUCT_SEARCH_MODEL } from "./constants";

export type ProductDiscoveryStage = "primary" | "targeted";

export const PRODUCT_DISCOVERY_TERRA_MODEL = "gpt-5.6-terra";
export const PRODUCT_DISCOVERY_LUNA_MODEL = "gpt-5.6-luna";

export type ProductDiscoveryModelRouting = {
  lunaPrimaryEnabled: boolean;
  primaryModel: string;
  targetedModel: string;
};

export type ProductDiscoveryStageUsage = {
  modelUsed: string;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  webSearchCalls: number | null;
};

type ModelStageTrace = {
  primaryModel: string;
  primaryUsage: OpenAiUsageDiagnostics | null;
  targetedAttempted: boolean;
  targetedModel: string | null;
  targetedUsage: OpenAiUsageDiagnostics | null;
};

const stageTraceByClient = new WeakMap<object, ModelStageTrace>();

/** Server-only. Default false. Never expose as NEXT_PUBLIC_*. */
export function isProductDiscoveryLunaPrimaryEnabled(): boolean {
  const raw = process.env.PRODUCT_DISCOVERY_LUNA_PRIMARY?.trim().toLowerCase();
  if (raw == null || raw === "") return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function getProductDiscoveryModel(stage: ProductDiscoveryStage): string {
  if (stage === "targeted") return PRODUCT_DISCOVERY_TERRA_MODEL;
  if (isProductDiscoveryLunaPrimaryEnabled()) return PRODUCT_DISCOVERY_LUNA_MODEL;
  return OPENAI_PRODUCT_SEARCH_MODEL || PRODUCT_DISCOVERY_TERRA_MODEL;
}

export function getProductDiscoveryModelRouting(): ProductDiscoveryModelRouting {
  return {
    lunaPrimaryEnabled: isProductDiscoveryLunaPrimaryEnabled(),
    primaryModel: getProductDiscoveryModel("primary"),
    targetedModel: getProductDiscoveryModel("targeted"),
  };
}

export function beginProductDiscoveryModelTrace(client: object): void {
  const routing = getProductDiscoveryModelRouting();
  stageTraceByClient.set(client, {
    primaryModel: routing.primaryModel,
    primaryUsage: null,
    targetedAttempted: false,
    targetedModel: null,
    targetedUsage: null,
  });
}

export function recordPrimaryModelStage(
  client: object,
  usage: OpenAiUsageDiagnostics | null
): void {
  const existing = stageTraceByClient.get(client);
  const primaryModel = getProductDiscoveryModel("primary");
  if (!existing) {
    stageTraceByClient.set(client, {
      primaryModel,
      primaryUsage: usage,
      targetedAttempted: false,
      targetedModel: null,
      targetedUsage: null,
    });
    return;
  }
  existing.primaryModel = primaryModel;
  existing.primaryUsage = usage;
}

export function recordTargetedModelStage(
  client: object,
  usage: OpenAiUsageDiagnostics | null
): void {
  const targetedModel = getProductDiscoveryModel("targeted");
  const existing = stageTraceByClient.get(client);
  if (!existing) {
    stageTraceByClient.set(client, {
      primaryModel: getProductDiscoveryModel("primary"),
      primaryUsage: null,
      targetedAttempted: true,
      targetedModel,
      targetedUsage: usage,
    });
    return;
  }
  existing.targetedAttempted = true;
  existing.targetedModel = targetedModel;
  existing.targetedUsage = usage;
}

function toStageUsage(
  modelUsed: string,
  usage: OpenAiUsageDiagnostics | null
): ProductDiscoveryStageUsage {
  return {
    modelUsed,
    inputTokens: usage?.inputTokens ?? null,
    cachedInputTokens: usage?.cachedInputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    webSearchCalls: usage?.webSearchCalls ?? null,
  };
}

export function productDiscoveryModelDiagnostics(client?: object | null): {
  modelRouting: ProductDiscoveryModelRouting;
  primaryModel: string;
  targetedAttempted: boolean;
  targetedModel: string | null;
  usageByStage: {
    primary: ProductDiscoveryStageUsage | null;
    targeted: ProductDiscoveryStageUsage | null;
  };
} {
  const routing = getProductDiscoveryModelRouting();
  const trace = client ? stageTraceByClient.get(client) : undefined;
  const targetedAttempted = trace?.targetedAttempted ?? false;
  const primaryModel = trace?.primaryModel ?? routing.primaryModel;
  const targetedModel = targetedAttempted
    ? trace?.targetedModel ?? routing.targetedModel
    : null;
  return {
    modelRouting: routing,
    primaryModel,
    targetedAttempted,
    targetedModel,
    usageByStage: {
      primary: toStageUsage(primaryModel, trace?.primaryUsage ?? null),
      targeted:
        targetedAttempted && targetedModel
          ? toStageUsage(targetedModel, trace?.targetedUsage ?? null)
          : null,
    },
  };
}
