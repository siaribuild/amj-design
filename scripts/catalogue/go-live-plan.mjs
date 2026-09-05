// Pure sheet data + plan() logic for the 2026-09-06 catalogue go-live.
// No I/O here — network/token/CLI concerns live in apply-go-live-min.mjs.
const ref = (_ref) => ({ _type: "reference", _ref });

// ── Vocabulary ────────────────────────────────────────────────────────────────
const GLAZING_TYPE = "glazingType";
const DG12 = "5+12A+5mm clear double tempered glass";
const DG8 = "5+8A+5mm clear double tempered glass";
const DG9 = "5+9A+5mm clear double tempered glass";
const SG6 = "6mm single clear tempered glass";
const HW = {
  chinaTop: "option-hardware-china-top-hardware",
  doricWinder: "option-hardware-au-doric-brand-chain-winder",
  ciilockD: "option-hardware-au-ciilock-brand-d-shape-handle",
  ciilockAcrylic: "option-hardware-au-ciilock-hardware-and-acrylic-handle",
};
const OPTIONS_P3 = {
  sliding: "Add a sliding flyscreen, choose the installation detail that matches your wall, and pick any colour from the powder-coat range when you build the quote.",
  flyscreen: "Add a flyscreen, choose the installation detail that matches your wall, and pick any colour from the powder-coat range when you build the quote.",
  none: "Choose the installation detail that matches your wall and pick any colour from the powder-coat range when you build the quote.",
};

// ── New glazing options (createIfNotExists) ───────────────────────────────────
const NEW_GLAZINGS = [
  {
    _id: "glz-6clr", _type: "option", name: "6Clr", slug: { _type: "slug", current: "glz-6clr" },
    optionType: ref(GLAZING_TYPE), glassSpecification: "SG", glassType: "clear", technicalValue: "single_clear",
    longDisplayName: "6mm Clear",
  },
  {
    _id: "glz-5clr-9-5clr-we", _type: "option", name: "5Clr/9/5Clr - WE", slug: { _type: "slug", current: "glz-5clr-9-5clr-we" },
    optionType: ref(GLAZING_TYPE), glassSpecification: "DG", glassType: "clear", technicalValue: "double_clear",
    longDisplayName: "5mm Clear/9mm Air/5mm Clear - Warm Edge Spacer",
  },
];

// ── New thermal profiles ──────────────────────────────────────────────────────
const row = (glazing, uValue, shgc, extra = {}) => ({
  _type: "thermalProfileRow", _key: extra.wersWindowId ? extra.wersWindowId.toLowerCase() : `${glazing}-derived`,
  glazing: ref(glazing), uValue, shgc, published: false, ...extra,
});
// WERS export rows for the frame the importer left unmapped (AMJ-046 / AMJ-047).
const wers = (id, glazing, uValue, shgc, tvw, heatingStars, coolingStars, published = false) =>
  row(glazing, uValue, shgc, { tvw, heatingStars, coolingStars, wersWindowId: id, certificationRef: id, published });
const AMJ80T_TB_AWNING_ROWS = [
  wers("AMJ-046-001", "glz-5clr-9ar-11-52clr-we", 3.6, 0.41, 0.42, 5.5, 3.5),
  wers("AMJ-046-002", "glz-5xene0186-9ar-11-52clear-we", 3.1, 0.39, 0.42, 5.8, 3.9),
  wers("AMJ-046-003", "glz-8clr-xyg-9ar-8clr-xyg-we", 3.7, 0.41, 0.43, 5.5, 3.5),
  wers("AMJ-046-004", "glz-8optiselec-9ar-8clr-we", 3.1, 0.19, 0.38, 5.0, 5.4),
  wers("AMJ-046-005", "glz-6xdtb0170-12ar-6xdtb0170-we", 3.0, 0.20, 0.24, 5.0, 5.5),
  wers("AMJ-046-006", "glz-6xdbg2360-d-12ar-6clr-we", 3.0, 0.13, 0.14, 4.7, 6.1),
  wers("AMJ-046-007", "glz-6optiselec-t70-12ar-6clr-we", 3.0, 0.19, 0.37, 5.0, 5.5),
  wers("AMJ-046-008", "glz-6optiselec-t70-12ar-6optiselec-t70-we", 3.0, 0.18, 0.31, 4.9, 5.6),
  wers("AMJ-046-009", "glz-6clr-xyg-12ar-6clr-xyg-we", 3.6, 0.43, 0.43, 5.6, 3.4),
  wers("AMJ-046-010", "glz-6xetb0150-12ar-6clr-we", 3.1, 0.22, 0.24, 5.1, 5.2),
  wers("AMJ-046-011", "glz-6xdtn0180-12ar-6mmclr-we", 3.0, 0.23, 0.38, 5.2, 5.1),
  wers("AMJ-046-012", "glz-6xdtn0179-12ar-6clr-we", 3.0, 0.25, 0.39, 5.3, 5.0),
  wers("AMJ-046-013", "glz-5xdne0175-12ar-5xdne0175-we", 3.0, 0.20, 0.33, 5.1, 5.4),
  wers("AMJ-046-014", "glz-5xene0185-12ar-5clr-we", 3.1, 0.36, 0.42, 5.7, 4.1),
  wers("AMJ-046-015", "glz-5clr-xyg-12ar-5clr-xyg-we", 3.6, 0.43, 0.44, 5.6, 3.4, true), // the sheet's standard glass
  wers("AMJ-047-001", "glz-13-52clr", 5.2, 0.43, 0.47, 4.2, 2.7),
  wers("AMJ-047-002", "glz-11-52hs-clr", 5.2, 0.43, 0.47, 4.2, 2.7),
  wers("AMJ-047-003", "glz-11-52clr-xyg", 5.2, 0.44, 0.47, 4.2, 2.7),
  wers("AMJ-047-004", "glz-11-52hjj-clr", 5.2, 0.34, 0.25, 3.8, 3.3),
];
const derived = (glazing, uValue, shgc, tvw, basis) =>
  row(glazing, uValue, shgc, { tvw, certificationRef: `DERIVED — ${basis}; not WERS-rated`, published: true });
