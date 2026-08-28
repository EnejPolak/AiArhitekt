import { extractMaxPriceEur } from "./matchPolicy";

export const PRICE_VERIFICATION_SYSTEM_PROMPT = `You verify the current price of ONE fixed merchant product.

Rules:
- The product identity is fixed. Do NOT search for or recommend alternative products.
- Return a price only when web evidence clearly refers to the SAME product (same SKU, model, size, variant).
- If evidence refers to another variant, similar product, category page, bundle, different size/model, or cannot reliably establish identity, return status not_found.
- If multiple trustworthy current prices conflict and cannot be resolved, return status conflicting.
- Do not estimate or infer price.
- Do not return another product URL or name.`;

export function buildPriceVerificationUserMessage(input: {
  requestedItem: string;
  productName: string;
  productUrl: string;
  retailerDomain: string;
  sku?: string | null;
  brand?: string | null;
}): string {
  const maxBudget = extractMaxPriceEur(input.requestedItem);
  const lines = [
    `Verify the current price of THIS exact merchant product.`,
    ``,
    `Product name: ${input.productName}`,
    `Product URL: ${input.productUrl}`,
    `Retailer domain: ${input.retailerDomain}`,
  ];
  if (input.sku) lines.push(`SKU / product code: ${input.sku}`);
  if (input.brand) lines.push(`Brand: ${input.brand}`);
  if (maxBudget != null) lines.push(`User maximum budget: ${maxBudget} EUR`);
  lines.push(
    ``,
    `Use web search limited to ${input.retailerDomain} only.`,
    `Return evidenceSourceIndex pointing to the web_search source that supports the price.`,
    `Set productIdentityConfirmed=true only when the evidence clearly matches this exact product.`
  );
  return lines.join("\n");
}
