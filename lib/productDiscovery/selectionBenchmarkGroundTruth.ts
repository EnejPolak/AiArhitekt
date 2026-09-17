/**
 * Dev-only acceptance-aligned ground-truth labeling for selection benchmarks.
 * Not wired into production searchProductItem.
 */
import { finalizeAcceptedProduct } from "./acceptancePolicy";
import { ACCEPTANCE_RESCUE_MIN_SCORE } from "./constants";
import { extractMaxPriceEur, usesExactLanguage, type RequirementLists } from "./matchPolicy";
import {
  categoryEvidenceHaystack,
  parseProductIdentity,
  verifyCoreCategoryInEvidence,
} from "./productIdentity";
import {
  buildProductEvidence,
  classifyExactDimensionAgainstEvidence,
  resolveGroundedPrice,
  trustedEvidenceHaystack,
} from "./productEvidence";
import {
  type RescueCandidate,
} from "./rescueCandidates";
import { parseRequestedRequirements } from "./requirementAnalysis";
import type { PriceEvidence, ProductDiscoveryProduct } from "./types";

export type GroundTruthAssessment = {
  qualifies: boolean;
  candidateId: string;
  url: string;
  name: string | null;
  price: number | null;
  priceEvidence: PriceEvidence;
  reasons: string[];
  acceptanceReason: string | null;
  acceptanceAccepted: boolean;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function haystackFor(candidate: RescueCandidate): string {
  return normalize(
    trustedEvidenceHaystack(
      buildProductEvidence({
        productUrl: candidate.url,
        sources: [
          {
            url: candidate.url,
            title: candidate.sourceTitle,
            snippet: candidate.sourceEvidence,
          },
        ],
        enrichment: candidate.enrichment,
        trustedDisplayName: nameFor(candidate),
      })
    )
  );
}

function nameFor(candidate: RescueCandidate): string | null {
  return (
    candidate.enrichment?.productName?.trim() ||
    candidate.enrichment?.pageTitle?.trim() ||
    candidate.sourceTitle?.trim() ||
    null
  );
}

function groundedPriceFor(candidate: RescueCandidate): {
  price: number | null;
  currency: string | null;
  priceEvidence: PriceEvidence;
} {
  const evidence = buildProductEvidence({
    productUrl: candidate.url,
    sources: [
      {
        url: candidate.url,
        title: candidate.sourceTitle,
        snippet: candidate.sourceEvidence,
      },
    ],
    enrichment: candidate.enrichment,
    trustedDisplayName: nameFor(candidate),
  });
  const grounded = resolveGroundedPrice({
    evidence,
    modelClaimedPrice: null,
    serpSnippetPrice: candidate.serpSnippetPrice ?? null,
  });
  return {
    price: grounded.price,
    currency: grounded.currency,
    priceEvidence: grounded.priceEvidence,
  };
}

function evidenceHasChrome(hay: string): boolean {
  return /\b(chrome|krom|kromiran|chromed)\b/i.test(hay);
}

function evidenceHasWhite(hay: string): boolean {
  return /\b(white|bela|belo|beli|bel)\b/i.test(hay);
}

function evidenceHasBlack(hay: string): boolean {
  return /\b(black|crna|crno|crni|crn)\b/i.test(hay);
}

function evidenceHasCeramic(hay: string): boolean {
  return /\b(ceramic|keramik)\b/i.test(hay);
}

function evidenceHasVase(hay: string): boolean {
  return /\b(vase|vaza)\b/i.test(hay);
}

function evidenceHasTile(hay: string): boolean {
  return /\b(tile|tiles|ploscic|plosic|granitogres|stenska plosc)\b/i.test(hay);
}

function evidenceHasStainless(hay: string): boolean {
  // Slovenian "nerjaveče jeklo" / URL slug nerjavecega — do not require trailing word-boundary after nerjav.
  return /\b(stainless|inox|nerjav\w*|nerjave\w*)\b|\bjekl[oa]?\b/i.test(hay);
}

function evidenceHasMetal(hay: string): boolean {
  return /\b(metal|kovin|steel|jekl|aluminium|aluminum|brass|meden)\b/i.test(hay);
}

function evidenceHasPendant(hay: string): boolean {
  return /\b(pendant|viseca|visilka|hanging)\b/i.test(hay);
}

function evidenceHasRadiator(hay: string): boolean {
  return /\b(radiator|ogrev|towel radiator|heated towel)\b/i.test(hay);
}

function evidenceHasTowelHolderOnly(hay: string): boolean {
  return /\b(drzalo|towel holder|holder)\b/i.test(hay) && !evidenceHasRadiator(hay);
}

/** Width ~60cm / 600mm evidence (production uses token inclusion, not inference). */
function evidenceHasWidth60(hay: string): boolean {
  // Explicit width wording
  if (/\b(?:sirina|width|wide)[^.]{0,24}60(?:[.,]\d+)?\s*cm\b/.test(hay)) return true;
  if (/\b60(?:[.,]\d+)?\s*cm\b[^.]{0,24}(?:sirina|width|wide)\b/.test(hay)) return true;
  // Common towel-radiator title form: "60 x 97 cm"
  if (/\b60(?:[.,]\d+)?\s*(?:cm\s*)?[x×]\s*\d{2,}/.test(hay)) return true;
  // Standalone 60 cm when not clearly a secondary side of a 100–120cm product
  if (/\b60(?:[.,]\d+)?\s*cm\b/.test(hay) && !/\b(?:120|100|80)\s*(?:cm|[x×])/.test(hay)) return true;
  // 600 mm only when not paired as 1200x600 / 1000x600 style overall size
  if (/\b600\s*mm\b/.test(hay) && !/\b(?:1[0-2]00|800)\s*[x×]\s*600\b/.test(hay)) return true;
  return false;
}

function evidenceHasExact60Width(hay: string): boolean {
  return classifyExactDimensionAgainstEvidence({ valueCm: "60", haystack: hay }) === "supported";
}

function evidenceHasHeight30(hay: string): boolean {
  if (/\b30(?:[.,]\d+)?\s*cm\b/.test(hay)) return true;
  if (/\b300\s*mm\b/.test(hay)) return true;
  if (/\bvisina[^.]{0,20}30\b/.test(hay)) return true;
  if (/\bheight[^.]{0,20}30\b/.test(hay)) return true;
  if (/\b30(?:[.,]0+)?\s*x\b/.test(hay)) return true;
  return false;
}

function evidenceHasApprox40(hay: string): boolean {
  if (/\b40(?:[.,]\d+)?\s*cm\b/.test(hay)) return true;
  if (/\b400\s*mm\b/.test(hay)) return true;
  if (/\bø\s*40\b/.test(hay) || /\boe\s*40\b/.test(hay) || /\bdiameter[^.]{0,12}40\b/.test(hay)) {
    return true;
  }
  return false;
}

function requirementEvidenced(reqId: string, label: string, hay: string): boolean {
  if (reqId.startsWith("category:")) {
    if (label.includes("towel")) return evidenceHasRadiator(hay);
    if (label.includes("vase")) return evidenceHasVase(hay);
    if (label.includes("pendant")) return evidenceHasPendant(hay);
    if (label.includes("kitchen sink")) {
      return /\b(sink|korito|pomival)\b/i.test(hay);
    }
    return reqId
      .replace("category:", "")
      .split(/\s+/)
      .some((t) => t.length >= 3 && hay.includes(normalize(t)));
  }
  if (reqId.startsWith("material:")) {
    const m = label.toLowerCase();
    if (m === "chrome") return evidenceHasChrome(hay);
    if (m === "ceramic") return evidenceHasCeramic(hay);
    if (m === "metal") return evidenceHasMetal(hay);
    if (m === "stainless" || m === "steel") return evidenceHasStainless(hay);
    return hay.includes(normalize(m));
  }
  if (reqId.startsWith("color:")) {
    const c = label.toLowerCase();
    if (c === "chrome") return evidenceHasChrome(hay);
    if (c === "white") return evidenceHasWhite(hay);
    if (c === "black") return evidenceHasBlack(hay);
    return hay.includes(normalize(c));
  }
  if (reqId.startsWith("dimension:")) {
    if (label.startsWith("60")) return evidenceHasWidth60(hay) || evidenceHasExact60Width(hay);
    if (label.startsWith("30")) return evidenceHasHeight30(hay);
    if (label.startsWith("40")) return evidenceHasApprox40(hay);
    const num = label.match(/(\d+(?:[.,]\d+)?)/)?.[1]?.replace(",", ".");
    return num ? hay.includes(num) : false;
  }
  if (reqId.startsWith("budget:")) return false; // handled via price
  return false;
}

function buildEvidenceBackedLists(
  requestedItem: string,
  candidate: RescueCandidate,
  price: number | null
): { lists: RequirementLists; reasons: string[] } {
  const hay = haystackFor(candidate);
  const reasons: string[] = [];
  const matched: string[] = [];
  const unmet: string[] = [];
  const unknown: string[] = [];
  const requirements = parseRequestedRequirements(requestedItem);

  for (const req of requirements) {
    if (req.id.startsWith("budget:")) {
      const max = extractMaxPriceEur(requestedItem);
      if (max == null) continue;
      if (price == null) {
        unknown.push(req.label);
        reasons.push(`price unknown (max ${max} EUR)`);
      } else if (price > max) {
        unmet.push(req.label);
        reasons.push(`over budget: €${price} > max €${max}`);
      } else {
        matched.push(req.label);
        reasons.push(`price €${price} within max €${max}`);
      }
      continue;
    }

    // Explicit finish/color contradictions for chrome requests.
    if (
      (req.id === "color:chrome" || req.id === "material:chrome" || req.label === "chrome") &&
      !evidenceHasChrome(hay)
    ) {
      if (evidenceHasWhite(hay)) {
        unmet.push("chrome");
        reasons.push("wrong finish: white, not chrome");
        continue;
      }
      if (evidenceHasBlack(hay)) {
        unmet.push("chrome");
        reasons.push("wrong finish: black, not chrome");
        continue;
      }
    }

    if (req.id === "color:white" && !evidenceHasWhite(hay) && evidenceHasBlack(hay)) {
      unmet.push("white");
      reasons.push("wrong color: black, not white");
      continue;
    }
    if (req.id === "color:black" && !evidenceHasBlack(hay) && evidenceHasWhite(hay)) {
      unmet.push("black");
      reasons.push("wrong color: white, not black");
      continue;
    }

    if (requirementEvidenced(req.id, req.label, hay)) {
      matched.push(req.label);
      reasons.push(`${req.label} confirmed from merchant/source evidence`);
    } else if (req.hard) {
      unknown.push(req.label);
      reasons.push(`hard requirement unverified: ${req.label}`);
    } else {
      unknown.push(req.label);
      reasons.push(`soft/secondary unverified: ${req.label}`);
    }
  }

  // Category pollution guards
  if (/\bvase\b/i.test(requestedItem) && evidenceHasTile(hay) && !evidenceHasVase(hay)) {
    unmet.push("vase");
    reasons.push("wrong category: tile page, not vase");
  }
  if (/\bheated\s+towel\s+rail\b/i.test(requestedItem) && evidenceHasTowelHolderOnly(hay)) {
    unmet.push("heated towel rail");
    reasons.push("wrong category: towel holder, not heated towel radiator");
  }
  if (/\bpendant\s+lamp\b/i.test(requestedItem) && !evidenceHasPendant(hay)) {
    if (/\b(stropna|ceiling)\b/i.test(hay)) {
      unmet.push("pendant lamp");
      reasons.push("wrong category: ceiling light, not pendant");
    }
  }

  return {
    lists: {
      matchedRequirements: [...new Set(matched)],
      unmetRequirements: [...new Set(unmet)],
      unknownRequirements: [...new Set(unknown)],
    },
    reasons,
  };
}

function buildProductFromCandidate(
  requestedItem: string,
  candidate: RescueCandidate
): { product: ProductDiscoveryProduct | null; evidenceText: string; reasons: string[] } {
  const name = nameFor(candidate);
  const evidenceText = trustedEvidenceHaystack(
    buildProductEvidence({
      productUrl: candidate.url,
      sources: [
        {
          url: candidate.url,
          title: candidate.sourceTitle,
          snippet: candidate.sourceEvidence,
        },
      ],
      enrichment: candidate.enrichment,
      trustedDisplayName: name,
    })
  );
  const priceInfo = groundedPriceFor(candidate);
  const priceEvidence = priceInfo.priceEvidence;
  const reasons: string[] = [];

  if (!name) {
    return { product: null, evidenceText, reasons: ["missing product name"] };
  }

  const { lists, reasons: listReasons } = buildEvidenceBackedLists(
    requestedItem,
    candidate,
    priceInfo.price
  );
  reasons.push(...listReasons);

  const product: ProductDiscoveryProduct = {
    name,
    retailer: candidate.domain,
    retailerDomain: candidate.domain,
    productUrl: candidate.url,
    price: priceInfo.price,
    currency: priceInfo.currency === "EUR" ? "EUR" : priceInfo.price != null ? priceInfo.currency : null,
    priceUnit: null,
    imageUrl: candidate.enrichment?.imageUrl ?? null,
    specifications: {},
    matchScore: ACCEPTANCE_RESCUE_MIN_SCORE,
    matchedRequirements: lists.matchedRequirements,
    unmetRequirements: lists.unmetRequirements,
    unknownRequirements: lists.unknownRequirements,
    whyItMatches: "Benchmark ground-truth product synthesized from merchant/source evidence only.",
    priceEvidence,
  };

  return { product, evidenceText, reasons };
}

/**
 * Ground-truth qualification aligned with production acceptance semantics,
 * plus explicit evidence requirements for color/finish/dimensions/budget
 * that a useful found result must satisfy for these focus requests.
 */
export function assessAcceptanceAlignedQualification(
  requestedItem: string,
  candidate: RescueCandidate
): GroundTruthAssessment {
  const name = nameFor(candidate);
  const priceInfo = groundedPriceFor(candidate);
  const priceEvidence = priceInfo.priceEvidence;
  const hay = haystackFor(candidate);
  const reasons: string[] = [];

  if (!name) {
    return {
      qualifies: false,
      candidateId: candidate.id,
      url: candidate.url,
      name: null,
      price: null,
      priceEvidence: "none",
      reasons: ["missing product name"],
      acceptanceReason: null,
      acceptanceAccepted: false,
    };
  }

  if (candidate.enrichment?.status !== "success") {
    reasons.push("merchant enrichment unsuccessful / weak");
  }

  const identity = parseProductIdentity(requestedItem);
  const categoryHay = categoryEvidenceHaystack({
    productName: "",
    evidenceText: trustedEvidenceHaystack(
      buildProductEvidence({
        productUrl: candidate.url,
        sources: [
          {
            url: candidate.url,
            title: candidate.sourceTitle,
            snippet: candidate.sourceEvidence,
          },
        ],
        enrichment: candidate.enrichment,
        trustedDisplayName: name,
      })
    ),
  });
  if (!verifyCoreCategoryInEvidence(identity, categoryHay)) {
    reasons.push(`core category unverified: ${identity.coreCategory}`);
  }

  // Focus-request mandatory evidence (useful-found semantics).
  if (/\bchrome\b/i.test(requestedItem) && !evidenceHasChrome(hay)) {
    if (evidenceHasWhite(hay)) reasons.push("wrong finish: white, not chrome");
    else if (evidenceHasBlack(hay)) reasons.push("wrong finish: black, not chrome");
    else reasons.push("chrome finish not evidenced");
  }
  if (/\bheated\s+towel\s+rail\b/i.test(requestedItem)) {
    if (evidenceHasTowelHolderOnly(hay)) reasons.push("wrong category: towel holder, not radiator");
    else if (!evidenceHasRadiator(hay)) reasons.push("heated towel radiator category not evidenced");
    if (!evidenceHasWidth60(hay)) reasons.push("width ~60cm not evidenced");
  }
  if (/\bvase\b/i.test(requestedItem)) {
    if (evidenceHasTile(hay) && !evidenceHasVase(hay)) reasons.push("wrong category: tile, not vase");
    if (!evidenceHasVase(hay)) reasons.push("vase category not evidenced");
    if (/\bceramic\b/i.test(requestedItem) && !evidenceHasCeramic(hay)) {
      reasons.push("ceramic material not evidenced");
    }
    if (/\bwhite\b/i.test(requestedItem) && !evidenceHasWhite(hay)) {
      reasons.push("white color not evidenced");
    }
    if (/\b30\s*cm\b/i.test(requestedItem) && !evidenceHasHeight30(hay)) {
      reasons.push("height ~30cm not evidenced");
    }
  }
  if (/\bpendant\s+lamp\b/i.test(requestedItem)) {
    if (!evidenceHasPendant(hay)) reasons.push("pendant lamp category not evidenced");
    if (/\bblack\b/i.test(requestedItem) && !evidenceHasBlack(hay)) {
      reasons.push("black color not evidenced");
    }
    if (/\b40\s*cm\b/i.test(requestedItem) && !evidenceHasApprox40(hay)) {
      reasons.push("approx 40cm size not evidenced");
    }
    // metal may remain unknown under production soft policy — do not hard-fail absence
  }
  if (/\bkitchen\s+sink\b/i.test(requestedItem)) {
    if (!/\b(sink|korito|pomival)\b/i.test(hay)) reasons.push("kitchen sink category not evidenced");
    if (/\bstainless|steel\b/i.test(requestedItem) && !evidenceHasStainless(hay)) {
      reasons.push("stainless steel / inox not evidenced");
    }
    if (usesExactLanguage(requestedItem) && /\b60\s*cm\b/i.test(requestedItem) && !evidenceHasExact60Width(hay)) {
      reasons.push("exact 60cm width not evidenced");
    }
  }

  const max = extractMaxPriceEur(requestedItem);
  if (max != null) {
    if (priceInfo.price == null || priceEvidence === "none") {
      reasons.push("price unknown");
    } else if (priceInfo.price > max) {
      reasons.push(`over budget: €${priceInfo.price} > max €${max}`);
    } else {
      reasons.push(`price €${priceInfo.price} confirmed within max €${max}`);
    }
  }

  const built = buildProductFromCandidate(requestedItem, candidate);
  if (!built.product) {
    return {
      qualifies: false,
      candidateId: candidate.id,
      url: candidate.url,
      name,
      price: priceInfo.price,
      priceEvidence,
      reasons: [...reasons, ...built.reasons],
      acceptanceReason: null,
      acceptanceAccepted: false,
    };
  }

  const finalized = finalizeAcceptedProduct({
    source: "rescue",
    requestedItem,
    product: built.product,
    evidenceText: built.evidenceText,
  });

  // Mandatory evidence failures (above) block qualification even if soft-unknown acceptance would pass.
  const mandatoryFailures = reasons.filter(
    (r) =>
      !r.startsWith("price €") &&
      !r.includes("confirmed from") &&
      !r.startsWith("soft/secondary")
  );

  // Keep positive confirmations separate from failures.
  const failureReasons = [
    ...mandatoryFailures.filter(
      (r) =>
        r.includes("not evidenced") ||
        r.includes("wrong ") ||
        r.includes("unverified") ||
        r.includes("unknown") ||
        r.includes("over budget") ||
        r.includes("missing")
    ),
  ];

  if (!finalized.accepted) {
    failureReasons.push(`acceptance rejected: ${finalized.reason}`);
  }

  const qualifies = finalized.accepted && failureReasons.length === 0;

  const auditReasons = qualifies
    ? [
        ...reasons.filter((r) => r.includes("confirmed") || r.startsWith("price €")),
        `acceptance accepted (${finalized.reason})`,
      ]
    : [...new Set([...failureReasons, ...reasons.filter((r) => !r.includes("confirmed"))])];

  return {
    qualifies,
    candidateId: candidate.id,
    url: candidate.url,
    name,
    price: priceInfo.price,
    priceEvidence,
    reasons: auditReasons,
    acceptanceReason: finalized.reason,
    acceptanceAccepted: finalized.accepted,
  };
}

export function isRadiatorPageCandidate(candidate: RescueCandidate): boolean {
  return evidenceHasRadiator(haystackFor(candidate));
}

export function isVasePageCandidate(candidate: RescueCandidate): boolean {
  return evidenceHasVase(haystackFor(candidate)) && !evidenceHasTile(haystackFor(candidate));
}
