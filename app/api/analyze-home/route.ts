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
    const imageContents = images.map((base64Image: string) => {
      let imageUrl = base64Image;
      
      if (!imageUrl.startsWith("data:")) {
        imageUrl = `data:image/png;base64,${imageUrl}`;
      }
      
      const supportedFormats = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
      const mimeMatch = imageUrl.match(/data:([^;]+)/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
      
      if (!supportedFormats.includes(mimeType.toLowerCase())) {
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
            "You are an experienced architect. Describe only what is objectively visible in the uploaded floor plans and photos. Do not guess. Do not suggest improvements. Do not mention style. Focus on layout, room relationships, and general condition. Use 2–3 concise sentences.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe the current layout and condition of this home.",
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
      "I can see the home layout and current condition. I'll use this information to create a cohesive renovation concept.";

    return NextResponse.json({ observation });
  } catch (error: any) {
    console.error("Error analyzing home:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze home" },
      { status: 500 }
    );
  }
}
