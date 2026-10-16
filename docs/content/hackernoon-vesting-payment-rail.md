# Vesting Is Crypto's Missing Payment Rail

**Subtitle:** I read about 1.28 million finished vesting schedules on-chain, and found crypto has built the mechanism for paying people over time, but it hasn't built the rail.

---

*Disclosure: I founded Vestream, a token vesting tracker, and the research in this article comes from that work.*

---

Ask most people in crypto what vesting is and you'll get the same answer: it's the lock on founder and investor tokens, a year-long cliff followed by a monthly release, there to stop insiders selling everything on launch day.

That answer isn't wrong, it's just very over simplified.

A vesting contract is value released on a schedule and enforced by code. Nobody at the employer approves it, no payroll provider processes it and no bank sits in the middle, so once it's deployed the money becomes the recipient's over time, whatever anyone decides later.

That description fits a salary. It also fits a pension, a grant, a stock option, a bonus paid in instalments and an investor lockup. Paying people over time is one of the oldest jobs in finance, and crypto built a programmable, global version of it years ago, then treated it as a niche tool for token launches.

Over the past few weeks I measured what actually happens to vested tokens once they unlock. I read about 1.28 million finished schedules across eight protocols, on Ethereum, Solana and other EVM chains, directly from their contracts: 835,908 individually, plus random samples covering an estimated 442,500 more on two Solana protocols ([full method and data](https://www.vestream.io/research/unclaimed-vesting)). Coverage varies by protocol, with typically one to six chains. It's the first study I know of to cover the category rather than a single protocol.

What I found is that the mechanism works, but almost everything around it doesn't.

## One mechanism, many jobs

Every vesting contract comes down to three parts: a pot of value, a schedule and a recipient. That one building block already does a wide range of work:

- Team and investor vesting (the familiar use).
- Airdrops and community distributions, often to tens of thousands of wallets at once.
- Grants paid out over a set period.
- Pay for people working on a project, streamed by the second.
- Treasury schedules that release a protocol's own reserves over years.

The next wave can run on the same building block. Circle's [Arc](https://www.certik.com/blog/circle-arc-mainnet-usdc-native-settlement), a layer 1 built for dollar finance with USDC as its gas token, went live on 16 September 2026, and [Robinhood Chain](https://www.certik.com/blog/robinhood-chain-onchain-capital-market) launched in July with tokenised stock exposure trading around the clock. Whenever a stablecoin salary, a tokenised equity award or an on-chain bonus is paid out over time, it uses the same mechanism: value held in a contract and released on a schedule.

So rather than separate products, these are one building block with different labels, which means any infrastructure that serves one can serve all of them.

[[GRAPHIC 1: One building block, many jobs. In the centre, a simple box with three parts: "pot of value", "schedule" and "recipient". Around it, labelled arrows to today's uses in solid lines (team and investor vesting, airdrops, grants, project pay streams, treasury schedules) and upcoming uses in dashed lines (stablecoin salaries, tokenised equity awards, on-chain bonuses). Place it here, after this paragraph.]]

## Why this matters now

For most of crypto's history vesting has been informal. The recipients were mostly founders, investors and early team members, who knew the contract existed and where to claim, so if something went wrong it was a problem for a few insiders.

That's changing, for three reasons.

Stablecoins have become real money. A schedule distributing dollars matters to an accountant in a way a schedule in a launch token never did.

Institutions are arriving. Custodians, fund administrators and payroll providers are starting to hold or report on-chain positions for clients who expect statements, not block explorers.

Regulation has caught up. In Europe, MiCA's transition period [ended on 1 July 2026](https://www.amf-france.org/en/news-publications/news/amf-reminds-digital-asset-service-providers-transitional-period-allowing-them-continue-providing), and crypto service providers now need full authorisation. Value paid to people over time has to be recorded, reported and taxed properly.

Something that worked as a script for insiders now has to work as infrastructure for everyone. My research suggests it isn't ready yet, and that it falls short in five specific ways.

[[GRAPHIC 2: The life of one vesting schedule. A left-to-right flow: "Created" → "Unlocks" → then three endings: "Claimed", "Never claimed" and "Cancelled". Add a fourth branch where the token itself stops trading ("Token dies"). Mark the five problems from this article as numbered tags along the flow: 1 Pull money (at "Unlocks" → "Never claimed"), 2 Earned vs received (between "Unlocks" and "Claimed"), 3 Ledger vs record (a layer underneath the whole flow), 4 Hidden obligations (at "Created"), 5 Outliving the asset (at "Token dies"). Place it here, before Problem one.]]

## Problem one: pull money

When your employer pays you, the payment arrives in your account, because your employer's system does the work. A salary is a push payment: the payer's side sends the money, and you don't have to do anything to receive it.

Most crypto vesting works the other way. When a tranche unlocks nothing arrives, and the value sits in the contract until the recipient notices, connects a wallet and claims it. In effect, crypto moved the final step of every payment onto the person being paid.

The data shows what that costs. This is the share of finished schedules still holding unclaimed tokens:

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

These rates say more about how each protocol is used than about the protocol itself. Platforms that carry a lot of airdrops and small community distributions show higher rates, while those used mainly for team and investor grants show lower ones, so this isn't a league table.

[[GRAPHIC 3: Bar chart, "Share of finished vesting schedules still unclaimed", one horizontal bar per protocol using the figures in the table above, sorted from lowest (Jupiter Lock 2.9%) to highest (Unvest 87.0%). Mark Streamflow and Jupiter Lock as "sample" with a lighter shade or an asterisk. Place it here, directly under the table, or use it to replace the table.]]

The more revealing number is how people fail to claim. You might expect recipients to start claiming and then drift off, but almost nobody does that. Across every protocol I measured, between 78% and 97% of unclaimed schedules had never been claimed once. People claim everything or nothing, and the few who stop partway tend to stop early: on Streamflow, 148 of the 150 partial claimers in my sample made their last claim before the schedule had even ended.

It would be easy to conclude that push systems are the answer. Superfluid is the clearest test, because its schedules are designed to start on their own: an automated service sends the transaction that begins each payment, so the recipient doesn't have to do anything. Of the 3,439 finished Superfluid schedules I checked, 83% started as designed, which shows push works most of the time. The rest is still telling, though. 187 schedules are recorded by the scheduler as failed, and another 345 never started at all. Superfluid's newer version also added an option for recipients to claim, and a third of the schedules using it (450 of 1,310) were never claimed.

Whichever way a payment works, someone has to be responsible for finishing it, and something has to happen when that doesn't go to plan. Most vesting has never decided either.

## Problem two: earning it and receiving it are different moments

A vesting schedule creates two separate dates. The unlock date is when the value becomes yours, and the claim date is when it actually reaches your wallet.

Traditional finance has the same split and treats it as fundamental. A trade is agreed on one day and settles on another, and a share award vests on one date and is delivered on another, with whole industries there to reconcile the two.

In crypto the two dates can drift apart by months or years, and nothing records both. That matters, because the date that counts is often the one nobody is watching. In the UK, HMRC treats the vesting of employee share awards as the taxable point, and its closest guidance for tokens points the same way, although there's no definitive rule. So a recipient who never claims can still owe tax on value that has been sitting in a contract they've forgotten about.

On Sablier, the largest protocol I measured, about a third of finished schedules are unclaimed, and on some protocols it's more than half. For those recipients the gap between the two dates is more than a technicality: it's the difference between a tax return that's correct and one that isn't.

A proper payment rail records the moment value is earned as well as the moment it moves. Vesting records neither in a form anyone can easily use.

[[GRAPHIC 4: Two dates on one timeline. A horizontal line with a marker at "Unlocks" (labelled "the value is yours, and in the UK this is usually the taxable point") and a later marker at "Claimed" (labelled "the tokens reach your wallet"). Shade the gap between them and label it "can be months or years". Add a small note at the end: "On the largest protocol measured, about 1 in 3 finished schedules never reach the second date." Place it here.]]

## Problem three: the chain is the ledger, not the record

The most repeated claim in crypto is that on-chain data is the source of truth. That's true in a narrow sense, because the chain holds the raw state, but in practice almost nobody reads the chain directly. Wallets, dashboards, analysts and auditors all read it through indexers and APIs, and those copies drift from the chain in ways I didn't expect.

- **Copies that remember a world that no longer exists.** On one locker protocol, transferring or splitting a lock creates a new lock and empties the old one. The protocol's subgraph, the index most tools read, kept the old lock as if nothing had happened, so 2,628 finished locks were recorded as unclaimed when the chain held nothing. The contracts were right; the copy most people read was not.
- **Disagreement at scale.** For one protocol, a third-party index disagreed with the chain on 17.5% of vesting contracts. That included 263 contracts recorded as locked whose escrow was actually empty, a pattern consistent with cancellations the index never recorded.
- **Units.** One API reports upfront percentages in basis points, so if you read them as plain percentages, grants look fully claimable on day one.
- **Zeros that mean "never measured".** In a pipeline I built, one protocol's claimed amounts were hardcoded to zero, and that protocol deletes its record entirely when someone claims in full. The result was a perfect 100% "unclaimed". In my audit, every protocol that came out at exactly 0% or 100% unclaimed turned out to be a measurement error rather than a real result.
- **Assumptions that don't travel.** Ethereum addresses ignore upper and lower case, but Solana's don't, and a cleaning step that made sense for one chain silently corrupted 72,872 Solana records in a pipeline I built myself.

None of this is fraud. It's what happens when a ledger has no trusted record-keeper. In equities, transfer agents and cap-table systems like Carta are the trusted record of who owns what, whereas on-chain value has a perfect ledger and nobody whose job is to keep the record right.

## Problem four: hidden obligations

Many vesting programmes don't put their recipients on-chain at all. To save costs, they publish a single cryptographic fingerprint of the full list, called a merkle root, and keep the list itself off-chain, so a recipient only becomes visible when they claim.

On one protocol I measured, Magna, an allocation only appears once it has been claimed, which makes it impossible for anyone outside to count the allocations nobody has claimed. On another, Team Finance, I could only verify recipients by fetching the lists from the protocol and checking all 174,283 entries against their contracts. Every one matched, but only because the protocol still publishes them.

That's fine for a crypto-native team, but not for an auditor, a custodian or a fund administrator, who needs to see obligations and not just outcomes. You can't report a liability you can't see, and institutions won't hold value they can't account for.

## Problem five: schedules outlive their assets

A vesting schedule can run for years, and the token it pays out may not last that long.

87% of unclaimed Sablier streams are in tokens that no longer trade anywhere, as are 91% of unclaimed UNCX locks, and 83% of the tokens behind unclaimed Smithii schedules on Solana have no price at all. A lot of the time recipients aren't forgetting value, the value has simply gone. On Unvest, 88% of the positions in two large airdrops were worth less than the fee to claim them, so leaving them was the rational choice.

That isn't always the case, though. Ten unclaimed Hedgey plans are each valued at more than $100,000 at market prices, and some unclaimed positions in tokens that still trade have sat untouched for over two years. One grant worth about $11,000, in a token with a healthy market, finished 20 months ago and has never been claimed. Across the six protocols I valued, the unclaimed tokens that still trade add up to roughly $4.9 to $9.5 million, depending on how strictly you discount positions that are larger than their own markets.

[[GRAPHIC 5: Where the unclaimed tokens sit. For Sablier, a single bar or ring split into "tokens with no market at all: 87%" (grey) and "tokens that still trade: 13%" (highlight colour). Beside it, a callout: "$4.9M to $9.5M still unclaimed in tokens that trade, across six protocols". Place it here.]]

Payment systems solved this lifecycle problem long ago, with expiry dates, unclaimed-property rules and the handling of dormant accounts. Vesting has none of that, so value is either claimed or stuck forever, and nothing separates the forgotten six-figure allocation from the worthless one.

## A note on headline numbers

The research taught me one more thing, and it affects every statistic in crypto, including mine.

On Sablier, a single airdrop token made up 61% of all unclaimed streams. On UNCX, one team's lock on its own tokens was worth $7.5 million, and on Sablier a single project streaming tokens to its own treasury held $2.8 million. Include those and you can produce almost any headline you want, so I took them out. The airdrop is excluded from Sablier's unclaimed rate in the table above, and projects locking or streaming tokens to themselves are excluded from every value figure in this article, because they aren't anyone's forgotten grant. Every figure here says what was excluded and why, because without that an aggregate on-chain number tells you very little.

## Why the standards haven't fixed it

Standards have been tried. [ERC-1620](https://eips.ethereum.org/EIPS/eip-1620), a money-streaming standard proposed in 2018 by Sablier's founder, is now marked stagnant, and [ERC-5725](https://eips.ethereum.org/EIPS/eip-5725), a standard for transferable vesting NFTs, reached final status in 2022.

Yet across the protocols I studied, each one still records schedules its own way: percentages in different units, balances tracked as internal shares rather than tokens, plans that vanish once fully claimed, recipient lists kept off-chain, and different conventions again on Solana.

I think the problem is the target. Standards so far have tried to define how to create a vesting schedule, and because protocols compete on how they create schedules, they'll keep diverging. What the rail needs is narrower and easier to agree on: a standard for how to read one.

Any vesting contract, on any chain, should be able to answer six questions the same way:

1. Who is the recipient?
2. How much was originally granted?
3. How much has unlocked so far?
4. How much has been claimed?
5. Has it been cancelled, and if so, when?
6. When does the next amount unlock, and when does it end?

Those six answers are enough for a wallet to show your balance, an accountant to report income on the right date, an auditor to see obligations and a custodian to hold positions for clients, and none of them limit how a protocol designs its product. Several protocols already expose most of them through their own contract functions, so this is less about anyone changing what they've built and more about agreeing to describe it the same way.

## What the rail needs

Put the five problems together and the missing infrastructure has five layers:

1. **A common read standard**, so every schedule answers the same six questions.
2. **A verified record**, checked against the chain, that institutions can rely on.
3. **Payments that complete**, through notifications, automatic claiming or push options, so value doesn't sit stranded.
4. **Both dates recorded**, unlock and claim, for tax, accounting and audit.
5. **Lifecycle handling**, with rules for expiry, cancellation and tokens that die, consistent across EVM chains and Solana.

[[GRAPHIC 6: The missing layer. Five stacked horizontal bands, like a payments infrastructure diagram, sitting on top of a base labelled "Vesting contracts on Ethereum, Solana and other chains". From the bottom up: 1 Common read standard, 2 Verified record, 3 Payments that complete, 4 Both dates recorded, 5 Lifecycle handling. Above the stack, the products it serves: token compensation, airdrops, stablecoin payroll, tokenised equity awards. Place it here.]]

None of this needs a new blockchain. It's the layer every mature financial system eventually builds on top of its ledger.

## Who builds it

Every money system develops this layer in the end. Card payments got card networks, securities got transfer agents and clearing houses, and private company equity got Carta, which turned spreadsheets of share options into the system of record for startup ownership.

Money released on a schedule, on-chain, doesn't have a system of record yet. Whoever builds it won't sit underneath just one category, they'll sit underneath all of them: token compensation, airdrops, stablecoin payroll, tokenised equity awards and every product that pays people over time.

## The mechanism is solved, the rail isn't

Vesting isn't really a lockup feature, it's the first draft of how the internet will pay people over time.

Crypto has solved the hard part, which is value that releases on schedule, enforced by code, with nobody in the middle able to stop it. What it hasn't built is the layer that makes the money arrive, keeps it visible and reconciled, and handles it when things go wrong. That gap is a big part of why so many finished vestings are never collected.

We've spent a decade making money programmable. The next decade is about making sure it arrives.

---

*Disclosure: I founded Vestream, a token vesting tracker, and the research referenced here comes from that work. The full method, per-protocol results and data are published under CC BY 4.0 at the link above.*

---

## Notes for publishing (not part of the article)

- **Graphics:** the six briefs in blue are placed where each graphic should go. Delete each brief once its graphic is in.
- **Links:** one to the research page (the citation); the rest go to third parties (CertiK on Arc and Robinhood Chain, the AMF on MiCA, and the two ERC pages). There are no links in the title or subtitle.
- **Bio:** "Founder of Vestream. I build infrastructure for tracking token vesting, and led the first cross-protocol study of on-chain vesting." Link: vestream.io. Hackernoon's founder exemption depends on the bio stating the role and linking the company.
- **Story settings:** tick the vested-interest disclosure.
- **Sources:** every figure is in docs/content/research-unclaimed-*.md. The Superfluid figures come from a full pull of 3,439 finished schedules across six chains on 16 Oct 2026.
- **Before submitting:** re-read the research page live, so the citation link and figures match.

## Graphics style guide (for all six figures)

- **Look:** clean, flat, editorial data graphics in the style of a financial research report. No logos, no Vestream wordmark, no crypto clichés (coins, rockets, padlocks, glowing chains, 3D renders).
- **Canvas:** 1600 × 900 px, the same for every figure, so they line up in the article. Light paper background (#F5F5F3), because Hackernoon pages are light; a dark graphic would look like an advert.
- **Colours (Vestream palette, no branding):** ink #0B0E12 for text and lines; deep teal #0F8A8A as the single highlight colour; teal #1CB8B8 for secondary highlights; greys #8B8E92 and #D5D8DC for everything de-emphasised. Use teal only for the thing the reader should look at.
- **Type:** Geist (free on Google Fonts). Figure titles in Geist Semibold 44px, labels Regular 28px, small notes 22px. Sentence case everywhere.
- **Lines and shapes:** 3px strokes, rounded corners of 12px on boxes, plenty of white space. Dashed lines only for "upcoming" or "not yet built".
- **Numbering:** put "Figure 1" to "Figure 6" small and grey in the top-left of each image, and the title beside it.
- **Source line:** bottom-left of each data figure (3 and 5) in small grey text: "Source: author's on-chain study, October 2026." No URL in the image; Hackernoon doesn't allow images to act as links.
- **Featured image (the header Hackernoon shows on the article card):** an abstract version of Figure 1, with no text other than the title. No logo; Hackernoon rejects logos in the featured image.
- **Accessibility:** add alt text for each figure when uploading, describing the takeaway, e.g. "Bar chart: unclaimed share of finished vesting schedules ranges from 2.9% on Jupiter Lock to 87% on Unvest."
