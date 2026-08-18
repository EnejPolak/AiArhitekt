export function isOpenAiImageRenderEnabled(): boolean {
  const flag = (process.env.OPENAI_IMAGE_RENDER_ENABLED ?? "").trim().toLowerCase();
  return flag === "true" || flag === "1" || flag === "yes";
}

export function getOpenAiImageQuality(): "low" | "medium" | "high" | "auto" {
  const raw = (process.env.OPENAI_IMAGE_QUALITY ?? "medium").trim().toLowerCase();
  if (raw === "low" || raw === "medium" || raw === "high" || raw === "auto") return raw;
  return "medium";
}

export function getOpenAiImageSize(): "1024x1024" | "1024x1536" | "1536x1024" | "auto" {
  const raw = (process.env.OPENAI_IMAGE_SIZE ?? "auto").trim().toLowerCase();
  if (raw === "1024x1024" || raw === "1024x1536" || raw === "1536x1024" || raw === "auto") {
    return raw;
  }
  return "auto";
}
