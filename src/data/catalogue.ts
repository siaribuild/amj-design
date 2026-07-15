// AUTO-GENERATED from products.xlsx — AMJ Trade Direct catalogue.
// This module is the single hardcoded source of truth for catalogue + product-detail pages.
// It is deliberately shaped to mirror future Sanity documents (category / family / product,
// referenced by slug), so migration is a matter of swapping the arrays below for GROQ queries
// while the selector helpers and React pages stay unchanged.
// Regenerate: node scripts/generate-catalogue.cjs <unpacked-xlsx-dir> src/data/catalogue.ts

export type CategorySlug = "windows" | "doors";

export interface Category {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
}

export interface Family {
  id: string;
  slug: string;
  categorySlug: string;
  name: string;
  shortDescription: string;
  description: string;
}

export type OptionAvailability = "standard" | "optional";

export interface ProductOption {
  typeSlug: string;
  typeName: string;
  name: string;
  availability: OptionAvailability;
  hex?: string;
}

export interface SpecRow { label: string; value: string; }

export interface Product {
  id: string;
  slug: string;
  name: string;
  familySlug: string;
  categorySlug: string;
  shortDescription: string;
  descriptionParagraphs: string[];
  standardGlass: string;
  hardware: string;
  minWidth: number | null;
  minHeight: number | null;
  maxWidth: number | null;
  maxHeight: number | null;
  profileThickness: string;
  airTightness: string;
  waterTightness: string;
  windPressure: string;
  notes: string;
  heroImage: string;
  gallery: string[];
  keySpecs: SpecRow[];
  specs: SpecRow[];
  options: ProductOption[];
  featuredOrder: number;
}

export const colorbondColourOptions: ProductOption[] = [
  { typeSlug: "colour", typeName: "Colour", name: "Dover White", availability: "standard", hex: "#E3E7E2" },
  { typeSlug: "colour", typeName: "Colour", name: "Surfmist", availability: "optional", hex: "#D7D6CB" },
  { typeSlug: "colour", typeName: "Colour", name: "Classic Cream", availability: "optional", hex: "#E6CFAE" },
  { typeSlug: "colour", typeName: "Colour", name: "Southerly", availability: "optional", hex: "#BFBFBB" },
  { typeSlug: "colour", typeName: "Colour", name: "Paperbark", availability: "optional", hex: "#C9B59B" },
  { typeSlug: "colour", typeName: "Colour", name: "Evening Haze", availability: "optional", hex: "#BFB5A1" },
  { typeSlug: "colour", typeName: "Colour", name: "Shale Grey", availability: "optional", hex: "#B2B4AF" },
  { typeSlug: "colour", typeName: "Colour", name: "Dune", availability: "optional", hex: "#ADA398" },
  { typeSlug: "colour", typeName: "Colour", name: "Bluegum", availability: "optional", hex: "#899094" },
  { typeSlug: "colour", typeName: "Colour", name: "Windspray", availability: "optional", hex: "#80847F" },
  { typeSlug: "colour", typeName: "Colour", name: "Pale Eucalypt", availability: "optional", hex: "#777D67" },
  { typeSlug: "colour", typeName: "Colour", name: "Gully", availability: "optional", hex: "#776F62" },
  { typeSlug: "colour", typeName: "Colour", name: "Wilderness", availability: "optional", hex: "#606F61" },
  { typeSlug: "colour", typeName: "Colour", name: "Wallaby", availability: "optional", hex: "#6C6A65" },
  { typeSlug: "colour", typeName: "Colour", name: "Mangrove", availability: "optional", hex: "#696957" },
  { typeSlug: "colour", typeName: "Colour", name: "Jasper", availability: "optional", hex: "#675C51" },
  { typeSlug: "colour", typeName: "Colour", name: "Basalt", availability: "optional", hex: "#5C5E5E" },
  { typeSlug: "colour", typeName: "Colour", name: "Woodland Grey", availability: "optional", hex: "#53514D" },
  { typeSlug: "colour", typeName: "Colour", name: "Cottage Green", availability: "optional", hex: "#3B5045" },
  { typeSlug: "colour", typeName: "Colour", name: "Ironstone", availability: "optional", hex: "#474B50" },
  { typeSlug: "colour", typeName: "Colour", name: "Deep Ocean", availability: "optional", hex: "#3C4B54" },
  { typeSlug: "colour", typeName: "Colour", name: "Manor Red", availability: "optional", hex: "#673833" },
  { typeSlug: "colour", typeName: "Colour", name: "Monument", availability: "optional", hex: "#404141" },
  { typeSlug: "colour", typeName: "Colour", name: "Night Sky", availability: "optional", hex: "#2B2C2C" },
];

export const categories: Category[] = [
  { id: "1", slug: "windows", name: "Windows", shortDescription: `Aluminium window systems for renovation and new-build projects, from compact ventilation units to higher-performance architectural openings.`, description: `The window range covers the major residential opening types used in renovation and new-build work: sliding, awning, casement, louvre, tilt-turn, sashless double hung and single hung. The category is designed to support practical trade selection, with each product defined by size limits, glass make-up, profile thickness, hardware and performance ratings where available. Use this category when the project requires repeatable aluminium window systems with clear configuration choices and a supply-only workflow.` },
  { id: "2", slug: "doors", name: "Doors", shortDescription: `Aluminium door systems for indoor-outdoor living, entries and wide façade openings, available across sliding, hinged, folding and premium large-panel formats.`, description: `The door range is focused on aluminium-framed access and façade systems for residential projects, from practical sliding and hinged doors through to bi-fold, pivot, slim-frame and lift-slide formats. The category supports both everyday renovation openings and premium indoor-outdoor connections, with product selection driven by opening width, panel operation, glass specification, hardware and exposure rating. Use this category when the project requires configurable aluminium doors for builder-led supply, manual review and confirmed production before delivery.` },
];

