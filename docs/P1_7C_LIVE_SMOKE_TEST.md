# P1.7c — Manual live MVP smoke test

This is a **one-time paid** end-to-end check of the real room-renovation path. Automated tests still make **zero** OpenAI Images / Google / SERP calls.

Do **not** commit room photos, product images, or credentials. Do **not** start P1.8 until this review is done.

Canonical renderer: **OpenAI `gpt-image-1.5`** via `openai.images.edit`.

## Why 2–3 products first

The first live render should confirm **2–3** products (for example sofa, coffee table, lamp). That is a **manual strategy**, not a code limit (max remains 10).

Fewer references make it easier to judge:

- room preservation
- product recognizability
- reference adherence
- unwanted object generation

## Required env names (values stay in `.env.local`, never in git/chat)

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
OPENAI_API_KEY
SUPABASE_SECRET_KEY
OPENAI_IMAGE_RENDER_ENABLED=true
```

Optional:

```text
OPENAI_IMAGE_QUALITY=medium
OPENAI_IMAGE_SIZE=auto
```

`OPENAI_IMAGE_RENDER_ENABLED=true` only **allows** Generate design. It does **not** start generation on page load.

Leave it `false` / unset until you are ready to click **Generate design once**.

Never `NEXT_PUBLIC_*` for OpenAI, the secret key, or the kill switch.

## Where to look if something fails

| Symptom | Where |
| --- | --- |
| Sign-in fails | Supabase Auth, `NEXT_PUBLIC_SUPABASE_*` |
| Upload fails | `project-uploads` private bucket, RLS |
| Analyze fails | `OPENAI_API_KEY`, 60s analysis cooldown, server logs |
| Find products fails | Geocode/Places/SERP keys, 60s discovery cooldown |
| Confirm but “Not render-ready” | Retailer image fetch / SSRF / magic bytes; unconfirm or pick another product |
| `render_disabled` | `OPENAI_IMAGE_RENDER_ENABLED` is not true |
| Rate limited on generate | 120s `claim_room_render_slot` |
| Generate succeeds but commerce looks invented | Bug: cards must come from `project_product_selections` |
| Refresh triggers another image call | Bug: same fingerprint must reuse |
| Confirm/unconfirm auto-renders | Bug: only Generate/Regenerate may call Images |

Server log line after an explicit generate (no keys):

```text
[room-render] { event: 'generated', openai_image_edit: 1, geocode: 0, places: 0, serp: 0, room_analysis: 0 }
```

Refresh/reuse:

```text
[room-render] { event: 'reused', openai_image_edit: 0, ... }
```

## Checklist

```text
[ ] Sign in (or sign up) with a disposable test account — credentials stay outside git
[ ] Create New Room Project
[ ] Upload a real room photo (do not commit it)
[ ] Analyze Room (explicit). Wait for persisted analysis.
[ ] Complete style / color / flooring / budget / location in the wizard
[ ] Find products (explicit). Real nearby retailers only.
[ ] Confirm 2–3 products that show usable images
[ ] On the visualization step, each confirmed product says Reference ready
     (if Not render-ready: unconfirm or choose another product — do not generate)
[ ] Set OPENAI_IMAGE_RENDER_ENABLED=true in server env and restart the app
[ ] Click Generate design ONCE
[ ] Wait for completion (do not spam click)
[ ] Confirm server log: openai_image_edit = 1, geocode/places/serp/analysis = 0
[ ] Compare original room vs result (scorecard below)
[ ] Evaluate each confirmed product (shape/color/material/features/placement)
[ ] Verify commerce cards still match persisted title, URL, image, price/null, retailer
[ ] Refresh the browser
[ ] Same render reloads; log event = reused; openai_image_edit = 0
[ ] Confirm/unconfirm one product
[ ] No automatic regeneration; UI says the previous visualization is stale
[ ] Optional later: wait 120s, Regenerate once; previous success still listed if the new attempt fails
```

## Persistence checks after success

- `project_room_renders.status = succeeded`
- `output_storage_path` under private `project-assets` (`projects/{projectId}/renders/{renderId}.*`)
- `output_hash` (SHA-256) present
- `reference_snapshot` has `selection_id`, `reference_asset_id`, `reference_hash` per input
- no signed URLs or secret keys in snapshots
- `source_fingerprint` matches current room + analysis + discovery + confirmed set + hashes + preferences + provider/model + schema version

## Scorecard (fill during the live review)

Use PASS / PARTIAL / FAIL for preservation and product rows. Use yes / no for unwanted generation.

| Item | Result | Notes |
| --- | --- | --- |
| Camera viewpoint |  |  |
| Wall positions |  |  |
| Windows |  |  |
| Doors |  |  |
| Ceiling / architecture / room identity |  |  |
| Product 1 general shape |  |  |
| Product 1 color |  |  |
| Product 1 material/texture |  |  |
| Product 1 major design features |  |  |
| Product 1 recognizability |  |  |
| Product 1 placement plausibility |  |  |
| Product 2 (same six criteria) |  |  |
| Product 3 (same six criteria) |  |  |
| Adds major unselected furniture | yes / no |  |
| Changes architecture unnecessarily | yes / no |  |
| Removes required preserved elements | yes / no |  |
| Changes selected product color substantially | yes / no |  |
| Merges two product references | yes / no |  |
| Duplicates furniture | yes / no |  |
| Impossible geometry | yes / no |  |
| Overall realism |  |  |

Do not require pixel-exact SKU reproduction. Commerce truth is the persisted selection rows, not the image.
