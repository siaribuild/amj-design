// Ops → Catalogue: read-only browser of the product catalogue. The catalogue is
// hardcoded (src/data/catalogue.ts) and destined for Sanity; editing happens there.
import { getCategories, getFamiliesByCategory, products, colorbondColourOptions } from "../data/catalogue";

const SAGE = "#5A7A6A";

export function Catalogue() {
  const categories = getCategories();
  return (
    <div className="max-w-4xl">
      <div className="bg-[#5A7A6A]/8 border border-[#5A7A6A]/25 text-[#355344] text-xs px-4 py-2.5 mb-5">
        Read-only. Product content is managed in the catalogue source (moving to Sanity); pricing rates live in the pricing engine.
      </div>
      {categories.map(cat => {
        const families = getFamiliesByCategory(cat.slug);
        return (
          <div key={cat.slug} className="mb-6">
            <h3 className="text-sm font-semibold text-[#14150f] mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{cat.name}</h3>
            <div className="bg-white border border-black/8">
              {families.map(fam => {
                const fp = products.filter(p => p.familySlug === fam.slug);
                return (
                  <div key={fam.slug} className="px-4 py-2.5 border-b border-black/5 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#14150f]">{fam.name}</span>
                      <span className="text-xs text-[#8b8880]">{fp.length} product{fp.length !== 1 ? "s" : ""}</span>
                    </div>
                    <p className="text-xs text-[#8b8880] mt-0.5">{fp.map(p => p.name).join(" · ")}</p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <h3 className="text-sm font-semibold text-[#14150f] mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Colorbond colours</h3>
      <div className="bg-white border border-black/8 p-4 flex flex-wrap gap-2">
        {colorbondColourOptions.map(col => (
          <span key={col.name} className="flex items-center gap-1.5 text-xs border border-black/10 px-2 py-1">
            <span className="w-3.5 h-3.5 border border-black/15" style={{ background: (col as any).hex ?? SAGE }} />{col.name}
          </span>
        ))}
      </div>
    </div>
  );
}