export const families: Family[] = [
  { id: "1", slug: "sliding-window", categorySlug: "windows", name: "Sliding Window", shortDescription: `Compact aluminium sliding windows for efficient ventilation and everyday residential openings.`, description: `Sliding windows suit projects where airflow, space efficiency and simple day-to-day operation are priorities. The sash moves horizontally within the frame, avoiding projection into paths, decks or internal rooms. Within this catalogue, the sliding window range is best positioned for bedrooms, laundries, kitchens and compact renovation openings where a durable aluminium system and practical double-glazed glass package are required.` },
  { id: "2", slug: "awning-window", categorySlug: "windows", name: "Awning Window", shortDescription: `Top-hinged aluminium windows for weather-protected ventilation and flexible room placement.`, description: `Awning windows are a reliable choice for controlled ventilation because the sash projects outward from the top, helping provide airflow even in light weather. This family spans several AMJ series with different maximum sizes, profile thicknesses and hardware options, making it suitable for bathrooms, bedrooms, laundries and upper-level openings. The range is particularly useful where the design calls for repeatable window modules, consistent frame colours and straightforward flyscreen or installation selections.` },
  { id: "3", slug: "casement-window", categorySlug: "windows", name: "Casement Window", shortDescription: `Side-hinged aluminium windows for strong ventilation, clear openings and higher sealing performance.`, description: `Casement windows are side-hinged outward-opening units that provide a wide clear opening and strong ventilation performance. They are suited to projects where improved sealing, directional airflow and a more traditional window operation are desired. In this catalogue, casement options include compact and higher-performing systems with Low-E or double-glazed glass options, making the family appropriate for bedrooms, studies and façade windows where performance and operation are more important than maximum width.` },
  { id: "4", slug: "glass-louvre", categorySlug: "windows", name: "Glass Louvre", shortDescription: `Adjustable glass louvre windows for high airflow, narrow openings and controlled ventilation.`, description: `Glass louvre windows use a bank of adjustable blades to provide high ventilation control in a narrow or vertical opening. They are particularly useful in bathrooms, laundries, stairwells and ventilation-led designs where airflow can be tuned without opening a large sash. The AMJ louvre products are differentiated by blade size and allowable dimensions, so selection should be based on opening height, airflow requirement and desired visual rhythm.` },
  { id: "5", slug: "tilt-and-turn-window", categorySlug: "windows", name: "Tilt & Turn Window", shortDescription: `European-style dual-action windows combining secure ventilation with inward-opening access.`, description: `Tilt and turn windows offer two operating modes: a secure tilt position for controlled ventilation and an inward-turning mode for broader opening and access. This family suits projects seeking a European-style operating system, better weather sealing and premium hardware feel. Because the exported catalogue contains a likely dimension inconsistency for one tilt-turn item, final sizes should be verified before publication or configuration.` },
  { id: "6", slug: "sashless-double-hung", categorySlug: "windows", name: "Sashless Double Hung", shortDescription: `Minimal vertical-sliding window system for contemporary openings and uninterrupted glass appearance.`, description: `Sashless double hung windows provide vertical sliding operation with a cleaner glass-forward appearance than traditional framed double-hung units. They suit contemporary residential projects where ventilation and unobstructed sightlines are both important. The family is best used for taller openings where the design intent is a refined façade with minimal interruption from horizontal framing.` },
  { id: "7", slug: "single-hung-window", categorySlug: "windows", name: "Single Hung Window", shortDescription: `Classic vertical-sliding aluminium window for compact rooms and traditional replacement applications.`, description: `Single hung windows provide familiar vertical-sliding operation with one moving sash and one fixed sash. They are a practical option for compact openings, replacement work and rooms where outward projection is undesirable. The AMJ single hung option combines a traditional operating format with aluminium framing and a Low-E glass make-up suited to residential performance expectations.` },
  { id: "8", slug: "sliding-door", categorySlug: "doors", name: "Sliding Door", shortDescription: `Aluminium sliding doors for patios, living areas and high-traffic indoor-outdoor openings.`, description: `Sliding doors are the core indoor-outdoor product family for living rooms, patios, balconies and renovation openings. They deliver large glazed areas while keeping panels within the frame line, making them efficient where swing clearance is limited. The catalogue includes standard and larger AMJ series, allowing selection by opening size, glass package, hardware and performance rating.` },
  { id: "9", slug: "casement-door", categorySlug: "doors", name: "Casement Door", shortDescription: `Hinged aluminium doors for side-entry, balcony and narrow-access applications.`, description: `Casement doors are hinged aluminium doors suited to entries, balconies, side access and narrower openings where a sliding or folding door is not appropriate. This family includes Low-E and double-glazed options, a range of maximum heights and different hardware systems. It is best positioned as a functional access-door family rather than the main wide-opening entertainment product.` },
  { id: "10", slug: "bi-fold-door", categorySlug: "doors", name: "Bi-Fold Door", shortDescription: `Folding aluminium doors for wide openings and flexible indoor-outdoor entertaining spaces.`, description: `Bi-fold doors are designed for wide openings where panels fold away to connect indoor and outdoor areas. They are well suited to entertaining zones, alfresco connections and renovation projects seeking a more open façade than a standard sliding door can provide. The available AMJ bi-fold systems differ in glass make-up, allowable height and performance rating, so the chosen series should match both opening size and expected exposure.` },
  { id: "11", slug: "pivot-door", categorySlug: "doors", name: "Pivot Door", shortDescription: `Statement aluminium pivot door for larger entries and contemporary façade design.`, description: `Pivot doors create a stronger entry statement than a conventional hinged door by rotating around an offset pivot point. The AMJ pivot option is best suited to contemporary façades, feature entries and projects where the door itself is part of the architectural expression. Final specification should consider hardware, threshold detail and installation requirements carefully because pivot doors are more design-led than commodity access doors.` },
  { id: "12", slug: "slim-frame-sliding-door", categorySlug: "doors", name: "Slim-Frame Sliding Door", shortDescription: `Premium slim-frame sliding door for larger glazed openings and a lighter architectural look.`, description: `Slim-frame sliding doors emphasise glass area and reduced visual frame bulk, making them suitable for premium living areas, views and contemporary architectural openings. The AMJ125T option supports large panels and a thicker profile, positioning it above standard sliding door systems. It is best used where the design intent is a high-end glazed façade with a lighter, more refined aluminium sightline.` },
  { id: "13", slug: "lift-slide-door", categorySlug: "doors", name: "Lift-Slide Door", shortDescription: `Heavy-duty lift-slide door for large openings where smooth operation and sealing matter.`, description: `Lift-slide doors are designed for larger and heavier glazed panels, using hardware that lifts the panel slightly before sliding to improve operation and sealing. This family is suited to premium openings where large panel size, smooth movement and weather performance are priorities. The AMJ150T lift-sliding option should be positioned as a higher-performance alternative to a conventional sliding door for substantial living-area openings.` },
];