const LOUVRE_ROW = () => derived("glz-6clr", 6.2, 0.70, 0.75, "typical single-glazed 6mm clear louvre; AMJ has no WERS louvre rating");
const HUNG_ROW = () => derived("glz-5clr-9-5clr-we", 3.8, 0.47, 0.50, "WERS AMJ-054-008 (AMJ100T Sliding Window, 5/12Air/5: Uw 3.7, SHGC 0.48) +0.1 Uw for the 9mm gap");
const profile = (id, name, frameTechnology, rows) => ({
  _id: `thermal-${id}`, _type: "thermalProfile", name, slug: { _type: "slug", current: id }, frameTechnology, rows,
});
const NEW_PROFILES = [
  profile("amj80t-thermally-broken-awning-window", "AMJ80T Thermally Broken Awning Window", "thermally_broken", AMJ80T_TB_AWNING_ROWS),
  profile("amj80-glass-louvre", "AMJ80 Glass Louvre", "conventional", [LOUVRE_ROW()]),
  profile("amj100l-glass-louvre", "AMJ100L Glass Louvre", "conventional", [LOUVRE_ROW()]),
  profile("amj150-sliding-door", "AMJ150 Sliding Door", "conventional",
    [derived("glz-5clr-12-5clr-we", 3.9, 0.58, 0.62, "WERS AMJ-003-011 (AMJ100 Sliding Door, same glass)")]),
  profile("amj100t-single-hung-window", "AMJ100T Single Hung Window", "thermally_broken", [HUNG_ROW()]),
  profile("amj100t-sashless-double-hung", "AMJ100T Sashless Double Hung", "thermally_broken", [HUNG_ROW()]),
];

// Every go-live profile → the ONE row (by WERS id, or glazing slug for the
// uncertified AMJ72T rows) that stays published. Everything else is unpublished.
const KEEP_PUBLISHED = {
  "thermal-amj72t-awning-window": { glazing: "glz-5clr-12-5clr-we" },
  "thermal-amj72t-fixed-window": { glazing: "glz-5clr-12-5clr-we" },
  "thermal-amj80st-fixed-window": { wers: "AMJ-038-016" },
  "thermal-amj80t-hinged-door": { wers: "AMJ-048-015" },
  "thermal-amj80-sliding-window": { wers: "AMJ-060-002" },
  "thermal-amj80-sliding-door": { wers: "AMJ-004-007" },
  "thermal-amj100l-awning": { wers: "AMJ-006-015" },
  "thermal-amj100l-fixed-window": { wers: "AMJ-040-015" },
  "thermal-amj100l-sliding-door": { wers: "AMJ-007-005" },
  "thermal-amj150-fixed-window": { wers: "AMJ-071-004" },
  "thermal-amj150t-tb-awning-window": { wers: "AMJ-052-015" },
  "thermal-amj100t-awning-window": { wers: "AMJ-009-001" },
  "thermal-amj100t-fixed-window": { wers: "AMJ-008-001" },
  "thermal-amj100t-casement-door": { wers: "AMJ-032-015" },
  "thermal-amj100t-sliding-door": { wers: "AMJ-010-001" },
  "thermal-amj68-bifold-door": { wers: "AMJ-034-015" },
};

// ── The 22 sheet products ─────────────────────────────────────────────────────
// dim = [minW, maxW, minH, maxH]. uw = the WERS-rated Uw quoted in the copy; null
// where the row is derived or uncertified (nothing is claimed in prose then).
const P = [];
const add = (p) => P.push(p);

