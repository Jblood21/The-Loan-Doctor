# Handoff: LoanDr. — Loan Officer Workspace (full rebuild)

## Overview
LoanDr. is a web app for mortgage loan officers (MLOs). It lets an LO model and compare
multiple loan scenarios side by side, run a reverse‑mortgage (HECM) estimate, generate a
branded borrower pre‑approval letter, reach a set of quick calculators, get help, and — for
the owner/admin — see usage data across all users. This handoff is a ground‑up redesign of an
older app (repo `Jblood21/Loan-Comparison-`) that had broken navigation, a dead
purchase/refinance toggle, and cramped form inputs. The redesign fixes those and adds a
login front‑end, an admin dashboard, and a pre‑approval letter generator.

## About the Design Files
The files in this bundle are a **design reference created in HTML** — a single interactive
prototype (`LoanDr.dc.html`) showing the intended look, layout, and behavior. **It is not
production code to ship directly.** It is authored in a small in‑house "Design Component"
runtime (`support.js`) — do **not** port that runtime. Your job is to **recreate these designs
in a real, production stack** using that stack's conventions.

Recommended target stack (no existing front end to preserve): **React + TypeScript + Vite**,
styled with Tailwind or CSS Modules, plus a **Node/Express + PostgreSQL** (or SQLite to start)
backend for auth, scenarios, settings, and admin data. The original repo already had an
Express/JWT/bcrypt server (`server/server.js`) you can lift and harden — its route shape is
summarized under **Backend** below.

### How to view the reference
Open `LoanDr.dc.html` in a browser (it loads fonts from Google Fonts and `support.js` from the
same folder). Any email/password signs you in (auth is stubbed). Walk every sidebar item.

## Fidelity
**High‑fidelity.** Colors, typography, spacing, radii, and interactions are final and should be
matched closely. Where math is intentionally stubbed it is called out inline in the UI (amber
notes) and in this README — implement real formulas there.

---

## Design Tokens

### Color
| Token | Hex | Use |
|---|---|---|
| `bg/app` | `#07111d` | App background (body) |
| `bg/sidebar` | `#0a1726` | Left sidebar |
| `bg/card` | `#0c1b2c` | Panels / cards |
| `bg/input` | `#091523` | Inputs, selects, segmented tracks |
| `bg/elevated` | `#0e2032` | Secondary buttons, list rows |
| `result/card` | `linear-gradient(160deg,#0e2740,#0c1d30)` | Results hero card |
| `border` | `rgba(140,165,195,.10)` | Card borders / dividers |
| `border/input` | `#21364d` | Input borders |
| `border/seg` | `#1c2f45` | Segmented control track |
| `text/primary` | `#e9f1fa` | Primary text |
| `text/heading` | `#ffffff` | Big numbers / hero headings |
| `text/muted` | `#8ba0b6` | Secondary text |
| `text/dim` | `#6f8aa3` / `#5f788f` | Field prefixes, section labels |
| `text/label` | `#aebfd1` | Form labels |
| `primary/blue` | `#2f80ed` (light `#5fa8f5`) | Primary accent |
| `accent/teal` | `#2dd4bf` | Secondary accent |
| `brand/gradient` | `linear-gradient(135deg,#2f80ed,#2dd4bf)` | Logo, primary buttons |
| `good` | `#34d399` | Positive deltas, connected state |
| `warn` | `#fbbf24` (text `#d9b777`) | Stub/estimate notices |
| `danger` | `#f87171` | Sign‑out hover, destructive |
| Letter paper | `#ffffff` on `#eef1f5` mat | Pre‑approval letter (light, client‑facing) |

Avatar gradients (admin): blue→teal, `#a78bfa→#f0abfc`, `#fbbf24→#fb923c`, `#34d399→#2dd4bf`,
`#f87171→#fbbf24`.

### Typography
- **UI / body:** `Manrope` (400/500/600/700/800).
- **Display, headings, all numbers:** `Space Grotesk` (400–700). Numbers use a `.num` class:
  `font-family:'Space Grotesk'; font-feature-settings:'tnum' 1;` (tabular figures — keep this).
- Page H1: 27px / 600 / letter‑spacing −.6px. Hero number: 46px / 600 / −1.5px.
  Section label: 12px / 700 / letter‑spacing .7px / `#6f8aa3`, uppercase.
  Form label: 13px / 600 / `#aebfd1`. Body: 14–15px. Helper: 12.5px / `#8ba0b6`.

### Spacing, radius, shadow
- Page padding: 34px top / 40px sides, max content width 1180px, centered.
- Card radius 16px; inputs/buttons 10–11px; pills 8–9px; chips/badges 20px.
- Inputs are **spacious**: height 46px, padding `0 14px` (with a 26px left pad when a `$`
  prefix is present, 34px right pad when a `%` suffix is present). This is the deliberate fix
  for the old "smushed" inputs — keep the height and padding.
- Focus ring: `border-color:#2f80ed; box-shadow:0 0 0 3px rgba(47,128,237,.16)`.
- Slide‑over / letter shadow: `0 20px 50px rgba(0,0,0,.35)`.
- Screen enter animation: `fade+translateY(8px)` over .35s ease.

