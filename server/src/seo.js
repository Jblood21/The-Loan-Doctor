// What search engines see. Only the home page belongs in search results; the rest of
// the site is private (signed-in pages) or personal (shared borrower quotes and agent
// links), so everything else is marked noindex.
//
// The home page is plain server-rendered HTML — not the React app — so it is readable
// by any crawler instantly, with no scripts. Anyone already signed in is sent on to the
// workspace by a tiny inline script.

/** The site's own address, used for canonical links and the sitemap. Prefers
 *  PUBLIC_BASE_URL; otherwise the address the request came in on. Always reduced to a
 *  plain http(s) origin so nothing odd can be written into the page. */
export function siteBase(req) {
  const candidates = [process.env.PUBLIC_BASE_URL, req && `${req.protocol}://${req.get('host')}`];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const u = new URL(String(c).trim());
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.origin;
    } catch {
      /* try the next one */
    }
  }
  return 'http://localhost';
}

const NAME = 'Loan Base Camp';
const TITLE = `${NAME} — Loan comparison workspace for loan officers`;
const DESCRIPTION =
  `${NAME} is a loan comparison workspace for loan officers and the real estate agents they work with. ` +
  'Compare Conventional, FHA, VA, USDA, ARM, DSCR and reverse mortgages side by side, and send clean pre-approval letters.';

const FEATURES = [
  ['Compare up to six scenarios', 'Put loan types side by side. See the payment, cash to close and APR for each, then share a link or a PDF with your borrower.'],
  ['Investor loans too', 'Run DSCR scenarios with rent, interest-only periods and prepayment penalties, so an investor can see the whole picture.'],
  ['Letters with the agent’s name on them', 'Create a pre-approval letter with the buyer’s agent — name, photo and brokerage — shown next to yours.'],
  ['Tools for everyday questions', 'Affordability, rent vs. buy, refinance break-even, rate buydowns, seller net sheets, county median income and more.'],
  ['A portal for agents', 'Agents get their own sign-in. They can edit and share the letters and reports a loan officer sends them.'],
  ['Works on any device', 'Use it in your browser, or install it as an app on your computer or phone.'],
];

/** JSON-LD tells Google the site's name, including the one-word spelling people type. */
function structuredData(base) {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${base}/#website`,
        url: `${base}/`,
        name: NAME,
        alternateName: ['LoanBaseCamp', 'Loan Basecamp', 'Basecamp'],
        inLanguage: 'en-US',
      },
      { '@type': 'Organization', '@id': `${base}/#organization`, name: NAME, url: `${base}/`, logo: `${base}/icon-512.png` },
      {
        '@type': 'SoftwareApplication',
        name: NAME,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: DESCRIPTION,
        url: `${base}/`,
      },
    ],
  };
  // `<` can't appear in a script block's JSON; escape it so nothing can end the tag early.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

const CSS = `
:root{--bg:#f5f3ea;--ink:#1b2431;--muted:#4a5666;--brand:#2f649c;--brand-hover:#254473;--on-brand:#fff;--surface:#fff;--tint:#e8eef5;--border:#e2e0d6;--hero-a:rgba(245,243,234,.9);--hero-b:rgba(245,243,234,.7);--scene:url(/brand/basecamp-day.webp)}
@media (prefers-color-scheme:dark){:root{--bg:#0d1824;--ink:#e9eff6;--muted:#9fb1c4;--brand:#4e8cc8;--brand-hover:#639ad4;--surface:#16263a;--tint:#1d3350;--border:#28384b;--hero-a:rgba(8,14,26,.86);--hero-b:rgba(8,14,26,.62);--scene:url(/brand/basecamp-night.webp)}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Figtree,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:var(--brand)}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
header.top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 0}
header.top img{display:block;height:40px;width:auto}
nav.top{display:flex;align-items:center;gap:18px;font-size:15px;font-weight:600}
nav.top a{text-decoration:none}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 24px;border-radius:12px;font-size:16px;font-weight:700;text-decoration:none;border:2px solid var(--brand)}
.btn.primary{background:var(--brand);color:var(--on-brand)}
.btn.primary:hover{background:var(--brand-hover);border-color:var(--brand-hover)}
.btn.secondary{background:transparent;color:var(--brand)}
.btn.secondary:hover{background:var(--tint)}
.hero{background:linear-gradient(var(--hero-a),var(--hero-b)),var(--scene) center bottom/cover no-repeat;border-bottom:1px solid var(--border)}
.hero .inner{padding:56px 0 72px;max-width:720px}
.eyebrow{margin:0 0 14px;font-size:13px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--brand)}
h1{margin:0;font-size:clamp(34px,6vw,54px);line-height:1.08;letter-spacing:-1.2px}
.lead{margin:20px 0 0;font-size:clamp(17px,2.4vw,20px);color:var(--muted);max-width:620px}
.cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.agent-line{margin:18px 0 0;font-size:15px;color:var(--muted)}
section.features{padding:64px 0 24px}
h2{margin:0 0 28px;font-size:clamp(24px,3.4vw,32px);letter-spacing:-.6px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:18px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:22px}
.card h3{margin:0 0 8px;font-size:18px}
.card p{margin:0;color:var(--muted);font-size:15.5px}
section.closing{padding:48px 0 72px;text-align:center}
section.closing p{margin:0 auto 24px;max-width:560px;color:var(--muted);font-size:17px}
footer{border-top:1px solid var(--border);padding:26px 0 40px;font-size:13.5px;color:var(--muted)}
footer .row{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px 24px}
@media (max-width:560px){nav.top .hide-sm{display:none}.hero .inner{padding:36px 0 52px}}
`;