add({
  slug: "amj72t-awning-window", grade: "Residential", system: "sys-80", profile: "thermal-amj72t-awning-window",
  glass: DG12, hardware: HW.chinaTop, tb: true, frameMm: null, air: null, water: null, wind: null,
  dim: [500, 1300, 500, 2400], uw: null, p3: "flyscreen",
  short: "Thermally broken residential awning window, double glazed as standard, made to size.",
  paragraphs: [
    "The AMJ72T awning window is the thermally broken window in AMJ's residential 72 series, built for bedrooms, bathrooms, kitchens and any wall where an energy report or a cold climate makes a standard aluminium frame hard to justify. The sash is hinged at the top and winds out at the bottom, so it can stay open in light rain.",
    "It arrives double glazed as standard, 5mm toughened glass either side of a 12mm sealed air gap, on a thermally broken frame with the chain winder fitted. Every unit is made to your sizes, from 500 × 500 up to 1300 wide by 2400 high.",
    "Pair it with the AMJ72T fixed window across a wider opening, add a flyscreen, choose the installation detail that matches your wall, and pick any colour from the powder-coat range when you build the quote.",
  ],
});
add({
  slug: "amj72t-fixed-window", grade: "Residential", system: "sys-80", profile: "thermal-amj72t-fixed-window",
  glass: DG12, hardware: null, tb: true, frameMm: null, air: null, water: null, wind: null,
  dim: [400, 3000, 400, 3000], uw: null, p3: "none",
  short: "Thermally broken residential fixed window for wide glass runs, double glazed as standard.",
  paragraphs: [
    "The AMJ72T fixed window is the fixed lite in AMJ's thermally broken residential 72 series: the panel that fills the rest of the opening beside an AMJ72T awning, or stands alone as a picture window in a living room, stairwell or hallway. It is the frame to use when the rest of the house is thermally broken and a plain aluminium fixed panel would undo the work.",
    "It arrives double glazed as standard, 5mm toughened glass either side of a 12mm sealed air gap, on the same thermally broken frame as the awning so the two sit flush in a run. Every unit is made to your sizes, from 400 × 400 up to 3000 × 3000.",
    "Couple it with the AMJ72T awning window for ventilation, choose the installation detail that matches your wall, and pick any colour from the powder-coat range when you build the quote.",
  ],
});
add({
  slug: "amj80-series-awning-window", name: "AMJ80ST Awning Window", grade: "Semi-commercial", system: "sys-80",
  profile: "thermal-amj80t-thermally-broken-awning-window", glass: DG12, hardware: HW.chinaTop, tb: true,
  frameMm: "1.6mm", air: "Low", water: "N5", wind: "N6", dim: [400, 1000, 400, 2400], uw: 3.6, p3: "flyscreen",
  short: "Semi-commercial thermally broken awning window, WERS-rated, made to size up to 1000 × 2400.",
  paragraphs: [
    "The AMJ80ST awning window is the thermally broken awning in the semi-commercial AMJ80 series, built for bathrooms, laundries, kitchens and high-level openings in homes and small commercial fit-outs. The sash is hinged at the top and winds out at the bottom, so it ventilates in light rain and sits inside the frame line when closed.",
    "It arrives double glazed as standard, 5mm toughened glass either side of a 12mm sealed gap and WERS-rated at Uw 3.6 on this frame, on a 1.6mm thermally broken frame with the chain winder fitted. Rated N5 for water and N6 for wind, it suits exposed elevations and upper floors, and every unit is made to your sizes from 400 × 400 up to 1000 wide by 2400 high.",
    "Run it beside the AMJ80 fixed window across a wider opening, add a flyscreen, choose the installation detail that matches your wall, and pick any colour from the powder-coat range when you build the quote.",
  ],
});
add({
  slug: "amj80-series-fixed-window", grade: "Semi-commercial", system: "sys-80", profile: "thermal-amj80st-fixed-window",
  glass: DG12, hardware: null, tb: false, frameMm: null, air: null, water: null, wind: null,
  dim: [400, 3000, 400, 3000], uw: 3.3, p3: "none",
  short: "Semi-commercial fixed window for large panes and window runs, WERS-rated and made to size.",
  paragraphs: [
    "The AMJ80 fixed window is the fixed lite of the semi-commercial AMJ80 series: the panel that fills the rest of the opening beside an AMJ80 awning or sliding window, or stands alone as a picture window in living rooms, stairwells and hallways. It is the everyday choice where the brief is light and views rather than ventilation.",
    "It arrives double glazed as standard, 5mm toughened glass either side of a 12mm sealed gap and WERS-rated at Uw 3.3 on this frame. Every unit is made to your sizes, from 400 × 400 up to 3000 × 3000.",
    "Couple it with the AMJ80ST awning or AMJ80 sliding window for ventilation, choose the installation detail that matches your wall, and pick any colour from the powder-coat range when you build the quote.",
  ],
});
add({
  slug: "amj80t-casement-door", grade: "Semi-commercial", system: "sys-80", profile: "thermal-amj80t-hinged-door",
  glass: DG12, hardware: HW.chinaTop, tb: true, frameMm: "2.0mm", air: "High", water: "N6", wind: "C4",
  dim: [600, 1300, 1500, 3500], uw: 3.1, p3: "flyscreen",
  short: "Thermally broken hinged door for side entries and balconies, WERS-rated, up to 1300 × 3500.",
  paragraphs: [
    "The AMJ80T casement door is the thermally broken hinged door in the semi-commercial AMJ80 series, built for side entries, balconies, laundries and any external door where a slider would get in the way. The leaf swings on hinges and closes against a full-height seal, which is what gives it its air and water performance.",
    "It arrives double glazed as standard, 5mm toughened glass either side of a 12mm sealed gap and WERS-rated at Uw 3.1 on this frame, on a 2.0mm thermally broken frame with the lock and handle set fitted. Rated N6 for water and C4 for wind with high air tightness, it suits exposed sites and upper-floor balconies, and every door is made to your sizes from 600 × 1500 up to 1300 wide by 3500 high.",
    "Pair it with the AMJ80 fixed window for a sidelight, add a flyscreen, choose the installation detail that matches your wall, and pick any colour from the powder-coat range when you build the quote.",
  ],
});
add({
  slug: "amj80-series-sliding-window", grade: "Semi-commercial", system: "sys-80", profile: "thermal-amj80-sliding-window",
  glass: DG8, hardware: HW.chinaTop, tb: false, frameMm: "1.8mm", air: "High", water: "N4", wind: "N4",
  dim: [750, 2000, 550, 1500], uw: null, p3: "sliding",
  short: "Semi-commercial sliding window for bedrooms and laundries, WERS-rated, up to 2000 × 1500.",
  paragraphs: [
    "The AMJ80 sliding window is the horizontal slider in the semi-commercial AMJ80 series, built for bedrooms, laundries and secondary living areas, and for any wall where an outward-opening sash would foul a path, deck or verandah. One panel slides past the other inside the frame, so nothing projects.",
    "It arrives double glazed as standard, 5mm toughened glass either side of an 8mm sealed gap and WERS-rated on this frame, on a 1.8mm frame with the lock and pull handle fitted. Rated N4 for water and wind with high air tightness, it suits sheltered and moderately exposed sites, and every unit is made to your sizes from 750 × 550 up to 2000 wide by 1500 high.",
    OPTIONS_P3.sliding,
  ],
});
add({
  slug: "amj80-series-sliding-door", name: "AMJ80 Series Sliding Door", grade: "Semi-commercial", system: "sys-80",
  profile: "thermal-amj80-sliding-door", glass: DG8, hardware: HW.chinaTop, tb: false, frameMm: "1.8mm",
  air: "High", water: "N4", wind: "N4", dim: [750, 2000, 1900, 2400], uw: 4.0, p3: "sliding",
  short: "Semi-commercial two-track sliding door for compact patio and side openings, double glazed as standard.",
  paragraphs: [
    "The AMJ80 sliding door is the compact door in the semi-commercial AMJ80 series, built for the openings a hinged door gets in the way of: small patios and balconies, laundries and side access. Two panels run on two tracks, one fixed and one sliding, and the same frame builds as a four-panel unit when the opening is wider.",
    "It arrives double glazed as standard, 5mm toughened glass either side of an 8mm sealed air gap and WERS-rated at Uw 4.0 on this frame, on a 1.8mm frame with the lock and pull handle fitted. Rated N4 for water and wind with high air tightness, it suits sheltered and moderately exposed sites, and every door is made to your sizes from 750 × 1900 up to 2000 wide by 2400 high.",
    OPTIONS_P3.sliding,
  ],
});
add({
  slug: "amj80-series-glass-louver4-inch", grade: "Semi-commercial", system: "sys-80", profile: "thermal-amj80-glass-louvre",
  glass: SG6, hardware: null, tb: false, frameMm: "2.0mm", air: null, water: null, wind: null,
  dim: [400, 972, 400, 2900], uw: null, p3: "none",
  notes: "Thermal row derived (typical single-glazed louvre), not WERS-rated. Aluminium 1.2mm blades are quoted on request; not modelled as an option.",
  short: "Semi-commercial 4-inch glass louvre for bathrooms and laundries that need maximum airflow.",
  paragraphs: [
    "The AMJ80 glass louvre is the ventilation window in the semi-commercial AMJ80 series, built for bathrooms, laundries, stairwells and warm-climate rooms where moving air matters more than a sealed pane. The 4-inch blades tilt open together on one handle and close flat, and the narrow blade suits tighter openings and privacy-conscious walls.",
    "It arrives with 6mm toughened clear glass blades as standard, with 1.2mm aluminium blades available where privacy matters, on a 2.0mm frame with the operating handle fitted. Every unit is made to your sizes, from 400 × 400 up to 972 wide by 2900 high.",
    OPTIONS_P3.none,
  ],
});
add({
  slug: "amj100l-series-awning-window", name: "AMJ100LST Awning Window", grade: "Commercial", system: "sys-100",
  profile: "thermal-amj100l-awning", glass: DG12, hardware: HW.chinaTop, tb: false, frameMm: "1.6mm",
  air: "Low", water: "N5", wind: "N6", dim: [400, 1200, 400, 2400], uw: null, p3: "flyscreen",
  short: "Commercial awning window on the AMJ100L frame, WERS-rated, made to size up to 1200 × 2400.",
  paragraphs: [
    "The AMJ100LST awning window is the awning in AMJ's full-commercial 100L series, built for offices, shopfronts, apartments and larger homes that want a commercial-section frame at a standard price. The sash is hinged at the top and winds out at the bottom, so it ventilates in light rain and takes a flyscreen on the inside.",
    "It arrives double glazed as standard, 5mm toughened glass either side of a 12mm sealed air gap and WERS-rated on this frame, on a 1.6mm frame with the chain winder fitted. Rated N5 for water and N6 for wind, it suits exposed elevations and upper floors, and every unit is made to your sizes from 400 × 400 up to 1200 wide by 2400 high.",
    "Run it beside the AMJ100L fixed window across a wider opening, add a flyscreen, choose the installation detail that matches your wall, and pick any colour from the powder-coat range when you build the quote.",
  ],
});
add({
  slug: "amj100l-series-fixed-window", grade: "Commercial", system: "sys-100", profile: "thermal-amj100l-fixed-window",
  glass: DG12, hardware: null, tb: false, frameMm: null, air: null, water: null, wind: null,
  dim: [400, 3600, 400, 3000], uw: 3.4, p3: "none",
  short: "Commercial fixed window for big panes and long runs, WERS-rated, up to 3600 × 3000.",
  paragraphs: [
    "The AMJ100L fixed window is the fixed lite of AMJ's full-commercial 100L series: the panel that fills the rest of the opening beside an AMJ100LST awning or AMJ100L sliding door, or stands alone as a picture window in living rooms, stair voids and shopfronts. The 100mm section carries larger panes than the residential frames.",
    "It arrives double glazed as standard, 5mm toughened glass either side of a 12mm sealed gap and WERS-rated at Uw 3.4 on this frame. Every unit is made to your sizes, from 400 × 400 up to 3600 wide by 3000 high.",
    "Couple it with the AMJ100LST awning window for ventilation, choose the installation detail that matches your wall, and pick any colour from the powder-coat range when you build the quote.",
  ],
});
add({
  slug: "amj100l-series-sliding-door", name: "AMJ100L Series Sliding Door", grade: "Commercial", system: "sys-100",
  profile: "thermal-amj100l-sliding-door", glass: DG8, hardware: HW.chinaTop, tb: false, frameMm: "1.8mm",
  air: "High", water: "N4", wind: "N4", dim: [750, 2000, 1900, 2800], uw: 4.0, p3: "sliding",
  short: "Commercial two-track sliding door for living rooms and alfresco openings, WERS-rated, up to 2000 × 2800.",
  paragraphs: [
    "The AMJ100L sliding door is the two-track slider in AMJ's full-commercial 100L series, built for living rooms, alfresco areas and balconies in homes, apartments and small commercial jobs. Two panels run on two tracks, one fixed and one sliding, and the same frame builds as a four-panel unit when the opening is wider.",
    "It arrives double glazed as standard, 5mm toughened glass either side of an 8mm sealed air gap and WERS-rated at Uw 4.0 on this frame, on a 1.8mm frame with the lock and pull handle fitted. Rated N4 for water and wind with high air tightness, it suits sheltered and moderately exposed sites, and every door is made to your sizes from 750 × 1900 up to 2000 wide by 2800 high.",
    OPTIONS_P3.sliding,
  ],
});
add({
  slug: "amj100l-series-glass-louver6-inch", grade: "Commercial", system: "sys-100", profile: "thermal-amj100l-glass-louvre",
  glass: SG6, hardware: null, tb: false, frameMm: "2.0mm", air: null, water: null, wind: null,
  dim: [400, 1188, 400, 2900], uw: null, p3: "flyscreen",
  notes: "Thermal row derived (typical single-glazed louvre), not WERS-rated. Aluminium 1.2mm blades are quoted on request; not modelled as an option.",
  short: "Commercial 6-inch glass louvre for stairwells and wet areas that need serious airflow.",
  paragraphs: [
    "The AMJ100L glass louvre is the ventilation window in AMJ's full-commercial 100L series, built for stairwells, bathrooms, laundries, plant rooms and warm-climate living areas where moving air matters more than a sealed pane. The 6-inch blades tilt open together on one handle and close flat, and the wider blade gives a bigger clear opening per metre of height than the 4-inch.",
    "It arrives with 6mm toughened clear glass blades as standard, with 1.2mm aluminium blades available where privacy matters, on a 2.0mm frame with the operating hardware fitted. Every unit is made to your sizes, from 400 × 400 up to 1188 wide by 2900 high.",
    OPTIONS_P3.flyscreen,
  ],
});
add({
  slug: "amj150-series-sliding-door", grade: "Commercial", system: "sys-150", profile: "thermal-amj150-sliding-door",
  glass: DG12, hardware: HW.chinaTop, tb: false, frameMm: "2.0mm", air: "High", water: "N5", wind: "N5",
  dim: [1000, 3000, 1900, 3200], uw: null, p3: "sliding",
  notes: "Thermal row derived from WERS AMJ-003-011 (AMJ100 Sliding Door, same glass), not WERS-rated for this frame.",
  short: "Commercial three-track stacker door for wide alfresco openings, double glazed, up to 3000 × 3200.",
  paragraphs: [
    "The AMJ150 sliding door is the three-track stacker in AMJ's commercial 150 series, built for the wide openings a two-track slider cannot clear: alfresco walls, living rooms opening onto a deck, and hospitality fit-outs. Three panels run on three tracks and stack behind one another to open two-thirds of the width, and the same frame builds as a six-panel unit that opens from the centre.",
    "It arrives double glazed as standard, 5mm toughened glass either side of a 12mm sealed air gap, on a 2.0mm frame with the lock and pull handle fitted. Rated N5 for water and wind with high air tightness, it suits exposed sites, and every door is made to your sizes from 1000 × 1900 up to 3000 wide by 3200 high.",
    OPTIONS_P3.sliding,
  ],
});
add({
  slug: "amj150st-awning-window", create: true, name: "AMJ150ST Awning Window", grade: "Commercial", system: "sys-150",
  profile: "thermal-amj150t-tb-awning-window", glass: DG12, hardware: HW.chinaTop, tb: true, frameMm: null,
  air: null, water: null, wind: null, dim: [500, 1300, 500, 2400], uw: 3.7, p3: "flyscreen",
  copyFrom: "amj100t-awning-window", family: "family-awning-window", category: "category-windows",
  notes: "Created 2026-09-06 from the go-live sheet. Dimension rule and options copied from AMJ100T Awning Window pending manufacturer confirmation.",
  short: "Commercial thermally broken awning window on the AMJ150 frame, WERS-rated, up to 1300 × 2400.",
  paragraphs: [
    "The AMJ150ST awning window is the thermally broken awning in AMJ's commercial 150 series, built for offices, apartments and larger homes where the deeper 150mm section is already in the wall and the energy report calls for a broken frame. The sash is hinged at the top and winds out at the bottom, so it ventilates in light rain and takes a flyscreen on the inside.",
    "It arrives double glazed as standard, 5mm toughened glass either side of a 12mm sealed gap and WERS-rated at Uw 3.7 on this frame, on a thermally broken frame with the chain winder fitted. Every unit is made to your sizes, from 500 × 500 up to 1300 wide by 2400 high.",
    "Run it beside the AMJ150 fixed window across a wider opening, add a flyscreen, choose the installation detail that matches your wall, and pick any colour from the powder-coat range when you build the quote.",
  ],
});
add({
  slug: "amj150-fixed-window", grade: "Commercial", system: "sys-150", profile: "thermal-amj150-fixed-window",
  glass: DG12, hardware: null, tb: false, frameMm: null, air: null, water: null, wind: null,
  dim: [400, 3000, 400, 3000], uw: 3.8, p3: "none",
  short: "Commercial fixed window on the deep AMJ150 frame, WERS-rated, up to 3000 × 3000.",
  paragraphs: [
    "The AMJ150 fixed window is the fixed lite of AMJ's commercial 150 series: the panel that fills the rest of the opening beside an AMJ150 stacker door or AMJ150ST awning, or stands alone as a picture window where the 150mm section is carried through the elevation.",
    "It arrives double glazed as standard, 5mm toughened glass either side of a 12mm sealed gap and WERS-rated at Uw 3.8 on this frame. Every unit is made to your sizes, from 400 × 400 up to 3000 × 3000.",
    "Couple it with the AMJ150ST awning window for ventilation, choose the installation detail that matches your wall, and pick any colour from the powder-coat range when you build the quote.",
  ],
});
add({
  slug: "amj100t-awning-window", grade: "Commercial", system: "sys-100", profile: "thermal-amj100t-awning-window",
  glass: DG12, hardware: HW.doricWinder, tb: true, frameMm: "2.0mm", air: "Low", water: "N6", wind: "N6",
  dim: [500, 1300, 500, 2400], uw: 3.7, p3: "flyscreen",
  short: "Commercial thermally broken awning window, WERS-rated, made to size up to 1300 × 2400.",
  paragraphs: [
    "The AMJ100T awning window is the thermally broken awning in AMJ's commercial 100 series, built for bedrooms, bathrooms, offices and any wall where an energy report is tight or frame condensation has been a problem. The sash is hinged at the top and winds out at the bottom, so it ventilates in light rain and takes a flyscreen on the inside.",
    "It arrives double glazed as standard, 5mm toughened glass either side of a 12mm sealed air gap and WERS-rated at Uw 3.7 on this frame, on a 2.0mm thermally broken frame with a Doric chain winder fitted. Rated N6 for water and wind, it suits exposed elevations and upper floors, and every unit is made to your sizes from 500 × 500 up to 1300 wide by 2400 high.",
    "Run it beside the AMJ100T fixed window across a wider opening, add a flyscreen, choose the installation detail that matches your wall, and pick any colour from the powder-coat range when you build the quote.",
  ],
});
add({
  slug: "amj100t-fixed-window", grade: "Commercial", system: "sys-100", profile: "thermal-amj100t-fixed-window",
  glass: DG12, hardware: null, tb: true, frameMm: null, air: null, water: null, wind: null,
  dim: [400, 3000, 400, 3000], uw: 3.0, p3: "none",
  short: "Commercial thermally broken fixed window for large panes, WERS-rated at Uw 3.0, up to 3000 × 3000.",
  paragraphs: [
    "The AMJ100T fixed window is the fixed lite of AMJ's thermally broken commercial 100 series: the panel beside an AMJ100T awning, hinged door or slider, or a stand-alone picture window in a living room, stair void or office. It is the frame to use when the rest of the elevation is thermally broken and a plain fixed panel would undo the work.",
    "It arrives double glazed as standard, 5mm toughened glass either side of a 12mm sealed air gap and WERS-rated at Uw 3.0 on this frame, on the same thermally broken section as the AMJ100T awning so the two sit flush in a run. Every unit is made to your sizes, from 400 × 400 up to 3000 × 3000.",
    "Couple it with the AMJ100T awning window for ventilation, choose the installation detail that matches your wall, and pick any colour from the powder-coat range when you build the quote.",
  ],
});
add({
  slug: "amj100t-series-casement-door", grade: "Commercial", system: "sys-100", profile: "thermal-amj100t-casement-door",
  glass: DG12, hardware: HW.chinaTop, tb: true, frameMm: "2.0mm", air: "Low", water: "N6", wind: "N5",
  dim: [1000, 2000, 1900, 2600], uw: 3.0, p3: "flyscreen",
  short: "Commercial thermally broken hinged door for entries and balconies, WERS-rated, up to 2000 × 2600.",
  paragraphs: [
    "The AMJ100T casement door is the thermally broken hinged door in AMJ's commercial 100 series, built for balconies, side and rear entries, offices and any external door where a slider would get in the way. The leaf swings on hinges and closes against a full-height seal, which is what gives it its water performance.",
    "It arrives double glazed as standard, 5mm toughened glass either side of a 12mm sealed gap and WERS-rated at Uw 3.0 on this frame, on a 2.0mm thermally broken frame with the lock and handle set fitted. Rated N6 for water and N5 for wind, it suits exposed sites and upper-floor balconies, and every door is made to your sizes from 1000 × 1900 up to 2000 wide by 2600 high.",
    "Pair it with the AMJ100T fixed window for a sidelight, add a flyscreen, choose the installation detail that matches your wall, and pick any colour from the powder-coat range when you build the quote.",
  ],
});
add({
  slug: "amj100t-series-sliding-door", grade: "Commercial", system: "sys-100", profile: "thermal-amj100t-sliding-door",
  glass: DG12, hardware: HW.ciilockD, tb: true, frameMm: "2.0mm", air: "Low", water: "N5", wind: "N4",
  dim: [1000, 3000, 1900, 2800], uw: 3.4, p3: "sliding",
  short: "Commercial thermally broken two-track sliding door for big alfresco openings, WERS-rated, up to 3000 × 2800.",
  paragraphs: [
    "The AMJ100T sliding door is the thermally broken two-track slider in AMJ's commercial 100 series, built for living rooms, alfresco walls and balconies where the door is the biggest piece of glass in the room and the energy report notices it. Two panels run on two tracks, one fixed and one sliding, and the same frame builds as a four-panel unit when the opening is wider.",
    "It arrives double glazed as standard, 5mm toughened glass either side of a 12mm sealed air gap and WERS-rated at Uw 3.4 on this frame, on a 2.0mm thermally broken frame with a Ciilock lock and D-handle fitted. Rated N5 for water and N4 for wind, it suits moderately exposed sites, and every door is made to your sizes from 1000 × 1900 up to 3000 wide by 2800 high.",
    OPTIONS_P3.sliding,
  ],
});
add({
  slug: "amj100t-single-hung-window", grade: "Commercial", system: "sys-100", profile: "thermal-amj100t-single-hung-window",
  glass: DG9, hardware: HW.chinaTop, tb: true, frameMm: "1.6mm", air: "Low", water: "N5", wind: "N3",
  dim: [500, 1000, 1000, 2400], uw: null, p3: "flyscreen",
  notes: "Thermal row derived from WERS AMJ-054-008 (AMJ100T Sliding Window) +0.1 Uw for the 9mm gap; not WERS-rated for this frame. Standard glass changed from Low-E to clear per the 2026-09-06 sheet.",
  short: "Commercial thermally broken single hung window for tall, narrow openings, up to 1000 × 2400.",
  paragraphs: [
    "The AMJ100T single hung window is the vertical slider in AMJ's thermally broken commercial 100 series, built for bedrooms, hallways and street elevations where a tall, narrow window suits the facade and nothing may project outward. The bottom sash slides up inside the frame and the top pane stays fixed, so it ventilates without fouling a path or awning below.",
    "It arrives double glazed as standard, 5mm toughened glass either side of a 9mm sealed air gap, on a 1.6mm thermally broken frame with the sash lock fitted. Rated N5 for water and N3 for wind, it suits sheltered and moderately exposed sites, and every unit is made to your sizes from 500 × 1000 up to 1000 wide by 2400 high.",
    OPTIONS_P3.flyscreen,
  ],
});
add({
  slug: "amj100t-series-sashless-double-hung", grade: "Commercial", system: "sys-100", profile: "thermal-amj100t-sashless-double-hung",
  glass: DG9, hardware: HW.ciilockAcrylic, tb: true, frameMm: "2.0mm", air: "Low", water: "N3", wind: "N3",
  dim: [400, 1300, 1000, 3000], uw: null, p3: "flyscreen",
  notes: "Thermal row derived from WERS AMJ-054-008 (AMJ100T Sliding Window) +0.1 Uw for the 9mm gap; not WERS-rated for this frame. Previously pointed at the AMJ83 Double Hung profile.",
  short: "Commercial thermally broken sashless double hung: glass panes that slide, up to 1300 × 3000.",
  paragraphs: [
    "The AMJ100T sashless double hung is the vertical slider in AMJ's thermally broken commercial 100 series with the sashes left out: two glass panes slide in the frame on their own, so the window reads as one clear pane from outside and opens top, bottom or both. It is built for living rooms, bedrooms and heritage-style elevations that want the double-hung proportion without the mid-rail.",
    "It arrives double glazed as standard, 5mm toughened glass either side of a 9mm sealed air gap, on a 2.0mm thermally broken frame with Ciilock hardware and an acrylic pull fitted. Rated N3 for water and wind, it suits sheltered sites, and every unit is made to your sizes from 400 × 1000 up to 1300 wide by 3000 high.",
    OPTIONS_P3.flyscreen,
  ],
});
add({
  slug: "amj68-series-bi-fold-door", grade: "Residential", system: "sys-80", profile: "thermal-amj68-bifold-door",
  glass: DG12, hardware: HW.chinaTop, tb: false, frameMm: "1.8mm", air: "High", water: "N3", wind: "N4",
  dim: [1100, 4500, 1900, 3000], uw: 3.7, p3: "flyscreen",
  short: "Residential bi-fold door for opening up a whole wall, WERS-rated, up to 4500 × 3000.",
  paragraphs: [
    "The AMJ68 bi-fold door is AMJ's residential folding door, built for alfresco walls, decks and entertaining areas where the brief is to open the whole wall rather than a third of it. The panels fold and stack to one or both sides on the track, leaving the opening clear from jamb to jamb.",
    "It arrives double glazed as standard, 5mm toughened glass either side of a 12mm sealed gap and WERS-rated at Uw 3.7 on this frame, on a 1.8mm frame with the hinges, lock and handles fitted. Rated N3 for water and N4 for wind with high air tightness, it suits sheltered and moderately exposed sites, and every door is made to your sizes from 1100 × 1900 up to 4500 wide by 3000 high.",
    "Add a retractable flyscreen, choose the installation detail that matches your wall, and pick any colour from the powder-coat range when you build the quote.",
  ],
});

