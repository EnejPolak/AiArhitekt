import { NextResponse } from "next/server";

/** Production HTTP errors must not include provider/internal exception text. */
export function sanitizedInternalErrorResponse(logLabel: string, error: unknown): NextResponse {
  console.error(logLabel, error);
  return NextResponse.json(
    {
      error: "internal_error",
      message: "Request failed. Try again.",
      status: 500,
    },
    { status: 500 }
  );
}

export function sanitizedRateLimitedResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "rate_limited",
      message: "Request failed. Try again.",
      status: 429,
    },
    { status: 429 }
  );
}
