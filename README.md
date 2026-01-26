# AI Architect

## Render API (OpenAI-only)

This project uses **OpenAI Images API** (`gpt-image-1`) via the server route `POST /api/render`.

**Note:** `gpt-image-1` may require **Organization Verification** in your OpenAI account. If you see a `403` error about verification, verify your org in the OpenAI dashboard and wait up to ~15 minutes for access to propagate.

### Setup

1) Copy `env.example` → `.env.local` (or set the variable in your environment)
2) Set:

`OPENAI_API_KEY=...`

### API (backwards compatible)

**Request** (same as current UI; extra fields optional):

```json
{
  "image": "data:image/jpeg;base64,...", 
  "prompt": "string (required)",
  "negativePrompt": "string (optional)",
  "mask": "data:image/png;base64,... (optional)",
  "size": "1024x1536 (optional)",
  "n": 1
}
```

**Response**

```json
{
  "imageUrl": "data:image/png;base64,...",
  "metadata": { "provider": "openai", "size": "1024x1536", "n": 1, "mode": "edits" }
}
```

