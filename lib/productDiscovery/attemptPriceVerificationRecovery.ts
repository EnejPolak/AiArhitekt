import OpenAI from "openai";
import {
  finalizeAcceptedProduct,
  type AcceptanceResult,
  type AcceptanceSource,
} from "./acceptancePolicy";
import { shouldAttemptPriceVerification } from "./priceVerificationEligibility";
import {
  applyVerifiedPriceToCandidate,
  verifyCandidatePrice,
  type CandidatePriceVerification,
} from "./verifyCandidatePrice";
import type { ProductDiscoveryProduct, ProductDiscoverySource } from "./types";

export type PriceVerificationRecoveryResult = {
  attempted: boolean;
  verification: CandidatePriceVerification | null;
  durationMs: number;
  finalized: (AcceptanceResult & { product: ProductDiscoveryProduct }) | null;
  recovered: boolean;
  priceVerificationSucceeded: boolean;
};

export function buildPriceVerificationDiagnostics(input: {
  verification: CandidatePriceVerification | null;
  attempted: boolean;
  durationMs: number;
  recovered: boolean;
}) {
  const verification = input.verification;
  return {
    priceVerificationAttempted: input.attempted,
    priceVerificationStatus: input.attempted ? verification?.status ?? "error" : null,
    priceVerificationEvidence:
      verification?.status === "verified" ? verification.evidenceType : verification ? "none" : null,
    priceVerificationPrice: verification?.price ?? null,
    priceVerificationRecovered: input.recovered,
    priceVerificationDurationMs: input.attempted ? input.durationMs : null,
    priceVerificationSucceeded: verification?.status === "verified",
  };
}

export async function attemptPriceVerificationRecovery(input: {
  client: OpenAI;
  requestedItem: string;
  allowlistDomains: string[];
  sources: ProductDiscoverySource[];
  source: AcceptanceSource;
  finalized: AcceptanceResult & { product: ProductDiscoveryProduct };
  evidenceText?: string;
}): Promise<PriceVerificationRecoveryResult> {
  const started = Date.now();

  if (
    !shouldAttemptPriceVerification({
      requestedItem: input.requestedItem,
      source: input.source,
      finalized: input.finalized,
      allowlistDomains: input.allowlistDomains,
      sources: input.sources,
    })
  ) {
    return {
      attempted: false,
      verification: null,
      durationMs: 0,
      finalized: null,
      recovered: false,
      priceVerificationSucceeded: false,
    };
  }

  const verification = await verifyCandidatePrice({
    client: input.client,
    requestedItem: input.requestedItem,
    candidate: input.finalized.product,
    allowlistDomains: input.allowlistDomains,
    sources: input.sources,
    allowDedicatedSearch: true,
  });

  const durationMs = Date.now() - started;

  if (verification.status !== "verified" || verification.price == null) {
    return {
      attempted: true,
      verification,
      durationMs,
      finalized: input.finalized,
      recovered: false,
      priceVerificationSucceeded: verification.status === "verified",
    };
  }

  const pricedProduct = applyVerifiedPriceToCandidate(input.finalized.product, verification);
  const rerun = finalizeAcceptedProduct({
    requestedItem: input.requestedItem,
    source: input.source,
    product: pricedProduct,
    evidenceText: [input.evidenceText, verification.evidenceText].filter(Boolean).join("\n") || undefined,
  });

  return {
    attempted: true,
    verification,
    durationMs,
    finalized: rerun,
    recovered: rerun.accepted,
    priceVerificationSucceeded: true,
  };
}