// ── Off the sheet → withdrawn ─────────────────────────────────────────────────
const DISABLE = [
  "amj100-series-pivot-door", "amj100l-series-casement-door", "amj125t-slim-frame-sliding-door",
  "amj150t-lift-sliding-door", "amj65t-casement-door", "amj65t-casement-windowoutward-opening",
  "amj65t-tilt-and-turn-window", "amj67t-fixed-window", "amj80-series-casement-window",
  "amj80t-bi-fold-door", "amj80t-tilt-and-turn-window",
];
const DEFAULT_COLOUR = "option-colour-night-sky";

// ── Derivations ───────────────────────────────────────────────────────────────
const fmt = (n) => n.toLocaleString("en-AU");
// Height first: the joinery order every other size on the site uses (see
// sanity/scripts/size-specs-height-first.mjs).
const sizeHW = (w, h) => `${fmt(h)} × ${fmt(w)} mm`;
const specRow = (i, label, value) => ({ _key: `sp${i}`, _type: "specRow", label, value });
const isDG = (glass) => /\+/.test(glass);

function buildSpecs(p, names) {
  const [minW, maxW, minH, maxH] = p.dim;
  const rows = [
    ["Family", names.family], ["Category", names.category], ["Grade", p.grade],
    ["Frame", p.tb ? "Thermally broken aluminium" : "Aluminium"],
    ["Standard glass", p.glass],
    p.hardware ? ["Hardware", names.hardware] : null,
    p.frameMm ? ["Profile thickness", p.frameMm] : null,
    ["Minimum size", sizeHW(minW, minH)], ["Maximum size", sizeHW(maxW, maxH)],
    p.air ? ["Air tightness", p.air] : null, p.water ? ["Water tightness", p.water] : null, p.wind ? ["Wind pressure", p.wind] : null,
  ].filter(Boolean);
  return rows.map(([l, v], i) => specRow(i, l, v));
}
function buildKeySpecs(p) {
  const [, maxW, , maxH] = p.dim;
  const chips = [
    p.frameMm ? ["Frame profile", p.frameMm] : null,
    ["Glazing", isDG(p.glass) ? "Double glazed" : "Single glazed"],
    ["Max size", sizeHW(maxW, maxH)],
    p.wind ? ["Wind rating", p.wind] : null,
    p.tb ? ["Frame", "Thermally broken"] : null,
    ["Grade", p.grade],
  ].filter(Boolean);
  return chips.map(([label, value], i) => ({ _key: `ks${i}`, _type: "specRow", label, value }));
}
function buildSeo(p, name, existing) {
  const [, maxW, , maxH] = p.dim;
  return {
    ...(existing ?? {}),
    metaTitle: isDG(p.glass) ? `${name} — Double glazed | OpenFrame` : `${name} | OpenFrame`,
    metaDescription: `${p.short} Made to size up to ${maxW} × ${maxH} mm. Supply-only from OpenFrame.`,
  };
}
function buildDimensionRule(p, existing) {
  const [minW, maxW, minH, maxH] = p.dim;
  const rule = { ...(existing ?? { _type: "object", ruleVersion: "v1" }), minWidthMm: minW, maxWidthMm: maxW, minHeightMm: minH, maxHeightMm: maxH };
  // An area cap authored for the old W×H envelope would silently re-impose it.
  if (typeof rule.maxAreaM2 === "number") rule.maxAreaM2 = Math.round((maxW * maxH) / 10_000) / 100;
  return rule;
}
const isHardware = (r) => String(r ?? "").startsWith("option-hardware-");
/** Column H: the named hardware becomes the standard, every other hardware
 *  option on the product stays offered but optional. Nothing is removed. */
