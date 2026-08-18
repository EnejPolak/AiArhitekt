import {
  PROJECT_ASSETS_BUCKET,
  REFERENCE_EXT_TO_MIME,
  REFERENCE_MIME_TO_EXT,
  type ProductReferenceExt,
  type ProductReferenceMimeType,
} from "./constants";

const PATH_PATTERN =
  /^projects\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/product-references\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp)$/;

export type ParsedProductReferencePath = {
  projectId: string;
  selectionId: string;
  ext: ProductReferenceExt;
  bucket: typeof PROJECT_ASSETS_BUCKET;
  storagePath: string;
};

export function extensionForReferenceMime(mime: ProductReferenceMimeType): ProductReferenceExt {
  return REFERENCE_MIME_TO_EXT[mime];
}

export function mimeForReferenceExtension(ext: string): ProductReferenceMimeType | null {
  if (ext === "jpg" || ext === "png" || ext === "webp") return REFERENCE_EXT_TO_MIME[ext];
  return null;
}

export function buildProductReferencePath(
  projectId: string,
  selectionId: string,
  mime: ProductReferenceMimeType
): string {
  return `projects/${projectId}/product-references/${selectionId}.${extensionForReferenceMime(mime)}`;
}

export function parseProductReferencePath(path: string): ParsedProductReferencePath | null {
  if (!path || path.includes("..") || path.includes("\\") || path.startsWith("/")) {
    return null;
  }
  const match = PATH_PATTERN.exec(path);
  if (!match) return null;
  const projectId = match[1];
  const selectionId = match[2];
  const ext = match[3] as ProductReferenceExt;
  return {
    projectId,
    selectionId,
    ext,
    bucket: PROJECT_ASSETS_BUCKET,
    storagePath: path,
  };
}

export function candidateProductReferencePaths(projectId: string, selectionId: string): string[] {
  return (["jpg", "png", "webp"] as const).map(
    (ext) => `projects/${projectId}/product-references/${selectionId}.${ext}`
  );
}

export function productReferenceFolderPrefix(projectId: string): string {
  return `projects/${projectId}/product-references`;
}

export function projectRenderFolderPrefix(projectId: string): string {
  return `projects/${projectId}/renders`;
}
