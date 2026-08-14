# Referral program — Australian legal, tax and privacy research

**Author:** research pass for the referral program spec (`docs/specs/referral-program.md`)
**Date:** 2026-08-15

---

## ⚠️ This is research, not legal advice

This document was assembled by reading primary Australian sources. **It has not been reviewed by a
lawyer or an accountant, and nothing in it has been professionally vetted.** It exists to inform
copy-drafting and to give the client's own advisers a starting point with the sources already
gathered. Do not publish terms, tax positions or privacy statements derived from this document
without professional review. Where this document states a conclusion, that conclusion is my reading
of the cited source, not advice you can rely on.

> **Client's priority question** — *"is our 12-month expiry enforceable, or does the 3-year gift card
> minimum apply?"* — is answered in **§10** at the end of this document. Short version: the gift card
> regime does not reach either clock, and not because of an exemption. **But §10.7 identifies a
> different rule that does bite — state unclaimed money legislation — which affects money already
> earned.**

### How to read this

Every substantive point is tagged with one of three confidence levels. **The split is the most
useful thing in this document — read the tags, not just the prose.**

| Tag | Means |
|---|---|
| **[CLEAR]** | Stated in, or directly follows from, primary legislation or a regulator's own published guidance, which is cited and dated. |
| **[PRACTICE]** | Appears to be common commercial practice, or is my inference applying a clear rule to these facts. Not stated by any regulator. Defensible, not authoritative. |
| **[UNCERTAIN]** | Genuinely unsettled, or depends on facts not yet fixed. **Needs the client's accountant or lawyer.** Do not build a promise on these. |

### A note on sourcing method

`ato.gov.au`, `austlii.edu.au` and parts of `legislation.gov.au` block automated fetching. Where a
page is cited below as fetched, it was retrieved directly and the text quoted is from the page
itself. Statutory text is quoted from the Federal Register of Legislation compilations. A small
number of points — flagged inline — rest on search-result snippets rather than a fetched page, and
are marked as such.

Compilations used: *A New Tax System (Goods and Services Tax) Act 1999* compilation current to
1 January 2026; *Competition and Consumer Act 2010* compilation current to 1 July 2026;
*Privacy Act 1988* Compilation No. 104, compilation date 4 June 2026.

---

## 1. Tax treatment of the referral payment

### 1.1 Is it assessable income to the referrer?

