# Agent Instructions: Window & Door Composition Extraction from Architectural Plan PDFs

## Objective

Given a residential architectural plan set (PDF, typically A3, 10–20 pages, produced by a volume builder or drafting studio), produce a structured record for **every window and door in the schedule**:

```json
{
  "tag": "W9",
  "composition": [
    { "operation": "awning", "widthMm": 900 },
    { "operation": "fixed",  "widthMm": 910 }
  ],
  "divisionAxis": "side-by-side",     // "side-by-side" | "stacked" | "grid" | "none"
  "wallOrientation": "E",             // N NE E SE S SW W NW
  "roomLabel": "BED 3",
  "evidence": {
    "sheet": "A6",
    "pdfPage": 7,
    "region": { "x0": 950, "y0": 480, "x1": 1500, "y1": 800, "dpi": 300 }
  },
  "splitRatio": "50:50",              // left:right viewed from OUTSIDE (or bottom:top for stacked)
  "confidence": "high",
  "flags": []
}
```

The **composition** field is the point of the exercise: the schedule alone rarely tells you whether "AWNING 2100×1810" is one sash, awning+fixed, or 2×awning. That answer lives in the elevation drawings and must be read visually — but only after cheap text analysis has told you exactly where to look.

## Cost Model (govern every decision by this)

| Operation | Approx. cost | Use for |
|---|---|---|
| `pdfinfo`, `pdffonts`, `pdftotext` | ~free | Everything you possibly can |
| `pdfplumber` word extraction w/ coordinates | ~free | Locating tags, labels, markers spatially |
| Rasterize 1 page @ 150 dpi → vision | ~1,600 tokens | Overview passes, max 1 per relevant sheet |
| Cropped region @ 300 dpi → vision | ~200–600 tokens | Per-window composition reads |

**Hard rules:**
1. Never rasterize a page before text analysis has proven it relevant.
2. Never send a full page at 300 dpi. Render at 300 dpi to disk if needed, but **crop before viewing**.
3. Never view the same region twice at the same resolution — if a crop was ambiguous, change something (resolution, threshold, crop bounds).
4. Budget target for a 14-page set with ~16 windows + 4 doors: **3–5 full-page views + 1 crop per opening**, i.e. roughly 15–25k vision tokens total.

---

## Phase 0 — Triage & Sheet Index (text only)

1. `pdfinfo` → page count, page dimensions.
2. `pdffonts` → confirm a text layer exists. **If no fonts:** the set is scanned; fall back to the OCR variant (Appendix B) and expect lower confidence throughout.
3. For each page, run `pdftotext -layout -f N -l N` and grep for classifier keywords:
   - `WINDOW SCHEDULE`, `DOOR SCHEDULE` → schedule sheet(s)
   - `GROUND FLOOR PLAN`, `FIRST FLOOR PLAN`, `FLOOR PLAN` → plan sheets
   - `ELEVATION` (often `ELEVATION A/B/C/D` or `NORTH ELEVATION` etc.) → elevation sheets
   - `SITE PLAN` → site plan (source of true north)
   - Sheet number from title block (`A3`, `A5`, `S08`…) — usually the last short token on the page. Capture it: tags reference it (e.g. `W9/S08` means "see sheet S08").
4. Build a **sheet index**: `{pdfPage → sheetId, sheetType, elevationLabels[]}`. All later phases consume this. Note that schedules frequently share a page with elevations — a page can have multiple types.

## Phase 1 — Schedule Extraction (text only)

Extract the window and door schedules into structured rows. Two strategies, in order:

1. **`pdftotext -layout`** on the schedule page, then parse the columnar block following the header row (`W N°  HEIGHT  WIDTH  HEAD HT.  GLAZING  ... WINDOW TYPE  COMMENTS`). Column headers vary by architect (`REF`, `MARK`, `SILL`, `TYPE`); match fuzzily and map to a canonical set: `{tag, heightMm, widthMm, headHeightMm, glazing, doubleGlazed, type, comments}`.
2. If layout text is mangled (columns collided), fall back to `pdfplumber.extract_tables()` on that page only.

Rules:
- Normalise tags: `1` in a window schedule → `W1`; accept `W01`, `W1`, `WD1` variants. Do the same for doors (`D1`).
- **Record numbering gaps** (e.g. schedule jumps W12 → W14). Do not invent the missing tag; note it in run metadata.
- **Comments are composition gold.** `"2x 600mm WIDE AWNINGS"`, `"920 DOOR & 1N° SIDELIGHT"`, `"RIGHT TO LEFT"` directly seed or constrain the composition. Parse them but still verify visually.
- The schedule `type` is a *claim to verify*, not the answer. `OFFSET AWNING` almost always means an unequal awning+fixed pair; plain `AWNING` may be single or an equal pair; `FIXED` is usually single but can be fixed+fixed with a mullion.

