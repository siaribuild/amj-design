// Parsing an LLM's "JSON" — one implementation, because three copies of
// `try { JSON.parse(s) } catch { return null }` all failed the same way.
//
// We ask Google for JSON in the prompt but cannot enforce it: responseMimeType /
// responseSchema are not in Cloudflare's documented parameter set for this
// model. An un-enforced model reliably answers with a fenced block —
//
//   ```json
//   { "lines": [ … ] }
//   ```
//
// — and sometimes a sentence of preamble. A bare JSON.parse rejects both, the
// validator returns null, the §22.3 repair pass asks again, gets the same shape,
// and the run fails `skill_output_invalid` having billed two calls for output
// that was substantively correct.
//
// Tolerating the wrapper is NOT tolerating bad data: the skill's own validate()
// still governs every field. This only stops us discarding a good answer over
// three backticks.

/** The first balanced JSON object or array in `s`, respecting string literals. */
function firstBalanced(s: string): string | null {
  for (let i = 0; i < s.length; i++) {
    const open = s[i];
    if (open !== "{" && open !== "[") continue;
    const close = open === "{" ? "}" : "]";
    let depth = 0, inStr = false, escaped = false;
    for (let j = i; j < s.length; j++) {
      const ch = s[j];
      if (inStr) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return s.slice(i, j + 1);
      }
    }
    // Unbalanced from here — a later opener cannot help, the tail is truncated.
    return null;
  }
  return null;
}

/** Parse model output that is SUPPOSED to be JSON. Returns null if it is not. */
export function parseModelJson(raw: string): unknown {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* fall through to the tolerant path */ }

  // ```json … ``` or ``` … ```
  const fenced = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(text);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* keep going */ }
  }

  const balanced = firstBalanced(text);
  if (balanced) {
    try { return JSON.parse(balanced); } catch { /* genuinely not JSON */ }
  }
  return null;
}