function alignHardware(options, hardwareId) {
  const list = (options ?? []).map((o) => ({ ...o }));
  if (!hardwareId) return list;
  let found = false;
  for (const o of list) {
    if (!isHardware(o.option?._ref)) continue;
    if (o.option._ref === hardwareId) { o.availability = "standard"; found = true; }
    else if (o.availability === "standard") o.availability = "optional";
  }
  if (!found) list.push({ _key: `hw-${hardwareId.replace(/^option-/, "")}`, _type: "productOption", option: ref(hardwareId), availability: "standard" });
  return list;
}
const rekey = (arr, prefix) => (arr ?? []).map((o, i) => ({ ...o, _key: `${prefix}${i}` }));
const stable = (v) => JSON.stringify(v, Object.keys(v ?? {}).sort ? undefined : undefined);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Normalize a thermalProfile doc to its authored content only, so a real/fixture
// doc and a NEW_PROFILES literal can be compared for drift with same(). Drops
// system fields (_id/_type/_rev/row _key); defaults published to false.
const ROW_OPTIONAL_KEYS = ["tvw", "heatingStars", "coolingStars", "wersWindowId", "certificationRef"];
function normProfile(doc) {
  if (!doc) return null;
  const rows = (doc.rows ?? []).map((r) => {
    const row = { glazing: r.glazing?._ref ?? r.glazing, uValue: r.uValue ?? null, shgc: r.shgc ?? null, published: r.published ?? false };
    for (const k of ROW_OPTIONAL_KEYS) if (r[k] != null) row[k] = r[k];
    return row;
  });
  return { name: doc.name, slug: doc.slug?.current ?? doc.slug, frameTechnology: doc.frameTechnology, rows };
}

