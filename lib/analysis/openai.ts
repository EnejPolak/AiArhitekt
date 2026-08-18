import OpenAI from "openai";
import {
  ROOM_ANALYSIS_MODEL,
  ROOM_ANALYSIS_PROVIDER,
  ROOM_ANALYSIS_TIMEOUT_MS,
} from "./constants";
import { AnalysisError, analysisErrorMessage, mapProviderFailure } from "./errors";
import { ROOM_ANALYSIS_SYSTEM_PROMPT, ROOM_ANALYSIS_USER_PROMPT } from "./prompt";
import { parseRoomAnalysisResult, type RoomAnalysisProviderResult } from "./schema";
import { ZodError } from "zod";

export type RoomPhotoImageInput = {
  bytes: Buffer;
  mime: "image/jpeg" | "image/png" | "image/webp";
};

export type RoomAnalysisProviderMeta = {
  provider: typeof ROOM_ANALYSIS_PROVIDER;
  model: typeof ROOM_ANALYSIS_MODEL;
};

function toDataUrl(image: RoomPhotoImageInput): string {
  return `data:${image.mime};base64,${image.bytes.toString("base64")}`;
}

function requireApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new AnalysisError(
      "provider_unconfigured",
      analysisErrorMessage("provider_unconfigured")
    );
  }
  return key;
}

export async function analyzeRoomImage(
  image: RoomPhotoImageInput
): Promise<{ result: RoomAnalysisProviderResult; meta: RoomAnalysisProviderMeta }> {
  const apiKey = requireApiKey();
  const openai = new OpenAI({
    apiKey,
    timeout: ROOM_ANALYSIS_TIMEOUT_MS,
    maxRetries: 0,
  });

  let raw: string;
  try {
    const completion = await openai.chat.completions.create({
      model: ROOM_ANALYSIS_MODEL,
      temperature: 0.2,
      max_tokens: 2500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ROOM_ANALYSIS_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: ROOM_ANALYSIS_USER_PROMPT },
            {
              type: "image_url",
              image_url: { url: toDataUrl(image) },
            },
          ],
        },
      ],
    });
    raw = completion.choices[0]?.message?.content ?? "";
  } catch (error) {
    throw mapProviderFailure(error);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new AnalysisError("invalid_result", analysisErrorMessage("invalid_result"));
  }

  try {
    return {
      result: parseRoomAnalysisResult(parsedJson),
      meta: {
        provider: ROOM_ANALYSIS_PROVIDER,
        model: ROOM_ANALYSIS_MODEL,
      },
    };
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AnalysisError("invalid_result", analysisErrorMessage("invalid_result"));
    }
    throw error;
  }
}
