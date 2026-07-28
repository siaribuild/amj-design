// ─── One downloadable document ────────────────────────────────────────────────
// Used in TWO places — the article page's rail and a product's Downloads tab —
// deliberately as one component. The metadata line IS the trust affordance: a
// raw cdn.sanity.io/files/…/9f3a2b….pdf link is an anonymous object, and a trade
// reader has no way to tell it from a stale copy someone emailed them. If the
// two surfaces rendered that line separately they would drift, and the one place
// they must not drift is the place a certifier checks a revision.
//
// This is what pays for linking a product STRAIGHT to a file rather than to the
// article that hosts it: everything the article page would have told the reader
// travels on the row, before the click.
import { Download, FileText, ArrowRight } from "lucide-react";
import type { Guide, GuideAttachment } from "../data/catalogue";

/** Bytes → what a person would say. A trade user on site data notices 12 MB. */
export function fileSize(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1000) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function docDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(+d) ? null : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export const DOC_TYPE_LABEL: Record<string, string> = {
  datasheet: "Data sheet",
  installation: "Installation guide",
  cad: "CAD / detail drawing",
  "test-report": "Test report",
  warranty: "Warranty",
  certificate: "Certificate",
  maintenance: "Care & maintenance",
};

// Fixed in CODE, not authored — the same reasoning as OPTION_TYPE_ORDER on the
// product page. An editor adding a new type in Sanity would have no icon, no
// sort position and nothing for the front end to do with it.
export const DOC_TYPE_ORDER = [
  "datasheet", "installation", "cad", "test-report", "certificate", "warranty", "maintenance",
];

export function DocumentRow({ attachment, guide, onOpenGuide }: {
  attachment: GuideAttachment;
  guide: Guide;
  /** Renders "Read the guide" only when there is a guide to read. */
  onOpenGuide?: (slug: string) => void;
}) {
  // Only the values that exist. A separator with nothing after it is worse than
  // a shorter line, and a placeholder for a missing revision is a small lie.
  const meta = [
    attachment.ext,
    fileSize(attachment.size),
    attachment.revision,
    docDate(attachment.revisedAt),
    attachment.standardRef,
  ].filter(Boolean).join(" · ");

  return (
    <div className="border-b border-black/8 last:border-0">
      <a href={attachment.url} target="_blank" rel="noopener"
        // icon-btn, not card-link: card-link paints sage-wash, which on this site
        // means selected — a hovered row would read as chosen. A control on a
        // light surface darkens.
        className="icon-btn flex items-start gap-3 px-4 py-3 group"
        // The extension is in the accessible name because this link leaves the
        // site and lands in a viewer or a downloads folder.
        aria-label={`${attachment.label} — ${attachment.ext} download`}>
        <FileText className="w-4 h-4 text-sage flex-shrink-0 mt-0.5" aria-hidden="true" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm text-ink">{attachment.label}</span>
          {meta && (
            <span className="block text-[11.5px] text-quiet mt-0.5" style={{ fontFamily: "'DM Mono', monospace" }}>
              {meta}
            </span>
          )}
          {attachment.note && (
            <span className="block text-[12.5px] text-body mt-1 leading-relaxed">{attachment.note}</span>
          )}
        </span>
        <Download className="w-4 h-4 text-quieter group-hover:text-sage flex-shrink-0 mt-0.5 transition-colors" aria-hidden="true" />
      </a>
      {/* The one link that must never lie: offered only when the guide actually
          has something to read. A body-less guide is a file record, and sending
          someone to its near-empty page would be the thin-page problem. */}
      {guide.hasBody && onOpenGuide && (
        <button onClick={() => onOpenGuide(guide.slug)}
          className="inline-flex items-center gap-1.5 text-xs text-sage hover:text-sage-deep px-4 pb-3 -mt-1 cursor-pointer">
          Read the guide <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** Documents grouped by kind, in the code-defined order. */
export function groupDocuments(docs: { guide: Guide; attachment: GuideAttachment }[]) {
  const byType = new Map<string, { guide: Guide; attachment: GuideAttachment }[]>();
  for (const d of docs) {
    const k = d.attachment.docType || "datasheet";
    byType.set(k, [...(byType.get(k) ?? []), d]);
  }
  return DOC_TYPE_ORDER
    .filter((t) => byType.has(t))
    .map((t) => ({ docType: t, label: DOC_TYPE_LABEL[t] ?? t, items: byType.get(t)! }));
}
