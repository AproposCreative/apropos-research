---
name: webflow-cms-localization
description: >-
  Webflow CMS localization for Apropos (DK primary + EN secondary): create items
  with both cmsLocaleIds via bulk, translate and publish EN, and never assume an
  existing item has EN. Use when creating/updating Webflow articles, fixing
  auto-translation, working with locales, or using Webflow MCP/Data API.
---

# Webflow CMS localization (Apropos)

Aligned with Webflow’s agentic/Data API guidance (MCP create_collection_items + CMS localization docs).

## Locales (canonical)

| Role | Display | cmsLocaleId |
|------|---------|-------------|
| Primary | DK (`da`) | `67dbf17ba540975b5b21c225` |
| Secondary | EN (`en`, `/en`) | `690ca0f6b0d13d8788354156` |

Site ID: `67dbf17ba540975b5b21c180`. Articles collection: `WEBFLOW_ARTICLES_COLLECTION_ID`.

## Create new articles (required pattern)

**Always** create with **both** locales in one call:

```http
POST /v2/collections/{articlesCollectionId}/items/bulk
```

```json
{
  "cmsLocaleIds": [
    "67dbf17ba540975b5b21c225",
    "690ca0f6b0d13d8788354156"
  ],
  "isDraft": true,
  "fieldData": { "name": "...", "slug": "...", "...": "..." }
}
```

- Response: same `id` for every locale variant.
- **Do not** use `POST /v2/sites/{siteId}/collections/.../items` for localized creates — it typically creates **only primary (DK)** and breaks auto-translation.
- In-repo: `lib/webflow-service.ts` → `publishArticleToWebflow` (create path uses `/items/bulk`).

## Update / translate EN

1. Confirm EN exists: `GET .../items/{id}?cmsLocaleId={EN}` — if 404, **stop**. API cannot add a secondary locale to an existing item (Designer only).
2. Translate editorial fields (OpenAI + `prompts/apropos_english_translator.prompt`).
3. Patch EN: `PATCH /v2/collections/{id}/items` with `{ items: [{ id, cmsLocaleId: EN, fieldData }] }`.
4. Publish EN only if DK is still live: `POST .../items/publish` with `{ items: [{ id, cmsLocaleIds: [EN] }] }`.

In-repo: `lib/webflow/article-translation.ts`, UI batch in `lib/webflow/article-translation-batch.ts`.

## Auto-translate triggers

- Webhook `collection_item_published` (DK only) → optimize images → `enqueueArticleTranslation`.
- Settings UI Scan/Kør — items without EN show as **Mangler EN** and are skipped.

## Existing items without EN

Webflow does **not** support adding secondary locales via API. For Odyssey / Lucky / etc.:

1. Designer → CMS item → Localization → **Add English**
2. Publish DK if needed
3. Settings → Oversættelse → Scan → Kør

## Agent Instructions (Webflow MCP 2.0)

When MCP is authenticated to the **Apropos** workspace (not a test site), mirror this skill as site Agent Instructions:

- Rule: `rules/cms-create-both-locales.md` — always bulk-create with DK+EN `cmsLocaleIds`.
- Skill: `translate-article-en/SKILL.md` — use Apropos English translator voice (`prompts/apropos_english_translator.prompt`).

Do not invent Designer-only actions via Data API. Prefer Data API for CMS item create/update/publish; use Designer tools only when the user has Designer open and the task requires canvas work.