## Phase 2 — Tag Location & Room/Orientation (text coordinates, no rendering)

Use `pdfplumber` word extraction **with coordinates** on each floor-plan page. This is the single biggest cost saver: window tags (`W1`, `W9`), room labels (`STUDY`, `BED 3`), and elevation markers (`A`, `B`, `C`, `D` inside view-marker circles) are all text objects with x/y positions. You do not need vision to find them.

For each schedule tag:

1. **Find the tag** on a plan page (the tag text `Wn` typically sits adjacent to `Sxx`, its sheet reference — use that adjacency to disambiguate from dimension text). Record `{pdfPage, x, y}` in PDF points.
2. **Assign the floor**: from the plan page it was found on (ground vs first). If a tag appears on both floors, treat as an error and flag.
3. **Assign the wall**: tags are drawn just outside the exterior wall they belong to. Compute the building footprint bounding box from the drawing extents (cluster of plan geometry / dimension strings) and snap the tag to the nearest edge: top→N-ish, bottom→S-ish, left→W-ish, right→E-ish *in plan-sheet coordinates*.
4. **Resolve true orientation**: find the north point. Sources in order of preference: (a) north arrow / compass on the site plan or title block, (b) `N` label near an arrow symbol on plan sheets, (c) lot boundary bearings on the site plan. If the north arrow is graphical-only, spend **one** low-res (100 dpi) crop of the title-block/compass region to read it. Convert plan-edge → compass direction (8-point). If north cannot be established, output plan-relative letters and set flag `northAssumed`.
   - Angled walls: if the tag's wall segment is not axis-aligned (detect via the wall's dimension chain direction or footprint polygon), use intercardinal letters (NE, SW, …).
5. **Room label**: nearest room-name word group *inside* the footprint (uppercase words that are not schedule/dimension/note text — maintain a stoplist: `DP`, `SS`, `WIP`, `RL`, dimension numbers). Nearest-by-distance from the tag, on the interior side of the wall.

## Phase 3 — Elevation Mapping (mostly text; geometry reasoning)

Goal: for each tag, predict **which elevation drawing shows it and roughly where**, before any pixels are read.

1. **Marker → face mapping**: elevation view markers (circled `A`/`B`/`C`/`D` with a direction pointer) sit around the plan. A marker on the **left** of the plan viewing right shows the **west** face, bottom shows south, etc. If the set uses `NORTH ELEVATION` naming instead, the mapping is direct. Build `{elevationLabel → compassFace}`.
2. **Mirroring rule (critical, easy to get wrong):** elevations are viewed from *outside*. For a viewer facing the wall:
   - East face: plan-north appears on the viewer's **right** → a window at the north end of the east wall is on the **right** of Elevation-East.
   - West face: plan-north on the viewer's **left**.
   - South face: plan-east on the viewer's **left**. North face: plan-east on the viewer's **right**.
   Encode this as a function; never eyeball it per window.
3. **Horizontal position prediction**: project the tag's along-wall coordinate from the plan into the elevation's horizontal axis using the rule above. This yields an ordering ("W9 is the rightmost of three first-floor windows on Elevation C") — usually sufficient without pixel-perfect registration.
4. **Vertical/floor assignment**: first-floor windows sit above the `FIRST FLOOR RL` / `GROUND CEILING RL` datum lines (these are text objects too — capture their y-positions on the elevation sheet). Head-height differences from the schedule (e.g. 2100 vs 2250) are a strong per-window fingerprint.
5. **Proportion fingerprint**: each candidate window's schedule aspect ratio (width:height) and relative width vs neighbours must match what's drawn. Use this as the cross-check when two windows on the same face could be confused. *(Real example: W9 1810 wide head 2100 vs W10 1450 wide head 2250 — the drawn widths ratio 0.80 and the head offset resolve identity decisively.)*

## Phase 4 — Composition Reads (targeted vision)

This is the only phase that should consume meaningful vision tokens.

### 4.1 Overview pass (once per elevation sheet)
Render each **elevation sheet** at 150 dpi (`pdftoppm -jpeg -r 150 -f N -l N`) and view it once. Purpose: confirm the marker→face mapping, count windows per face per floor, and record approximate pixel bounding boxes for each opening. Do not attempt symbol reading here.

