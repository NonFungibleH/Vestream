# Building with the Vestream design system

Vestream is a token-vesting tracker. These components come from the
production Next.js app, compiled as-is — they are the real parts, not
reimplementations.

## Setup: no provider required

Components render standalone. There is **no theme provider and no root
wrapper** — tokens are plain CSS custom properties defined on `:root` in the
stylesheet, so anything you render is styled as soon as `styles.css` is
loaded.

Two exceptions:

- **Toasts.** Wrap the subtree in `ToastProvider`, then call `useToast()`
  inside it. The hook returns `{ show, success, error, info }`. It is safe to
  call outside a provider (it degrades to a no-op), so a missing provider
  fails quietly rather than crashing.
- **Dark mode.** The dark palette is keyed off an ancestor `.dark` class
  (`@custom-variant dark (&:is(.dark *))`). Put `className="dark"` on a
  wrapper to flip the `--preview-*` token set; there is no toggle component.

## Styling idiom: Tailwind utilities + inline style for one-off values

This system uses **Tailwind v4 utility classes** for layout and repeated
values, and **`style={{}}` for one-off colours and shadows**. Both idioms
appear side by side throughout the real components — mixing them is correct
here, not a smell. There are no CSS modules and no styled-components.

Token-backed utility families (all resolve to the custom properties below):

| Family | Examples |
|---|---|
| Surface | `bg-background`, `bg-card`, `bg-primary`, `bg-muted` |
| Text | `text-foreground`, `text-muted-foreground`, `text-primary` |
| Border | `border-border`, `border-input`, `focus-visible:ring-ring/50` |
| Radius | `rounded-xl`, `rounded-2xl` (scale keyed to `--radius`) |
| Type | `text-sm`, `leading-relaxed`, `tracking-widest`, `font-semibold` |

## The palette — read this before picking a colour

The brand accent is **teal `#1CB8B8`**, not blue. Every accent, CTA,
focus ring and active state derives from it.

```
--primary            #1CB8B8   accent, CTAs, active states
--ring               #1CB8B8   focus rings
--background         #F5F5F3   warm paper page background
--foreground         #1A1D20   headings and body text
--card               #ffffff   raised surfaces
--muted-foreground   #8B8E92   secondary text
--border             rgba(21,23,26,0.10)
--destructive        #B3322E
--radius             0.5rem
```

The one gradient in real use is `linear-gradient(135deg, #1CB8B8 0%,
#0F8A8A 100%)`. Do not invent a blue/purple gradient — nothing in this
system uses one.

Dashboard and explorer surfaces use a separate `--preview-*` ramp that has
both a light and a dark definition: `--preview-bg`, `--preview-card`,
`--preview-card-2`, `--preview-border`, `--preview-text`, `--preview-text-2`,
`--preview-muted`, `--preview-hover`. Use these — via
`style={{ background: "var(--preview-card)" }}` — for anything that must work
on both the white marketing site and the dark Vesting Explorer.

## Page themes — never mix them

Three page themes, each used whole-page. `SiteNav` and `SiteFooter` take a
matching `theme` prop and **must** agree with the page background:

| Theme | Background | Used for |
|---|---|---|
| `"light"` | `#F5F5F3` | consumer pages — home, pricing, resources |
| `"navy"` | `#0d1b35` | developer-facing pages |
| `"dark"` | `#0d0f14` | AI/technical pages |

## Where the truth lives

Read the real files before styling — they beat any summary:

- `_ds/<folder>/styles.css` and its `@import` closure — every token and
  utility, as compiled.
- `components/<group>/<Name>/<Name>.prompt.md` — per-component usage.
- `components/<group>/<Name>/<Name>.d.ts` — the exact props.

## An idiomatic build

Library components for the controls, utilities plus inline style for your
own layout glue:

```jsx
<div className="rounded-2xl p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
  <div className="flex items-center justify-between">
    <h3 className="text-sm font-semibold text-foreground">Next unlock</h3>
    <Badge variant="outline">Sablier</Badge>
  </div>

  <div className="text-3xl font-semibold mt-2" style={{ letterSpacing: "-0.02em" }}>
    42,500 NOVA
  </div>
  <p className="text-sm text-muted-foreground leading-relaxed mt-1">
    Unlocks in 3 days across 4 tracked wallets.
  </p>

  <div className="flex gap-2 mt-4">
    <Button size="sm">View streams</Button>
    <Button size="sm" variant="outline">Export CSV</Button>
  </div>
</div>
```