---

## App Shell & Navigation
- **Auth gate:** unauthenticated → Login (full screen). Authenticated → app shell.
- **App shell:** fixed 236px left sidebar (sticky, full height) + scrollable main area.
- **Sidebar:** logo; "WORKSPACE" group → Compare Loans, Reverse (HECM), Pre‑Approval, Tools,
  Help Center; "ADMIN" group → Dashboard; footer → Settings (opens slide‑over), Sign out.
- Active nav item: `background:rgba(47,128,237,.14); color:#5fb0f5; font-weight:600`. Hover on
  inactive: `background:rgba(140,165,195,.07)`. Sign‑out hover tints red.
- Routing: implement as real routes (`/compare`, `/hecm`, `/pre-approval`, `/tools`, `/help`,
  `/admin`, `/login`). The prototype uses one `screen` state value instead.

---

## Screens / Views

### 1. Login
- Two‑column split. **Left** (flex 1.05): dark gradient `linear-gradient(155deg,#0a1a2e,#0c2238,#0a3340)`
  with two radial glows + a faint 46px grid masked toward transparent; logo top‑left; headline
  "Every loan scenario, side by side in seconds." + subcopy; three stat blocks (6 scenarios /
  5 programs / 1 click). **Right** (flex .95, bg `#091522`): "Welcome back", Email + Password
  inputs (48px tall), Remember me + Forgot password row, full‑width gradient "Sign in" button
  (50px), "Create an account" link, and a demo note.
- Behavior: any credentials → authenticate → go to Compare. Replace with real POST `/api/auth/login`.

### 2. Compare Loans (core screen)
- Header: title + subtitle on the left; right‑side actions: "My Scenarios", "Export", "Save"
  (gradient).
- **Scenario tabs** row: one tab per scenario (active = white text + 2px teal underline), plus a
  dashed "+" button to add (cap 6). Each tab selects that scenario.
- **Two‑column grid (1.35fr / 1fr):**
  - **Left form card:**
    - Transaction segmented control **Purchase / Refinance** (active = gradient pill). Switching
      to Refinance relabels "Purchase Price" → "Home Value". (This toggle was broken in the old
      app — it must work.)
    - Borrowers segmented **1 / 2**.
    - **Loan type** pills: Conventional, FHA, VA, USDA, ARM (active = teal‑tinted).
    - **Loan program** pills: Standard, HomeReady, Home Possible, First‑Time Buyer (active = blue‑tinted).
    - "LOAN DETAILS" grid (2 cols): Purchase Price/Home Value (`$`), Down Payment (`$` + a linked
      `%` field), Interest Rate (`%`), Loan Amount (auto, read‑only, dimmed), Loan Term (select:
      30/20/15/10), Credit Score (select, 800 → 580 bands).
    - "RATE BUYDOWN & CREDITS" (3 cols): Lender Credit, Seller Credit, Other Credits (all `$`).
  - **Right results column (sticky):**
    - Hero card: "{TYPE} · Estimated Monthly Payment", big total, subline
      `{loan} · {rate}% · {term} yr · {LTV}% LTV`, then rows: Principal & Interest, Property Taxes
      (est.), Homeowners Insurance (est.), Mortgage Insurance (est. or "None").
    - Cash‑to‑Close card: total + Down Payment, Est. Closing Costs (3%), Credits Applied; amber
      stub note about MIP/PMI/APR.

### 3. Reverse (HECM)
- Badge "Reverse Mortgage · HECM", title, subtitle. Two‑column grid.
- Left: "BORROWER & PROPERTY" 2‑col inputs — Youngest Borrower Age, Home Value (`$`), Existing
  Mortgage Balance (`$`), Expected Rate (%); then "PAYOUT OPTION" pills: Lump Sum / Tenure /
  Line of Credit.
- Right (sticky): "Available to Borrower (est.)" hero + rows: Max Claim Amount, Principal Limit
  Factor, Gross Principal Limit, Less Existing Mortgage; amber stub note (replace simplified PLF
  with HUD PLF tables).

### 4. Pre‑Approval (letter generator)  ← added this round
- Badge "Generator", title "Pre‑Approval Letter", subtitle.
- Two‑column grid (1fr / 1.05fr).
- **Left form card:**
  - "DATA SOURCE" segmented: **From a Scenario** / **From your LOS**.
  - *From a Scenario:* a `<select>` of saved scenarios (label shows name + computed loan amount);
    letter fields derive live from the chosen scenario.
  - *From your LOS:* a provider `<select>` (Arive, ICE/Encompass, Calyx Point, BytePro); if not
    connected → dashed panel with "Connect to LOS"; once connected → green "Connected" badge +
    "Disconnect", a search box, and a list of borrower results each with a "Use" button that fills
    the borrower name + property address.
  - Borrower Name(s), Property Address (optional), "Letter Valid For" (30/60/90 days).
  - Actions: "Download PDF" (gradient) + "Email"; amber stub note (LOS API + PDF export are stubbed).
