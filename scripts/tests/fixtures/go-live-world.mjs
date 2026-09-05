import { NEW_PROFILES, KEEP_PUBLISHED, P, DISABLE, HW, DEFAULT_COLOUR } from "../../catalogue/go-live-plan.mjs";

function glazingOptionsFromNewProfiles() {
  const seen = new Map();
  for (const profile of NEW_PROFILES) {
    for (const row of profile.rows) {
      const id = row.glazing._ref;
      if (!seen.has(id)) seen.set(id, { _id: id, _type: "option", name: id, isDefault: false, type: "glazingType" });
    }
  }
  return [...seen.values()];
}

export function makeWorld() {
  const systems = [
    { _id: "system-80", slug: "sys-80" },
    { _id: "system-100", slug: "sys-100" },
    { _id: "system-150", slug: "sys-150" },
  ];
  const hardware = Object.values(HW).map((id) => ({ _id: id, name: id, type: "hardware" }));
  const colours = [{ _id: DEFAULT_COLOUR, name: "Night Sky", isDefault: true, type: "colour" }];
  const options = [...glazingOptionsFromNewProfiles(), ...hardware, ...colours];

  const profiles = Object.entries(KEEP_PUBLISHED).map(([id, keep]) => {
    const kept = { _key: "keep", glazing: keep.glazing ?? "glz-existing", wersWindowId: keep.wers ?? null, published: true, uValue: 3.0, shgc: 0.4 };
    const other = { _key: "other", glazing: "glz-other", wersWindowId: null, published: false, uValue: 3.5, shgc: 0.5 };
    return { _id: id, rows: [kept, other] };
  });

  const products = new Map();
  for (const p of P) {
    if (p.create) continue; // not yet created
    products.set(p.slug, {
      _id: `product-${p.slug}`,
      slug: { current: p.slug },
      name: p.name ?? null,
      familyName: "Existing Family",
      categoryName: "Existing Category",
      operation: "existing",
      options: [],
      dimensionRule: {},
      seo: {},
    });
  }
  for (const slug of DISABLE) {
    products.set(slug, { _id: `product-${slug}`, slug: { current: slug }, disabled: false });
  }

  const fullProfiles = NEW_PROFILES.map((p) => JSON.parse(JSON.stringify(p)));

  const families = [{ _id: "family-awning-window", name: "Awning Window" }];
  const categories = [{ _id: "category-windows", name: "Windows" }];

  return { products, families, categories, systems, profiles, options, fullProfiles };
}

// Returns a copy of world with one field of one fullProfiles doc changed —
// for drift tests (plan() must then re-createOrReplace that doc).
export function altered(world, docId, field, value) {
  const fullProfiles = world.fullProfiles.map((p) => (p._id === docId ? { ...p, [field]: value } : p));
  return { ...world, fullProfiles };
}

export function makeTransport(world) {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ method: init.method ?? "GET", url, body: init.body ? JSON.parse(init.body) : undefined });
    if ((init.method ?? "GET") === "POST") {
      return { ok: true, status: 200, json: async () => ({ transactionId: "fake" }), text: async () => "{}" };
    }
    const u = new URL(url);
    const groq = u.searchParams.get("query") ?? "";
    let result;
    if (groq.includes('"families"')) {
      result = { families: world.families, categories: world.categories, systems: world.systems, profiles: world.profiles, fullProfiles: world.fullProfiles, options: world.options };
    } else if (groq.includes("order(slug.current asc)")) {
      // Estimator-view query: every product, on-sheet and off-sheet — see runVerify().
      const profileRows = new Map([...world.profiles, ...world.fullProfiles].map((p) => [p._id, p]));
      const systemSlugById = new Map(world.systems.map((s) => [s._id, s.slug]));
      result = [...world.products.values()]
        .map((p) => {
          const profile = p.thermalProfile?._ref ? profileRows.get(p.thermalProfile._ref) : null;
          const published = profile ? profile.rows.filter((r) => r.published !== false && r.uValue != null && r.shgc != null).length : 0;
          return {
            slug: p.slug.current,
            name: p.name ?? null,
            disabled: p.disabled === true,
            pricingRef: p.pricingRef ?? null,
            operation: p.operation ?? (p.family ? "created" : null),
            hasDim: p.dimensionRule?.minWidthMm != null && p.dimensionRule?.maxHeightMm != null,
            system: p.frameSystem?._ref ? systemSlugById.get(p.frameSystem._ref) : null,
            profile: p.thermalProfile?._ref ?? null,
            published,
            stdHardware: null,
            paras: p.descriptionParagraphs?.length ?? 0,
          };
        })
        .sort((a, b) => a.slug.localeCompare(b.slug));
    } else {
      const slugsParam = u.searchParams.get("$slugs");
      const slugs = slugsParam ? JSON.parse(slugsParam) : [];
      result = slugs.map((s) => world.products.get(s)).filter(Boolean);
    }
    return { ok: true, status: 200, json: async () => ({ result }), text: async () => JSON.stringify({ result }) };
  };
  return { fetchImpl, requests };
}