// ── Plan ──────────────────────────────────────────────────────────────────────
function plan(world) {
  const ids = new Set([...world.families, ...world.categories, ...world.systems, ...world.profiles, ...world.options].map((d) => d._id));
  const optionName = new Map(world.options.map((o) => [o._id, o.name]));
  const systemId = new Map(world.systems.map((s) => [s.slug, s._id]));
  const profileById = new Map(world.profiles.map((p) => [p._id, p]));
  const problems = [];
  const mutations = [];
  const report = [];
  let amend = 0;
  let create = 0;

  // 1. glazing options — only if absent.
  for (const g of NEW_GLAZINGS) {
    if (!ids.has(g._id)) { mutations.push({ createIfNotExists: g }); report.push(`create glazing option ${g._id}`); }
    ids.add(g._id);
  }
  // 2. new profiles — every glazing they reference must exist (or be created above).
  //    createOrReplace only when the fetched full doc actually differs (converged: no mutation).
  const fullProfileById = new Map((world.fullProfiles ?? []).map((p) => [p._id, p]));
  for (const pr of NEW_PROFILES) {
    for (const r of pr.rows) if (!ids.has(r.glazing._ref)) problems.push(`${pr._id}: glazing ${r.glazing._ref} does not exist`);
    const existing = fullProfileById.get(pr._id);
    const existingSlug = existing?.slug?.current ?? existing?.slug;
    if (existing && existingSlug !== pr.slug.current) {
      problems.push(`${pr._id}: existing slug "${existingSlug}" would be renamed to "${pr.slug.current}" — refusing`);
    } else if (existing && same(normProfile(existing), normProfile(pr))) {
      report.push(`profile ${pr._id}: unchanged`);
    } else {
      report.push(existing ? `profile ${pr._id} exists — content differs, replacing` : `create profile ${pr._id} (${pr.rows.length} rows, ${pr.rows.filter((r) => r.published).length} published)`);
      mutations.push({ createOrReplace: pr });
    }
    ids.add(pr._id);
  }
  // 3. one published row per go-live profile.
  for (const [id, keep] of Object.entries(KEEP_PUBLISHED)) {
    const pr = profileById.get(id);
    if (!pr) { problems.push(`profile ${id} does not exist`); continue; }
    const rows = pr.rows ?? [];
    const target = rows.filter((r) => (keep.wers ? r.wersWindowId === keep.wers : r.glazing === keep.glazing));
    if (target.length !== 1) { problems.push(`profile ${id}: expected exactly one row for ${JSON.stringify(keep)}, found ${target.length}`); continue; }
    if (target[0].uValue == null || target[0].shgc == null) problems.push(`profile ${id}: the row to keep has no Uw/SHGC`);
    const flips = rows.filter((r) => (r.published !== false) !== (r === target[0]));
    if (!flips.length) continue;
    // One patch per row that changes, addressed by _key — never a whole-array rewrite.
    const set = {};
    for (const r of flips) set[`rows[_key=="${r._key}"].published`] = r === target[0];
    mutations.push({ patch: { id, set } });
    report.push(`profile ${id}: ${flips.filter((r) => r !== target[0]).length} row(s) unpublished, keep ${keep.wers ?? keep.glazing}`);
  }
  // 4. products. A created product copies its options from the copy source's
  // PLANNED state (the hardware alignment this same plan is about to write for
  // that source), not its live state — otherwise a --write immediately
  // followed by a replan still emits a stray options patch for the created
  // product (criterion 28: one --write must converge).
  const plannedOptionsBySlug = new Map();
  for (const q of P) {
    if (q.create) continue;
    const ex = world.products.get(q.slug);
    if (ex) plannedOptionsBySlug.set(q.slug, alignHardware(ex.options, q.hardware));
  }
  for (const p of P) {
    const existing = world.products.get(p.slug);
    const source = p.copyFrom ? world.products.get(p.copyFrom) : existing;
    const sourceOptions = p.copyFrom ? (plannedOptionsBySlug.get(p.copyFrom) ?? source?.options) : source?.options;
    if (!existing && !p.create) { problems.push(`product ${p.slug} does not exist`); continue; }
    if (p.create && !source) { problems.push(`product ${p.slug}: copy source ${p.copyFrom} does not exist`); continue; }
    for (const id of [p.profile, systemId.get(p.system), p.hardware, p.family, p.category].filter(Boolean)) if (!ids.has(id)) problems.push(`product ${p.slug}: ${id} does not exist`);
    if (!systemId.has(p.system)) problems.push(`product ${p.slug}: frame system ${p.system} unknown`);
    const name = p.name ?? existing?.name;
    const names = {
      family: existing?.familyName ?? source?.familyName, category: existing?.categoryName ?? source?.categoryName,
      hardware: p.hardware ? optionName.get(p.hardware) : null,
    };
    const set = {
      name,
      frameSystem: ref(systemId.get(p.system)),
      thermalProfile: ref(p.profile),
      standardGlass: p.glass,
      pricingRef: p.slug,
      shortDescription: p.short,
      descriptionParagraphs: p.paragraphs,
      keySpecs: buildKeySpecs(p),
      specs: buildSpecs(p, names),
      ...(sourceOptions == null && !p.hardware ? {} : { options: rekey(alignHardware(sourceOptions, p.hardware), "opt") }),
      dimensionRule: buildDimensionRule(p, existing?.dimensionRule ?? source?.dimensionRule),
      seo: buildSeo(p, name, existing?.seo),
      ...(p.notes ? { notes: p.notes } : {}),
    };
    if (p.create) {
      const doc = {
        _id: `product-${p.slug}`, _type: "product", slug: { _type: "slug", current: p.slug },
        family: ref(p.family), category: ref(p.category), disabled: false, schemaVersion: 1,
        // After the last product in Studio's drag order; the plugin re-ranks on the next drag.
        orderRank: "0|1000d0:", ...set,
      };
      if (world.products.has(p.slug)) {
        const existingCreated = world.products.get(p.slug);
        const changed = Object.keys(set).filter((k) => !same(existingCreated[k], set[k]));
        if (changed.length) {
          const patch = {};
          for (const k of changed) patch[k] = set[k];
          mutations.push({ patch: { id: `product-${p.slug}`, set: patch } });
          report.push(`product ${p.slug}: exists, ${changed.join(", ")}`);
          amend++;
        } else {
          report.push(`product ${p.slug}: unchanged`);
        }
      }
      else { mutations.push({ createIfNotExists: doc }); report.push(`create product ${p.slug} (from ${p.copyFrom})`); create++; }
      continue;
    }
    const changed = Object.keys(set).filter((k) => !same(existing[k], set[k]));
    if (!changed.length) { report.push(`product ${p.slug}: unchanged`); continue; }
    const patch = {};
    for (const k of changed) patch[k] = set[k];
    mutations.push({ patch: { id: existing._id, set: patch } });
    amend++;
    const dimNote = same(existing.dimensionRule, set.dimensionRule) ? "" : ` dims ${JSON.stringify(existing.dimensionRule && [existing.dimensionRule.minWidthMm, existing.dimensionRule.maxWidthMm, existing.dimensionRule.minHeightMm, existing.dimensionRule.maxHeightMm])} → ${JSON.stringify(p.dim)}`;
    report.push(`product ${p.slug}: ${changed.join(", ")}${dimNote}`);
  }
  // 5. withdrawn.
  for (const slug of DISABLE) {
    const d = world.products.get(slug);
    if (!d) { problems.push(`product to disable ${slug} does not exist`); continue; }
    if (d.disabled === true) continue;
    mutations.push({ patch: { id: d._id, set: { disabled: true } } });
    report.push(`disable ${slug}`);
  }
  // 6. one default colour.
  for (const o of world.options.filter((o) => o.type === "colour")) {
    const want = o._id === DEFAULT_COLOUR;
    if ((o.isDefault === true) === want) continue;
    mutations.push({ patch: { id: o._id, set: { isDefault: want } } });
    report.push(`colour ${o.name}: isDefault ${want}`);
  }
  if (!world.options.some((o) => o._id === DEFAULT_COLOUR)) problems.push(`default colour ${DEFAULT_COLOUR} does not exist`);
  return { mutations, report, problems, summary: { amend, create } };
}

