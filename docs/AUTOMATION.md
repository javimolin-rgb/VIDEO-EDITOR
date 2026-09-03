# Automation

Recipes chain the operations the app already has. They are stored globally
(not per project) so they are reusable, and run either by hand or when media
is imported (spec §87, §141).

```
Recipe { name, trigger, importKinds, steps[], enabled }
  step { kind, params }
        │  executeStep — one Phase 2–6 operation each
        ▼
run { steps[] with status + plain-language result }
```

## Steps (`automation/types.ts` → `STEP_DEFS`)

| kind | does | reuses |
| --- | --- | --- |
| `remove-silences` | ripple-delete quiet gaps in audio clips | `projectStore.removeSilences` |
| `detect-shots` | shot markers on video clips | `projectStore.detectShotsForClip` |
| `generate-captions` | transcribe first audio clip → captions | `projectStore.transcribeClip` (needs a speech model — else **skipped**) |
| `caption-style` | apply a caption preset | `projectStore.updateCaptionStyle` |
| `normalize-audio` | set track gains toward a target dBFS | `automation/normalize.ts` + `renderAudioMix` |
| `auto-color` | grade each clip toward neutral | `automation/autocolor.ts` + `sampleLook` |
| `auto-reframe` | subject-tracked crop of clip 1 → new clip | `genStore.autoReframeClip` |
| `add-broll` | match / generate a clip per caption line | `genStore.generateBroll` |
| `apply-brand` | caption style + colours from a brand template | `automationStore.applyBrandTemplate` |
| `export` | render preset — **skipped**, run from the Export dialog | — |

## Triggers

- `manual` — the **Run** button, or `⌘K → Run recipe: …`.
- `on-import` — `projectStore.importFiles` calls a hook (`setOnImportComplete`,
  registered by `automationStore` to avoid a circular import). The first
  enabled `on-import` recipe whose `importKinds` match the imported kinds runs.

## Social repurposing (spec §82, §182)

`automationStore.repurpose(platformIds)` auto-reframes the first video clip to
each selected platform's aspect (9:16 / 1:1 / 4:5 / 16:9) and builds a
**content pack** — `buildContentPack(lines)` derives a title (first strong
sentence, title-cased), description (first 2–3 sentences), tags
(`extractVisualConcepts`), CTA (last imperative line, else "Watch to the end.")
and a **heuristic** hook note (spec §84 — no fabricated analytics).

## Brand templates (spec §86)

`BrandTemplate { captionStyle, colors, fonts, primaryAspect }` in Dexie
`brandTemplates`. "Save current as template" snapshots the open project's
caption style + brand-kit colours; **Apply** writes them back into any project;
`apply-brand` is also a recipe step.

## Not yet

Automation marketplace / sharing (§142 — templates are already portable data,
sharing UI is later), thumbnail generation (§85), auto-highlights / chapters
(§179, §180 — need real content analysis), animated lower-thirds / intro cards
(need a text-clip renderer).
