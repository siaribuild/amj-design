// SCAFFOLD (glazing/thermal, M3) — public "Thermal performance" table for the
// product detail page: WERS ratings per glazing (Uw / SHGC / Tvw / stars).
//
// Not yet wired into ProductDetailPage. No fabricated values — a product with no
// thermal data renders nothing (per the no-mock-fallbacks directive).

export interface ThermalRow {
  glazingName: string;
  glassSpec?: string | null; // SG / DG / TG
  uValue: number | null;
  shgc: number | null;
  tvw?: number | null;
  heatingStars?: number | null;
  coolingStars?: number | null;
}

export function ThermalPerformance({ rows }: { rows: ThermalRow[] }) {
  if (!rows?.length) return null; // no data ⇒ show nothing, never a fabricated rating
  return (
    <section className="thermal-performance">
      <h3>Thermal performance</h3>
      <table>
        <thead>
          <tr>
            <th>Glazing</th><th>Uw</th><th>SHGC</th><th>Tvw</th><th>Heating ★</th><th>Cooling ★</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.glazingName}{r.glassSpec ? ` (${r.glassSpec})` : ""}</td>
              <td>{r.uValue ?? "—"}</td>
              <td>{r.shgc ?? "—"}</td>
              <td>{r.tvw ?? "—"}</td>
              <td>{r.heatingStars ?? "—"}</td>
              <td>{r.coolingStars ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* TODO(glazing-thermal-M3): project thermalProfile rows into the Product type
          (catalogueQuery), render inside ProductDetailPage's tabs styled to match
          TechnicalContent, and surface glazing as a selectable option in the
          configurator (D1 — the choices come from these rows). */}
    </section>
  );
}