`Button` variants: `default · secondary · destructive · outline · ghost ·
link`. Sizes: `default · xs · sm · lg · icon · icon-xs · icon-sm · icon-lg`.
`Badge` takes the same variant names, no sizes. Both accept `asChild` to
render as their child element instead.

## Content conventions

Mockups must never imply real integrations. Use the house placeholder tokens
**NOVA** (orange), **FLUX** (blue/purple), **VEST** (green), **KLAR** (cyan),
and truncated addresses like `0x3f5CE…8b2e`. Protocol and chain names
(Sablier, Hedgey, UNCX, Ethereum, Base, BNB Chain) are real integrations and
may be used factually.

# Vestream (vestr@0.1.0)

This design system is the published vestr React library, bundled as a single
browser global. All 41 components are the real upstream code.

## Where things are

- `_ds_bundle.js` — the whole-DS bundle at the project root; loads every component to `window.Vestream`. First line is a `/* @ds-bundle: … */` metadata header.
- `styles.css` — the single stylesheet entry: it `@import`s the tokens, fonts, and component styles (`_ds_bundle.css`). Link this one file.
- `components/<group>/<Name>/<Name>.prompt.md` (example JSX + variants), `<Name>.d.ts` (types), `<Name>.html` (variant grid).
- `tokens/*.css` — CSS custom properties, names verbatim from upstream.
- `fonts/` — `@font-face` files + `fonts.css` (when the package ships fonts).

For a specific component, `read_file("components/<group>/<Name>/<Name>.prompt.md")`.

## Loading

Add these two lines to your page once (React must be on the page first):

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
```

Components are then available at `window.Vestream.*`. Mount into a dedicated child node (e.g. `<div id="ds-root">`), not the host page's own React root, so the two trees don't collide:

```jsx
const { ApiAccessForm } = window.Vestream;
ReactDOM.createRoot(document.getElementById('ds-root')).render(<ApiAccessForm />);
```

## Tokens

202 CSS custom properties from vestr. Names are
preserved verbatim from upstream. They are declared inside `_ds_bundle.css` (this DS ships one compiled stylesheet rather than separate token files).

- **color** (60): `--color-red-400`, `--color-red-500`, `--color-red-600`, …
- **spacing** (5): `--tw-space-y-reverse`, `--tw-inset-shadow`, `--tw-inset-shadow-alpha`, …
- **typography** (14): `--font-weight-normal`, `--font-weight-medium`, `--font-weight-semibold`, …
- **radius** (1): `--radius`
- **shadow** (7): `--tw-shadow`, `--tw-ring-shadow`, `--tw-shadow-alpha`, …
- **other** (115): `--spacing`, `--container-xs`, `--container-sm`, …

## Components

### general
- `ApiAccessForm`
- `AppStoreBadges`
- `Badge`
- `Button`
- `Card`
- `ContactModal`
- `ContactTrigger`
- `CookieBanner`
- `CopyableCode`
- `CopyButton`
- `DashboardFooter`
- `DashboardSidebar`
- `GetTheAppModal`
- `Input`
- `Label`
- `LiveActivityTicker`
- `MobileAppBanner`
- `PaywallTeaser`
- `PhoneClock`
- `PricingComparisonTable`
- `PricingCta`
- `ScanWalletCTA`
- `Separator`
- `SiteFooter`
- `SiteNav`
- `StreamCard`
- `ToastProvider`
- `TokenFAQ`
- `TokenMetaPanel`
- `TokenPaywall`
- `TokenPulse`
- `TokenShareRow`
- `TrackInAppCTA`
- `TvlComparisonBar`
- `UnlockSummary`
- `UpcomingUnlockTicker`
- `UpsellModal`
- `VestingTimeline`
- `WaitlistForm`
- `WalletChip`
- `WalletInput`