- **Right (sticky):** live, **light/white** letter preview on a gray mat — lender letterhead,
  date, "Dear {borrower}", pre‑approval paragraph, a terms table (Loan Type, Purchase Price, Loan
  Amount, Down Payment, Interest Rate, Loan Term), validity sentence with expiration date,
  signature block, Equal Housing Lender footnote.

### 5. Tools
- Title + subtitle; responsive 3‑col grid of calculator cards: Affordability, Rent vs. Buy,
  Amortization, DTI Calculator, Refi Break‑Even, Extra Payment. Each card: tinted icon tile,
  title, description, "Open →". Cards lift on hover. (Cards are placeholders — each should open
  its calculator.)

### 6. Help Center
- Title + subtitle; search box; FAQ accordion (5 items, single‑open, "+"/"–" toggle); a
  "Still need help?" contact card with a "Contact Support" button.

### 7. Admin Dashboard
- Title + subtitle; 4 stat cards (Total Users, Scenarios Saved, Active Today, Pre‑Approvals)
  each with value + green delta; a Users table with search and columns NAME (avatar+name),
  EMAIL, COMPANY, SCENARIOS, STATUS (Active/Trial/Inactive pill). Wire to real admin endpoints.

### Settings (slide‑over, global)
- 440px right slide‑over with scrim. Profile chip, then sections: **My Account** (name, company,
  phone, NMLS), **Lender Information** (name, NMLS, website), **Dual Branding** (agent name,
  brokerage, phone). The original app also supported Title Company fees, a Title/Settlement agent,
  dark mode, and an admin password gate — fold these back in as needed.

---

## Interactions & Behavior
- Tabs/segments/pills set the active value and re‑render dependent UI (results, labels).
- Purchase↔Refinance changes the price label; loan‑type changes the results "type" + MI logic.
- Down Payment `$` and `%` are linked: editing one recomputes the other from Home Value; editing
  Home Value preserves the `%` and recomputes the `$`. Loan Amount = Home Value − Down Payment.
- Add scenario appends a blank scenario (cap 6) and activates it.
- Pre‑Approval source toggle swaps the input group; "Connect to LOS" flips to a connected state
  with selectable borrower results; choosing a scenario/borrower updates the live letter.
- FAQ accordion is single‑open. Settings opens/closes a slide‑over (scrim click closes).
- Focus states on every input (blue ring). Buttons darken/translate slightly on hover/active.

## Real math to implement (stubbed in the prototype)
- **P&I** is real: `M = P·r·(1+r)^n / ((1+r)^n − 1)`, `r = rate/100/12`, `n = term·12`.
- **Taxes/Insurance** are rough estimates (1.25%/yr and 0.35%/yr of home value) — make
  configurable per scenario/lender.
- **Mortgage insurance** is placeholder: Conventional PMI ≈ 0.6%/yr when LTV>80; FHA MIP ≈
  0.55%/yr; USDA ≈ 0.35%/yr. Implement real FHA upfront+annual MIP, VA funding fee, USDA
  guarantee fee, and conventional PMI by LTV/credit.
- **APR, total interest, amortization** — not computed; implement.
- **HECM** principal limit factor is a linear approximation — replace with HUD PLF lookup by age
  + expected rate; respect the FHA max claim amount.

## State Management
- `auth` (token/user), `currentScreen/route`, `scenarios[]` (active index, ≤6), per‑scenario
  fields (transaction, borrowers, loanType, program, homePrice, downPayment, downPct, rate, term,
  credit, lenderCredit, sellerCredit, otherCredits), `hecm` inputs, `preApproval`
  (source, scenarioIdx, losProvider, losConnected, losQuery, borrowerName, propertyAddress,
  expDays), `settingsOpen`, `openFaq`. Persist scenarios/settings per user via the backend.

## Backend (from the original repo — reuse & harden)
Express + JWT (bcrypt, 12 salt rounds) with a JSON/SQL store. Routes:
`POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `PUT /api/auth/profile`,
`PUT /api/auth/password`; `GET/PUT /api/settings`; `GET/POST/PUT/DELETE /api/scenarios[/:id]`;
`POST /api/admin/login`, `GET /api/admin/users`, `GET /api/admin/stats`; `GET /api/health`.
Add: **LOS integration** endpoints (OAuth/connect + borrower search/pull per provider) and a
**pre‑approval PDF** generation endpoint. Move secrets to env; rate‑limit auth.

## Assets
- Logo: a simple gradient "pulse/heartbeat" mark (`M3 13h3l2 5 4-12 2 7h4`) in a rounded gradient
  tile + "Loan**Dr.**" wordmark. Recreate as an SVG/component; no external logo file needed.
- Icons: inline stroke icons (Lucide‑style, 2px). Use Lucide or Heroicons in the real app.
- Fonts: Manrope + Space Grotesk (Google Fonts).

## Files
- `LoanDr.dc.html` — the full interactive design reference (all 7 screens + settings).
- `support.js` — the prototype runtime ONLY so the HTML opens locally. Do not port it.
