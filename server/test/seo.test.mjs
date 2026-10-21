// What search engines see: a crawlable home page, robots/sitemap, and noindex everywhere else.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from './helpers.mjs';
import { landingHtml, noindexExceptHome, robotsTxt, siteBase, sitemapXml } from '../src/seo.js';

const hasBuiltClient = fs.existsSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'index.html'));
const get = async (s, p, headers) => {
  const res = await fetch(`${s.base}${p}`, { headers });
  return { status: res.status, type: res.headers.get('content-type') || '', robots: res.headers.get('x-robots-tag'), text: await res.text() };
};

describe('siteBase', () => {
  const req = (host, protocol = 'https') => ({ protocol, get: () => host });
  const withEnv = (value, fn) => {
    const before = process.env.PUBLIC_BASE_URL;
    if (value === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = value;
    try {
      return fn();
    } finally {
      if (before === undefined) delete process.env.PUBLIC_BASE_URL;
      else process.env.PUBLIC_BASE_URL = before;
    }
  };

  it('prefers the configured address and drops any path', () => {
    expect(withEnv('https://www.loanbasecamp.com/some/path?x=1', () => siteBase(req('other.example')))).toBe('https://www.loanbasecamp.com');
  });
  it('falls back to the address the request arrived on', () => {
    expect(withEnv(undefined, () => siteBase(req('loandr.onrender.com')))).toBe('https://loandr.onrender.com');
  });
  it('never lets anything but a plain web address into the page', () => {
    expect(withEnv('javascript:alert(1)', () => siteBase(req('loandr.onrender.com')))).toBe('https://loandr.onrender.com');
    expect(withEnv('not a url', () => siteBase(req('x.test', 'http')))).toBe('http://x.test');
    expect(withEnv(undefined, () => siteBase(req('bad host"><script>')))).toBe('http://localhost');
  });
});

describe('page content', () => {
  const html = landingHtml('https://loandr.onrender.com');
  it('names the product, has one main heading, and links to sign in and sign up', () => {
    expect(html).toContain('<title>Loan Base Camp — Loan comparison workspace for loan officers</title>');
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('href="/login?mode=register"');
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="/agent"');
  });
  it('is honest when the site is invitation-only', () => {
    const closed = landingHtml('https://loandr.onrender.com', { signupsOpen: false });
    expect(closed).toContain('I have an access code');
    expect(closed).toContain('invitation-only');
    expect(closed).not.toContain('Create an account in under a minute');
    expect(html).not.toContain('invitation-only');
  });
  it('points search engines and link previews at the right address', () => {
    expect(html).toContain('<link rel="canonical" href="https://loandr.onrender.com/">');
    expect(html).toContain('<meta property="og:image" content="https://loandr.onrender.com/brand/og-image.png">');
    expect(html).toContain('<meta name="robots" content="index, follow, max-image-preview:large">');
  });
  it('gives Google the one-word spelling people type, as valid structured data', () => {
    const json = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1];
    const graph = JSON.parse(json)['@graph'];
    const site = graph.find((n) => n['@type'] === 'WebSite');
    expect(site.name).toBe('Loan Base Camp');
    expect(site.alternateName).toContain('LoanBaseCamp');
    expect(site.url).toBe('https://loandr.onrender.com/');
  });
  it('makes no promises about prices or rates', () => {
    expect(html).not.toMatch(/\$\d|per month|% APR|lowest rate/i);
  });
  it('builds robots.txt and a sitemap from the same address', () => {
    expect(robotsTxt('https://x.test')).toContain('Sitemap: https://x.test/sitemap.xml');
    expect(robotsTxt('https://x.test')).toContain('Disallow: /api/');
    expect(sitemapXml('https://x.test').match(/<loc>/g)).toHaveLength(1);
  });
  it('only marks the home page, search files and brand images as indexable', () => {
    const headersFor = (p) => {
      const out = {};
      noindexExceptHome({ path: p }, { setHeader: (k, v) => (out[k] = v) }, () => {});
      return out['X-Robots-Tag'];
    };
    for (const p of ['/', '/robots.txt', '/sitemap.xml', '/brand/loan-base-camp.svg', '/icon-512.png', '/favicon.ico']) expect(headersFor(p)).toBeUndefined();
    for (const p of ['/login', '/compare', '/q/abc123', '/s/tok', '/agent', '/api/health', '/admin', '/google8c5a0c4e5772ce9a.html']) {
      expect(headersFor(p)).toBe('noindex, nofollow');
    }
  });
});

describe('the running server', () => {
  let s;
  beforeAll(async () => {
    s = await startServer({ SERVE_CLIENT: 'true', PUBLIC_BASE_URL: 'https://www.loanbasecamp.com' });
  });
  afterAll(() => s.stop());

  it('serves the public home page at / with no noindex', async () => {
    const r = await get(s, '/');
    expect(r.status).toBe(200);
    expect(r.type).toMatch(/text\/html/);
    expect(r.robots).toBeNull();
    expect(r.text).toContain('<link rel="canonical" href="https://www.loanbasecamp.com/">');
    expect(r.text).toContain('Every loan scenario, side by side in seconds.');
    // Real text in the raw HTML — nothing here needs a script to appear.
    expect(r.text).not.toContain('<div id="root">');
  });

  it('shows the invitation-only version when signups are closed', async () => {
    const closed = await startServer({ SERVE_CLIENT: 'true', ALLOW_SIGNUP: 'false' });
    try {
      expect((await get(closed, '/')).text).toContain('I have an access code');
    } finally {
      await closed.stop();
    }
    expect((await get(s, '/')).text).toContain('Create an account in under a minute');
  });

  it('serves robots.txt and sitemap.xml for the configured address', async () => {
    const robots = await get(s, '/robots.txt');
    expect(robots.type).toMatch(/text\/plain/);
    expect(robots.text).toContain('Sitemap: https://www.loanbasecamp.com/sitemap.xml');
    const map = await get(s, '/sitemap.xml');
    expect(map.type).toMatch(/xml/);
    expect(map.text).toContain('<loc>https://www.loanbasecamp.com/</loc>');
  });

  it('keeps the API, shared links and signed-in pages out of search results', async () => {
    for (const p of ['/api/health', '/q/abc123', '/s/sometoken', '/login', '/compare', '/google8c5a0c4e5772ce9a.html']) {
      expect((await get(s, p)).robots, p).toBe('noindex, nofollow');
    }
  });

  it('still lets crawlers fetch the logo and link-preview image', async () => {
    for (const p of ['/brand/loan-base-camp.svg', '/brand/og-image.png', '/icon-512.png']) {
      const r = await get(s, p);
      expect(r.status, p).toBe(200);
      expect(r.robots, p).toBeNull();
    }
  });

  it.skipIf(!hasBuiltClient)('marks the app shell noindex in its own HTML as well', async () => {
    const r = await get(s, '/login');
    expect(r.text).toContain('<meta name="robots" content="noindex, nofollow"');
    expect(r.text).toContain('<div id="root">');
  });

  it.skipIf(!hasBuiltClient)('serves the Google verification file untouched', async () => {
    const r = await get(s, '/google8c5a0c4e5772ce9a.html');
    expect(r.status).toBe(200);
    expect(r.text).toBe('google-site-verification: google8c5a0c4e5772ce9a.html');
  });
});