/** `signupsOpen` is false when the site is invitation-only (ALLOW_SIGNUP=false); the page
 *  then says so instead of inviting strangers to a sign-up form that needs a code. */
export function landingHtml(base, { signupsOpen = true } = {}) {
  const cta = signupsOpen
    ? `<a class="btn primary" href="/login?mode=register">Create an account</a>
        <a class="btn secondary" href="/login">Sign in</a>`
    : `<a class="btn primary" href="/login">Sign in</a>
        <a class="btn secondary" href="/login?mode=register">I have an access code</a>`;
  const closing = signupsOpen
    ? `<h2>Ready to try it?</h2>
      <p>Create an account in under a minute and start comparing.</p>
      <a class="btn primary" href="/login?mode=register">Create an account</a>`
    : `<h2>Have an access code?</h2>
      <p>Loan Base Camp is invitation-only right now. If someone gave you a code, enter it when you create your account.</p>
      <a class="btn primary" href="/login?mode=register">Create an account</a>`;
  const cards = FEATURES.map(([h, p]) => `<div class="card"><h3>${h}</h3><p>${p}</p></div>`).join('\n      ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${TITLE}</title>
<meta name="description" content="${DESCRIPTION}">
<link rel="canonical" href="${base}/">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#f5f3ea">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${NAME}">
<meta property="og:title" content="${TITLE}">
<meta property="og:description" content="${DESCRIPTION}">
<meta property="og:url" content="${base}/">
<meta property="og:image" content="${base}/brand/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${NAME} — loan comparison workspace for loan officers">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${TITLE}">
<meta name="twitter:description" content="${DESCRIPTION}">
<meta name="twitter:image" content="${base}/brand/og-image.png">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script type="application/ld+json">${structuredData(base)}</script>
<script>
// Already signed in? Skip the brochure and go straight to the workspace.
try{if(localStorage.getItem('loandr.token')||sessionStorage.getItem('loandr.token'))location.replace('/compare')}catch(e){}
</script>
<style>${CSS}</style>
</head>
<body>
<div class="hero">
  <div class="wrap">
    <header class="top">
      <a href="/" aria-label="${NAME} home"><img src="/brand/loan-base-camp.svg" alt="${NAME}" width="185" height="40"></a>
      <nav class="top" aria-label="Account">
        <a class="hide-sm" href="/agent">Agent portal</a>
        <a href="/login">Sign in</a>
      </nav>
    </header>
    <div class="inner">
      <p class="eyebrow">For loan officers and real estate agents</p>
      <h1>Every loan scenario, side by side in seconds.</h1>
      <p class="lead">${NAME} is a loan comparison workspace. Model Conventional, FHA, VA, USDA, ARM, DSCR and reverse mortgages, then hand your borrower a clean breakdown.</p>
      <div class="cta">
        ${cta}
      </div>
      <p class="agent-line">Real estate agent? <a href="/agent">Go to the agent portal</a>.</p>
    </div>
  </div>
</div>
<main>
  <section class="features">
    <div class="wrap">
      <h2>What you can do with ${NAME}</h2>
      <div class="grid">
      ${cards}
      </div>
    </div>
  </section>
  <section class="closing">
    <div class="wrap">
      ${closing}
    </div>
  </section>
</main>
<footer>
  <div class="wrap row">
    <span>© ${new Date().getUTCFullYear()} ${NAME}</span>
    <span>Equal Housing Lender · For licensed mortgage professionals</span>
  </div>
</footer>
</body>
</html>
`;
}

export function robotsTxt(base) {
  return `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${base}/sitemap.xml
`;
}

export function sitemapXml(base) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${base}/</loc></url>
</urlset>
`;
}

// Static files that may be crawled and shown (the logo in search results, link previews).
const CRAWLABLE_PREFIXES = ['/brand/', '/icon-', '/favicon', '/apple-touch-icon'];

/** Mark everything except the home page noindex — shared quotes, agent links, the API
 *  and every signed-in page stay out of Google even if someone posts a link. */
export function noindexExceptHome(req, res, next) {
  const p = req.path;
  if (p !== '/' && p !== '/robots.txt' && p !== '/sitemap.xml' && !CRAWLABLE_PREFIXES.some((x) => p.startsWith(x))) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  }
  next();
}
