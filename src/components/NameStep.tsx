// ═══════════════════════════════════════════════════════════════════════════════
// NAME STEP — "What's your name?", asked once, where nothing else will ask.
//
// ⚠️ THE SUBMIT GATE NEVER RENDERS THIS. Asking for the name on its own screen
// and then again in the details form is one question asked twice, and the owner
// removed it (design §16.4 / MG-1). Inside the gate a details form always
// follows the sign-in, so the name is collected there.
//
// It exists for the two paths that sign a person in with NO details form after
// them: /login, and the account-shell interstitial for an account whose name is
// still NULL (E4). Both key off the same `user.name === null` signal, so someone
// who abandoned the gate mid-way and later signs in at /login is asked exactly
// once — there.
//
// Mandatory in both: no skip, no dismissal, no "later". A NULL name is exactly
// what made this site invent "j.smith92" and put it on a quote.
// ═══════════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { SAGE, WindowMark, Btn, FieldLabel, Input } from "../app/ui";
import { updateProfile, type AuthUserDto } from "../data/api";

export function NameStep({ email, onSaved, variant = "login" }: {
  email: string;
  onSaved: (user: AuthUserDto) => void;
  /** `login` names the account the person just signed into; `interstitial` drops
   *  that clause — they are already inside their account. */
  variant?: "login" | "interstitial";
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (saving) return;
    if (!name.trim()) { setError("Enter your name to continue."); return; }
    setSaving(true); setError("");
    try {
      const r = await updateProfile({ name: name.trim() });
      onSaved(r.user);
    } catch {
      setError("Couldn't save your name. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative min-h-screen ground-bone flex items-center justify-center pt-16 pb-24 overflow-hidden">
      <div className="w-full max-w-sm mx-auto px-6 relative">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4"><WindowMark size={32} color={SAGE} /></div>
          <h1 className="font-semibold text-ink font-display t-hd2">What's your name?</h1>
          <p className="text-body mt-1 t-bd-sm">
            {variant === "login"
              ? `You're signed in as ${email}. This is the name that goes on your quotes and how we'll address you.`
              : "This is the name that goes on your quotes and how we'll address you."}
          </p>
        </div>
        <div className="card p-6 space-y-4">
          <div>
            <FieldLabel htmlFor="name-step-name">Full name</FieldLabel>
            <Input id="name-step-name" value={name} autoFocus autoComplete="name" maxLength={120}
              aria-invalid={!!error || undefined}
              aria-describedby={error ? "name-step-err" : undefined}
              onChange={(e) => { setName(e.target.value); if (error) setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="e.g. Sam Taylor" />
            {error && <p id="name-step-err" role="alert" className="text-red-700 mt-1 t-cap">{error}</p>}
          </div>
          <Btn variant="sage" size="md" onClick={save}
            className={`w-full justify-center ${!name.trim() || saving ? "opacity-50 pointer-events-none" : ""}`}>
            {saving ? "Saving…" : "Save and continue"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
