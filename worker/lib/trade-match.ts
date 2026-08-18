// The pure matchers behind the auto-pass triple (registration Phase 2, design
// §5). Zero imports, no Env, no I/O — this is the unit-testable heart of the
// decision, and `scripts/tests/unit.test.mjs` pins it with tables rather than
// examples.
//
// THE COST ASYMMETRY, said once here so every threshold below is read in its
// light: a false NEGATIVE queues an application and costs ops a minute. A false
// POSITIVE is one third of an auto-pass whose residual risk the owner explicitly
// accepted (AB-P2-9 — nothing in this phase claims ABN ownership is proven; the
// controls are ops visibility, human order review and one-action revocation).
// So the matching here is generous about legal-form and punctuation noise, and
// deliberately strict about acronyms and bare surnames. Nothing in this module
// ever rejects: the only two outcomes it can produce are "auto-pass" and "a
// human looks at it".
//
// Every threshold is a named constant so tuning is a one-line change with a unit
// table behind it (ASSUMED: P2-ARCH-3).

/** Bigram Dice similarity threshold for two business names. Tolerates one
 *  realistic typo or a small spelling drift; not a synonym engine. */
const NAME_DICE_THRESHOLD = 0.85;
/** Token-set containment needs at least this many tokens in the smaller set, so
 *  a bare `SMITH` cannot ride into `SMITH BROTHERS`. */
const MIN_CONTAINMENT_TOKENS = 2;

/** Legal-form tokens stripped from the END of a name, repeatedly. Australian
 *  entity names carry these; the person typing their business name usually does
 *  not, and that difference must not queue an application. */
const LEGAL_FORM_TOKENS = new Set([
  "PTY", "LTD", "LIMITED", "PROPRIETARY", "INC", "INCORPORATED",
  "CO", "COMPANY", "TRUST", "TRUSTEE", "ATF",
]);

/** The one abbreviation we canonicalise. E-P2-20 names this case ("Smith Bros"
 *  vs "SMITH BROTHERS PTY LTD"); anything beyond it would be speculation. */
const ABBREVIATIONS: Record<string, string> = { BROS: "BROTHERS" };

/** Normalise a business name for comparison.
 *
 *  Order matters: `&` and `P/L` are expanded while their punctuation still
 *  exists, because the next step destroys it. */
export function normalizeBusinessName(raw: string | null | undefined): string {
  return normalizeTokens(raw, true).join(" ");
}

/** `expand` controls the abbreviation table. Criterion 2 wants it on (so
 *  "Smith Bros" reaches "SMITH BROTHERS PTY LTD"); criterion 3 needs the
 *  unexpanded form too, because a DOMAIN is an abbreviation by nature, and
 *  expanding the register's side moves it further away rather than closer. */
function normalizeTokens(raw: string | null | undefined, expand: boolean): string[] {
  let s = String(raw ?? "").toUpperCase();
  s = s.replace(/&/g, " AND ");
  s = s.replace(/\bP\s*\/\s*L\b/g, " PTY LTD ");
  s = s.replace(/[^A-Z0-9]+/g, " ").trim();
  let tokens = s ? s.split(" ") : [];
  if (tokens[0] === "THE") tokens = tokens.slice(1);
  // Repeatedly, so "PTY LTD" and "PTY. LTD. TRUSTEE" both come off entirely.
  while (tokens.length > 1 && LEGAL_FORM_TOKENS.has(tokens[tokens.length - 1])) tokens = tokens.slice(0, -1);
  return expand ? tokens.map((t) => ABBREVIATIONS[t] ?? t) : tokens;
}

/** Split a submitted name on a trading-as marker.
 *
 *  "Motro Holdings T/A Motro Constructions" is one legal entity and one trading
 *  name; the ABR knows both, and the applicant may type either side. Each
 *  candidate is matched independently and a hit on either satisfies criterion 2.
 *  Applies to the SUBMITTED name only — ABR supplies its trading names as a list
 *  already. */
export function businessNameCandidates(raw: string | null | undefined): string[] {
  const s = String(raw ?? "");
  const parts = s.split(/\s+(?:T\s*\/\s*A|TRADING\s+AS)\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : (s.trim() ? [s.trim()] : []);
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < s.length; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** Sørensen–Dice over character bigrams. 1 = identical, 0 = nothing shared. */
function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const counts = new Map<string, number>();
  for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1);
  let hits = 0;
  for (const g of B) {
    const n = counts.get(g) ?? 0;
    if (n > 0) { hits++; counts.set(g, n - 1); }
  }
  return (2 * hits) / (A.length + B.length);
}

/** Is one token set contained in the other, with the smaller set big enough to
 *  mean something? `SMITH BROTHERS` ⊂ `SMITH BROTHERS CONSTRUCTIONS` passes;
 *  `SMITH` ⊂ `SMITH BROTHERS` does not. */
function tokenSetContained(a: string, b: string): boolean {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return false;
  const [small, large] = A.size <= B.size ? [A, B] : [B, A];
  if (small.size < MIN_CONTAINMENT_TOKENS) return false;
  for (const t of small) if (!large.has(t)) return false;
  return true;
}

/** Criterion 2: does the submitted business name match what the register holds?
 *
 *  `abrNames` is the ABR entity name followed by every trading/business name —
 *  E-P2-3 requires all of them to be considered, not just the entity. The
 *  `matched` value is the ABR name that satisfied it, frozen into the snapshot
 *  so ops can see WHY a decision went the way it did. */