const productDefinitions: Product[] = [
  {
    id: "1", slug: "amj80-series-sliding-window", name: "AMJ80 Series Sliding Window",
    familySlug: "sliding-window", categorySlug: "windows",
    shortDescription: `Compact sliding window for practical ventilation where outward sash projection is not available.`,
    descriptionParagraphs: [`AMJ80 Series Sliding Window is a sliding window designed for supply-only residential and trade projects. It is a practical choice for bedrooms, laundries and compact living spaces where ventilation is needed without sash projection. It is specified with 5 + 8A + 5mm double-tempered clear glass and AMJ Standard D Shape Handle as the listed hardware package. The product supports 750–2000mm wide by 550–1500mm high and uses a 1.8mm aluminium profile, with high air tightness, N4 water, N4 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "5+8A+5mm Double Tempered Clear Glass", hardware: "AMJ Standard D Shape Handle",
    minWidth: 750, minHeight: 550, maxWidth: 2000, maxHeight: 1500,
    profileThickness: "1.8mm", airTightness: "High", waterTightness: "N4", windPressure: "N4",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1699259160970-a42f68d2eb2e?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1699259160970-a42f68d2eb2e?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1774199616762-31d947dc7d35?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "1.8mm" }, { label: "Glazing", value: "Double glazed" }, { label: "Max size", value: "2000 × 1500 mm" }, { label: "Wind rating", value: "N4" }],
    specs: [{ label: "Family", value: "Sliding Window" }, { label: "Category", value: "Windows" }, { label: "Standard glass", value: "5+8A+5mm Double Tempered Clear Glass" }, { label: "Hardware", value: "AMJ Standard D Shape Handle" }, { label: "Profile thickness", value: "1.8mm" }, { label: "Minimum size", value: "750 × 550 mm" }, { label: "Maximum size", value: "2000 × 1500 mm" }, { label: "Air tightness", value: "High" }, { label: "Water tightness", value: "N4" }, { label: "Wind pressure", value: "N4" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "AU Doric Brand D Shape Handle", availability: "optional" }, { typeSlug: "hardware", typeName: "Hardware", name: "AMJ Standard D Shape Handle", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Fiber Glass", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.3mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.5mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.8mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Aluminium", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Retractable Flyscreen", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Sub Sill & Head", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Timber Reveal", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "T Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 1,
  },
  {
    id: "2", slug: "amj80-series-awning-window", name: "AMJ80 Series Awning Window",
    familySlug: "awning-window", categorySlug: "windows",
    shortDescription: `Entry-level awning window for controlled ventilation in smaller residential openings.`,
    descriptionParagraphs: [`AMJ80 Series Awning Window is an awning window designed for supply-only residential and trade projects. It suits bathrooms, bedrooms, laundries and upper-level openings where controlled ventilation and weather-conscious operation are useful. It is specified with 5 + 12A + 5mm double-tempered clear glass and AMJ Standard Chain Winder as the listed hardware package. The product supports 400–1000mm wide by 400–2400mm high and uses a 1.6mm aluminium profile, with low air tightness, N5 water, N6 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "5+12A+5mm Double Tempered Clear Glass", hardware: "AMJ Standard Chain Winder",
    minWidth: 400, minHeight: 400, maxWidth: 1000, maxHeight: 2400,
    profileThickness: "1.6mm", airTightness: "Low", waterTightness: "N5", windPressure: "N6",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1774199616762-31d947dc7d35?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "1.6mm" }, { label: "Glazing", value: "Double glazed" }, { label: "Max size", value: "1000 × 2400 mm" }, { label: "Wind rating", value: "N6" }],
    specs: [{ label: "Family", value: "Awning Window" }, { label: "Category", value: "Windows" }, { label: "Standard glass", value: "5+12A+5mm Double Tempered Clear Glass" }, { label: "Hardware", value: "AMJ Standard Chain Winder" }, { label: "Profile thickness", value: "1.6mm" }, { label: "Minimum size", value: "400 × 400 mm" }, { label: "Maximum size", value: "1000 × 2400 mm" }, { label: "Air tightness", value: "Low" }, { label: "Water tightness", value: "N5" }, { label: "Wind pressure", value: "N6" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "AU Doric Brand Chain Winder", availability: "optional" }, { typeSlug: "hardware", typeName: "Hardware", name: "AMJ Standard Chain Winder", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Fiber Glass", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.3mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.5mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.8mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Aluminium", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Sub Sill & Head", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Timber Reveal", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "T Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 2,
  },
  {
    id: "3", slug: "amj100l-series-awning-window", name: "AMJ100L Series Awning Window",
    familySlug: "awning-window", categorySlug: "windows",
    shortDescription: `Larger awning window for repeatable residential modules and clean aluminium detailing.`,
    descriptionParagraphs: [`AMJ100L Series Awning Window is an awning window designed for supply-only residential and trade projects. It suits bathrooms, bedrooms, laundries and upper-level openings where controlled ventilation and weather-conscious operation are useful. It is specified with 5 + 12A + 5mm double-tempered clear glass and AMJ Standard Chain Winder as the listed hardware package. The product supports 400–1200mm wide by 400–2400mm high and uses a 1.6mm aluminium profile, with low air tightness, N5 water, N6 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "5+12A+5mm Double Tempered Clear Glass", hardware: "AMJ Standard Chain Winder",
    minWidth: 400, minHeight: 400, maxWidth: 1200, maxHeight: 2400,
    profileThickness: "1.6mm", airTightness: "Low", waterTightness: "N5", windPressure: "N6",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1774199616762-31d947dc7d35?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "1.6mm" }, { label: "Glazing", value: "Double glazed" }, { label: "Max size", value: "1200 × 2400 mm" }, { label: "Wind rating", value: "N6" }],
    specs: [{ label: "Family", value: "Awning Window" }, { label: "Category", value: "Windows" }, { label: "Standard glass", value: "5+12A+5mm Double Tempered Clear Glass" }, { label: "Hardware", value: "AMJ Standard Chain Winder" }, { label: "Profile thickness", value: "1.6mm" }, { label: "Minimum size", value: "400 × 400 mm" }, { label: "Maximum size", value: "1200 × 2400 mm" }, { label: "Air tightness", value: "Low" }, { label: "Water tightness", value: "N5" }, { label: "Wind pressure", value: "N6" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "AU Doric Brand Chain Winder", availability: "optional" }, { typeSlug: "hardware", typeName: "Hardware", name: "AMJ Standard Chain Winder", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Fiber Glass", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.3mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.5mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.8mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Aluminium", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Sub Sill & Head", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Timber Reveal", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "T Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 3,
  },
  {
    id: "4", slug: "amj100t-awning-window", name: "AMJ100T Awning Window",
    familySlug: "awning-window", categorySlug: "windows",
    shortDescription: `Higher-spec awning window with 2.0mm profile and strong N6 weather ratings.`,
    descriptionParagraphs: [`AMJ100T Awning Window is an awning window designed for supply-only residential and trade projects. It suits bathrooms, bedrooms, laundries and upper-level openings where controlled ventilation and weather-conscious operation are useful. It is specified with 5 + 12A + 5mm double-tempered clear glass and American Chain Winder as the listed hardware package. The product supports 500–1300mm wide by 500–2400mm high and uses a 2.0mm aluminium profile, with low air tightness, N6 water, N6 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "5+12A+5mm Double Tempered Clear Glass", hardware: "American Chain Winder",
    minWidth: 500, minHeight: 500, maxWidth: 1300, maxHeight: 2400,
    profileThickness: "2.0mm", airTightness: "Low", waterTightness: "N6", windPressure: "N6",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1774199616762-31d947dc7d35?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "2.0mm" }, { label: "Glazing", value: "Double glazed" }, { label: "Max size", value: "1300 × 2400 mm" }, { label: "Wind rating", value: "N6" }],
    specs: [{ label: "Family", value: "Awning Window" }, { label: "Category", value: "Windows" }, { label: "Standard glass", value: "5+12A+5mm Double Tempered Clear Glass" }, { label: "Hardware", value: "American Chain Winder" }, { label: "Profile thickness", value: "2.0mm" }, { label: "Minimum size", value: "500 × 500 mm" }, { label: "Maximum size", value: "1300 × 2400 mm" }, { label: "Air tightness", value: "Low" }, { label: "Water tightness", value: "N6" }, { label: "Wind pressure", value: "N6" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "Scissor Winder", availability: "optional" }, { typeSlug: "hardware", typeName: "Hardware", name: "American Chain Winder", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Fiber Glass", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.3mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.5mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.8mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Aluminium", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Sub Sill & Head", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Timber Reveal", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "T Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 4,
  },
  {
    id: "5", slug: "amj100t-series-awning-window", name: "AMJ100T Series Awning Window",
    familySlug: "awning-window", categorySlug: "windows",
    shortDescription: `Premium AMJ100T awning window with upgraded hardware and robust weather performance.`,
    descriptionParagraphs: [`AMJ100T Series Awning Window is an awning window designed for supply-only residential and trade projects. It suits bathrooms, bedrooms, laundries and upper-level openings where controlled ventilation and weather-conscious operation are useful. It is specified with 5 + 12A + 5mm double-tempered clear glass and AU Doric Brand Chain Winder as the listed hardware package. The product supports 500–1300mm wide by 500–2400mm high and uses a 2.0mm aluminium profile, with low air tightness, N6 water, N6 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "5+12A+5mm Double Tempered Clear Glass", hardware: "AU Doric Brand Chain Winder",
    minWidth: 500, minHeight: 500, maxWidth: 1300, maxHeight: 2400,
    profileThickness: "2.0mm", airTightness: "Low", waterTightness: "N6", windPressure: "N6",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1774199616762-31d947dc7d35?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "2.0mm" }, { label: "Glazing", value: "Double glazed" }, { label: "Max size", value: "1300 × 2400 mm" }, { label: "Wind rating", value: "N6" }],
    specs: [{ label: "Family", value: "Awning Window" }, { label: "Category", value: "Windows" }, { label: "Standard glass", value: "5+12A+5mm Double Tempered Clear Glass" }, { label: "Hardware", value: "AU Doric Brand Chain Winder" }, { label: "Profile thickness", value: "2.0mm" }, { label: "Minimum size", value: "500 × 500 mm" }, { label: "Maximum size", value: "1300 × 2400 mm" }, { label: "Air tightness", value: "Low" }, { label: "Water tightness", value: "N6" }, { label: "Wind pressure", value: "N6" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "AU Doric Brand Chain Winder", availability: "standard" }, { typeSlug: "hardware", typeName: "Hardware", name: "Scissor Winder", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Fiber Glass", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.3mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.5mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.8mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Aluminium", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Sub Sill & Head", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Timber Reveal", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "T Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 5,
  },
  {
    id: "6", slug: "amj150-series-awning-window", name: "AMJ150 Series Awning Window",
    familySlug: "awning-window", categorySlug: "windows",
    shortDescription: `Robust AMJ150 awning window for larger repeatable openings and supply-only projects.`,
    descriptionParagraphs: [`AMJ150 Series Awning Window is an awning window designed for supply-only residential and trade projects. It suits bathrooms, bedrooms, laundries and upper-level openings where controlled ventilation and weather-conscious operation are useful. It is specified with 5 + 12A + 5mm double-tempered clear glass and AMJ Standard Chain Winder as the listed hardware package. The product supports 400–1200mm wide by 400–2400mm high and uses a 2.0mm aluminium profile, with low air tightness, N5 water, N6 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "5+12A+5mm Double Tempered Clear Glass", hardware: "AMJ Standard Chain Winder",
    minWidth: 400, minHeight: 400, maxWidth: 1200, maxHeight: 2400,
    profileThickness: "2.0mm", airTightness: "Low", waterTightness: "N5", windPressure: "N6",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1774199616762-31d947dc7d35?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "2.0mm" }, { label: "Glazing", value: "Double glazed" }, { label: "Max size", value: "1200 × 2400 mm" }, { label: "Wind rating", value: "N6" }],
    specs: [{ label: "Family", value: "Awning Window" }, { label: "Category", value: "Windows" }, { label: "Standard glass", value: "5+12A+5mm Double Tempered Clear Glass" }, { label: "Hardware", value: "AMJ Standard Chain Winder" }, { label: "Profile thickness", value: "2.0mm" }, { label: "Minimum size", value: "400 × 400 mm" }, { label: "Maximum size", value: "1200 × 2400 mm" }, { label: "Air tightness", value: "Low" }, { label: "Water tightness", value: "N5" }, { label: "Wind pressure", value: "N6" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "AU Doric Brand Chain Winder", availability: "optional" }, { typeSlug: "hardware", typeName: "Hardware", name: "AMJ Standard Chain Winder", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Fiber Glass", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.3mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.5mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.8mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Aluminium", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Sub Sill & Head", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Timber Reveal", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "T Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 6,
  },
  {
    id: "7", slug: "amj65t-casement-windowoutward-opening", name: "AMJ65T Casement Window(Outward Opening)",
    familySlug: "casement-window", categorySlug: "windows",
    shortDescription: `Compact outward-opening casement window with Low-E argon glass and high weather ratings.`,
    descriptionParagraphs: [`AMJ65T Casement Window (Outward Opening) is a casement window designed for supply-only residential and trade projects. It suits rooms where clear opening, directional airflow and stronger perimeter sealing are more important than very wide spans. It is specified with 6mm Low-E + 15argon + 6mm tempered clear glass and VBH as the listed hardware package. The product supports 450–700mm wide by 600–1800mm high and uses a 2.0mm aluminium profile, with high air tightness, N6 water, N6 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "6mm Low-e+15Ar+6mm Tempered Clear Glass", hardware: "VBH",
    minWidth: 450, minHeight: 600, maxWidth: 700, maxHeight: 1800,
    profileThickness: "2.0mm", airTightness: "High", waterTightness: "N6", windPressure: "N6",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1774199616762-31d947dc7d35?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1774199616762-31d947dc7d35?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1699259160970-a42f68d2eb2e?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "2.0mm" }, { label: "Glazing", value: "Low-E double glazed" }, { label: "Max size", value: "700 × 1800 mm" }, { label: "Wind rating", value: "N6" }],
    specs: [{ label: "Family", value: "Casement Window" }, { label: "Category", value: "Windows" }, { label: "Standard glass", value: "6mm Low-e+15Ar+6mm Tempered Clear Glass" }, { label: "Hardware", value: "VBH" }, { label: "Profile thickness", value: "2.0mm" }, { label: "Minimum size", value: "450 × 600 mm" }, { label: "Maximum size", value: "700 × 1800 mm" }, { label: "Air tightness", value: "High" }, { label: "Water tightness", value: "N6" }, { label: "Wind pressure", value: "N6" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "VBH", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Fiber Glass", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.3mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.5mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.8mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Aluminium", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Sub Sill & Head", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Timber Reveal", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "T Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 7,
  },
  {
    id: "8", slug: "amj80-series-casement-window", name: "AMJ80 Series Casement Window",
    familySlug: "casement-window", categorySlug: "windows",
    shortDescription: `Practical outward-opening casement window for smaller rooms and controlled airflow.`,
    descriptionParagraphs: [`AMJ80 Series Casement Window is a casement window designed for supply-only residential and trade projects. It suits rooms where clear opening, directional airflow and stronger perimeter sealing are more important than very wide spans. It is specified with 5 + 12A + 5mm double-tempered clear glass and AMJ Standard Handle as the listed hardware package. The product supports 450–750mm wide by 500–1800mm high and uses a 1.6mm aluminium profile, with low air tightness, N6 water, N5 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "5+12A+5mm Double Tempered Clear Glass", hardware: "AMJ Standard Handle",
    minWidth: 450, minHeight: 500, maxWidth: 750, maxHeight: 1800,
    profileThickness: "1.6mm", airTightness: "Low", waterTightness: "N6", windPressure: "N5",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1774199616762-31d947dc7d35?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1774199616762-31d947dc7d35?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1699259160970-a42f68d2eb2e?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "1.6mm" }, { label: "Glazing", value: "Double glazed" }, { label: "Max size", value: "750 × 1800 mm" }, { label: "Wind rating", value: "N5" }],
    specs: [{ label: "Family", value: "Casement Window" }, { label: "Category", value: "Windows" }, { label: "Standard glass", value: "5+12A+5mm Double Tempered Clear Glass" }, { label: "Hardware", value: "AMJ Standard Handle" }, { label: "Profile thickness", value: "1.6mm" }, { label: "Minimum size", value: "450 × 500 mm" }, { label: "Maximum size", value: "750 × 1800 mm" }, { label: "Air tightness", value: "Low" }, { label: "Water tightness", value: "N6" }, { label: "Wind pressure", value: "N5" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "AU Doric Brand D Shape Handle", availability: "optional" }, { typeSlug: "hardware", typeName: "Hardware", name: "AMJ Standard Handle", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Retractable Flyscreen", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Sub Sill & Head", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Timber Reveal", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "T Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 8,
  },
  {
    id: "9", slug: "amj80-series-glass-louver4-inch", name: "AMJ80 Series Glass Louver(4 inch)",
    familySlug: "glass-louvre", categorySlug: "windows",
    shortDescription: `Four-inch glass louvre window for narrow openings and adjustable high-airflow ventilation.`,
    descriptionParagraphs: [`AMJ80 Series Glass Louvre(4 inch) is a glass louvre designed for supply-only residential and trade projects. It suits bathrooms, laundries, stairwells and narrow ventilation zones where airflow needs to be adjusted in small increments. It is specified with 6mm tempered clear glass and AMJ Standard Handle as the listed hardware package. The product supports 400–972mm wide by 400–2900mm high and uses a 2.0mm aluminium profile. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "6mm Tempered Clear Glass", hardware: "AMJ Standard Handle",
    minWidth: 400, minHeight: 400, maxWidth: 972, maxHeight: 2900,
    profileThickness: "2.0mm", airTightness: "", waterTightness: "", windPressure: "",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1699259160970-a42f68d2eb2e?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "2.0mm" }, { label: "Glazing", value: "Single tempered" }, { label: "Max size", value: "972 × 2900 mm" }],
    specs: [{ label: "Family", value: "Glass Louvre" }, { label: "Category", value: "Windows" }, { label: "Standard glass", value: "6mm Tempered Clear Glass" }, { label: "Hardware", value: "AMJ Standard Handle" }, { label: "Profile thickness", value: "2.0mm" }, { label: "Minimum size", value: "400 × 400 mm" }, { label: "Maximum size", value: "972 × 2900 mm" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "AMJ Standard Handle", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Sub Sill & Head", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Timber Reveal", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "T Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 9,
  },
  {
    id: "10", slug: "amj100l-series-glass-louver6-inch", name: "AMJ100L Series Glass Louver(6 inch)",
    familySlug: "glass-louvre", categorySlug: "windows",
    shortDescription: `Six-inch glass louvre window for taller ventilation zones and stronger blade presence.`,
    descriptionParagraphs: [`AMJ100L Series Glass Louvre(6 inch) is a glass louvre designed for supply-only residential and trade projects. It suits bathrooms, laundries, stairwells and narrow ventilation zones where airflow needs to be adjusted in small increments. It is specified with 6mm tempered clear glass and China Top Hardware as the listed hardware package. The product supports 400–1188mm wide by 400–2900mm high and uses a 2.0mm aluminium profile. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "6mm Tempered Clear Glass", hardware: "China Top Hardware",
    minWidth: 400, minHeight: 400, maxWidth: 1188, maxHeight: 2900,
    profileThickness: "2.0mm", airTightness: "", waterTightness: "", windPressure: "",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1699259160970-a42f68d2eb2e?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "2.0mm" }, { label: "Glazing", value: "Single tempered" }, { label: "Max size", value: "1188 × 2900 mm" }],
    specs: [{ label: "Family", value: "Glass Louvre" }, { label: "Category", value: "Windows" }, { label: "Standard glass", value: "6mm Tempered Clear Glass" }, { label: "Hardware", value: "China Top Hardware" }, { label: "Profile thickness", value: "2.0mm" }, { label: "Minimum size", value: "400 × 400 mm" }, { label: "Maximum size", value: "1188 × 2900 mm" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "China Top Hardware", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Fiber Glass", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.3mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.5mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.8mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Aluminium", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Sub Sill & Head", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Timber Reveal", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "T Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 10,
  },
  {
    id: "11", slug: "amj65t-tilt-and-turn-window", name: "AMJ65T Tilt&Turn Window",
    familySlug: "tilt-and-turn-window", categorySlug: "windows",
    shortDescription: `Dual-action tilt-turn window with premium hardware; source dimensions require validation.`,
    descriptionParagraphs: [`AMJ65T Tilt&Turn Window is a tilt & turn window designed for supply-only residential and trade projects. It suits projects seeking secure ventilation, inward opening access and a more premium European-style operating format. It is specified with 6mm Low-E + 15argon + 6mm tempered clear glass and VBH as the listed hardware package. The product supports listed range requires validation (900–600mm W, 2200–800mm H) and uses a 2.0mm aluminium profile, with high air tightness, N6 water, C4 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "6mm Low-e+15Ar+ómm Tempered Clear Glass", hardware: "VBH",
    minWidth: 600, minHeight: 800, maxWidth: 900, maxHeight: 2200,
    profileThickness: "2.0mm", airTightness: "High", waterTightness: "N6", windPressure: "C4",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1699259160970-a42f68d2eb2e?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1699259160970-a42f68d2eb2e?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1774199616762-31d947dc7d35?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "2.0mm" }, { label: "Glazing", value: "Low-E double glazed" }, { label: "Max size", value: "900 × 2200 mm" }, { label: "Wind rating", value: "C4" }],
    specs: [{ label: "Family", value: "Tilt & Turn Window" }, { label: "Category", value: "Windows" }, { label: "Standard glass", value: "6mm Low-e+15Ar+ómm Tempered Clear Glass" }, { label: "Hardware", value: "VBH" }, { label: "Profile thickness", value: "2.0mm" }, { label: "Minimum size", value: "600 × 800 mm" }, { label: "Maximum size", value: "900 × 2200 mm" }, { label: "Air tightness", value: "High" }, { label: "Water tightness", value: "N6" }, { label: "Wind pressure", value: "C4" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "VBH", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Fiber Glass", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.3mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.5mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.8mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Aluminium", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Nail Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Screw", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 11,
  },
  {
    id: "12", slug: "amj80t-tilt-and-turn-window", name: "AMJ80T Tilt&Turn Window",
    familySlug: "tilt-and-turn-window", categorySlug: "windows",
    shortDescription: `Dual-action tilt-turn window for secure ventilation and inward-opening access.`,
    descriptionParagraphs: [`AMJ80T Tilt&Turn Window is a tilt & turn window designed for supply-only residential and trade projects. It suits projects seeking secure ventilation, inward opening access and a more premium European-style operating format. It is specified with 6mm Low-E + 22argon + 6mm tempered clear glass and VBH as the listed hardware package. The product supports 600–900mm wide by 800–2200mm high and uses a 2.0mm aluminium profile, with high air tightness, N6 water, C4 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "6mm Low-e+22Ar+ómm Tempered Clear Glass", hardware: "VBH",
    minWidth: 600, minHeight: 800, maxWidth: 900, maxHeight: 2200,
    profileThickness: "2.0mm", airTightness: "High", waterTightness: "N6", windPressure: "C4",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1699259160970-a42f68d2eb2e?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1699259160970-a42f68d2eb2e?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1774199616762-31d947dc7d35?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "2.0mm" }, { label: "Glazing", value: "Low-E double glazed" }, { label: "Max size", value: "900 × 2200 mm" }, { label: "Wind rating", value: "C4" }],
    specs: [{ label: "Family", value: "Tilt & Turn Window" }, { label: "Category", value: "Windows" }, { label: "Standard glass", value: "6mm Low-e+22Ar+ómm Tempered Clear Glass" }, { label: "Hardware", value: "VBH" }, { label: "Profile thickness", value: "2.0mm" }, { label: "Minimum size", value: "600 × 800 mm" }, { label: "Maximum size", value: "900 × 2200 mm" }, { label: "Air tightness", value: "High" }, { label: "Water tightness", value: "N6" }, { label: "Wind pressure", value: "C4" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "VBH", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.3mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.5mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.8mm Stainless Steel", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Nail Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Screw", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 12,
  },
  {
    id: "13", slug: "amj100t-series-sashless-double-hung", name: "AMJ100T Series Sashless Double Hung",
    familySlug: "sashless-double-hung", categorySlug: "windows",
    shortDescription: `Sashless double hung window for taller openings with clean glass-forward sightlines.`,
    descriptionParagraphs: [`AMJ100T Series Sashless Double Hung is a sashless double hung designed for supply-only residential and trade projects. It suits taller contemporary openings where vertical ventilation and clean glass lines are desired. It is specified with 5 + 8A + 5mm double-tempered clear glass and AU Ciilock Hardware&Acrylic Handle as the listed hardware package. The product supports 400–1300mm wide by 1000–3000mm high and uses a 2.0mm aluminium profile, with low air tightness, N3 water, N3 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "5+8A+5mm Double Tempered Clear Glass", hardware: "AU Ciilock Hardware&Acrylic Handle",
    minWidth: 400, minHeight: 1000, maxWidth: 1300, maxHeight: 3000,
    profileThickness: "2.0mm", airTightness: "Low", waterTightness: "N3", windPressure: "N3",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1774199616762-31d947dc7d35?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "2.0mm" }, { label: "Glazing", value: "Double glazed" }, { label: "Max size", value: "1300 × 3000 mm" }, { label: "Wind rating", value: "N3" }],
    specs: [{ label: "Family", value: "Sashless Double Hung" }, { label: "Category", value: "Windows" }, { label: "Standard glass", value: "5+8A+5mm Double Tempered Clear Glass" }, { label: "Hardware", value: "AU Ciilock Hardware&Acrylic Handle" }, { label: "Profile thickness", value: "2.0mm" }, { label: "Minimum size", value: "400 × 1000 mm" }, { label: "Maximum size", value: "1300 × 3000 mm" }, { label: "Air tightness", value: "Low" }, { label: "Water tightness", value: "N3" }, { label: "Wind pressure", value: "N3" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "AU Ciilock Hardware&Acrylic Handle", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.3mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.5mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.8mm Stainless Steel", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Sub Sill & Head", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Timber Reveal", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "T Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 13,
  },
  {
    id: "14", slug: "amj100t-single-hung-window", name: "AMJ100T Single Hung Window",
    familySlug: "single-hung-window", categorySlug: "windows",
    shortDescription: `Single hung aluminium window for compact vertical-sliding replacement applications.`,
    descriptionParagraphs: [`AMJ100T Single Hung Window is a single hung window designed for supply-only residential and trade projects. It suits compact replacement openings and rooms where a familiar vertical-sliding operation is preferred. It is specified with 5mm Low-E + 9argon + 5mm tempered clear glass and Caldwell as the listed hardware package. The product supports 500–1000mm wide by 1000–2400mm high and uses a 1.6mm aluminium profile, with low air tightness, N5 water, N3 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "5mm Low-e+9Ar+5mm Tempered Clear Glass", hardware: "Caldwell",
    minWidth: 500, minHeight: 1000, maxWidth: 1000, maxHeight: 2400,
    profileThickness: "1.6mm", airTightness: "Low", waterTightness: "N5", windPressure: "N3",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1774199616762-31d947dc7d35?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1774199616762-31d947dc7d35?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1699259160970-a42f68d2eb2e?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "1.6mm" }, { label: "Glazing", value: "Low-E double glazed" }, { label: "Max size", value: "1000 × 2400 mm" }, { label: "Wind rating", value: "N3" }],
    specs: [{ label: "Family", value: "Single Hung Window" }, { label: "Category", value: "Windows" }, { label: "Standard glass", value: "5mm Low-e+9Ar+5mm Tempered Clear Glass" }, { label: "Hardware", value: "Caldwell" }, { label: "Profile thickness", value: "1.6mm" }, { label: "Minimum size", value: "500 × 1000 mm" }, { label: "Maximum size", value: "1000 × 2400 mm" }, { label: "Air tightness", value: "Low" }, { label: "Water tightness", value: "N5" }, { label: "Wind pressure", value: "N3" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "Caldwell", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Fiber Glass", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.3mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.5mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.8mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Aluminium", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Nail Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Screw", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 14,
  },
  {
    id: "15", slug: "amj80-series-sliding-door", name: "AMJ80 Series Sliding door",
    familySlug: "sliding-door", categorySlug: "doors",
    shortDescription: `Compact aluminium sliding door for smaller patio, balcony or utility openings.`,
    descriptionParagraphs: [`AMJ80 Series Sliding Door is a sliding door designed for supply-only residential and trade projects. It suits patios, balconies and living-area connections where large glass area is required without door-swing clearance. It is specified with 5 + 8A + 5mm double-tempered clear glass and AMJ Standard D Shape Handle as the listed hardware package. The product supports 750–2000mm wide by 550–1500mm high and uses a 1.8mm aluminium profile, with high air tightness, N4 water, N4 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "5+8A+5mm Double Tempered Clear Glass", hardware: "AMJ Standard D Shape Handle",
    minWidth: 750, minHeight: 550, maxWidth: 2000, maxHeight: 1500,
    profileThickness: "1.8mm", airTightness: "High", waterTightness: "N4", windPressure: "N4",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1758998202918-d921125a700f?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1758998202918-d921125a700f?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1743510935745-b0cd869db5e8?w=1600&h=1000&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "1.8mm" }, { label: "Glazing", value: "Double glazed" }, { label: "Max size", value: "2000 × 1500 mm" }, { label: "Wind rating", value: "N4" }],
    specs: [{ label: "Family", value: "Sliding Door" }, { label: "Category", value: "Doors" }, { label: "Standard glass", value: "5+8A+5mm Double Tempered Clear Glass" }, { label: "Hardware", value: "AMJ Standard D Shape Handle" }, { label: "Profile thickness", value: "1.8mm" }, { label: "Minimum size", value: "750 × 550 mm" }, { label: "Maximum size", value: "2000 × 1500 mm" }, { label: "Air tightness", value: "High" }, { label: "Water tightness", value: "N4" }, { label: "Wind pressure", value: "N4" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "AU Doric Brand D Shape Handle", availability: "optional" }, { typeSlug: "hardware", typeName: "Hardware", name: "AMJ Standard D Shape Handle", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Fiber Glass", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.3mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.5mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.8mm Stainless Steel", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Sub Sill & Head", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Timber Reveal", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "T Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 15,
  },
  {
    id: "16", slug: "amj100l-series-sliding-door", name: "AMJ100L Series Sliding door",
    familySlug: "sliding-door", categorySlug: "doors",
    shortDescription: `Taller AMJ100L sliding door for residential indoor-outdoor connections.`,
    descriptionParagraphs: [`AMJ100L Series Sliding Door is a sliding door designed for supply-only residential and trade projects. It suits patios, balconies and living-area connections where large glass area is required without door-swing clearance. It is specified with 5 + 8A + 5mm double-tempered clear glass and AMJ Standard D Shape Handle as the listed hardware package. The product supports 750–2000mm wide by 550–2800mm high and uses a 1.8mm aluminium profile, with high air tightness, N4 water, N4 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "5+8A+5mm Double Tempered Clear Glass", hardware: "AMJ Standard D Shape Handle",
    minWidth: 750, minHeight: 550, maxWidth: 2000, maxHeight: 2800,
    profileThickness: "1.8mm", airTightness: "High", waterTightness: "N4", windPressure: "N4",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1758998202918-d921125a700f?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1758998202918-d921125a700f?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1743510935745-b0cd869db5e8?w=1600&h=1000&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "1.8mm" }, { label: "Glazing", value: "Double glazed" }, { label: "Max size", value: "2000 × 2800 mm" }, { label: "Wind rating", value: "N4" }],
    specs: [{ label: "Family", value: "Sliding Door" }, { label: "Category", value: "Doors" }, { label: "Standard glass", value: "5+8A+5mm Double Tempered Clear Glass" }, { label: "Hardware", value: "AMJ Standard D Shape Handle" }, { label: "Profile thickness", value: "1.8mm" }, { label: "Minimum size", value: "750 × 550 mm" }, { label: "Maximum size", value: "2000 × 2800 mm" }, { label: "Air tightness", value: "High" }, { label: "Water tightness", value: "N4" }, { label: "Wind pressure", value: "N4" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "AU Doric Brand Chain Winder", availability: "optional" }, { typeSlug: "hardware", typeName: "Hardware", name: "AU Ciilock Brand D Shape Handle", availability: "optional" }, { typeSlug: "hardware", typeName: "Hardware", name: "AMJ Standard D Shape Handle", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Fiber Glass", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.3mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.5mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.8mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Aluminium", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Sub Sill & Head", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Timber Reveal", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "T Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 16,
  },
  {
    id: "17", slug: "amj100t-series-sliding-door", name: "AMJ100T Series Sliding Door",
    familySlug: "sliding-door", categorySlug: "doors",
    shortDescription: `AMJ100T sliding door for larger openings with upgraded hardware and double glazing.`,
    descriptionParagraphs: [`AMJ100T Series Sliding Door is a sliding door designed for supply-only residential and trade projects. It suits patios, balconies and living-area connections where large glass area is required without door-swing clearance. It is specified with 5 + 12A + 5mm double-tempered clear glass and AU Ciilock Brand D Shape Handle as the listed hardware package. The product supports 1000–3000mm wide by 2800–2800mm high and uses a 2.0mm aluminium profile, with low air tightness, N5 water, N4 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "5+12A+5mm Double Tempered Clear Glass", hardware: "AU Ciilock Brand D Shape Handle",
    minWidth: 1000, minHeight: 2800, maxWidth: 3000, maxHeight: 2800,
    profileThickness: "2.0mm", airTightness: "Low", waterTightness: "N5", windPressure: "N4",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1758998202918-d921125a700f?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1758998202918-d921125a700f?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1743510935745-b0cd869db5e8?w=1600&h=1000&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "2.0mm" }, { label: "Glazing", value: "Double glazed" }, { label: "Max size", value: "3000 × 2800 mm" }, { label: "Wind rating", value: "N4" }],
    specs: [{ label: "Family", value: "Sliding Door" }, { label: "Category", value: "Doors" }, { label: "Standard glass", value: "5+12A+5mm Double Tempered Clear Glass" }, { label: "Hardware", value: "AU Ciilock Brand D Shape Handle" }, { label: "Profile thickness", value: "2.0mm" }, { label: "Minimum size", value: "1000 × 2800 mm" }, { label: "Maximum size", value: "3000 × 2800 mm" }, { label: "Air tightness", value: "Low" }, { label: "Water tightness", value: "N5" }, { label: "Wind pressure", value: "N4" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "AU Doric Brand D Shape Handle", availability: "optional" }, { typeSlug: "hardware", typeName: "Hardware", name: "AU Ciilock Brand D Shape Handle", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.3mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.5mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.8mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Aluminium", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Sub Sill & Head", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Timber Reveal", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "T Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 17,
  },
  {
    id: "18", slug: "amj150-series-sliding-door", name: "AMJ150 Series Sliding Door",
    familySlug: "sliding-door", categorySlug: "doors",
    shortDescription: `Large AMJ150 sliding door with high air tightness and stronger weather performance.`,
    descriptionParagraphs: [`AMJ150 Series Sliding Door is a sliding door designed for supply-only residential and trade projects. It suits patios, balconies and living-area connections where large glass area is required without door-swing clearance. It is specified with 5 + 12A + 5mm double-tempered clear glass and AMJ Standard D Shape Handle as the listed hardware package. The product supports 1000–3000mm wide by 550–3200mm high and uses a 2.0mm aluminium profile, with high air tightness, N5 water, N5 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "5+12A+5mm Double Tempered Clear Glass", hardware: "AMJ Standard D Shape Handle",
    minWidth: 1000, minHeight: 550, maxWidth: 3000, maxHeight: 3200,
    profileThickness: "2.0mm", airTightness: "High", waterTightness: "N5", windPressure: "N5",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1758998202918-d921125a700f?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1758998202918-d921125a700f?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1743510935745-b0cd869db5e8?w=1600&h=1000&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "2.0mm" }, { label: "Glazing", value: "Double glazed" }, { label: "Max size", value: "3000 × 3200 mm" }, { label: "Wind rating", value: "N5" }],
    specs: [{ label: "Family", value: "Sliding Door" }, { label: "Category", value: "Doors" }, { label: "Standard glass", value: "5+12A+5mm Double Tempered Clear Glass" }, { label: "Hardware", value: "AMJ Standard D Shape Handle" }, { label: "Profile thickness", value: "2.0mm" }, { label: "Minimum size", value: "1000 × 550 mm" }, { label: "Maximum size", value: "3000 × 3200 mm" }, { label: "Air tightness", value: "High" }, { label: "Water tightness", value: "N5" }, { label: "Wind pressure", value: "N5" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "AU Doric Brand D Shape Handle", availability: "optional" }, { typeSlug: "hardware", typeName: "Hardware", name: "AU Ciilock Brand D Shape Handle", availability: "optional" }, { typeSlug: "hardware", typeName: "Hardware", name: "AMJ Standard D Shape Handle", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.3mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.5mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.8mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Aluminium", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Sub Sill & Head", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Timber Reveal", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "T Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 18,
  },
  {
    id: "19", slug: "amj65t-casement-door", name: "AMJ65T Casement Door",
    familySlug: "casement-door", categorySlug: "doors",
    shortDescription: `Single hinged casement door with Low-E argon glass for high-performance access points.`,
    descriptionParagraphs: [`AMJ65T Casement Door is a casement door designed for supply-only residential and trade projects. It suits side entries, balconies and functional access points where a hinged aluminium door is preferred. It is specified with 6mm Low-E + 15argon + 6mm tempered clear glass and HK KinLong as the listed hardware package. The product supports 600–1300mm wide by 1500–3500mm high and uses a 2.0mm aluminium profile, with high air tightness, N6 water, C4 wind ratings listed in the catalogue. The catalogue note for this item is: Single Casement Door Only. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "6mm Low-e+15Ar+6mm Tempered Clear Glass", hardware: "HK KinLong",
    minWidth: 600, minHeight: 1500, maxWidth: 1300, maxHeight: 3500,
    profileThickness: "2.0mm", airTightness: "High", waterTightness: "N6", windPressure: "C4",
    notes: "Single Casement Door Only",
    heroImage: "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1743510935745-b0cd869db5e8?w=1600&h=1000&fit=crop&auto=format", "https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "2.0mm" }, { label: "Glazing", value: "Low-E double glazed" }, { label: "Max size", value: "1300 × 3500 mm" }, { label: "Wind rating", value: "C4" }],
    specs: [{ label: "Family", value: "Casement Door" }, { label: "Category", value: "Doors" }, { label: "Standard glass", value: "6mm Low-e+15Ar+6mm Tempered Clear Glass" }, { label: "Hardware", value: "HK KinLong" }, { label: "Profile thickness", value: "2.0mm" }, { label: "Minimum size", value: "600 × 1500 mm" }, { label: "Maximum size", value: "1300 × 3500 mm" }, { label: "Air tightness", value: "High" }, { label: "Water tightness", value: "N6" }, { label: "Wind pressure", value: "C4" }, { label: "Notes", value: "Single Casement Door Only" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "VBH", availability: "optional" }, { typeSlug: "hardware", typeName: "Hardware", name: "HK KinLong", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.5mm Stainless Steel", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "0.8mm Stainless Steel", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Nail Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Screw", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 19,
  },
  {
    id: "20", slug: "amj80t-casement-door", name: "AMJ80T Casement Door",
    familySlug: "casement-door", categorySlug: "doors",
    shortDescription: `Low-E argon casement door for hinged access openings up to 3500mm high.`,
    descriptionParagraphs: [`AMJ80T Casement Door is a casement door designed for supply-only residential and trade projects. It suits side entries, balconies and functional access points where a hinged aluminium door is preferred. It is specified with 6mm Low-E + 22argon + 6mm tempered clear glass and HK KinLong as the listed hardware package. The product supports 600–1300mm wide by 1500–3500mm high and uses a 2.0mm aluminium profile, with high air tightness, N6 water, C4 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "6mm Low-e+22Ar+6mm Tempered Clear Glass", hardware: "HK KinLong",
    minWidth: 600, minHeight: 1500, maxWidth: 1300, maxHeight: 3500,
    profileThickness: "2.0mm", airTightness: "High", waterTightness: "N6", windPressure: "C4",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1743510935745-b0cd869db5e8?w=1600&h=1000&fit=crop&auto=format", "https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "2.0mm" }, { label: "Glazing", value: "Low-E double glazed" }, { label: "Max size", value: "1300 × 3500 mm" }, { label: "Wind rating", value: "C4" }],
    specs: [{ label: "Family", value: "Casement Door" }, { label: "Category", value: "Doors" }, { label: "Standard glass", value: "6mm Low-e+22Ar+6mm Tempered Clear Glass" }, { label: "Hardware", value: "HK KinLong" }, { label: "Profile thickness", value: "2.0mm" }, { label: "Minimum size", value: "600 × 1500 mm" }, { label: "Maximum size", value: "1300 × 3500 mm" }, { label: "Air tightness", value: "High" }, { label: "Water tightness", value: "N6" }, { label: "Wind pressure", value: "C4" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "HK KinLong", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Retractable Flyscreen", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Nail Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Screw", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 20,
  },
  {
    id: "21", slug: "amj100l-series-casement-door", name: "AMJ100L Series Casement Door",
    familySlug: "casement-door", categorySlug: "doors",
    shortDescription: `Compact casement door with double glazing for functional side-entry applications.`,
    descriptionParagraphs: [`AMJ100L Series Casement Door is a casement door designed for supply-only residential and trade projects. It suits side entries, balconies and functional access points where a hinged aluminium door is preferred. It is specified with 5 + 12A + 5mm double-tempered clear glass and AMJ Standard Handle as the listed hardware package. The product supports 600–900mm wide by 1900–2400mm high and uses a 2.0mm aluminium profile, with low air tightness, N6 water, N5 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "5+12A+5mm Double Tempered Clear Glass", hardware: "AMJ Standard Handle",
    minWidth: 600, minHeight: 1900, maxWidth: 900, maxHeight: 2400,
    profileThickness: "2.0mm", airTightness: "Low", waterTightness: "N6", windPressure: "N5",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1743510935745-b0cd869db5e8?w=1600&h=1000&fit=crop&auto=format", "https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "2.0mm" }, { label: "Glazing", value: "Double glazed" }, { label: "Max size", value: "900 × 2400 mm" }, { label: "Wind rating", value: "N5" }],
    specs: [{ label: "Family", value: "Casement Door" }, { label: "Category", value: "Doors" }, { label: "Standard glass", value: "5+12A+5mm Double Tempered Clear Glass" }, { label: "Hardware", value: "AMJ Standard Handle" }, { label: "Profile thickness", value: "2.0mm" }, { label: "Minimum size", value: "600 × 1900 mm" }, { label: "Maximum size", value: "900 × 2400 mm" }, { label: "Air tightness", value: "Low" }, { label: "Water tightness", value: "N6" }, { label: "Wind pressure", value: "N5" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "AU Novas Brand Handle", availability: "optional" }, { typeSlug: "hardware", typeName: "Hardware", name: "AMJ Standard Handle", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Retractable Flyscreen", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Sub Sill & Head", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Timber Reveal", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "T Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 21,
  },
  {
    id: "22", slug: "amj100t-series-casement-door", name: "AMJ100T Series Casement Door",
    familySlug: "casement-door", categorySlug: "doors",
    shortDescription: `Wider AMJ100T casement door for hinged openings requiring double glazing and N6 water rating.`,
    descriptionParagraphs: [`AMJ100T Series Casement Door is a casement door designed for supply-only residential and trade projects. It suits side entries, balconies and functional access points where a hinged aluminium door is preferred. It is specified with 5 + 12A + 5mm double-tempered clear glass and China Kin Long Brand Handle as the listed hardware package. The product supports 1000–2000mm wide by 1900–2600mm high and uses a 2.0mm aluminium profile, with low air tightness, N6 water, N5 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "5+12A+5mm Double Tempered Clear Glass", hardware: "China Kin Long Brand Handle",
    minWidth: 1000, minHeight: 1900, maxWidth: 2000, maxHeight: 2600,
    profileThickness: "2.0mm", airTightness: "Low", waterTightness: "N6", windPressure: "N5",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1743510935745-b0cd869db5e8?w=1600&h=1000&fit=crop&auto=format", "https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "2.0mm" }, { label: "Glazing", value: "Double glazed" }, { label: "Max size", value: "2000 × 2600 mm" }, { label: "Wind rating", value: "N5" }],
    specs: [{ label: "Family", value: "Casement Door" }, { label: "Category", value: "Doors" }, { label: "Standard glass", value: "5+12A+5mm Double Tempered Clear Glass" }, { label: "Hardware", value: "China Kin Long Brand Handle" }, { label: "Profile thickness", value: "2.0mm" }, { label: "Minimum size", value: "1000 × 1900 mm" }, { label: "Maximum size", value: "2000 × 2600 mm" }, { label: "Air tightness", value: "Low" }, { label: "Water tightness", value: "N6" }, { label: "Wind pressure", value: "N5" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "AU Novas Brand Handle", availability: "optional" }, { typeSlug: "hardware", typeName: "Hardware", name: "China Kin Long Brand Handle", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Retractable Flyscreen", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Sub Sill & Head", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Timber Reveal", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "T Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 22,
  },
  {
    id: "23", slug: "amj68-series-bi-fold-door", name: "AMJ68 Series Bi-Fold Door",
    familySlug: "bi-fold-door", categorySlug: "doors",
    shortDescription: `AMJ68 bi-fold door for wide openings and flexible indoor-outdoor connections.`,
    descriptionParagraphs: [`AMJ68 Series Bi-Fold Door is a bi-fold door designed for supply-only residential and trade projects. It suits alfresco and entertaining openings where multiple panels need to fold away to create a wider connection. It is specified with 5 + 12A + 5mm double-tempered clear glass and KSBG as the listed hardware package. The product supports 1100–4500mm wide by 650–3000mm high and uses a 1.8mm aluminium profile, with high air tightness, N3 water, N4 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "5+12A+5mm DoubleTempered Clear Glass", hardware: "KSBG",
    minWidth: 1100, minHeight: 650, maxWidth: 4500, maxHeight: 3000,
    profileThickness: "1.8mm", airTightness: "High", waterTightness: "N3", windPressure: "N4",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1743510935745-b0cd869db5e8?w=1600&h=1000&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1743510935745-b0cd869db5e8?w=1600&h=1000&fit=crop&auto=format", "https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1758998202918-d921125a700f?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "1.8mm" }, { label: "Glazing", value: "Double glazed" }, { label: "Max size", value: "4500 × 3000 mm" }, { label: "Wind rating", value: "N4" }],
    specs: [{ label: "Family", value: "Bi-Fold Door" }, { label: "Category", value: "Doors" }, { label: "Standard glass", value: "5+12A+5mm DoubleTempered Clear Glass" }, { label: "Hardware", value: "KSBG" }, { label: "Profile thickness", value: "1.8mm" }, { label: "Minimum size", value: "1100 × 650 mm" }, { label: "Maximum size", value: "4500 × 3000 mm" }, { label: "Air tightness", value: "High" }, { label: "Water tightness", value: "N3" }, { label: "Wind pressure", value: "N4" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "KSBG", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Retractable Flyscreen", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Sub Sill & Head", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Timber Reveal", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "T Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 23,
  },
  {
    id: "24", slug: "amj80t-bi-fold-door", name: "AMJ80T Bi-Fold Door",
    familySlug: "bi-fold-door", categorySlug: "doors",
    shortDescription: `Higher-performance AMJ80T bi-fold door with Low-E argon glass for large openings.`,
    descriptionParagraphs: [`AMJ80T Bi-Fold Door is a bi-fold door designed for supply-only residential and trade projects. It suits alfresco and entertaining openings where multiple panels need to fold away to create a wider connection. It is specified with 6mm Low-E + 25argon + 6mm tempered clear glass and KSBG as the listed hardware package. The product supports 1000–4500mm wide by 1500–3500mm high and uses a 2.0mm aluminium profile, with high air tightness, N6 water, N5 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "6mm Low-e+25Ar+6mm Tempered Clear Glass", hardware: "KSBG",
    minWidth: 1000, minHeight: 1500, maxWidth: 4500, maxHeight: 3500,
    profileThickness: "2.0mm", airTightness: "High", waterTightness: "N6", windPressure: "N5",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1743510935745-b0cd869db5e8?w=1600&h=1000&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1743510935745-b0cd869db5e8?w=1600&h=1000&fit=crop&auto=format", "https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1758998202918-d921125a700f?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "2.0mm" }, { label: "Glazing", value: "Low-E double glazed" }, { label: "Max size", value: "4500 × 3500 mm" }, { label: "Wind rating", value: "N5" }],
    specs: [{ label: "Family", value: "Bi-Fold Door" }, { label: "Category", value: "Doors" }, { label: "Standard glass", value: "6mm Low-e+25Ar+6mm Tempered Clear Glass" }, { label: "Hardware", value: "KSBG" }, { label: "Profile thickness", value: "2.0mm" }, { label: "Minimum size", value: "1000 × 1500 mm" }, { label: "Maximum size", value: "4500 × 3500 mm" }, { label: "Air tightness", value: "High" }, { label: "Water tightness", value: "N6" }, { label: "Wind pressure", value: "N5" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "KSBG", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Retractable Flyscreen", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Screw", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 24,
  },
  {
    id: "25", slug: "amj100-series-pivot-door", name: "AMJ100 Series Pivot Door",
    familySlug: "pivot-door", categorySlug: "doors",
    shortDescription: `Statement aluminium pivot door for contemporary entries and feature façade openings.`,
    descriptionParagraphs: [`AMJ100 Series Pivot Door is a pivot door designed for supply-only residential and trade projects. It suits contemporary entries and façade features where the door is intended to make a stronger architectural statement. It is specified with 5 + 12A + 5mm double-tempered clear glass and AMJ Standard Handle as the listed hardware package. The product supports 600–1500mm wide by 1900–3000mm high and uses a 2.0mm aluminium profile. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "5+12A+5mm DoubleTempered Clear Glass", hardware: "AMJ Standard Handle",
    minWidth: 600, minHeight: 1900, maxWidth: 1500, maxHeight: 3000,
    profileThickness: "2.0mm", airTightness: "", waterTightness: "", windPressure: "",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1758998202918-d921125a700f?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "2.0mm" }, { label: "Glazing", value: "Double glazed" }, { label: "Max size", value: "1500 × 3000 mm" }],
    specs: [{ label: "Family", value: "Pivot Door" }, { label: "Category", value: "Doors" }, { label: "Standard glass", value: "5+12A+5mm DoubleTempered Clear Glass" }, { label: "Hardware", value: "AMJ Standard Handle" }, { label: "Profile thickness", value: "2.0mm" }, { label: "Minimum size", value: "600 × 1900 mm" }, { label: "Maximum size", value: "1500 × 3000 mm" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "AU Novas Brand Handle", availability: "optional" }, { typeSlug: "hardware", typeName: "Hardware", name: "AMJ Standard Handle", availability: "standard" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "Retractable Flyscreen", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Sub Sill & Head", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Timber Reveal", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "T Fin", availability: "optional" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 25,
  },
  {
    id: "26", slug: "amj125t-slim-frame-sliding-door", name: "AMJ125T Slim-frame Sliding Door",
    familySlug: "slim-frame-sliding-door", categorySlug: "doors",
    shortDescription: `Premium slim-frame sliding door for large glazed openings and refined architectural sightlines.`,
    descriptionParagraphs: [`AMJ125T Slim-frame Sliding Door is a slim frame sliding door designed for supply-only residential and trade projects. It suits premium living areas and view-facing façades where reduced frame bulk and larger glass areas are desirable. It is specified with 6mm Low-E + 25argon + 6mm tempered clear glass and Baogao as the listed hardware package. The product supports 1200–5000mm wide by 1500–3500mm high and uses a 3.0mm aluminium profile, with high air tightness, N3 water, N4 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "6mm Low-e+25Argon+6mm Tempered Clear Glass", hardware: "Baogao",
    minWidth: 1200, minHeight: 1500, maxWidth: 5000, maxHeight: 3500,
    profileThickness: "3.0mm", airTightness: "High", waterTightness: "N3", windPressure: "N4",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1758998202918-d921125a700f?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1758998202918-d921125a700f?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1743510935745-b0cd869db5e8?w=1600&h=1000&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "3.0mm" }, { label: "Glazing", value: "Low-E double glazed" }, { label: "Max size", value: "5000 × 3500 mm" }, { label: "Wind rating", value: "N4" }],
    specs: [{ label: "Family", value: "Slim-Frame Sliding Door" }, { label: "Category", value: "Doors" }, { label: "Standard glass", value: "6mm Low-e+25Argon+6mm Tempered Clear Glass" }, { label: "Hardware", value: "Baogao" }, { label: "Profile thickness", value: "3.0mm" }, { label: "Minimum size", value: "1200 × 1500 mm" }, { label: "Maximum size", value: "5000 × 3500 mm" }, { label: "Air tightness", value: "High" }, { label: "Water tightness", value: "N3" }, { label: "Wind pressure", value: "N4" }],
    options: [{ typeSlug: "hardware", typeName: "Hardware", name: "VBH", availability: "standard" }, { typeSlug: "hardware", typeName: "Hardware", name: "Baogao", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Screw", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 26,
  },
  {
    id: "27", slug: "amj150t-lift-sliding-door", name: "AMJ150T Lift-Sliding Door",
    familySlug: "lift-slide-door", categorySlug: "doors",
    shortDescription: `Lift-slide aluminium door for large openings needing smooth operation and stronger sealing.`,
    descriptionParagraphs: [`AMJ150T Lift-Sliding Door is a lift-sliding door designed for supply-only residential and trade projects. It suits substantial living-area openings where large glazed panels, smooth operation and higher sealing performance are required. It is specified with 6mm Low-E + 25argon + 6mm tempered clear glass and VBH as the listed hardware package. The product supports 1200–4000mm wide by 1500–3500mm high and uses a 2.0mm aluminium profile, with high air tightness, N6 water, N5 wind ratings listed in the catalogue. Final dimensions, configuration and installation details should be confirmed during review before manufacture.`],
    standardGlass: "6mm Low-e+25Ar+6mm Tempered Clear Glass", hardware: "VBH",
    minWidth: 1200, minHeight: 1500, maxWidth: 4000, maxHeight: 3500,
    profileThickness: "2.0mm", airTightness: "High", waterTightness: "N6", windPressure: "N5",
    notes: "",
    heroImage: "https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format",
    gallery: ["https://images.unsplash.com/photo-1580687104004-8e9b3d462526?w=1200&h=900&fit=crop&auto=format", "https://images.unsplash.com/photo-1743510935745-b0cd869db5e8?w=1600&h=1000&fit=crop&auto=format", "https://images.unsplash.com/photo-1614595737476-42487331b8a1?w=1200&h=900&fit=crop&auto=format"],
    keySpecs: [{ label: "Frame profile", value: "2.0mm" }, { label: "Glazing", value: "Low-E double glazed" }, { label: "Max size", value: "4000 × 3500 mm" }, { label: "Wind rating", value: "N5" }],
    specs: [{ label: "Family", value: "Lift-Slide Door" }, { label: "Category", value: "Doors" }, { label: "Standard glass", value: "6mm Low-e+25Ar+6mm Tempered Clear Glass" }, { label: "Hardware", value: "VBH" }, { label: "Profile thickness", value: "2.0mm" }, { label: "Minimum size", value: "1200 × 1500 mm" }, { label: "Maximum size", value: "4000 × 3500 mm" }, { label: "Air tightness", value: "High" }, { label: "Water tightness", value: "N6" }, { label: "Wind pressure", value: "N5" }],
    options: [{ typeSlug: "installation", typeName: "Installation", name: "Bracket", availability: "standard" }, { typeSlug: "installation", typeName: "Installation", name: "Screw", availability: "optional" }, { typeSlug: "flyscreen", typeName: "Flyscreen", name: "None", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Standard Powercoat", availability: "standard" }, { typeSlug: "colour", typeName: "Colour", name: "Anodised", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Woodgrain", availability: "optional" }, { typeSlug: "colour", typeName: "Colour", name: "Custom Colour", availability: "optional" }],
    featuredOrder: 27,
  },
];

export const products: Product[] = productDefinitions.map(product => ({
  ...product,
  options: [
    ...product.options.filter(option => option.typeSlug !== "colour"),
    ...colorbondColourOptions,
  ],
}));

// ─── Selectors (future GROQ query boundary) ──────────────────────────────────
export const getCategories = (): Category[] => categories;
export const getCategory = (slug: string): Category | undefined => categories.find(c => c.slug === slug);
export const getFamiliesByCategory = (categorySlug: string): Family[] => families.filter(f => f.categorySlug === categorySlug);
export const getFamily = (slug: string): Family | undefined => families.find(f => f.slug === slug);
export const getProductBySlug = (slug: string): Product | undefined => products.find(p => p.slug === slug);
export const getProductsByCategory = (categorySlug: string): Product[] =>
  products.filter(p => p.categorySlug === categorySlug).sort((a, b) => a.featuredOrder - b.featuredOrder);
export const getProductsByFamily = (familySlug: string): Product[] =>
  products.filter(p => p.familySlug === familySlug).sort((a, b) => a.featuredOrder - b.featuredOrder);
export const getRelatedProducts = (slug: string, limit = 3): Product[] => {
  const p = getProductBySlug(slug);
  if (!p) return [];
  return products.filter(x => x.familySlug === p.familySlug && x.slug !== p.slug).slice(0, limit);
};
export const familyProductCount = (familySlug: string): number =>
  products.filter(p => p.familySlug === familySlug).length;
