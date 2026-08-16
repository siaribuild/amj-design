// Referral data for the account area — loaded once by the shell, read by the
// rail and the Referrals section.
//
// Same shape as useAccountData/AccountDataCtx next door: the shell fetches, a
// context carries it, and the section consumes. Two independent fetches would
// let the rail's badge and the page's earnings strip disagree with each other on
// screen, which is the sort of thing nobody reports and everybody notices.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  getReferralOffer, getReferrerScreen,
  type ReferralOffer, type ReferrerScreen,
} from "../data/referrals";

export interface ReferralData {
  screen: ReferrerScreen | null;
  offer: ReferralOffer | null;
  loading: boolean;
  /** After a claim, a join or a leave — the whole section is derived from these
   *  two responses, so one reload is the entire refresh. */
  reload: () => void;
}

const Ctx = createContext<ReferralData>({ screen: null, offer: null, loading: true, reload: () => {} });

export const useReferrals = () => useContext(Ctx);

export function ReferralDataProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<ReferrerScreen | null>(null);
  const [offer, setOffer] = useState<ReferralOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    setLoading(true);
    // Settled, not all: a failure on either side should degrade that half of the
    // section rather than blank the other one. Someone whose discount card loads
    // still gets their discount explained even if the referrer half errored.
    Promise.allSettled([getReferrerScreen(), getReferralOffer()]).then(([s, o]) => {
      if (!live) return;
      setScreen(s.status === "fulfilled" ? s.value : null);
      setOffer(o.status === "fulfilled" ? o.value : null);
      setLoading(false);
    });
    return () => { live = false; };
  }, [nonce]);

  return <Ctx.Provider value={{ screen, offer, loading, reload }}>{children}</Ctx.Provider>;
}

/** Does this account have a Referrals section at all? Yes — always.
 *
 *  It used to be conditional: a code, OR history, OR a live offer. That hid it
 *  from the one person who most needed it. A tradie handed a code on a job site
 *  has none of those three things, so the section — and with it the only field
 *  in the account area for typing a code — was invisible to exactly the people
 *  the manual capture path exists for. Half of these introductions happen where
 *  a link never gets clicked, so that was half the attribution design out of
 *  reach.
 *
 *  The owner's ruling is that it is unconditional. The cost is a rail item on
 *  accounts that never engage; the gain is that a referral program is
 *  discoverable rather than hidden until you already know it exists, which was
 *  always an odd property for one to have.
 *
 *  Kept as a predicate rather than deleted: the callers read better for it, and
 *  the reason above is worth somewhere to live. */
export function hasReferralSection(_data: ReferralData): boolean {
  return true;
}

/** Confirmed money, whole dollars, for the rail badge. Undefined when there is
 *  none — a zero badge is noise on a nav item. */
export function confirmedBadge(data: ReferralData): string | undefined {
  const confirmed = data.screen?.earnings.confirmed ?? 0;
  return confirmed > 0 ? `$${Math.round(confirmed).toLocaleString("en-AU")}` : undefined;
}
