# Press page production dependency

Read-only investigation, 20 October 2026. This records the existing publication dependency encountered while preparing the press page and press kit. No Webflow node, CMS item, publication setting or production domain was changed by this investigation.

## Decision

There is not yet a verified, narrowly scoped repair that allows a full production publication while preserving the existing article dates and Featured ordering. The Featured sort dependency is now directly verified through MCP. The topic date's legacy text binding remains inaccessible through the exposed settings interface.

The owner's existing deployment authorization remains valid. This is a technical and content-integrity dependency, not a missing approval. Creating and testing the press page and its assets can proceed independently.

## Existing evidence

- Site: `67dbf17ba540975b5b21c180`.
- Production: `https://www.aproposmagazine.com`.
- Staging: `https://apropos-magazine.webflow.io`.
- Earlier release analysis: `WEBFLOW-PROFILE-RELEASE-2026-10-20.md`.
- Paired public comparison: `measurements/2026-10-20-profile-release-comparison.json`.
- Earlier date-binding capability inspection: `measurements/2026-10-20-profile-release-dependency.json`.

The earlier comparison covered 521 unique paths and found no unexpected article text, metadata or custom-script changes. It did find six topic hero cards with changed visible dates and a different order of the same 25 Featured cards after a full staging publication.

That comparison is a dated snapshot, not permission to ignore any subsequent concurrent changes. This investigation did not repeat the full crawl.

## Direct MCP findings

The following settings were read through `data_element_settings_tool > get_settings`, with `type: "all_raw_settings"`.

| Page | Element | Verified query settings |
| --- | --- | --- |
| Featured `67dbf17ba540975b5b21c218` | DynamoWrapper `99538792-0e39-544f-40b4-d2f89d97d094` | Articles source; dynamic; `sort: [{"fieldSlug":"published-on","direction":"descending"}]`; limit 100; offset 0; pagination 25 |
| Topics template `67dbf17ba540975b5b21c213` | Hero DynamoWrapper `21da636a-b814-9994-4fb8-84b2a66475bd` | Articles source; dynamic; same `published-on` descending sort; limit 1; offset 0 |
| Topics template `67dbf17ba540975b5b21c213` | Secondary hero DynamoWrapper `21da636a-b814-9994-4fb8-84b2a6647627` | Articles source; dynamic; same `published-on` descending sort; limit 1; offset 1 |

The Articles collection is `67dbf17ba540975b5b21c2a6`.

These reads prove that the three lists depend on mutable publication metadata for ordering. They do not prove the inaccessible date-text binding, which must remain a separate unresolved point.

### Topic date binding limitation

Date element:

```json
{
  "component": "67dbf17ba540975b5b21c213",
  "element": "21da636a-b814-9994-4fb8-84b2a66475c7"
}
```

`data_element_tool > query_elements` returns a `Block` with styles `text_label` and `Invert effect`, no text children and no exposed CMS binding.

Both `all_raw_settings` and `all_resolved_settings` return only:

```json
{
  "domId": "",
  "tag": "div",
  "visibility": true,
  "attributes": []
}
```

The earlier `get_bindable_sources` read did not expose created/published system fields. `webflow_get_more_tools` was consulted for a supported legacy date-binding inspection capability and returned that the complete tool list was already available. No additional capability was provided.

## Fresh public readback

Read-only HTTP GETs on 20 October 2026 reproduced the visible discrepancy on `/topics/anmeldelser`.

Production fragment:

```html
<div class="short-info__wrap hero__post__info">
  <div class="text_label invert-effect">Koncerter</div>
  <div class="border_vertical post__info__border_invert"></div>
  <div class="text_label invert-effect">Oct 19, 2026</div>
</div>
```

Staging fragment:

```html
<div class="short-info__wrap hero__post__info">
  <div class="text_label invert-effect">Koncerter</div>
  <div class="border_vertical post__info__border_invert"></div>
  <div class="text_label invert-effect">Oct 20, 2026</div>
</div>
```

This is server-rendered visible content, not a difference limited to Webflow runtime hashes or responsive image attributes.

## Date-source findings

A fresh `get_collection_details` read confirmed that the Articles collection has only two custom DateTime fields:

- `start-dato`, field ID `1506e3149bb1e7f2d5603a33cca35215`.
- `slut-dato`, field ID `53c8e6b39cbf1bc9ef23498744686365`.

These are event dates. There is no custom `publish-date` field in the live collection schema.

The application already contains optional support for `publish-date` in `lib/liv/publish-verified.ts`. It checks the collection schema and only writes the field if it exists as a DateTime field. That code is not evidence that historical original-publication dates exist in Webflow.

`lib/seo-engine/auto-seo-worker.ts` supplies `item.lastPublished` as `publishDate`. Therefore, an existing JSON-LD date produced through that path cannot automatically be treated as an independent record of first publication.

Webflow documents `lastPublished` and `createdOn` as system dates based on their respective actions and recommends a custom field when historical dates must be preserved:

- [CMS Collections, default fields](https://webflow.com/webflow-way/cms/cms-collections)
- [Collection List settings](https://developers.webflow.com/designer/reference/element-settings/collection-list-settings)

`createdOn` is not equivalent to original publication. A draft may have been created earlier, and imports may carry another creation timestamp. No substitution with creation dates or event dates is justified by the evidence collected here.

## Publication capability

The earlier single-page production publishing attempt returned HTTP 400, `Invalid parameter: pageId`. It was not repeated in this investigation.

The working publish action is full-site publication. Consequently, publishing only the new press page cannot presently be relied upon as a way to avoid the topic and Featured side effects.

The sorting mechanism is editable through the supported headless MCP interface:

```text
data_element_settings_tool
  > set_settings
  > operations[]
  > settings[]
  > key: "sort"
  > static_json.value: JSON-encoded sort array
```

This identifies a supported patch surface, not a safe replacement sort value. No sort mutation was performed.

## Safe resume plan

1. Preserve the current production evidence, CMS IDs and saved press-page work. Coordinate shared Webflow changes with the Liv task.
2. Establish an authoritative original-publication date source per item and locale. Prefer first successful publication receipts and preserved history. Existing visible dates can document what was displayed, but are not automatically proof of first publication.
3. Define a durable publication-date field and a controlled migration only for records with sufficient evidence. Keep unknown dates explicitly unresolved. Coordinate first-publication handling in all publishing paths, including the existing optional Liv support.
4. Obtain supported access to inspect and replace the topic date's legacy binding. Do not remove or hide the date merely to bypass the missing binding capability.
5. Bind visible dates and relevant list ordering to the approved durable field. Preserve existing styles, filters, pagination and design. Avoid freezing the current Featured list manually, which would change its ongoing behavior.
6. Publish to staging and verify the affected Danish and English topics, Featured ordering and the press page. Publish to staging again and prove the date values and ordering stay stable.
7. Recheck concurrent changes since the saved 521-path comparison. Then use the supported full-site publication to the existing custom domains and read back the affected production paths.

This is a coordinated date-data repair, not an isolated press-page setting. Until those conditions are met, describe the press page and press kit as staged and verified where applicable, not as released to the production domain.
