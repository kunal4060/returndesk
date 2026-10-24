import { NextResponse } from "next/server";
import { geminiSemanticCheck } from "@impactx/ml";

/**
 * POST /api/gemini-screen — Gemini semantic-consistency check.
 *
 * Runs server-side so the API key never reaches the browser. The key is
 * read from process.env by the ML module (or passed through here) and
 * is never included in the response or logged. With no key configured,
 * the ML module returns a clearly labelled MOCK result.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
  const claimedItem = typeof body.claimedItem === "string" ? body.claimedItem : "";
  const claimedDamage = typeof body.claimedDamage === "string" ? body.claimedDamage : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";

  if (!imageBase64 || !claimedItem) {
    return NextResponse.json(
      { error: "imageBase64 and claimedItem are required." },
      { status: 400 },
    );
  }

  const result = await geminiSemanticCheck(
    { imageBase64, mimeType, claimedItem, claimedDamage },
    { apiKey: process.env.GEMINI_API_KEY },
  );

  return NextResponse.json({
    mode: result.mode,
    verdict: result.verdict ?? null,
    signal: result.signal,
  });
}