// Defence in depth: re-validate the computed mutation list against a fixed
// allow-list before it ever reaches the network, independent of whether the
// plan-building logic above is trusted. See docs/runs/catalogue-go-live-min/02-design.md §4.
const ALLOWED_MUTATION_KEYS = new Set(["createIfNotExists", "createOrReplace", "patch"]);
function assertSafe(mutations) {
  const violations = [];
  for (const m of mutations) {
    for (const k of Object.keys(m)) if (!ALLOWED_MUTATION_KEYS.has(k)) violations.push(`disallowed mutation key "${k}"`);
    if (m.patch) {
      for (const k of Object.keys(m.patch)) if (k !== "id" && k !== "set") violations.push(`disallowed patch key "${k}"`);
      if (m.patch.id?.startsWith("drafts.")) violations.push(`disallowed draft target id "${m.patch.id}"`);
      if (m.patch.set) {
        for (const k of Object.keys(m.patch.set)) if (k === "slug" || k.startsWith("slug.")) violations.push(`disallowed set key "${k}"`);
      }
    }
    const createId = (m.createIfNotExists ?? m.createOrReplace)?._id;
    if (createId?.startsWith("drafts.")) violations.push(`disallowed draft target id "${createId}"`);
    if (m.createOrReplace?._type === "product") violations.push(`disallowed createOrReplace of a product`);
  }
  return violations;
}

export {
  NEW_GLAZINGS, NEW_PROFILES, KEEP_PUBLISHED, P, DISABLE, DEFAULT_COLOUR, HW,
  buildSpecs, buildKeySpecs, buildSeo, buildDimensionRule, alignHardware, rekey, same, normProfile,
  plan, assertSafe,
};