export function nameMatches(
  submitted: string | null | undefined,
  abrNames: readonly (string | null | undefined)[],
): { pass: boolean; matched: string | null } {
  const candidates = businessNameCandidates(submitted).map(normalizeBusinessName).filter(Boolean);
  if (!candidates.length) return { pass: false, matched: null };
  for (const raw of abrNames) {
    const target = normalizeBusinessName(raw);
    if (!target) continue;
    for (const candidate of candidates) {
      if (candidate === target) return { pass: true, matched: String(raw) };
      if (tokenSetContained(candidate, target)) return { pass: true, matched: String(raw) };
      if (dice(candidate, target) >= NAME_DICE_THRESHOLD) return { pass: true, matched: String(raw) };
    }
  }
  return { pass: false, matched: null };
}

/** Bigram Dice threshold for a domain core against a squashed business name.
 *  Looser than the name threshold because a domain is already an abbreviation
 *  of a name — vowels drop out, words run together. */
const DOMAIN_DICE_THRESHOLD = 0.8;
/** Substring containment between a domain core and a business name needs at
 *  least this many characters. Three-letter collisions are everywhere. */
const MIN_DOMAIN_CONTAINMENT = 4;

/** Mailbox providers where the domain says nothing about the business.
 *
 *  A free mailbox can NEVER satisfy criterion 3 (D2) — not "scores lower",
 *  never. Exported so the unit table pins membership; additions are one-line
 *  edits. An unlisted webmail provider is treated as a business domain, which is
 *  a named residual (design §9.5.4): it still has to fuzzy-match the business
 *  name to matter, so the cost of a gap here is an auto-pass that needed a
 *  matching name anyway, not a free pass. */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com", "googlemail.com",
  "hotmail.com", "hotmail.com.au", "outlook.com", "outlook.com.au",
  "live.com", "live.com.au", "msn.com",
  "yahoo.com", "yahoo.com.au", "ymail.com",
  "bigpond.com", "bigpond.net.au",
  "icloud.com", "me.com", "mac.com",
  "protonmail.com", "proton.me",
  "optusnet.com.au", "tpg.com.au", "iinet.net.au", "internode.on.net",
  "westnet.com.au", "dodo.com.au",
  "aol.com", "mail.com", "fastmail.com",
]);

/** Public suffixes stripped before comparing a domain to a business name.
 *
 *  A small fixed list rather than a PSL dependency: a Worker should not ship a
 *  ten-thousand-entry table to answer this, and an unlisted suffix degrades to
 *  "the core is a bit longer", which queues rather than waving anything through.
 *  Longest first, so `.com.au` wins over `.au`. */
const PUBLIC_SUFFIXES = [
  ".com.au", ".net.au", ".org.au", ".id.au", ".asn.au", ".edu.au",
  ".com", ".net", ".org", ".co", ".io", ".build", ".au",
];

function domainCore(domain: string): string {
  let d = domain;
  for (const suffix of PUBLIC_SUFFIXES) {
    if (d.endsWith(suffix) && d.length > suffix.length) { d = d.slice(0, -suffix.length); break; }
  }
  return d.replace(/[^a-z0-9]/g, "").toUpperCase();
}

/** The space-stripped normalised forms of a name, for comparison against a
 *  domain, which has no spaces to give. TWO of them — with the abbreviation
 *  table applied and without. `smithbros.com.au` belongs to SMITH BROTHERS PTY
 *  LTD, whose trading name is "SMITH BROS": expanding BROS is exactly what
 *  criterion 2 needs and exactly what criterion 3 must not be limited to. */
const squashVariants = (name: string | null | undefined): string[] => {
  const expanded = normalizeTokens(name, true).join("");
  const literal = normalizeTokens(name, false).join("");
  return expanded === literal ? [expanded] : [expanded, literal];
};

/** Criterion 3: does the account's email domain plausibly belong to this business?
 *
 *  `names` is the submitted business name plus every ABR name. Deliberately NO
 *  acronym matching — `sbc.com.au` against *Smith Building Co* queues, because
 *  three-letter collisions are everywhere and the failure mode of omitting
 *  acronyms is a queue entry, which D2 prices as acceptable. */
export function emailDomainPlausible(
  email: string | null | undefined,
  names: readonly (string | null | undefined)[],
): { pass: boolean; domain: string; freeMailbox: boolean } {
  const address = String(email ?? "").trim().toLowerCase();
  const at = address.lastIndexOf("@");
  const domain = at >= 0 ? address.slice(at + 1) : "";
  if (!domain || !domain.includes(".")) return { pass: false, domain, freeMailbox: false };
  if (FREE_MAIL_DOMAINS.has(domain)) return { pass: false, domain, freeMailbox: true };

  const core = domainCore(domain);
  if (!core) return { pass: false, domain, freeMailbox: false };
  for (const name of names) {
    for (const squashed of squashVariants(name)) {
      if (!squashed) continue;
      const shorter = core.length <= squashed.length ? core : squashed;
      const longer = core.length <= squashed.length ? squashed : core;
      if (shorter.length >= MIN_DOMAIN_CONTAINMENT && longer.includes(shorter)) {
        return { pass: true, domain, freeMailbox: false };
      }
      if (dice(core, squashed) >= DOMAIN_DICE_THRESHOLD) return { pass: true, domain, freeMailbox: false };
    }
  }
  return { pass: false, domain, freeMailbox: false };
}
