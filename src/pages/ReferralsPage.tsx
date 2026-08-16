// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT → REFERRALS — one place for everything referral (UX spec §5).
//
// It serves TWO different people, and often one person in both roles: someone
// who refers, and someone who WAS referred and has a discount. Hence the page
// structure: an h2 per block, so a person with both never has to work out which
// half they are reading, and a person with one simply doesn't see the other
// heading. There is no placeholder for the missing block.
//
//   h1  Referrals
//   h2  Your discount     ← only when an offer exists
//   h2  Refer a mate      ← always
//
// Both blocks are still to come: every figure in them ([discount], [window],
// [payoutDays], [minOrder]) renders from GET /api/referral/program, and the
// referrer block's five states are decided by GET /api/account/referrals. No
// program figure may be typed into a string, so neither block can be written
// ahead of those endpoints — and a mocked shape would be a second source of
// truth for numbers the owner changes from the console.
// ═══════════════════════════════════════════════════════════════════════════════

export function ReferralsPage() {
  return (
    <header className="mb-[22px]">
      <h1 className="text-ink t-hd1">Referrals</h1>
    </header>
  );
}