### 4.2 Per-opening crop
For each tag:
1. Render the elevation page at **300 dpi to disk once** (reuse the file for all windows on that sheet).
2. Crop the predicted window region generously (~1.5× the window extents), upscale small crops to ≥800 px on the short edge, and view.
3. **Read the symbology:**
   - **Vertical mullion lines** inside the frame → side-by-side units. **Horizontal transom lines** → stacked units. Both → grid.
   - **Dashed/solid chevron (V or Λ) spanning a pane** → operable sash. Apex convention varies by drafter; do not rely on apex direction alone to distinguish awning/hopper/casement — **combine with the schedule type** (schedule says AWNING → chevroned panes are awning sashes). A chevron pointing to a side jamb with the schedule saying CASEMENT → casement hinged on the apex side.
   - **Plain pane, no marks** → fixed.
   - **Horizontal arrows / half-pane offset in doors** → sliding; count panels; `RIGHT TO LEFT` comments give stack direction. Entry doors: leaf + sidelight panels read as `door` + `fixed sidelight` units.
   - **Louvres** → dense horizontal blade lines across a pane.
4. **Faint-line fallback:** if a pane looks empty but the schedule says operable, threshold the crop (`pixel < 250 → 0`) before concluding "no symbol". Symbols are often drawn in light blue/grey that greys out at low contrast.
5. **Measure the split:** record the pixel x (or y) of each mullion/transom within the frame. Convert: `unitWidthMm = (unitPx / totalPx) × scheduleWidthMm`. Round to 5 mm. `splitRatio` = percentages left→right **as viewed from outside** (state bottom→top for stacked). For a single unit, `splitRatio: "100"` and `divisionAxis: "none"`.
6. **Record evidence** exactly as consumed: sheet id, pdf page, crop bbox in rendered-pixel coords, dpi. This must be sufficient for a human to re-crop and verify.

### 4.3 Reconciliation & confidence
For every opening, reconcile three sources: schedule type/comments, plan tag context, drawn composition.

- All agree → `confidence: high`.
- Drawing shows fewer units than physics allows (e.g. a 2100×2100 "AWNING" drawn as one undivided pane — a single awning sash cannot be ~2.1 m wide; practical sash limit ≈ 1200 mm) → output what is **drawn** (`composition: [awning 2100]`), set `confidence: low`, add flag `manufacturability: sash exceeds typical awning limits; fabricator will split; drawings silent on configuration`. Do not invent a split the documents don't show.
- Schedule comment contradicts the drawing (comment says 2× awnings, drawing shows one chevron) → prefer the comment for operation count, the drawing for geometry, flag `scheduleDrawingMismatch`.
- Window not found on any elevation (internal courtyard, highlight window hidden behind roof) → composition from schedule + comments only, `confidence: low`, flag `notVisibleOnElevations`.

## Phase 5 — Output Assembly

Emit one JSON array covering every schedule row (windows then doors), plus run metadata:

```json
{
  "meta": {
    "sourceFile": "...", "pages": 14, "sheetIndex": {...},
    "northSource": "site plan compass", "missingTags": ["W13"],
    "visionBudget": { "fullPageViews": 4, "cropViews": 20 }
  },
  "openings": [ ...records as specified above... ]
}
```

Doors use the same record shape; `operation` values include `hinged`, `sliding`, `stacker-sliding`, `fixed sidelight`, `sectional (garage)`.

---

## Appendix A — Known Architect Variance (handle, don't assume)

- Tag styles: `W1/S08` two-line circles, plain `W01`, `WD-01`, hexagon door tags.
- Elevation naming: `A–D` with view markers vs `NORTH/SOUTH/EAST/WEST` vs `FRONT/REAR/LHS/RHS` (map FRONT via the street boundary on the site plan).
- Schedules on a dedicated sheet vs sharing an elevation sheet vs split across two pages.
- Units: mm everywhere in AU; if a schedule shows `21.00` style values, they're likely cm×10 or misparsed — sanity-check heights fall in 300–3000 mm.
- Some drafters chevron **every** operable sash; some chevron none on small windows. Absence of a chevron where the schedule says operable is a contrast/omission problem before it is a "fixed" conclusion.
- Corner (wrap) windows appear on two elevations — merge into one record, note both faces in a flag.

## Appendix B — Scanned/Vector-Only Sets (no text layer)

If `pdffonts` is empty: rasterize all pages once at 100 dpi for classification (cheapest legible pass), OCR the schedule page region at 300 dpi (`pytesseract` on a crop), and replace Phase-2 text-coordinate searches with OCR word boxes. Everything else proceeds identically, with `confidence` capped at `medium`.
