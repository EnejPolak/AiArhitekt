import OpenAI from "openai";
import {
  ROOM_RENDER_INPUT_FIDELITY,
  ROOM_RENDER_MODEL,
  ROOM_RENDER_TIMEOUT_MS,
  MAX_PROVIDER_EDIT_IMAGES,
} from "./constants";
import { getOpenAiImageQuality, getOpenAiImageSize, isOpenAiImageRenderEnabled } from "./env";
import { RenderError, mapRenderProviderFailure, renderErrorMessage } from "./errors";
import { validateRenderOutputBytes } from "./validate";

export type RoomImageEditFile = {
  filename: string;
  mime: "image/jpeg" | "image/png" | "image/webp";
  bytes: Uint8Array;
};

export type RoomImageEditInput = {
  prompt: string;
  images: RoomImageEditFile[];
};

export type RoomImageEditResult = {
  bytes: Buffer;
  mime: "image/jpeg" | "image/png" | "image/webp";
};

export type RoomImageEditFn = (input: RoomImageEditInput) => Promise<RoomImageEditResult>;

function requireApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new RenderError("provider_unconfigured", renderErrorMessage("provider_unconfigured"));
  }
  return key;
}

function toUploadFile(image: RoomImageEditFile): File {
  const copy = new Uint8Array(image.bytes);
  return new File([copy], image.filename, { type: image.mime });
}

export async function editRoomImageWithOpenAI(
  input: RoomImageEditInput
): Promise<RoomImageEditResult> {
  if (!isOpenAiImageRenderEnabled()) {
    throw new RenderError("render_disabled", renderErrorMessage("render_disabled"));
  }
  if (input.images.length < 2) {
    throw new RenderError("invalid_input", renderErrorMessage("invalid_input"));
  }
  if (input.images.length > MAX_PROVIDER_EDIT_IMAGES) {
    throw new RenderError("too_many_references", renderErrorMessage("too_many_references"));
  }

  const openai = new OpenAI({
    apiKey: requireApiKey(),
    timeout: ROOM_RENDER_TIMEOUT_MS,
    maxRetries: 0,
  });

  const files = input.images.map(toUploadFile);

  let b64: string | undefined;
  try {
    const response = await openai.images.edit({
      model: ROOM_RENDER_MODEL,
      image: files,
      prompt: input.prompt,
      n: 1,
      size: getOpenAiImageSize(),
      quality: getOpenAiImageQuality(),
      input_fidelity: ROOM_RENDER_INPUT_FIDELITY,
    } as never);
    const first = (response as { data?: Array<{ b64_json?: string | null }> }).data?.[0];
    b64 = first?.b64_json ?? undefined;
  } catch (error) {
    throw mapRenderProviderFailure(error);
  }

  if (!b64) {
    throw new RenderError("invalid_output", renderErrorMessage("invalid_output"));
  }

  const bytes = Buffer.from(b64, "base64");
  const validated = validateRenderOutputBytes(bytes);
  return { bytes, mime: validated.mime };
}
