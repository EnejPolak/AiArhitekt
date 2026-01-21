import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { images } = body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { error: "Images are required" },
        { status: 400 }
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Prepare image inputs for Vision API
    // Ensure base64 data URLs are properly formatted
    const imageContents = images.map((base64Image: string) => {
      // If it's already a data URL, use it directly
      // If it's just base64, wrap it in data URL format
      let imageUrl = base64Image;
      
      if (!imageUrl.startsWith("data:")) {
        // Assume it's base64 and needs data URL wrapper
        // Try to detect format from first bytes or default to png
        imageUrl = `data:image/png;base64,${imageUrl}`;
      }
      
      // Validate format - OpenAI supports: png, jpeg, gif, webp
      const supportedFormats = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
      const mimeMatch = imageUrl.match(/data:([^;]+)/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
      
      if (!supportedFormats.includes(mimeType.toLowerCase())) {
        // Convert to PNG if unsupported format
        console.warn(`Unsupported image format: ${mimeType}, converting to PNG`);
        // Extract base64 data
        const base64Data = imageUrl.includes(",") ? imageUrl.split(",")[1] : imageUrl;
        imageUrl = `data:image/png;base64,${base64Data}`;
      }
      
      return {
        type: "image_url" as const,
        image_url: {
          url: imageUrl,
        },
      };
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an experienced interior architect. Describe only what you objectively see in the uploaded room photos. Do not guess. Do not ask questions. Do not suggest improvements. Do not describe style preferences. Use 2–3 concise, factual sentences. Be specific and observational.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe the current state of this room based on the photos.",
            },
            ...imageContents,
          ],
        },
      ],
      max_tokens: 200,
      temperature: 0.3,
    });

    const observation =
      completion.choices[0]?.message?.content ||
      "I can see the room in the photos. The current layout and finishes are visible.";

    return NextResponse.json({ observation });
  } catch (error: any) {
    console.error("Error analyzing room:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze room" },
      { status: 500 }
    );
  }
}
