# Vesting Is Crypto's Missing Payment Rail

**Subtitle:** I read about 1.28 million finished vesting schedules on-chain. Crypto has built the mechanism for paying people over time. It has not built the rail.

---

*Disclosure: I'm the founder of Vestream, which tracks token vesting. The research cited in this article was collected through that work.*

---

Ask most people in crypto what vesting is and you'll get the same answer: it's the lock on founder and investor tokens. A year-long cliff, then a monthly drip, there to stop insiders dumping on launch day.

That answer isn't wrong, but it's far too small.

A vesting contract is value released on a schedule and enforced by code. Nobody at the employer approves it, no payroll provider processes it, and no bank sits in the middle. Once it's deployed, the money becomes the recipient's over time, whatever anyone decides later.

That description fits a salary. It fits a pension, a grant, a stock option, a bonus paid in instalments and an investor lockup. Paying people over time is one of the oldest jobs in finance, and crypto built a programmable, global, permissionless version of it years ago. It then treated it as a niche tool for token launches.

Over the past few weeks I measured what actually happens to vested tokens once they unlock. I read about 1.28 million finished schedules across eight protocols and 26 chains, directly from their contracts: 835,908 individually, plus random samples covering an estimated 442,500 more on two Solana protocols ([full method and data](https://www.vestream.io/research/unclaimed-vesting)). It's the first study I know of to cover the category rather than a single protocol.

What I found is that the mechanism works. Almost everything around it doesn't.

## One mechanism, many jobs

Strip any vesting contract back and it has three parts: a pot of value, a schedule, and a recipient. That one primitive already does a remarkable range of work:

- Team and investor vesting, the familiar use.
- Airdrops and community distributions, often to tens of thousands of wallets at once.
- Grants paid in tranches as milestones land.
- Contributor pay streamed by the second.
- Treasury schedules that release a protocol's own reserves over years.

The next wave runs on the same primitive. Circle's [Arc](https://www.certik.com/blog/circle-arc-mainnet-usdc-native-settlement), a layer 1 built for dollar finance with USDC as its gas token, went live on 16 September 2026. [Robinhood Chain](https://www.certik.com/blog/robinhood-chain-onchain-capital-market) launched in July with tokenised stock exposure trading around the clock. Stablecoin salaries, tokenised equity awards and on-chain bonuses are all, mechanically, vesting schedules.

These aren't separate products. They're one primitive with different labels, and any infrastructure that serves one serves all of them.

## Why this matters now

For most of crypto's history, vesting has been informal. The recipients were mostly founders, investors and early contributors. They knew the contract existed and knew where to claim, and if something went wrong it was a problem for a few insiders.

That era is ending. Three things have changed.

Stablecoins have become real money. A schedule denominated in dollars matters to an accountant in a way a schedule in a launch token never did.

Institutions are arriving. Custodians, fund administrators and payroll providers are starting to hold or report on-chain positions for clients who expect statements, not block explorers.

Regulation has caught up. In Europe, MiCA's transition period [ended on 1 July 2026](https://www.amf-france.org/en/news-publications/news/amf-reminds-digital-asset-service-providers-transitional-period-allowing-them-continue-providing), and crypto service providers now need full authorisation. Value paid to people over time has to be recorded, reported and taxed properly.

Something that worked as a script for insiders now has to work as infrastructure for everyone. My research suggests it isn't ready, and it fails in five specific ways.

## Problem one: pull money

When your employer pays you, the payment arrives in your account. The payer's system does the work. Traditional payment rails are push systems: the payer's side sends the money.

Most crypto vesting works the other way. When a tranche unlocks, nothing arrives. The value sits in the contract until the recipient notices, connects a wallet and claims it. Crypto quietly moved the final step of every payment onto the person being paid.

The data shows what that costs. The share of finished schedules still holding unclaimed tokens:

| Protocol | Unclaimed share of finished schedules |
|---|---|
| Jupiter Lock | 2.9% (sample) |
| Streamflow | 26.1% (sample) |
| Sablier | 30.3% (excluding one airdrop) |
| Hedgey | 40.9% |
| UNCX | 48.1% (excluding two mass distributions) |
| Smithii | 60.7% |
| Team Finance | 66.3% of allocations (excluding mass distributions) |
| Unvest | 87.0% |

The more revealing number is *how* people fail to claim. You might expect recipients to start and drift off: claim the first few tranches, then forget. Almost nobody does that. Across every protocol I measured, between 78% and 97% of unclaimed schedules had never been claimed once.

People claim everything or nothing. When someone does stop partway, they stop early. On Streamflow, 148 of the 150 partial claimers in my sample made their last claim before the schedule had even ended.

It would be easy to conclude that push systems are the answer, but they fail too, just differently. Superfluid's vesting schedules are meant to start themselves, triggered by an automated transaction. In a small sample I checked, every schedule had been created but never started, because the transaction that starts it was never sent.

Every payment rail has to answer one question: who is responsible for completing the payment, and what happens when nobody does? Vesting never answered it.

## Problem two: two clocks

A vesting schedule creates two separate moments. The *unlock* is when value becomes yours. The *claim* is when it actually reaches your wallet.

Traditional finance has the same split and treats it as fundamental. Trade date and settlement date are different days. A share award vests on one date and is delivered on another. Entire industries exist to reconcile the two.

In crypto, the two clocks drift apart by months or years, and nothing records both. That matters, because the clock that counts is often the one nobody is watching. In the UK, HMRC treats the vesting of employee share awards as the taxable point. Its closest guidance for tokens points the same way, though there's no definitive rule. A recipient who never claims can still owe tax on value that has been sitting in a contract they've forgotten.

A third of finished schedules are unclaimed. For those recipients, the gap between the two clocks isn't a technicality: it's the difference between a tax return that's correct and one that isn't.

A payment rail records the moment value is earned as well as the moment it moves. Vesting records neither in a form anyone can use.

## Problem three: the chain is the ledger, not the record

The most repeated claim in crypto is that on-chain data is the source of truth. It's true in a narrow sense: the chain holds the raw state. In practice almost nobody reads the chain directly. Wallets, dashboards, analysts and auditors all read it through indexers and APIs, and those copies drift from the chain, in ways I didn't expect.

- **Copies that remember a world that no longer exists.** When a UNCX lock is transferred or split, the contract creates a new lock and empties the old one. The protocol's subgraph, the index most tools read, kept the old lock as if nothing had happened: 2,628 finished locks were recorded as unclaimed when the chain held nothing.
- **Disagreement at scale.** For one protocol, a third-party index disagreed with the chain on 17.5% of vesting contracts. That included 263 contracts recorded as locked whose escrow was actually empty, a pattern consistent with revocations the index never recorded.
- **Units.** One API reports upfront percentages in basis points. Read as plain percentages, grants appear fully claimable on day one.
- **Zeros that mean "never measured".** In a pipeline I built, one protocol's claimed amounts were hardcoded to zero, and that protocol deletes its record entirely when someone claims in full. The naive count came out at a perfect 100% "unclaimed". A clean 0% or 100% is almost always a bug.
- **Assumptions that don't travel.** Ethereum addresses ignore case; Solana's don't. A cleaning step that made sense for one chain silently corrupted 72,872 Solana records in a pipeline I built myself.

None of this is fraud. It's what happens when a ledger has no trusted record-keeper. In equities, transfer agents and cap-table systems like Carta are the trusted record of who owns what. On-chain value has a perfect ledger and no one whose job is to keep the record right.

## Problem four: hidden obligations

Many vesting programmes don't put their recipients on-chain at all. To save costs, they publish a single cryptographic fingerprint of the full list, a merkle root, and keep the list itself off-chain. A recipient becomes visible only when they claim.

On one protocol I measured, Magna, an allocation becomes visible only when it's claimed. That makes it impossible for any outside observer to count the allocations nobody has claimed. On another, Team Finance, I could only verify recipients by fetching the lists from the protocol and checking all 174,283 entries against their contracts. Every one matched, but only because the protocol still publishes them.

That's fine for a crypto-native team. It's not fine for an auditor, a custodian or a fund administrator, who needs to see obligations, not just outcomes. You can't report a liability you can't see, and institutions won't hold value they can't account for.

## Problem five: schedules outlive their assets

A vesting schedule runs for years, and the token it pays may not last that long.

87% of unclaimed Sablier streams are in tokens that no longer trade anywhere. 91% of unclaimed UNCX locks are in tokens with no market. 83% of the tokens behind unclaimed Smithii schedules on Solana have no price at all. Often, recipients aren't forgetting value; the value has gone. On Unvest, 88% of the positions in two large airdrops were worth less than the fee to claim them, so leaving them was the rational choice.

But not always. Ten unclaimed Hedgey plans are each worth more than $100,000, and some unclaimed positions in liquid tokens have sat untouched for over two years. Across six protocols, the tokens that still trade add up to roughly $4.9–9.5 million, depending on how strictly you discount positions larger than their own markets.

A schedule outliving its asset is a lifecycle problem that payment systems solved long ago, through expiry, unclaimed-property rules and dormant-account handling. Vesting has none of it. Value is either claimed or stuck forever, and nothing distinguishes the forgotten six-figure allocation from the worthless one.

## A note on headline numbers

One more thing the research taught me, and it affects every statistic in crypto, including mine.

On Sablier, a single airdrop token accounted for 61% of all unclaimed streams. On UNCX, one team lock was worth $7.5 million, and a single project streaming tokens to its own treasury held $2.8 million on Sablier. Include those and you can produce almost any headline you want. Every figure in this article states what was excluded and why, because without that, an aggregate on-chain number is close to meaningless.

## Why the standards haven't fixed it

Standards have been tried. [ERC-1620](https://eips.ethereum.org/EIPS/eip-1620), a money-streaming standard proposed in 2018 by Sablier's founder, is now marked stagnant. [ERC-5725](https://eips.ethereum.org/EIPS/eip-5725), a standard for transferable vesting NFTs, reached final status in 2022.

Yet across the protocols I studied, each one still encodes schedules its own way: percentages in different units, balances tracked as internal shares rather than tokens, plans that vanish when fully claimed, recipient lists held off-chain, and different conventions again on Solana.

The problem is the target. Standards so far have tried to define how to *create* a vesting schedule. Protocols compete on how they create schedules, so they will keep diverging. What the rail needs is narrower and easier to agree: a standard for how to *read* one.

Any vesting contract, on any chain, should be able to answer six questions the same way:

1. Who is the recipient?
2. How much was originally granted?
3. How much has unlocked so far?
4. How much has been claimed?
5. Has it been revoked, and if so, when?
6. When does the next amount unlock, and when does it end?

Those six answers are enough for a wallet to show your balance, an accountant to report income on the right clock, an auditor to see obligations, and a custodian to hold positions for clients. None of them constrains how a protocol designs its product.

## What the rail needs

Put the five problems together and the missing infrastructure has five layers:

1. **A common read standard**, so every schedule answers the same six questions.
2. **A verified record**, reconciled against the chain, that institutions can rely on.
3. **Completed payments**: notifications, automatic claiming or push options, so value doesn't sit stranded.
4. **Both clocks recorded**, unlock and claim, for tax, accounting and audit.
5. **Lifecycle handling**: expiry, revocation and dead-asset rules, consistent across EVM chains and Solana.

None of this needs a new blockchain. It's the unglamorous layer every mature financial system eventually builds on top of its ledger.

## Who builds it

Every money system develops this layer eventually. Card payments got card networks. Securities got transfer agents and clearing houses. Private company equity got Carta, which turned spreadsheets of share options into the system of record for startup ownership.

Money released on a schedule, on-chain, has no system of record yet. Whoever builds it won't sit underneath one category. They'll sit underneath all of them: token compensation, airdrops, stablecoin payroll, tokenised equity awards and every product that pays people over time.

## The mechanism is solved. The rail isn't.

Vesting isn't a lockup feature. It's the first draft of how the internet will pay people over time.

Crypto has solved the hard part: value that releases on schedule, enforced by code, with no one in the middle able to stop it. What it hasn't built is the layer that makes the money arrive, makes it visible, keeps it reconciled, and handles it when things go wrong. That gap is why a third of finished vestings are never collected.

We spent a decade making money programmable. The next decade is about making sure it arrives.

---

*Disclosure: I'm the founder of Vestream, which tracks token vesting across 13 protocols. The research referenced here was collected through that work; the full method, per-protocol results and data are published at the link above under CC BY 4.0.*

---

## Notes for publishing (not part of the article)

- **Word count:** about 2,700.
- **Links:** one to the research page (the citation); the rest to third parties (CertiK on Arc and Robinhood Chain, the AMF on MiCA, the ERC pages). No links in the title or subtitle.
- **Bio:** "Founder of Vestream. I build infrastructure for tracking token vesting, and led the first cross-protocol study of on-chain vesting." Link: vestream.io. Hackernoon's founder exemption depends on the bio stating the role and linking the company.
- **Story settings:** tick the vested-interest disclosure.
- **Figures to commission:**
  1. The single primitive (pot + schedule + recipient) feeding today's uses (solid) and upcoming uses (dashed).
  2. A bar chart of unclaimed share by protocol, from the table.
  3. The lifecycle of one vesting, from created to unlocked, claimed, never claimed, revoked or a dead token, with the five problems marked.
- **Every figure is sourced** in docs/content/research-unclaimed-*.md. The Superfluid point rests on a small sample, and the wording says so.
- **Before submitting:** re-read the research page live, so the citation link and figures match.