**[CLEAR] Yes.** A commission received by a business for a referral is ordinary income under
s 6-5 *Income Tax Assessment Act 1997* (assessable income includes income according to ordinary
concepts, derived directly or indirectly from all sources).
[ITAA 1997 s 6-5](https://www.legislation.gov.au/C2004A05138/latest/text)

This is the referrer's own tax obligation, not AMJ's. AMJ's only exposure is the withholding
question in §3. **[PRACTICE]** The terms should say plainly that the referrer is responsible for
their own tax on the payment, and that AMJ gives no tax advice — this is universal in the published
referral terms reviewed (§6).

### 1.2 Is it deductible to AMJ?

**[CLEAR] Yes, on ordinary principles.** The ATO's own statement: *"You can claim a tax deduction
for most expenses you incur in carrying on your business if they are directly related to earning
your assessable income."* A commission paid to acquire a customer is a day-to-day operating
expense of exactly that kind.
[ATO, *Deductions*, last updated 18 June 2026](https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/income-and-deductions-for-business/deductions)
(fetched)

Note from the same page: **[CLEAR]** *"You can't claim the GST component of your expenses as a
deduction if you can claim it as a GST credit on your business activity statement."* So where the
referrer is GST-registered, the deductible amount is the GST-exclusive portion and the GST portion
is an input tax credit instead — not both.

### 1.3 Is it a taxable supply attracting GST?

**[CLEAR] Yes, where the referrer is registered or required to be registered for GST.** All four
limbs of s 9-5 are met: the referrer supplies a service (s 9-10(2)(b)–(c) — a supply is "any form of
supply whatsoever", expressly including services and the provision of advice or information) for
consideration (s 9-15(1)(b) — "any payment ... in response to or for the inducement of a supply of
anything"), in the course of an enterprise they carry on, connected with Australia.
[GST Act ss 9-5, 9-10, 9-15](https://www.legislation.gov.au/C2004A00446/latest/text)

The ATO reaches the same conclusion for referral services specifically: a referral service is a
taxable supply on which the supplier is liable for GST. *(This particular framing is from an ATO
search-result snippet, not a fetched page — the underlying statutory analysis above is what carries
the point.)*

**[CLEAR] If the referrer is not registered for GST, there is no taxable supply and no GST.**
Registration is compulsory only at a GST turnover of $75,000 or more.
[ATO, *Registering for GST*, last updated 23 May 2025](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/registering-for-gst)
(fetched). **Many sole-trader tradies referring occasionally will be under this threshold, so AMJ
will be paying a mix of registered and unregistered referrers.** The program must handle both.

### 1.4 "We pay you $500" — inclusive or exclusive of GST?

This is the sharpest practical question in the whole tax section, and the statute answers it.

**[CLEAR] A bare stated amount is GST-*inclusive*.** GST is 10% of the *value* of a taxable supply
(s 9-70), and value is 10/11 of the *price* (s 9-75(1)). Price is defined as the consideration
*"without any discount for the amount of GST (if any) payable on the supply"*. So if the agreement
says the consideration is $500, that $500 **is** the price, and the GST inside it is $45.45. The
statute contains no default that grosses a stated figure up.
[GST Act ss 9-70, 9-75](https://www.legislation.gov.au/C2004A00446/latest/text)

The consequence, which the spec's decision **M13** ("the advertised commission is inclusive of any
GST payable") accepts:

| Referrer | AMJ pays | Referrer keeps | AMJ's net cost after input tax credit |
|---|---|---|---|
| GST-registered | $500 | **$454.55** (remits $45.45 to ATO) | $454.55 |
| Not GST-registered | $500 | **$500.00** | $500.00 |

**[CLEAR] Two identical referrals therefore pay the registered referrer about 9.1% less than the
unregistered one, and cost AMJ correspondingly less.** This is arithmetic, not opinion. It is worth
stating to the owner explicitly, because it is invisible in the "1% of the order" framing and a
GST-registered tradie who works it out may reasonably feel short-changed.

**[PRACTICE] The alternative — and it is what the reference B2B agreement does — is to state
amounts exclusive of GST and add GST where the referrer is registered.** M2M One's published
referral agreement, cl 7.2, states that commission payments are exclusive of GST and that the
consideration is increased by the GST amount where GST is imposed, payable on receipt of a tax
invoice. Under that structure the referrer keeps $500 either way and AMJ's net cost is $500 either
way. It is fairer and more neutral; it is also harder to say in one sentence to a tradie, which cuts
against the spec's stated simplicity requirement (§1 of the spec).
[M2M One Referral Agreement](https://m2mone.com.au/m2m-one-referral-agreement/) (fetched;
no date published on the page)

**[UNCERTAIN] Which structure to adopt is a commercial decision with a tax consequence, and it is
the accountant's call in combination with the owner's.** Whichever is chosen, the terms must say so
in terms — a stated figure with no GST clause defaults to inclusive, and that default may not be
what the owner intends.

---

## 2. RCTI (Recipient Created Tax Invoice)

### 2.1 Is an RCTI the appropriate instrument here?

**[CLEAR] Yes — and AMJ qualifies to issue one under the limb designed for exactly this fact
pattern.** The governing instrument is the *A New Tax System (Goods and Services Tax): Recipient
Created Tax Invoice Determination 2023* (F2023L00785), made 23 May 2023 and commencing the day after
registration in June 2023. It is made under s 29-70(3) of the GST Act and **replaced roughly 50
narrowly-targeted determinations**, including — tellingly — *Recipient Created Tax Invoice
Determination (No. 11) 2016 on Referrals* and *(No. 09) 2016 on Loyalty Program Participation*, both
repealed by its Schedule 1.
[Determination text](https://www.legislation.gov.au/F2023L00785/asmade/text) (fetched)

Section 6(2) is the relevant limb:

> A **business entity** that is the recipient of a taxable supply may issue an RCTI for the supply
> if: (a) the recipient and the supplier are registered for GST when the RCTI is issued; (b) **the
> recipient determines the value of the taxable supply** acquired from the supplier; and (c) the
> recipient satisfies the requirements in section 7.

"Business entity" means simply *an entity that carries on an enterprise and is registered for GST*
(s 4). **AMJ does not need to be a "large business entity" or hit any turnover threshold.** The only
substantive gate is that AMJ determines the value of the supply — which is precisely what the
program does: AMJ computes 1% of the order's ex-GST goods value, and the referrer learns the amount
from AMJ. **[CLEAR] This is the textbook s 6(2) case.**

### 2.2 The ATO's conditions for issuing one

**[CLEAR]** Section 7(1) of the Determination requires the recipient to:

1. issue a document complying with s 29-70(1)(b)–(d) of the GST Act (approved form; enough
   information to ascertain supplier identity and ABN, what is supplied and its price, the extent to
   which it is a taxable supply, the date, the GST amount, **and — because it is recipient-issued —
   the recipient's identity or ABN and a statement that the GST is payable by the supplier**;
   s 29-70(1)(c)(ii) and (vii)); and it must be ascertainable from the document that it is intended
   to be an RCTI (s 29-70(1)(d));
2. issue it to the supplier **within 28 days** of the supply being made, or of the recipient
   determining the value where that happens later;
3. **retain the RCTI or a copy for five years**;
4. have a written agreement with the supplier meeting s 8, **or** an agreement embedded in the RCTI
   meeting s 9;
5. for an embedded agreement, not have received a rejection notice from the supplier within 21 days;
6. stop issuing RCTIs once either party fails any requirement (e.g. the referrer deregisters for
   GST); and
7. reasonably comply with its obligations under the taxation laws.

### 2.3 The written agreement requirement — and the simpler route

**[CLEAR] A written agreement is mandatory, but it does not have to be a separate signed document.**
Section 8 sets out the standalone-agreement route: it must specify the supplies, be current when the
RCTI issues, contain acknowledgements that both parties are GST-registered, and include conditions
that the recipient can issue RCTIs, the supplier will not issue tax invoices, and each will notify
the other if it ceases to be GST-registered.

**Section 9 is the simpler route and is the one worth designing for.** An agreement *embedded in the
RCTI itself* must declare that it applies to the supplies the RCTI relates to; that the recipient
will issue RCTIs; that the supplier will not issue tax invoices; that both are GST-registered and
will notify the other if that changes; **that the supplier will notify the recipient within 21 days
if it does not accept the agreement**; and that acceptance of the RCTI constitutes acceptance of the
agreement.

The ATO confirms the choice in its own words: *"Your written agreement can either be a separate
document specifying the sales, or you can embed this information or specific terms in the tax
invoice."*
[ATO, *Tax invoices*, last updated 25 August 2025](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices)
(fetched)

**[PRACTICE] The embedded-agreement route fits this program well**: a referrer who signs up, ticks
the payout-details form and later receives an RCTI-by-email has entered the agreement without any
separate signature ceremony, and the 21-day rejection window runs automatically. The ATO publishes a
template — *Recipient-created tax invoices form (NAT 73657)*.
[ATO, *Recipient-created tax invoices*, last updated 25 August 2025](https://www.ato.gov.au/forms-and-instructions/recipient-created-tax-invoices)
(fetched)

### 2.4 Is there a simpler compliant alternative for small, irregular payments?

**[CLEAR] Yes, and this materially reduces the problem.** Section 29-80(1) of the GST Act disapplies
*both* the "you must hold a tax invoice to claim the input tax credit" rule (s 29-10(3)) *and* the
"supplier must give you a tax invoice on request" rule (s 29-70(2)) where **the value of the supply
does not exceed $50, or such higher amount as the regulations specify**. The ATO states the current
figure as **$82.50 including GST** (i.e. a value of $75).
[GST Act s 29-80](https://www.legislation.gov.au/C2004A00446/latest/text);
[ATO, *Tax invoices*, 25 August 2025](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices)
(fetched)

**Applied to this program at a 1% rate, no tax invoice or RCTI is needed at all for any referred
order up to $8,250 ex-GST goods value.** Given a $2,000 qualifying minimum, the smallest payout is
$20 and a large share of payouts will fall under the threshold entirely.

**[UNCERTAIN] What is not clear is how the threshold applies when AMJ batches several earnings into
one weekly bank transfer** (spec §8.4(c) groups confirmed earnings per referrer into a single
transfer). The threshold is expressed per *supply*, and three separate referrals look like three
separate supplies — but the payment is one. The analogous no-ABN guidance (§3) says a *series* of
small separate supplies does not aggregate, which supports treating them separately, but that is
guidance on a different provision. **Accountant question.**

### 2.5 Guidance status — worth flagging

**[CLEAR] The ATO's RCTI ruling is mid-replacement.** GSTR 2000/10 still explains the old repealed
determinations. **Draft ruling GSTR 2026/D2 *Goods and services tax: recipient created tax invoices*
was published on 29 July 2026, with the comment period closing 11 September 2026**, and will replace
GSTR 2000/10 and explain the 2023 Determination.
[ATO, *Advice under development – GST issues*, item 4268](https://www.ato.gov.au/about-ato/ato-advice-and-guidance/advice-under-development-program/advice-under-development-gst-issues)
(fetched)

**[PRACTICE] Implication:** a final ruling is likely within the next 6–12 months and may change
detail. Do not hard-code RCTI wording as though it is settled; keep the document template editable.

---

## 3. No-ABN withholding

### 3.1 The obligation

**[CLEAR] 47%.** The ATO: *"If the payer has reasonable grounds to believe that the statement the
supplier makes is false or misleading, they are required to withhold 47% (from 1 July 2017) from the
total payment for the supply."*
[ATO, *Statement by a supplier not quoting an ABN*, last updated 30 June 2017](https://www.ato.gov.au/forms-and-instructions/statement-by-supplier-not-quoting-an-abn)
(fetched)

And the general rule: *"If the supplier does not provide an ABN and the total payment for goods and
services is more than $75 (excluding GST) you generally withhold the top rate of tax from the payment
and pay it to us."*
[ATO, *Withholding if ABN is not provided*, last updated 11 June 2025](https://www.ato.gov.au/businesses-and-organisations/hiring-and-paying-your-workers/payg-withholding/payments-you-need-to-withhold-from/withholding-from-suppliers/withholding-if-abn-not-provided)
(fetched). The governing ruling is TR 2002/9.

### 3.2 The reporting that follows

**[CLEAR]** If AMJ ever has to withhold, it must:

- be registered for PAYG withholding;
- report and pay the withheld amount on its activity statement;
- **complete a *PAYG payment summary – withholding where ABN not quoted* (NAT 3283) and give it to
  the referrer at the time of payment or as soon as possible after**;
- keep a copy to prepare the **annual report for PAYG withholding where no ABN is quoted**; and
- keep records of these transactions **separate from other payment records**, because no input tax
  credit can be claimed on a payment withheld from.

(Same ATO page, 11 June 2025.)

**[PRACTICE] This is a disproportionate amount of machinery for a $20 commission.** It is a strong
practical argument for the spec's M12 gate, independent of the legal analysis.

### 3.3 Thresholds and exemptions that would apply at this size

**[CLEAR] The $75 exclusion is significant here.** The ATO: *"When the payment for the full supply
is $75 or less (excluding GST) you don't have to: get an invoice with an ABN; get a tax invoice;
withhold tax."* And on aggregation: *"You can't avoid having to withhold by choosing to break down a
larger supply into $75 or less amounts, but **a series of small supplies of under $75 would not
require withholding** where no ABN was quoted."*
[ATO, *Payments you don't withhold from*, last updated 11 June 2025](https://www.ato.gov.au/businesses-and-organisations/hiring-and-paying-your-workers/payg-withholding/payments-you-need-to-withhold-from/withholding-from-suppliers/payments-you-don-t-withhold-from)
(fetched)

**At a 1% rate, $75 corresponds to a referred order of $7,500 ex-GST goods.** Below that, no-ABN
withholding does not arise at all, ABN or no ABN.

Other listed exceptions, none of which fit a tradie referrer acting in business: the supply is not a
business transaction (private/domestic, hobby, private recreational pursuit); the supplier's income
is wholly exempt; the supplier is not carrying on an enterprise. **[CLEAR] The ATO is explicit that
the *Statement by a supplier* form is unavailable to someone who is in business:** *"If the supplier
is operating a business or is entitled to register for an ABN, they cannot use the Statement by a
supplier form."* A tradie referring another tradie in the course of their business cannot escape via
that route.

### 3.4 Does requiring an ABN before payout cleanly avoid the issue?

**[CLEAR] Substantially yes.** Withholding is triggered by the *absence* of a quoted ABN. If AMJ
pays no one without a valid quoted ABN, the trigger never fires. This supports the spec's M12.

**Three qualifications, all [PRACTICE]:**

1. **Quoting is not the same as validity.** The obligation turns on the supplier quoting *their*
   ABN. An ABN that is cancelled, or belongs to a different entity than the payee name, is a problem
   AMJ should catch. **ABN Lookup is a free public register** and can verify an ABN's status and the
   registered entity name — see §7.
   [ABN Lookup FAQs](https://abr.business.gov.au/FAQ/ABNBasics) (fetched)
2. **Timing matters.** The ATO warns: *"you must not make full payment to the supplier on the
   understanding that an ABN will be quoted later."* Holding the payment until the ABN is quoted is
   expressly permitted and is exactly what the spec does (M12 — the earning stays `confirmed` and
   the account says what is missing). That design is correct.
3. **An ABN requirement excludes some genuine referrers.** A tradie who is an employee, or who
   simply has no ABN, cannot be paid at all under M12. That is a commercial choice, not a legal
   necessity — for payouts under $75 there is no withholding obligation anyway. **[UNCERTAIN]**
   whether the owner wants to pay small amounts to non-ABN holders is a business decision with a tax
   consequence; the accountant should confirm the position before the terms promise anything.

---

## 4. ACCC / Australian Consumer Law

### 4.1 The provision nobody expects: ACL s 49, referral selling

**[CLEAR] This is the single most on-point provision in the ACL, and it is a strict-liability
offence.** Verbatim (ACL = Schedule 2, *Competition and Consumer Act 2010*, compilation current to
1 July 2026):

> **49 Referral selling**
> A person must not, in trade or commerce, induce a consumer to acquire goods or services by
> representing that the consumer will, after the contract for the acquisition of the goods or
> services is made, receive a rebate, commission or other benefit in return for: (a) giving the
> person the names of prospective customers; or (b) otherwise assisting the person to supply goods
> or services to other consumers; if receipt of the rebate, commission or other benefit is
> contingent on an event occurring after that contract is made.

Section 167 makes the same conduct **an offence of strict liability**, punishable for a body
corporate by a fine of up to **the greater of $100,000,000**, three times the benefit obtained, or
30% of adjusted turnover during the breach turnover period.
[CCA Sch 2 ss 49, 167](https://www.legislation.gov.au/C2004A00109/latest/text)

**How this applies to AMJ's design — [PRACTICE], as no regulator has addressed this fact pattern:**

The prohibition bites where a person is induced **to buy** by the promise of a commission that is
contingent on later referral success. AMJ's design has a feature that most likely takes it outside
s 49: **spec decision A18 — "Anyone with a registered account may refer, including someone who has
never ordered."** Registration is free and requires no purchase, so the commission is not offered as
an inducement to *acquire goods*. There is no acquisition contract whose making is the trigger.

**The risk is entirely in the marketing, and the spec's §8.2 placements are where it lives.** The
home page and `/trade-account` placements are shown to logged-out visitors — i.e. prospective
customers. Copy that reads *"place your first order and earn 1% on every mate you refer"* would
recast the commission as an inducement to buy, contingent on later events, and land squarely in
s 49. Copy that reads *"any account can refer — you don't need to have ordered"* does not.

The ACCC's own business guidance draws the same line: for a new sale you may give a discount for
contact details, but the customer must receive it whether or not the friends buy anything; **for
existing customers, refer-a-friend offers paying on successful referrals are lawful**, and the
ACCC's example is a subscription service giving vouchers for successful referrals.
[ACCC, *Unfair business practices*](https://www.accc.gov.au/business/selling-products-and-services/unfair-business-practices)
(fetched; no revision date on the page);
[NSW Government, *Referral selling*](https://www.nsw.gov.au/legal-and-justice/consumer-rights-and-protection/advertising-product-packaging-and-pricing-laws/referral-selling)
(fetched; no date shown)

**Concrete recommendation [PRACTICE]:** keep the referrer reward and the referred tradie's discount
visibly decoupled from any requirement that the *referrer* buys anything, and say so in the copy.
This is cheap to do and removes the only serious criminal exposure in the program.

### 4.2 "B2B" does not put this outside the consumer provisions

**[CLEAR] The assumption that both parties being businesses removes ACL consumer protections is
wrong.** Under ACL s 3(1), a person acquires goods "as a consumer" if the amount paid did not exceed
**$40,000** *or such greater amount as is prescribed* — **the prescribed figure has been $100,000
since 1 July 2021** — **or** the goods are of a kind ordinarily acquired for personal, domestic or
household use.
[CCA Sch 2 s 3](https://www.legislation.gov.au/C2004A00109/latest/text);
threshold increase per [ACCC, *A guide to consumer guarantees for businesses and legal
practitioners*](https://www.accc.gov.au/about-us/publications/a-guide-to-consumer-guarantees-for-businesses-and-legal-practitioners)
(search snippet — the guide PDF would not text-extract)

Aluminium windows and doors are plainly "of a kind ordinarily acquired for personal, domestic or
household use", and most orders will be under $100,000. Section 3(2) excludes acquisitions for
re-supply, or for using up or transforming *"in the course of repairing or treating other goods or
fixtures on land"*.

**[UNCERTAIN] Whether a tradie who buys windows and installs them into a client's building falls
inside that exclusion is genuinely unsettled** — no ACCC guidance or case squarely on it was found.
It matters because it decides whether the consumer-only provisions (including s 49) bite at all.
**Do not draft on the assumption that "our customers are businesses, so the ACL consumer provisions
don't apply."** Lawyer question.

**[CLEAR] Separately, s 18 has no consumer threshold at all.** *"A person must not, in trade or
commerce, engage in conduct that is misleading or deceptive or is likely to mislead or deceive."*
It applies to every representation AMJ makes to a referrer or a referred tradie regardless of the
s 3 analysis.

### 4.3 What must be disclosed, and where

**[CLEAR] Fine print cannot cure a misleading headline.** The ACCC: information in fine print and
qualifications must not conflict with the overall message of the advertisement; a headline offer
with exclusions buried in fine print may be misleading.
[ACCC, *False or misleading claims*](https://www.accc.gov.au/consumers/advertising-and-promotions/false-or-misleading-claims)
(fetched; no revision date shown — linked guides dated July and November 2021)

**[CLEAR] A promise to pay is a representation about a future matter and the onus is reversed.** The
ACCC states a business making a claim about future matters must have reasonable grounds at the time
of making it; under ACL s 4, the business bears the burden of proving it did. Practically: AMJ must
have a real, resourced process for calculating and paying manual bank transfers *before* it
advertises the promise.

**[CLEAR] ACL s 32(2) is directly on point for a rebate program**, and is a hook the brief did not
anticipate:

> If a person offers any rebate, gift, prize or other free item in connection with ... the promotion
> by any means of the supply or use of goods or services ... the person must, **within the time
> specified in the offer or (if no such time is specified) within a reasonable time** after making
> the offer, provide the rebate ... in accordance with the offer.

Section 32(1) separately prohibits offering a rebate with the intention of not providing it.
[CCA Sch 2 s 32](https://www.legislation.gov.au/C2004A00109/latest/text)

**[PRACTICE] Implication for the spec:** the terms should state a payment timeframe (e.g. "within X
business days of the referred order being paid in full") rather than leaving timing open. Stating a
window and meeting it discharges s 32(2) cleanly; saying nothing leaves AMJ exposed to an
after-the-fact argument about what was "reasonable". Note also the spec's `min_payout_balance`
(M7): if a referrer's earned money is held below a threshold, **that condition must be disclosed at
the point the offer is made**, or the held payment is arguably not provided "in accordance with the
offer".

**Disclose adjacent to the headline claim, not in a footer [PRACTICE]:** the $2,000 ex-GST minimum;
that 1% is of ex-GST goods value excluding delivery; that payment triggers on payment in full, not
on order placement; the 12-month lapse; that the referred party must be genuinely new; payment
method and timing; the ABN requirement; and any minimum payout balance.

### 4.4 Loyalty schemes — the closest analogue

**[CLEAR]** The ACCC's *Customer loyalty schemes – final report* (published **3 December 2019**)
identified as concerns: whether consumers actually receive advertised benefits; **unilateral changes
by schemes to their terms**; poor communication; poor data disclosure. On unilateral change, the
ACCC's position is that schemes should give members clear and timely notice and the opportunity to
use their existing balance, and should consider compensation before reducing point value or earn
rates.
[ACCC, *Customer loyalty schemes – final report*, 3 December 2019](https://www.accc.gov.au/about-us/publications/customer-loyalty-schemes-final-report)

**[UNCERTAIN → treat with care] How far this carries to B2B.** The report is a *consumer* market
study of consumer-facing schemes, its recommendations were largely law-reform proposals to
government rather than binding rules, and it is now more than six years old with no refresh found.
It is the clearest published statement of what the ACCC finds objectionable, **not** current
enforcement posture, and **not** authority for a B2B program. The two hooks it rests on — s 18 and
the UCT regime — are not consumer-limited, which is why the behavioural expectations transfer even
though the report does not.

### 4.5 Unfair contract terms — this does apply to sole traders

**[CLEAR] The thresholds, from the statute.** ACL s 23(4): a contract is a small business contract
if it is for a supply of goods or services and at least one party makes it in the course of carrying
on a business and either **employs fewer than 100 persons** (s 23(4)(b)(i)) **or** has **turnover of
less than $10,000,000** for its last income year (s 23(4)(b)(ii)). Casuals count only if employed on
a regular and systematic basis; part-timers count as FTE fractions (s 23(5)).
[CCA Sch 2 s 23](https://www.legislation.gov.au/C2004A00109/latest/text)

**A sole trader satisfies this comfortably.** There is **no contract-value threshold** under the ACL
regime — the former $300,000 / $1m upfront-price cap was removed in the reforms commencing
**9 November 2023**. (Do not import the $5m figure; that belongs to the separate ASIC Act regime for
financial products. [ASIC, *Unfair contract term protections for small businesses*, last updated
March 2025](https://www.asic.gov.au/about-asic/what-we-do/our-role/laws-we-administer/unfair-contract-term-protections-for-small-businesses/))

**[CLEAR] Since 9 November 2023 an unfair term is not merely void — proposing or relying on one is a
contravention carrying civil penalties.** Section 23(2A) prohibits *making* a standard form small
business contract containing an unfair term the person proposed; s 23(2B) makes each unfair term a
separate contravention; s 23(2C) prohibits applying or relying on one. Penalties attach under s 224.

**[CLEAR] The s 24 test.** A term is unfair if all three limbs are met: (a) significant imbalance in
the parties' rights and obligations; (b) not reasonably necessary to protect the legitimate
interests of the advantaged party; (c) detriment (financial or otherwise) if applied or relied on.
**Section 24(4) presumes limb (b) is NOT satisfied unless the advantaged party proves otherwise** —
the burden is on AMJ. Transparency (s 24(3): plain language, legible, presented clearly, readily
available) must be taken into account but is not determinative — a perfectly clear term can still be
unfair.

**[CLEAR] "We may vary or terminate this program at any time at our discretion" is squarely within
the statutory grey list.** Section 25 lists as examples of terms that *may* be unfair:

- **(b)** a term permitting one party but not another **to terminate** the contract;
- **(d)** a term permitting one party but not another **to vary the terms** of the contract;
- **(h)** a term permitting one party **unilaterally to determine whether the contract has been
  breached or to interpret its meaning**.

Paragraph (h) matters as much as (b) and (d) here: a fraud/abuse clause reading *"we may forfeit any
reward we believe was obtained by self-referral, and our determination is final"* is a unilateral
determination clause, not merely an anti-fraud measure.

**[PRACTICE] Drafting implications that follow directly:** confine the variation right to specified,
articulable circumstances rather than "at our discretion"; give reasonable advance notice; and pair
it with an exit or wind-down right. **[PRACTICE] On already-earned money:** a clause that lets AMJ
end the program and thereby extinguish a 1% payment already triggered by a paid order is the
highest-risk formulation. The spec's §4.7 rule — *"Money already promised is honoured"* — is
materially more defensible under the s 24 test and should be preserved in the terms, not just in the
code.

**[CLEAR] Enforcement temperature:** UCT is among the ACCC's **2026-27 compliance and enforcement
priorities**, announced 19 February 2026.
[ACCC, *Compliance and enforcement priorities 2026-27*](https://www.accc.gov.au/about-us/publications/compliance-and-enforcement-priorities-2026-27)
(the factsheet PDF would not text-extract; this rests on a search snippet of the ACCC's
media-release pages)

**[UNCERTAIN] Whether the referral T&Cs standing alone are a contract "for a supply of goods or
services" under s 23(4)(a).** The better view is that a referral arrangement paying commission for
referral activity is a contract for services, but no ACCC guidance or case on referral-program terms
specifically was found. **[PRACTICE] The safer structure is to incorporate the program terms into,
or annex them to, the trading-account terms**, which are unambiguously a supply contract — the
question then largely disappears.

### 4.6 Developments to be aware of

**[CLEAR-ish, dates from search snippets]** The *Competition and Consumer Amendment (Unfair Trading
Practices) Bill 2026* introduces a general prohibition on unfair trading practices (dark patterns,
drip pricing, subscription traps). It is **consumer-only in this tranche**, with Treasury
consultation under way on extending it to small businesses and franchisees. Reported as passing both
Houses 1 July 2026 and applying from 1 July 2027.
[Parliament of Australia bill page](https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation/Bills_Search_Results/Result?bId=r7468)
*(passage and commencement dates rest on search snippets, not a fetched page — verify before
relying)*

ACL maximum penalties were increased on **28 March 2026** to up to **$100 million** for bodies
corporate for certain offences, per the ACCC's own note on its
[*A guide to sales practices*](https://www.accc.gov.au/about-us/publications/a-guide-to-sales-practices-for-businesses-and-legal-practitioners)
publication page (fetched; guide dated 6 November 2024, with an ACCC note that it predates the
increase). This is consistent with the s 167 penalty text quoted in §4.1.

---

## 5. Privacy (Privacy Act 1988 / APPs)

### 5.1 The headline finding — the program itself may end the small business exemption

**This is the most consequential privacy finding and it inverts the usual assumption.**

**[CLEAR] The small business exemption still exists.** Section 6D of the *Privacy Act 1988* is
present and unrepealed in **Compilation No. 104, compilation date 4 June 2026**. Section 6D(1): a
business is a small business if its annual turnover for the previous financial year is
**$3,000,000 or less**.
[Privacy Act 1988, current compilation](https://www.legislation.gov.au/C2004A03712/latest/text)

**[CLEAR] But s 6D(4) lists things that remove the exemption, and two of them describe a paid
referral program almost exactly:**

- **s 6D(4)(c)** — you disclose personal information about another individual to anyone else **for a
  benefit, service or advantage**;
- **s 6D(4)(d)** — you **provide a benefit, service or advantage to collect** personal information
  about another individual from anyone else.

A program that pays a referrer a commission in exchange for bringing in a new customer's details is
the s 6D(4)(d) fact pattern on its face. **If it fires, AMJ ceases to be a small business operator
entirely — not merely for referral data, but for all personal information it holds** — and the full
13 APPs plus the Notifiable Data Breaches scheme apply to the whole business.

**[CLEAR] The escape hatch is consent.** Sections 6D(7)–(8) disapply (4)(c) and (4)(d) where the
disclosure or collection is with the other individual's consent (and, for (4)(d), the benefit is
provided in order to be allowed to collect).

**[PRACTICE — and this is a design recommendation, not merely a legal note] The spec's architecture
already leans the safe way, and should be held there deliberately.** Spec decision A1 captures
referrals by **the referred tradie entering a code themselves** (link cookie or manual entry) — the
referrer never hands AMJ the prospect's contact details. On those facts AMJ is not "collecting
personal information about another individual **from anyone else**"; the individual self-identifies.
**Any future change that lets a referrer submit a mate's name, phone or email would change this
analysis materially.** That constraint deserves to be written down as a rule, not left as an
accident of the current design.

**[UNCERTAIN] Whether s 6D(4)(d) is engaged on the current design is exactly the kind of question
that needs a lawyer**, because the stakes are the whole business's privacy status, not just this
feature.

**[CLEAR] Reform status:** the *Privacy and Other Legislation Amendment Act 2024* (No. 128 of 2024,
Royal Assent 10 December 2024) did **not** repeal s 6D — confirmed by its continued presence in the
June 2026 compilation. Repeal of the small business exemption was agreed in principle in the
Government's response to the Privacy Act Review and remains a second-tranche commitment, but
**[UNCERTAIN — search snippets only]** no second-tranche Bill appears to have been introduced or
passed and no commencement date is fixed.

**[CLEAR] Correcting a claim in circulation:** several commentary pages assert that "from
10 December 2026, ~2.5 million additional businesses come under the full scope of the Privacy Act."
That is a conflation. The 10 December 2026 date is the deferred commencement of the **automated
decision-making transparency obligation (new APP 1.7)**, a privacy-policy disclosure duty for APP
entities only. It has nothing to do with the small business exemption.

### 5.2 (a) Storing bank details — APP 11 and retention

**[CLEAR] Bank account details are NOT "sensitive information" under the Privacy Act — despite the
common assumption that they are.** The s 6(1) definition is a closed list covering racial or ethnic
origin, political opinions and associations, religious and philosophical beliefs, professional/trade
association and trade union membership, sexual orientation and practices, criminal record, health,
genetic and certain biometric information. **Financial and banking information is absent.**
[OAIC, *APP Guidelines Chapter B: Key concepts*, v1.4, 21 December 2022](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-b-key-concepts)

Practical consequence: BSB/account number attract no special statutory regime — no APP 3.3
collection-consent rule and no "directly related" test under APP 6.2(a). **They do raise the
practical bar under APP 11**, because the reasonableness test expressly weighs the *sensitivity in
the ordinary sense* of the information and the possible adverse consequences to the individual.

**[CLEAR] The APP 11.1 standard** is "such steps as are reasonable in the circumstances" to protect
personal information from misuse, interference, loss and unauthorised access, modification or
disclosure. Since 11 December 2024 the OAIC states these expressly include **technical and
organisational measures**. Reasonableness factors: the entity's nature, size and resources; the
amount and sensitivity of information held; possible adverse consequences; practicability; and
whether the measure is itself privacy-invasive. The OAIC's guide states people expect **financial
information to receive high-level protection**, recommends considering encryption for databases,
servers, backups and data in transit, and expects need-to-know access limits, MFA in higher-risk
scenarios and audit logs covering internal and external access.
[OAIC, *APP Guidelines Chapter 11*, last updated 3 October 2025](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-11-app-11-security-of-personal-information);
[OAIC, *Guide to securing personal information*](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/handling-personal-information/guide-to-securing-personal-information)

> **Worth surfacing to the owner:** the spec (§7.1) removed audit logging of payout bank-detail reads
> and edits at the owner's direction, and flagged the consequence itself. The OAIC's guidance lists
> **audit logs covering internal and external access** among the expectations for securing personal
> information, and singles out financial information as warranting high-level protection. That does
> not make the decision unlawful — APP 11 is a reasonableness standard weighing size and resources,
> and access is behind Cloudflare Access with low payment volume. But it does mean the decision now
> runs against a specific published OAIC expectation rather than merely against engineering taste,
> which is a different thing to have accepted. **[PRACTICE]** Re-put it to the owner in those terms.

**[CLEAR] APP 11.2 — retention.** Reasonable steps must be taken to **destroy or de-identify**
personal information once it is no longer needed for any permitted purpose, except where retention
is required by an Australian law or court order. Where destruction is impracticable (backups), the
OAIC's "beyond use" concept requires access controls, logs and audit trails, with backups reviewed.

**[CLEAR] The competing retention obligation is five years.** ATO business records must be kept five
years from when prepared or obtained, or when the transaction was completed, whichever is later. The
RCTI Determination independently requires retaining an RCTI or copy for **five years** (s 7(1)(c)).
[ATO, *Overview of record-keeping rules for business*](https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/record-keeping-for-business/overview-of-record-keeping-rules-for-business)

**[PRACTICE] These two obligations point at different objects and the spec already separates them
correctly.** The five-year duty attaches to the *payment record* — date, amount, payee, ABN,
reference — which is exactly the frozen snapshot on `referral_payout` (spec §7.1). It does **not**
obviously justify retaining a *live, usable* BSB and account number indefinitely on the user row.
A defensible design: keep the live payout credential only while the referrer is active or a payout
is pending; purge or tokenise it after the final payout; retain the frozen ledger entry for five
years. **[UNCERTAIN]** the exact purge trigger is a judgement call worth confirming.

### 5.3 Is an ABN personal information?

**[CLEAR] For a company or trust, generally no. For a sole trader, treat it as yes.** The OAIC:
generally, information only about a business is not personal information — but *"an individual's
personal information may be so interconnected to information about his or her business or company
that information about that business or company can constitute personal information about the
individual."* A sole trader's ABN resolves via a free public register to a named individual and
their trading address.
[OAIC, *What is personal information?*, last updated 5 May 2017](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/handling-personal-information/what-is-personal-information)

**[CLEAR] Public availability does not change the classification.** The OAIC states personal
information ranges *"from sensitive and confidential information to information that is publicly
available."* Publication on ABN Lookup affects the *harm* analysis (low incremental sensitivity), not
whether it is personal information.

### 5.4 (b) Showing referrer B what their referral did

**[CLEAR] The governing rule is APP 6.1** — use or disclose only for the primary purpose of
collection unless an exception applies. "Disclosure" means making information accessible outside the
entity and releasing subsequent handling from the entity's effective control. The relevant
exceptions are **APP 6.1(a) consent** (informed, voluntary, current, specific, with capacity) and
**APP 6.2(a)** — the individual would *reasonably expect* the disclosure and the secondary purpose is
*related* to the primary purpose (the stricter "directly related" test applies only to sensitive
information, which order value is not). APP 5.2(f) separately requires notifying the entity's usual
disclosures at or before collection.
[OAIC, *APP Guidelines Chapter 6*, v1.1, 22 July 2019](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-6-app-6-use-or-disclosure-of-personal-information);
[Chapter 5](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-5-app-5-notification-of-the-collection-of-personal-information)

**[CLEAR] Where the referred tradie is a sole trader, an order value tied to a named business is
personal information about an identifiable individual.** And critically: **the referrer knows exactly
who they referred**, so this is one-to-one re-identification. There is no de-identification argument
available. Where the referred party is a Pty Ltd with employees, generally it is not personal
information — but the system cannot tell these apart at runtime, so **the sole-trader case sets the
floor**.

**[PRACTICE] Disclosure options, ranked:**

| What referrer B sees | APP 6 position |
|---|---|
| "Your referral placed an order worth $X" | Disclosure of PI about a third party. Needs consent, or a weak "reasonably expects" argument. **Avoid.** |
| Binary status — *qualified / not yet qualified* | Much weaker disclosure; confirms a relationship, reveals no figure. |
| **Commission amount only — "you earned $Y"** | Strongest. This is information about B's *own* entitlement. |
| Aggregate across ≥N referrals | Reduces re-identification, but collapses back to per-person disclosure at 1–2 referrals. |

**The spec is already close to the safe end and should be held there.** §8.3(3) shows business name
or a masked email plus a status (*Signed up · Quoting · Ordered · Paid in full*) and expressly
excludes phone, address, project details and order contents. **[CLEAR] But the spec's own §11(4)
identifies the residual leak correctly: a percentage commission is invertible.** If the referrer sees
"you earned $Y" and the rate is published as 1%, then $X = $Y × 100 exactly. **The commission figure
*is* the order value, restated.**

**[PRACTICE] Three ways to break the inversion, in decreasing order of usefulness:** band the
displayed commission; do not publish the exact rate alongside the exact earned figure on the same
surface; or accept the disclosure and **obtain the referred tradie's express consent at the point
the code is applied** — which the OAIC's consent criteria mean must be a real, specific
notification, not a buried privacy-policy line. Given that the referred tradie is *receiving a
discount* at that moment, a clear one-line disclosure ("your mate will be told when your first order
is paid, and is paid a percentage of it") is easy to place and is the cleanest fix. It also helps on
the s 6D(8) consent point in §5.1 — **one design decision addresses both**.

**[UNCERTAIN] Whether a tradie who knowingly used a mate's referral code "reasonably expects" their
order value to be reported back is arguable either way.** Do not build on APP 6.2(a) alone.

### 5.5 Notifiable Data Breaches, and the statutory tort

**[CLEAR] The NDB scheme follows Privacy Act coverage** — it applies to APP entities, so an exempt
small business operator is outside it. If s 6D(4)(d) fires (§5.1), NDB switches on for the whole
business simultaneously with the APPs.
[OAIC, *Data breach preparation and response, Part 4*, last updated February 2025](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/preventing-preparing-for-and-responding-to-data-breaches/data-breach-preparation-and-response/part-4-notifiable-data-breach-ndb-scheme)

**[PRACTICE] If covered, a breach of stored BSB/account number in the clear would very likely be
assessed as likely to result in serious harm** — financial information is listed among the types
that increase that risk, and direct financial harm and fraud are the obvious vectors.

**[CLEAR] The statutory tort of serious invasion of privacy commenced 10 June 2025 and reaches
businesses that are exempt from the Privacy Act.** The OAIC states it *"extends beyond APP entities,
covering individuals and organisations otherwise exempt from the Privacy Act, such as small
businesses."* Elements: intrusion upon seclusion or misuse of information; reasonable expectation of
privacy; **intentional or reckless** conduct (not negligent); public interest in privacy outweighing
countervailing interests; **damage need not be proved**.
[OAIC, *Statutory tort for serious invasions of privacy*, last updated 19 June 2025](https://www.oaic.gov.au/privacy/your-privacy-rights/more-privacy-rights/statutory-tort-for-serious-invasions-of-privacy)

**[PRACTICE] Note where the exposure actually sits.** The recklessness threshold means a merely
negligent data breach is unlikely to found the tort. The sharper exposure is the **referral-status
disclosure in §5.4** — deliberately showing a sole trader's order value to a third party is
*intentional* conduct, which is the limb the tort reaches. **[UNCERTAIN]** the tort is barely a year
old and no case law on commercial-information disclosure was found.

---

## 6. Terms and conditions — clauses this program needs

Structure only. **[PRACTICE] throughout** unless a clause is tied to a [CLEAR] rule above, in which
case the cross-reference is given.

### Reference points (structure summarised; no wording copied)

- **[M2M One Referral Agreement](https://m2mone.com.au/m2m-one-referral-agreement/)** — a published
  Australian B2B referral agreement, and the closest structural analogue found. Notable features:
  a defined term with automatic renewal; an appointment clause restricting the referrer to
  company-supplied marketing material and prohibiting misleading statements; **an express obligation
  on the referrer to tell prospects that they may receive commission**; a referral-review clause
  listing specific, objective grounds on which a referral may be rejected (already referred by
  another, pre-existing relationship, unacceptable credit risk, prospect objects); commission
  calculated as a percentage with a defined qualifying window; **an RCTI mechanism with the GST
  clause expressed exclusive of GST**; set-off against amounts owed; suspension of commission while
  the referrer is in breach; an audit right; confidentiality; liability caps; termination for cause
  and for convenience on notice — **with post-termination commission rights expressly preserved**;
  and variation only by written agreement of both parties (no unilateral variation right at all).
- **[B2Bpay Partner Referral Program](https://www.b2bpay.com.au/partner-referral-program-b2bpay/)** —
  a live Australian B2B two-sided program. Notable features: attribution via a dedicated per-partner
  referral page; a defined qualifying threshold and a defined qualifying window; **discretionary
  acceptance into the program**; a two-sided reward; and the reward conditions carried in numbered
  footnotes tied to each headline claim.

### The clause list

| # | Clause | What it protects against |
|---|---|---|
| 1 | **Eligibility** — who may refer (registered, active, non-staff accounts), who counts as a referred party (genuinely new, no prior account or order), express exclusion of related entities and of self-referral | Disputes over who qualifies; the §7 gaming vectors. Also the place to state that referring does **not** require the referrer to have purchased — the s 49 point (§4.1) |
| 2 | **How attribution works** — link and code capture, the 90-day cookie, one referral per referred account permanently, first-recorded-wins, no chains or levels, and the rule that an existing customer clicking a link is never a referral | The single largest source of "but I referred them first" disputes. Objective, stated rules here are also the UCT-safe alternative to discretionary determination (s 25(h), §4.5) |
| 3 | **Qualifying conditions** — minimum order value stated as ex-GST goods excluding delivery; payment in full as the trigger; the 12-month lapse; what happens on cancellation or refund | ACL s 18 / s 29 misleading-conduct risk if the headline implies payment on order rather than on payment in full |
| 4 | **Reward calculation** — the rate, the base (ex-GST goods, excluding delivery and GST), any cap, and that the rate in force when the referral was recorded is the rate that applies | Retrospective change disputes. Mirrors spec M10's snapshot rule — **the terms must say what the code does** |
| 5 | **Payment timing and method** — bank transfer, the payment window, any minimum payout balance, and the ABN + bank-details prerequisite | **ACL s 32(2) [CLEAR]** — the rebate must be provided within the time specified or a reasonable time. A held balance below a threshold must be disclosed up front (§4.3) |
| 6 | **Tax responsibility** — the referrer is responsible for their own tax; whether the amount is GST-inclusive or exclusive **stated expressly**; the ABN requirement; the RCTI agreement (or a cross-reference to it) | §1.4 [CLEAR] — silence defaults to GST-inclusive. §2.3 — the RCTI written-agreement requirement can be satisfied here or embedded in the RCTI |
| 7 | **Right to vary or terminate** — confined to specified circumstances, with advance notice, not "at any time at our discretion" | **ACL s 25(b),(d) [CLEAR]** grey-list terms; s 24(4) puts the burden on AMJ to prove necessity (§4.5) |
| 8 | **Already-earned amounts on termination** — rewards already qualified are still paid; referrals already recorded run out their window | The rule the ACCC's loyalty work is most pointed about, and the highest-risk clause to get wrong under s 24. Mirrors spec §4.7 |
| 9 | **Fraud, abuse and forfeiture** — objective criteria (distinct ABN, distinct ownership or control, distinct delivery address, no common director), a stated review path, and suspension pending review | Gaming (§7) — **but note this clause is itself a UCT exposure** if drafted as unreviewable discretion: s 25(h) (§4.5) |
| 10 | **What each party sees** — what a referrer is shown about their referrals, and what the referred tradie is told about the referrer being paid | **APP 5 notification and the s 6D(8) consent point [CLEAR]** (§5.1, §5.4). This clause is doing real privacy work, not boilerplate |
| 11 | **Privacy** — what is collected (ABN, bank details), why, how long it is kept, and a link to the privacy policy | APP 1 and APP 5; supports the retention position in §5.2 |
| 12 | **Marketing conduct by the referrer** — no misleading statements about AMJ or its products, no unauthorised use of branding, no spam | ACL s 18 exposure created *by the referrer's* conduct; the M2M agreement treats this as a core clause |
| 13 | **No agency** — the referrer is not an agent, partner or employee and cannot bind AMJ | Ostensible authority claims; also relevant to the referrer's own tax status |
| 14 | **Set-off and account standing** — commission may be applied against amounts the referrer owes; suspension while in breach | Bad-debt exposure. Present in the M2M reference |
| 15 | **Governing law and jurisdiction** — the relevant Australian State or Territory | Forum disputes |
| 16 | **How the terms are notified and where they live** — and, per spec §11, that program figures are stated on the program page rather than as literals in the terms | Prevents the terms advertising a stale rate after an ops config change |

---

## 7. Anti-fraud and gaming

### 7.1 There is no Australian regulatory guidance on this — [CLEAR, and it contradicts the assumption]

Searches across ACCC, ASIC, business.gov.au and state Fair Trading material found **nothing**
addressing self-referral, circular referrals, related-entity referrals, or a business referring
itself through a second ABN. Everything substantive returned was commercial vendor content.

**The practical consequence is not "anything goes" but the reverse: there is no safe harbour to
copy.** No regulator has blessed any particular anti-gaming design, so the only real constraint on
how the rules are written is the s 24 unfairness test (§4.5) — which cuts *against* broad discretion.

### 7.2 The finding that matters most: one ABN per person is not a reliable control

**[CLEAR] A single individual can legitimately hold more than one ABN.** The Australian Business
Register: *"You can conduct any number of businesses/activities under the same ABN provided they all
operate under the same business structure. If your second or subsequent business operates under a
different structure, you need to apply for separate ABNs for each new business structure."*
[ABN Lookup, *ABN basics FAQs*](https://abr.business.gov.au/FAQ/ABNBasics) (fetched)

So the same person may hold a sole-trader ABN **and** be the sole director of a Pty Ltd with its own
ABN, **and** be trustee of a trust with a third — all entirely legitimately.

**[CLEAR] This directly limits the spec's A13 gate** ("same ABN as the referrer → refused"). A13 is
worth keeping — it catches the lazy case — but it **cannot** be described, internally or in the
terms, as preventing a business from referring itself. Someone willing to use their company ABN
alongside their sole-trader ABN passes A13 cleanly. The spec's §4.6.6 already reaches the right
conclusion about containment (every quote is human-reviewed; the perpetrator must buy and pay for a
real order; the maximum gain is bounded and self-funding); **this finding strengthens that reasoning
rather than undermining it**, but it also means the ABN check should not be over-claimed.

### 7.3 What is actually available as a control

**[CLEAR] ABN Lookup is a free public register** exposing an ABN's status, entity name and entity
type. **[PRACTICE]** Verifying that the quoted ABN is active and that its registered entity name
matches the payee account name is a cheap, high-value check that also serves the no-ABN withholding
position (§3.4) and the RCTI requirement to show the supplier's identity and ABN (§2.2).

**[PRACTICE]** Beyond that, the reviewable signals are the ones the spec already flags for manual
review: shared phone, shared business name, shared delivery postcode, common director. Objective,
stated criteria plus a review path are both more effective and more UCT-defensible than an
open discretion to forfeit.

### 7.4 Pyramid selling — checked, and not engaged

**[CLEAR]** ACL ss 44–46 prohibit pyramid schemes, whose defining features are a **participation
payment** by new members and earnings substantially derived from **recruiting further members**
rather than genuine product sales. AMJ's program has neither: there is no payment to join, the
commission is a percentage of real ex-GST goods value on a genuinely paid order, and spec decision
A10 forbids chains and levels entirely. **Low risk — provided it stays single-tier and the payment
stays tied to product value rather than to recruitment.** Worth noting the boundary is contested:
the Federal Court found the ACN scheme to be a pyramid scheme and the Full Court subsequently upheld
ACN's appeal.

---

## 8. Confidence summary

### Clear from primary sources

- Referral commission is assessable income to the referrer (ITAA 1997 s 6-5) and deductible to AMJ.
- A referral service by a GST-registered referrer is a taxable supply (GST Act s 9-5); an
  unregistered referrer charges no GST; compulsory registration starts at $75,000 turnover.
- **A bare stated amount is GST-inclusive** (GST Act ss 9-70, 9-75) — silence is not neutral.
- AMJ qualifies to issue RCTIs as a **"business entity" that determines the value** under s 6(2) of
  the 2023 Determination; no turnover threshold applies.
- The RCTI written agreement **may be embedded in the RCTI itself** (s 9), with a 21-day rejection
  window; 28-day issue deadline; 5-year retention.
- **No tax invoice at all is needed where the supply's value is ≤$75 ($82.50 inc GST)** — GST Act
  s 29-80 — covering referred orders up to $8,250 ex-GST at a 1% rate.
- No-ABN withholding is **47%**, applies above $75 excluding GST, and brings PAYG registration,
  activity-statement reporting, a NAT 3283 payment summary and an annual report. Requiring an ABN
  avoids the trigger. The *Statement by a supplier* form is unavailable to someone in business.
- **ACL s 49 (referral selling) is a strict-liability offence** (s 167) with penalties up to $100m
  for a body corporate.
- **"Both parties are businesses" does not remove ACL consumer protections** — the s 3 threshold is
  $100,000 and windows are goods ordinarily acquired for household use. **s 18 has no consumer
  threshold at all.**
- **ACL s 32(2)** requires a rebate to be provided within the time specified, or a reasonable time.
- UCT applies to sole traders (s 23(4): <100 employees **or** <$10m turnover, **no** value
  threshold); since 9 Nov 2023 proposing or relying on an unfair term is a penalty contravention;
  s 24(4) puts the burden on the drafter; **unilateral variation, unilateral termination and
  unilateral determination are all on the s 25 grey list**.
- **Bank details are NOT "sensitive information"** under the Privacy Act s 6(1) — contrary to common
  assumption — though APP 11 still weighs their practical sensitivity.
- APP 11.2 requires destruction or de-identification once no longer needed; ATO/RCTI retention is
  5 years and attaches to the payment record, not necessarily the live credential.
- A sole trader's ABN and order value can be personal information; public availability does not
  change that.
- **Privacy Act s 6D small business exemption still exists** (Compilation No. 104, 4 June 2026), and
  **s 6D(4)(c)/(d) can remove it for a paid referral arrangement**, with consent under s 6D(7)–(8)
  as the escape hatch.
- The statutory tort of serious invasion of privacy commenced 10 June 2025 and **reaches businesses
  exempt from the Privacy Act**; it requires intentional or reckless conduct.
- **An individual may legitimately hold multiple ABNs** across different business structures.

### Appears to be common practice / reasoned inference

- Stating that the referrer is responsible for their own tax.
- Using the embedded-agreement RCTI route rather than a separate signed agreement.
- Stating amounts exclusive of GST and grossing up for registered referrers (the M2M structure).
- Verifying ABN status and entity-name match via ABN Lookup before payout.
- Encryption at rest, UI masking, role-restricted access and audit logging of bank-detail reads.
- Purging the live payout credential after the final payout while retaining the ledger entry.
- Showing referrers a binary qualified/not-qualified status or their own earned amount rather than
  the referred party's order value; banding commission figures to break the inversion.
- Confining variation rights to specified circumstances with notice and an exit right.
- Objective, stated fraud criteria with a review path rather than unreviewable discretion.

### Genuinely uncertain — needs the client's accountant or lawyer

- Whether the payment should be GST-inclusive or exclusive (commercial + tax decision).
- Whether the $75 / $82.50 no-invoice threshold applies per referral or per batched bank transfer.
- Whether a tradie installing windows into a client's building falls within the ACL s 3(2)
  exclusion, and therefore whether the consumer-only provisions bite.
- Whether the referral T&Cs standing alone are a "contract for a supply of goods or services" for
  UCT purposes.
- **Whether this program engages Privacy Act s 6D(4)(d) and ends the small business exemption for
  the whole business.** Highest-stakes open question in this document.
- Whether a referred tradie "reasonably expects" order-value disclosure under APP 6.2(a) absent
  express consent.
- Whether the statutory tort could reach a referral-status disclosure (no case law).
- Second-tranche Privacy Act reform timing (search snippets only).
- The Unfair Trading Practices Bill 2026 passage and commencement dates (search snippets only).

---

## 9. Questions the client must put to their accountant / lawyer

### For the accountant

1. Should the advertised referral commission be **GST-inclusive or GST-exclusive**? Note that a bare
   "$500" defaults to inclusive under GST Act s 9-75, which means a GST-registered referrer nets
   ~9.1% less than an unregistered one for an identical referral. Which do you recommend, and what
   exact wording should the terms carry?
2. Do you want us to **issue RCTIs** under s 6(2) of the 2023 Determination — for which we qualify as
   a "business entity" that determines the value — or will you work from the CSV export and have
   referrers issue their own invoices? If RCTIs: **embedded agreement (s 9) or separate written
   agreement (s 8)?**
3. Given GST Act s 29-80, **no tax invoice is required where the supply's value is ≤$75 ($82.50 inc
   GST)** — at a 1% rate that is every referred order up to $8,250 ex-GST. **Do you want RCTIs issued
   only above that threshold, or for every payment for consistency?**
4. When we batch several confirmed earnings into **one weekly bank transfer**, do the $75 no-ABN
   threshold and the $82.50 tax-invoice threshold apply **per referral or per transfer**?
5. We propose to pay no one without a valid quoted ABN, holding the earning until it is supplied.
   **Does that fully discharge our no-ABN withholding obligation**, and are you comfortable we need
   not register for PAYG withholding for this program at all?
6. **Should we verify ABNs against ABN Lookup** (active status, and registered entity name matching
   the payee account name) before each payout, and do you want that check recorded?
7. **How long should we retain a referrer's live BSB and account number** after their final payout,
   given APP 11.2 requires destruction once no longer needed but tax records must be kept five
   years? Is retaining only the frozen payment-record snapshot sufficient for your purposes?
8. Draft ruling **GSTR 2026/D2** on RCTIs was published 29 July 2026 and will replace GSTR 2000/10.
   **Is there anything in it that changes your answer to Q2 or Q3?**

### For the lawyer

9. **Does this program engage Privacy Act s 6D(4)(d)** — providing a benefit to collect personal
   information about another individual from someone else — and thereby **end our small business
   exemption for the entire business**? Our design has the referred tradie enter a code themselves
   rather than the referrer submitting their details. **Is that distinction sufficient, and what
   exactly must we never change?**
10. Related: if it does engage s 6D(4)(d), **what consent wording and placement would satisfy
    s 6D(8)**, and should we take that consent from the referred tradie at the point the code is
    applied?
11. **Does our marketing create ACL s 49 (referral selling) exposure?** Specifically: our home page
    and trade-account pages show the referral pitch to logged-out prospective customers. Our rule is
    that any registered account may refer without ever having ordered. **Is that enough to keep the
    commission outside "inducing a consumer to acquire goods", and what copy must we avoid?**
12. **Are our customers "consumers" under ACL s 3?** Windows and doors are goods ordinarily acquired
    for household use and most orders are under $100,000, but our buyers are tradies who install them
    into clients' buildings — **does the s 3(2)(b)(ii) "repairing or treating other goods or fixtures
    on land" exclusion apply?**
13. **How should the variation and termination clause be drafted** so it is not an unfair term under
    ACL ss 24–25? We want to be able to end the program, but we intend to honour money already
    earned and to let referrals already recorded run out their 12-month window.
14. **Is our fraud/forfeiture clause a UCT risk?** We want to withhold payment where we believe a
    referral is a self-referral through a related entity, but s 25(h) covers terms letting one party
    unilaterally determine breach. **What review path do we need to include?**
15. Should the referral program terms be **standalone or incorporated into the trading-account
    terms**, given the uncertainty over whether standalone referral terms are a "contract for a
    supply of goods or services" under s 23(4)(a)?
16. **What exactly may we show a referrer about the people they referred?** We plan to show business
    name or masked email plus a status, and the commission they earned. Because the rate is
    published, the commission figure discloses the referred party's order value by simple
    arithmetic. **Is that acceptable with an APP 5 notice to the referred tradie, or do we need
    express consent — or should we band the displayed figure?**
17. **What must the referred tradie be told**, and when, about the fact that their mate is paid a
    percentage of their first order?
18. Our terms will state a payment timeframe to satisfy **ACL s 32(2)**. **What timeframe is
    defensible** given payouts are made manually in a weekly batch, and how should we express the
    minimum-payout-balance hold so it is not a failure to provide the rebate as offered?
19. **Confirm the gift card regime (ACL Pt 3-2 Div 3A) does not apply** to either the 12-month
    attribution window or the referred tradie's percentage discount, on the basis that neither is an
    "article ... commonly known as a gift card or gift voucher ... redeemable for goods or services"
    under s 99A. **Is there any argument to the contrary we should know about?**
20. If the owner later chooses a **fixed-dollar discount** instead of a percentage (spec §12 D14),
    and it is implemented as a credit with a balance attached to the account, **does that change your
    answer to Q19?**
21. **Which State or Territory's unclaimed money legislation applies to us?** Under it, does a
    referral commission that has been earned but never collected — because the referrer never
    supplies an ABN and bank details — **become "unclaimed money" we must lodge with the state, and
    after what period?**
22. **Can we draft the terms so a commission does not become "legally payable" until the referrer
    supplies a valid ABN and bank details**, so that the unclaimed money clock does not start? If so,
    **is that condition itself at risk of being an unfair term**, and how should it be limited — a
    long-stop date, a duty on us to chase, or something else?
23. Is our **12-month attribution window** — disclosed prominently, and snapshotted at the time the
    referral is recorded so it cannot be shortened retrospectively — **defensible under ACL s 24?**
    What would you change about how it is expressed?
24. Does **ACL s 32(2)** require us to state the expiry **within the offer itself** rather than only
    in linked terms, and does the minimum payout balance need the same treatment?

---

## 10. The 12-month expiry and the gift card question

*Added after the main research pass, at the client's request. Same tagging and citation conventions.*

### 10.0 Short answer

**[CLEAR] The gift card regime does not reach either clock — and not because of an exemption. Neither
thing is a gift card in the first place.** The three-year minimum in ACL s 99B is triggered by
*supplying a gift card*, and s 99A defines that as an **article**, commonly known as a gift card or
gift voucher, **redeemable for goods or services**. AMJ issues no article, nothing is redeemable, and
nobody would call either thing a gift voucher.

A lawyer should still confirm before launch, because that is what launch sign-off is for. **But it is
not a close question, and it should not shape the design.** The exemption analysis in §10.2 is a
fallback that is never reached.

**The part of the client's question that *should* change the design is the last part — unclaimed
money (§10.7).** "We never expire earned commission" is the right policy, but it does **not** follow
that AMJ may hold that money indefinitely. In Victoria it very likely may not.

### 10.1 The statutory definition, and why neither clock falls inside it

**[CLEAR]** ACL s 99A (Competition and Consumer Act 2010 Sch 2, compilation current to 1 July 2026):

> **99A Meaning of gift card**
> A gift card is:
> (a) an article (whether in physical or electronic form) that:
>   (i) is of a kind that is commonly known as a gift card or gift voucher; and
>   (ii) is redeemable for goods or services; or
> (b) an article of a kind specified in regulations made for the purposes of this paragraph;
> but does not include an article of a kind specified in the regulations.

[CCA Sch 2 s 99A](https://www.legislation.gov.au/C2004A00109/latest/text) (fetched)

The limbs in (a) are **cumulative**. Applied to AMJ:

| Limb | The referrer's commission | The referred tradie's discount |
|---|---|---|
| **an "article"** (physical or electronic) | No. A contingent promise to pay money. Nothing is issued. | No. Per spec §4.6.4 the discount is *evaluated per pricing call* by `loadAccountDiscount`, with **"no stored flag to go stale"**. There is literally no object. |
| **commonly known as a gift card or gift voucher** | No. | No. |
| **redeemable for goods or services** | No — it is a payment of cash to the referrer, not redemption. | No. A percentage reduction applied to a price is not redeemed; nothing is exchanged for goods. |

**The referral code is not a counter-example.** It is an identifier that attaches a relationship to an
account (spec §7 — `user.referral_code`, unique index, no separate code table). It carries no value,
no balance, and is not supplied to anyone as a thing.

**[CLEAR] Treasury says exactly this, and it is decisive.** The Explanatory Statement to the gift card
regulations, quoting **paragraph 1.24 of the Explanatory Memorandum to the Bill**:

> "credit, charge and debit cards, public transport tickets, buy a certain number, get one free-style
> customer loyalty cards (e.g. coffee cards); and **discount offers and advertising material are not
> commonly known as a gift card and therefore do not need to be specifically exempted.**"

[Treasury, *Explanatory Statement — Gift Cards* (exposure draft), March 2019](https://treasury.gov.au/sites/default/files/2019-03/c2018-t333988-ES_Gift_Cards.pdf)
(fetched; PDF text extracted. **Note: this document is marked EXPOSURE DRAFT** — it is cited here
because it quotes verbatim the authoritative EM para 1.24, whose wording is independently confirmed
by search results for the
[Bill's Explanatory Memorandum](https://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;query=Id:%22legislation/ems/r6188_ems_ba9da418-5082-4b5d-9978-7683a85f440f%22).)

Two things follow, and the second is the more useful:

1. "Discount offers" are outside the definition — AMJ's discount is exactly that.
2. **Treasury's reasoning is that such things "do not need to be specifically exempted"** — they never
   enter the definition, so the exemption list is irrelevant to them. That is a stronger position than
   relying on a carve-out, because a carve-out can be amended and a definition boundary is structural.

**[CLEAR] The ACCC frames a gift card the same way**: *"A gift card, sometimes known as a gift
voucher, is usually loaded with an amount of money. The person who receives the gift card can exchange
it for goods or services to the value of the amount on the card."* Stored value, exchanged for goods.
The ACCC separately treats **"discount vouchers"** as a *distinct category* — shopper dockets, loyalty
stamp cards and the like — whose only stated rule is that **"a business must clearly state all
conditions and restrictions on how discount vouchers can be used."**
[ACCC, *Gift cards and discount vouchers*](https://www.accc.gov.au/business/treating-customers-fairly/rules-for-gift-cards)
(fetched; no revision date shown)

**That ACCC sentence is, in substance, the whole of AMJ's obligation here.**

### 10.2 The exemptions — accurately listed, with two corrections

The brief's understanding was that *"cards or vouchers supplied free of charge as part of a customer
loyalty or promotional programme are carved out of the 3-year minimum."* **Partly right, and the
detail matters in a way that helps AMJ.**

**[CLEAR] The accurate list.** Competition and Consumer Regulations 2010, reg 89A and reg 89C
(compilation current to 11 August 2026):
[Regulations text](https://www.legislation.gov.au/F1996B01420/latest/text) (fetched)

**Reg 89A — not a gift card at all:**
- (a) an article redeemable for goods or services whose value **can be increased after supply** (i.e.
  reloadable prepaid cards), other than by payment reversal or error correction;
- (b) an article only redeemable for **electricity, gas or a telecommunications service**.

**Reg 89C(1) — s 99B and s 99F(1)(b) do not apply to gift cards that are:**
- (a) only redeemable for a particular good or service **available only for a specified period**, and
  which cease to be redeemable at the end of it;
- (b) only redeemable for a particular good or service and **supplied at a genuine discount** on its
  market value.

**Reg 89C(2) — s 99B and s 99F(1)(b) do not apply to gift cards supplied:**
- (a) **as part of a temporary marketing promotion to the purchaser of goods or services in connection
  with the purchase**;
- (b) **donated for a promotional purpose**;
- (c) for an **employee reward scheme**;
- (d) **for the purposes of a customer loyalty program**;
- (e) in exchange for another gift card ceasing to be redeemable at the same time.

**Reg 89C(3) — the whole of Subdivision B does not apply to:**
- second-hand gift cards (supplied by someone who cannot vary the expiry); and
- gift cards supplied to certain registered charities, Commonwealth/State/Territory departments,
  non-commercial agencies, and local government bodies.

**Correction 1 [CLEAR]: there is no general "supplied free of charge" exemption.** The carve-outs are
specific named categories, and "free of charge" is not one of them. Note that reg 89C(2)(a) actually
requires the card be supplied *to the purchaser of goods or services in connection with the purchase*
— i.e. it presupposes a purchase, not a giveaway.

**Correction 2 [CLEAR], and this is the one worth internalising: the loyalty and promotional
carve-outs are narrower than they appear.** They disapply **only s 99B (the 3-year minimum) and
s 99F(1)(b) (the corresponding void provision)**. They do **not** disapply **s 99C — the requirement
that the expiry appear prominently on the card**. Only reg 89C(3) (second-hand; charities and
government) disapplies the whole Subdivision.

The ACCC's own page confirms this asymmetry: the exceptions it lists for the *display* rule are only
second-hand cards, charities/government agencies, and reloadable cards — **"customer loyalty program"
is present in its 3-year exception list and absent from its display-rule exception list.**

**So even on the counterfactual where AMJ's incentive *were* a gift card supplied under a loyalty
program, the three-year minimum would fall away but the duty to display the expiry prominently would
survive.** That is worth stating because it points in the same direction as everything else in this
document: **the legal duty attaching to an expiring incentive is prominent disclosure, not a long
period.**

**[PRACTICE] Does the referral incentive sit inside a carve-out?** It does not need to, and AMJ should
not argue that it does. If pressed, reg 89C(2)(d) ("customer loyalty program") is the nearest fit, but
a *referral* program rewards introducing other people rather than repeat custom, so the fit is
imperfect. **Rely on the definition (§10.1), not the carve-out.**

### 10.3 Does the gift card regime reach B2B at all?

**[CLEAR] It adopts the general ACL consumer definition — there is no narrower one.** Sections 99B,
99C and 99D are each framed as *"A person must not, in trade or commerce, supply a gift card **to a
consumer**..."*. The ACL dictionary (s 2) provides simply: **"consumer: see section 3."**
[CCA Sch 2 ss 2, 99B–99D](https://www.legislation.gov.au/C2004A00109/latest/text) (fetched)

**The brief was right not to assume B2B is outside.** As established in §4.2, s 3 captures business
acquisitions under the $100,000 threshold and goods ordinarily acquired for personal, domestic or
household use. **If AMJ ever issued actual gift cards to tradies, the regime would very likely reach
them**, notwithstanding that both parties are businesses.

It does not matter here **only** because there is no gift card. This is a live constraint on any
future design, not a general immunity.

### 10.4 The two clocks, treated separately

**(1) The attribution window (the referrer's commission) — [CLEAR] plainly outside.** Nothing is
issued to the referrer. The commission is a contingent promise that matures only if a third party
signs up, orders and pays in full. It is not an article, not redeemable for goods or services, and not
commonly known as a gift card. In contract terms it is a **condition precedent**, and the gift card
regime has nothing to say about it.

**(2) The referred tradie's first-order discount — [CLEAR] also outside**, for the reasons in §10.1.
The strongest point is a fact about the implementation rather than a legal characterisation: under
spec §4.6.1 the discount is composed inside `loadAccountDiscount` and applied by the single existing
percentage-discount step in the pricing engine; under §4.6.4 it is **evaluated per pricing call with
no stored flag**. There is no instrument, no balance and no object that could be supplied to anyone.

**[PRACTICE] One caveat with a design consequence.** This analysis depends on the discount remaining
**a percentage computed at pricing time**. If the owner later chooses the **fixed-dollar form** (spec
§12 D14) *and* it were implemented as a **credit with a balance attached to the account**, the margin
narrows — a dollar-value credit sitting on an account and applied against goods starts to resemble the
mischief the regime targets. It would still probably fall outside s 99A (no article supplied, not
commonly known as a gift voucher), but "probably" is doing more work than it does today.

**This is an additional, independent reason to prefer the percentage form** beyond the engineering
reasons the spec already gives at §4.6.2 — and it is the substance of lawyer question 20.

### 10.5 If there is no minimum period, what actually constrains us?

**[CLEAR] The brief's framing is correct: no Australian law imposes a minimum validity period on an
incentive of this kind.** The constraints are conduct rules, not duration rules:

1. **ACL s 18 / s 29 — misleading conduct.** Per §4.3, fine print must not contradict the headline
   message. An expiry that is material to the offer belongs where the offer is made.
2. **ACL s 32(2) — and yes, it bears directly on this** (answering the brief's specific question).
   Section 32(2) requires a person who offers a rebate in connection with promoting the supply of
   goods or services to provide it *"within the time specified in the offer or (if no such time is
   specified) within a reasonable time after making the offer"*. Its relevance to an *expiring*
   incentive is this: **s 32(2) fixes AMJ's obligation to deliver, and an expiry is a limitation on
   that obligation. A limitation that is not stated in the offer is not part of the offer.** A
   12-month window disclosed in the offer is a term of it; a window introduced later, or buried, is
   AMJ narrowing an obligation it has already assumed. Section 32(1) separately prohibits offering a
   rebate with the intention of not providing it.
3. **Unfair contract terms** — §4.5, applied to this specific term in §10.6.

**[CLEAR] Conclusion: the duty is prominence and clarity, not length.** A clearly and prominently
disclosed 12-month window is lawful. A generous but obscure window is worse than a short but obvious
one.

### 10.6 Is a 12-month expiry at risk of being unfair? (§4.5 and §4.3 applied)

Applying the s 24 test, all three limbs of which must be met, with s 24(4) putting the burden on AMJ
to prove the term is reasonably necessary.

**What makes it more defensible — [PRACTICE]:**

- **Nothing was paid for it.** Neither benefit was purchased; no consideration was given up to obtain
  it. That weakens the **detriment** limb (s 24(1)(c)) considerably — the party loses an unexercised
  gratuitous opportunity, not something they bought. **This is the single biggest distinction from a
  gift card**, where the consumer has paid real money and expiry destroys value they own.
- **The window serves a genuine commercial purpose.** Attribution exists so AMJ pays for introductions
  that actually caused a sale, and a causal claim genuinely decays with time. That is a legitimate
  interest for s 24(1)(b), and articulating it in the terms helps discharge the s 24(4) burden.
- **The referred tradie controls the trigger.** They decide whether and when to order; the clock is
  not something AMJ springs on them.
- **Prominent, plain disclosure** feeds directly into the s 24(2)(a) transparency factor.

**What would raise the risk — [PRACTICE]:**

- **Pairing the expiry with a unilateral right to vary or shorten it.** This is the real exposure. An
  expiry term standing alone is ordinary; an expiry term *plus* "we may change these terms at any
  time" engages s 25(d) and would let AMJ retrospectively cut short an advertised benefit. **The
  spec's M10 snapshot rule is the answer** — the window in force when the referral was recorded is the
  window that applies — and **the terms must say so, not just the code.**
- **Expiring money already earned.** The spec deliberately does not (§4.7). That is correct and is the
  most important thing to preserve: expiring an *earned* commission is far closer to the gift card
  mischief and would be the most attackable term in the whole document.
- **Burying the expiry** in linked terms rather than stating it with the offer (also the s 32(2)
  point).
- **No reminder before lapse.** [PRACTICE] A notice as the window approaches is cheap and is strong
  evidence of fairness if the term is ever challenged.

**[PRACTICE] Overall assessment: low risk.** A clearly disclosed 12-month attribution window,
snapshotted at recording, on a benefit nobody paid for, in a program where earned money never expires,
is defensible. It is not zero risk — **no case law or ACCC guidance on referral-program expiry terms
was found**, so this is reasoned application of the s 24 test rather than a settled answer.

**One caution [CLEAR]: transparency is necessary but not sufficient.** Section 24(2)(a) makes
transparency a *mandatory consideration*, not a safe harbour — a perfectly clear term can still be
unfair. Disclosing the expiry well does not by itself immunise it.

### 10.7 Unclaimed money — the part of the question that does bite

**[CLEAR] Here the honest answer is not "no rule applies".** The spec's decision never to expire
earned commission is right — but **it does not follow that AMJ may hold the money indefinitely.**
State and territory unclaimed money regimes can require a business holding money owed to someone to
hand it to the state. **They differ materially, and the difference decides the answer.**

**Victoria — would very likely catch the scenario.** *Unclaimed Money Act 2008* (Vic) s 3(1):

> **unclaimed money** means — (a) principal, interest, dividends, bonuses, profits, salaries, wages
> and **any other sums of money that are legally payable to the owner and that have remained unpaid
> for not less than 12 months after that money became payable** ... other than any amount the value of
> which is less than $20 or the prescribed amount (whichever is higher).

Business obligations: **s 11** requires a business to keep a business register and, by 31 March each
year, enter the unclaimed money it held as at 1 March; **s 12** requires payment to the Registrar on or
before 31 May each year.
[Unclaimed Money Act 2008 (Vic), authorised version](https://www.legislation.vic.gov.au/in-force/acts/unclaimed-money-act-2008/019)
(PDF fetched and text extracted)

→ **A $200 earned commission, legally payable and unpaid for 12 months, is well above the $20 floor
and on the face of the definition is unclaimed money that AMJ would have to register and remit.**
The catch-all "any other sums of money that are legally payable" is deliberately broad and is not
limited to accounts or deposits.

**New South Wales — much narrower; probably not caught, but not certainly.** *Unclaimed Money Act
1995* (NSW) **s 7(1)**: money is unclaimed money if it is money of a kind referred to in s 8 that
**"an enterprise holds in an account that has not been operated on for at least 2 years"** (reduced
from six years by amendments in 2025). **s 8** limits the kinds to: (a) money the recovery of which
has been or may be barred by operation of law; (b) money on deposit; (c) withdrawable share capital.
**s 8A** separately obliges an enterprise to make reasonable efforts to identify and locate the owner
and to ensure the money is paid — **maximum penalty 500 penalty units for a body corporate**.
[Unclaimed Money Act 1995 (NSW)](https://legislation.nsw.gov.au/view/whole/html/inforce/current/act-1995-075)
(fetched);
[Revenue NSW, *How to return unclaimed money*, last updated 24 July 2026](https://www.revenue.nsw.gov.au/unclaimed-money/return-unclaimed-money)
(fetched — confirms the "held in an account" framing and that amounts of $100 or less are not
classed as unclaimed money)

→ **[UNCERTAIN]** An accrued liability in a ledger is arguably not money "held in an account", and an
unpaid commission is not obviously within s 8(a)–(c) until recovery becomes statute-barred. But
s 8A's positive duty to locate the owner and ensure payment applies regardless of that argument.

**Queensland** — administered by the Queensland Public Trustee rather than a revenue office; not
analysed in detail here.
[Queensland Public Trustee, *Unclaimed money*](https://www.qld.gov.au/law/laws-regulated-industries-and-accountability/money-tax-and-trust-accounts/money-and-finance/unclaimed-money)
(fetched)

**[CLEAR] I could not determine AMJ's State or Territory from the repository.** The answer changes
with the jurisdiction, so **it must be identified before the terms are drafted.** This is lawyer
question 21.

**[CLEAR] What holds regardless of state:**

- **Do not design "if they never claim it, we keep it."** In Victoria that is very likely wrong; in
  NSW there is at minimum a positive statutory duty to make reasonable efforts to locate the owner and
  get them paid, backed by penalties.
- **The spec's existing design is already doing useful evidentiary work.** Showing a referrer exactly
  what is missing and that the money is held rather than lost (§8.3(5), AC-28), plus the "earning
  confirmed" email (§9), is precisely the "reasonable efforts to identify, locate and pay the owner"
  these regimes require. **Keep it, and keep a record of the attempts.**

**[PRACTICE] The strongest available drafting lever, with a caveat.** The Victorian clock runs from
when the money *"became payable"*. If the terms make supply of a valid ABN and bank details a genuine
**condition precedent to the commission becoming payable** — rather than merely a practical
prerequisite to transferring money already owed — the 12-month clock arguably never starts. The
spec's M12 already holds the earning as `confirmed` pending details, which is structurally close to
this, but **the terms must express it as a condition of payability** for the argument to be available
at all.

**[UNCERTAIN] Whether that framing survives scrutiny is exactly a lawyer question, and there is a real
tension in it**: a condition precedent drafted so that money can never become payable could itself be
attacked as an unfair term under §4.5 — AMJ would be relying on its own terms to avoid a debt
indefinitely. A long-stop date, or a duty on AMJ to chase the referrer, would likely be needed to make
it defensible. This is lawyer question 22.

### 10.8 Summary

| Question | Answer | Confidence |
|---|---|---|
| Does the 3-year gift card minimum apply to the 12-month **attribution window**? | **No** | [CLEAR] |
| Does it apply to the **referred tradie's discount**? | **No** | [CLEAR] |
| Is that because of an exemption? | **No — neither is a gift card under s 99A at all.** The exemptions are never reached | [CLEAR] |
| Is there a general "supplied free of charge" exemption? | **No** — the carve-outs are specific named categories | [CLEAR] |
| Would the loyalty carve-out remove *all* gift card duties if it applied? | **No** — it removes only the 3-year rule; the prominent-expiry duty (s 99C) survives | [CLEAR] |
| Would the regime reach B2B if we *did* issue gift cards? | **Very likely yes** — s 99B adopts the s 3 consumer definition | [CLEAR] |
| Is there any minimum period we must offer? | **No** | [CLEAR] |
| What is the actual duty? | **Disclose the expiry clearly and prominently, in the offer itself** | [CLEAR] |
| Is a 12-month expiry at risk of being an unfair term? | **Low risk** if prominently disclosed, snapshotted at recording, and earned money never expires | [PRACTICE] |
| May we hold earned-but-uncollected commission indefinitely? | **No.** State unclaimed money law likely requires remitting it — Victoria very likely at 12 months | [CLEAR] a regime applies; [UNCERTAIN] which |

**The sharp answer the client asked for:** the gift card framework plainly does not reach this, the
12-month expiry is enforceable, and the design does not need to change on that account. Have a lawyer
confirm it at launch sign-off, but do not treat it as an open question. **The genuinely open issue
uncovered by asking it is unclaimed money, not gift cards — and that one affects the money the spec
was most confident about: the commission it deliberately never expires.**

---

## Appendix — primary sources cited

| Source | Date | Fetched? |
|---|---|---|
| [GST Act 1999 (compilation to 1 Jan 2026)](https://www.legislation.gov.au/C2004A00446/latest/text) | 2026-01-01 | Yes |
| [GST RCTI Determination 2023 (F2023L00785)](https://www.legislation.gov.au/F2023L00785/asmade/text) | made 23 May 2023 | Yes |
| [Competition and Consumer Act 2010, Sch 2 (ACL) (compilation to 1 Jul 2026)](https://www.legislation.gov.au/C2004A00109/latest/text) | 2026-07-01 | Yes |
| [Privacy Act 1988 (Compilation No. 104)](https://www.legislation.gov.au/C2004A03712/latest/text) | 2026-06-04 | Yes |
| [ITAA 1997](https://www.legislation.gov.au/C2004A05138/latest/text) | current | Act identity verified; s 6-5 wording from search snippet |
| [ATO — Withholding if ABN is not provided](https://www.ato.gov.au/businesses-and-organisations/hiring-and-paying-your-workers/payg-withholding/payments-you-need-to-withhold-from/withholding-from-suppliers/withholding-if-abn-not-provided) | 2025-06-11 | Yes |
| [ATO — Payments you don't withhold from](https://www.ato.gov.au/businesses-and-organisations/hiring-and-paying-your-workers/payg-withholding/payments-you-need-to-withhold-from/withholding-from-suppliers/payments-you-don-t-withhold-from) | 2025-06-11 | Yes |
| [ATO — Statement by a supplier not quoting an ABN](https://www.ato.gov.au/forms-and-instructions/statement-by-supplier-not-quoting-an-abn) | 2017-06-30 | Yes |
| [ATO — Tax invoices](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices) | 2025-08-25 | Yes |
| [ATO — Recipient-created tax invoices](https://www.ato.gov.au/forms-and-instructions/recipient-created-tax-invoices) | 2025-08-25 | Yes |
| [ATO — Registering for GST](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/registering-for-gst) | 2025-05-23 | Yes |
| [ATO — Deductions](https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/income-and-deductions-for-business/deductions) | 2026-06-18 | Yes |
| [ATO — Advice under development, GST issues (GSTR 2026/D2)](https://www.ato.gov.au/about-ato/ato-advice-and-guidance/advice-under-development-program/advice-under-development-gst-issues) | draft pub. 2026-07-29 | Yes |
| [ATO — Record-keeping overview](https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/record-keeping-for-business/overview-of-record-keeping-rules-for-business) | current | Snippet |
| [ABN Lookup — ABN basics FAQs](https://abr.business.gov.au/FAQ/ABNBasics) | v9.9.7, undated | Yes |
| [ACCC — Unfair business practices](https://www.accc.gov.au/business/selling-products-and-services/unfair-business-practices) | undated | Yes |
| [ACCC — False or misleading claims](https://www.accc.gov.au/consumers/advertising-and-promotions/false-or-misleading-claims) | undated | Yes |
| [ACCC — Unfair contract terms](https://www.accc.gov.au/business/business-rights-protections/unfair-contract-terms) | reflects 2023-11-09 | Yes |
| [ACCC — Customer loyalty schemes final report](https://www.accc.gov.au/about-us/publications/customer-loyalty-schemes-final-report) | 2019-12-03 | Yes |
| [ACCC — Compliance and enforcement priorities 2026-27](https://www.accc.gov.au/about-us/publications/compliance-and-enforcement-priorities-2026-27) | 2026-02-19 | Snippet |
| [NSW Government — Referral selling](https://www.nsw.gov.au/legal-and-justice/consumer-rights-and-protection/advertising-product-packaging-and-pricing-laws/referral-selling) | undated | Yes |
| [ASIC — UCT protections for small businesses](https://www.asic.gov.au/about-asic/what-we-do/our-role/laws-we-administer/unfair-contract-term-protections-for-small-businesses/) | 2025-03 | Yes |
| [OAIC — APP Guidelines Ch B (key concepts)](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-b-key-concepts) | v1.4, 2022-12-21 | Yes |
| [OAIC — APP Guidelines Ch 5](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-5-app-5-notification-of-the-collection-of-personal-information) | v1.2, 2019-07-22 | Yes |
| [OAIC — APP Guidelines Ch 6](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-6-app-6-use-or-disclosure-of-personal-information) | v1.1, 2019-07-22 | Yes |
| [OAIC — APP Guidelines Ch 11](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-11-app-11-security-of-personal-information) | 2025-10-03 | Yes |
| [OAIC — Guide to securing personal information](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/handling-personal-information/guide-to-securing-personal-information) | date stamp unreliable | Yes |
| [OAIC — What is personal information?](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/handling-personal-information/what-is-personal-information) | 2017-05-05 | Yes |
| [OAIC — NDB scheme (Part 4)](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/preventing-preparing-for-and-responding-to-data-breaches/data-breach-preparation-and-response/part-4-notifiable-data-breach-ndb-scheme) | 2025-02 | Yes |
| [OAIC — Statutory tort for serious invasions of privacy](https://www.oaic.gov.au/privacy/your-privacy-rights/more-privacy-rights/statutory-tort-for-serious-invasions-of-privacy) | 2025-06-19 | Yes |
| [M2M One Referral Agreement](https://m2mone.com.au/m2m-one-referral-agreement/) | undated | Yes |
| [B2Bpay Partner Referral Program](https://www.b2bpay.com.au/partner-referral-program-b2bpay/) | undated | Yes |
| **Added for §10** | | |
| [Competition and Consumer Regulations 2010 (regs 89A–89C)](https://www.legislation.gov.au/F1996B01420/latest/text) | compilation to 2026-08-11 | Yes |
| [Treasury — Explanatory Statement, Gift Cards (**exposure draft**)](https://treasury.gov.au/sites/default/files/2019-03/c2018-t333988-ES_Gift_Cards.pdf) | 2019-03 | Yes (PDF extracted) |
| [Treasury Laws Amendment (Gift Cards) Bill 2018 — Explanatory Memorandum](https://parlinfo.aph.gov.au/parlInfo/search/display/display.w3p;query=Id:%22legislation/ems/r6188_ems_ba9da418-5082-4b5d-9978-7683a85f440f%22) | 2018 | No — para 1.24 wording via Treasury ES + search snippet |
| [ACCC — Gift cards and discount vouchers](https://www.accc.gov.au/business/treating-customers-fairly/rules-for-gift-cards) | undated | Yes |
| [Unclaimed Money Act 2008 (Vic), authorised version](https://www.legislation.vic.gov.au/in-force/acts/unclaimed-money-act-2008/019) | current | Yes (PDF extracted) |
| [Unclaimed Money Act 1995 (NSW)](https://legislation.nsw.gov.au/view/whole/html/inforce/current/act-1995-075) | current (am. 2025 No 37) | Yes |
| [Revenue NSW — How to return unclaimed money](https://www.revenue.nsw.gov.au/unclaimed-money/return-unclaimed-money) | 2026-07-24 | Yes |
| [Queensland Public Trustee — Unclaimed money](https://www.qld.gov.au/law/laws-regulated-industries-and-accountability/money-tax-and-trust-accounts/money-and-finance/unclaimed-money) | undated | Yes |
