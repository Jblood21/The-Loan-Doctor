# Putting LoanDr. on the web — step by step

This guide gets you a **live link you can open in any browser**, with no software to
install on your computer. The whole app (the website + its backend) runs as one service.

You only need to do **one** thing I can't do for you: connect your GitHub repo to a free
host and click "deploy." Everything else is pre-configured in this repo.

> Estimated time: ~10 minutes. Cost: **$0** on the free tier.

---

## Recommended: Render (free, near one-click)

Render reads the [`render.yaml`](render.yaml) file already in this repo and sets
everything up automatically.

### Step 1 — Make sure the code is on GitHub
It already is, in your repo **`Jblood21/The-Loan-Doctor`**. Once this branch is merged
into `main` (or just deploy from the branch), you're ready. Nothing to do here unless you
haven't merged yet.

### Step 2 — Create a free Render account
1. Go to **https://render.com**
2. Click **Get Started** and choose **Sign in with GitHub** (free, no card required).
3. When asked, **authorize Render** to see your repositories.

### Step 3 — Deploy with the Blueprint
1. In the Render dashboard, click **New +** (top right) → **Blueprint**.
2. Find and select **`The-Loan-Doctor`** in the repo list, then click **Connect**.
3. Render reads `render.yaml` and shows a service named **loandr**. It will **prompt you to
   fill in a few values** before deploying (these are kept private — they are *not* stored in
   the repo). Set at least these:

   | Variable         | What to enter                                    |
   |------------------|--------------------------------------------------|
   | `ADMIN_PASSWORD` | A strong password for the Admin Dashboard.       |
   | `OWNER_EMAIL`    | **Your** email — this becomes your normal login. |
   | `OWNER_PASSWORD` | A password for your own loan-officer account.    |
   | `OWNER_NAME`     | Your name (optional, shown in the app).          |

   Optional:

   | Variable          | What to enter                                                             |
   |-------------------|---------------------------------------------------------------------------|
   | `ADMIN_EMAIL`     | Your preferred admin login email (defaults to `admin@loandr.app`).        |
   | `SIGNUP_CODE`     | Invite code others type to register. Defaults to `123456` — change it to something private, or clear it to fully close signups. |
   | `PUBLIC_BASE_URL` | Leave blank for now — you'll set it after Step 4 to your live URL.        |

4. Click **Apply** (or **Create Resources**) and wait ~3–5 minutes while it builds. You'll
   see logs; when it says **"Live"**, it's done.

### Step 4 — Open your live site
Render gives you a URL like **`https://loandr.onrender.com`**. Click it — that's your live
website. Sign in with the credentials **you** set in Step 3:

- **Your workspace:** `OWNER_EMAIL` + `OWNER_PASSWORD`
- **Admin Dashboard:** your `ADMIN_EMAIL` (or `admin@loandr.app`) + `ADMIN_PASSWORD`

Public self-signup is **off** by default, so a stranger with your link can't create an
account or reach the admin area. To let specific people in, see *"Inviting others"* below.

Then come back to Render → service → **Environment**, set **`PUBLIC_BASE_URL`** to your live
URL (e.g. `https://loandr.onrender.com`), and Save — this makes the Zapier/LOS webhook URL
shown inside the app correct.

> **First load is slow (~50 seconds).** On the free tier the server "sleeps" after 15
> minutes of no traffic and takes a moment to wake up. After that it's fast. This is normal
> for free hosting and goes away on a paid instance.

That's it — you have a shareable link. 🎉

### Inviting others (optional)
The app ships locked down to your accounts. Two ways to give access to other people:

- **Invite code:** the deploy ships with `SIGNUP_CODE=123456` so you can hand the link to a
  few people right away — they pick **Create an account** and enter `123456`. Change it to
  something private in Render → Environment whenever you like (it's easy to guess as-is).
- **Fully open signups:** set `ALLOW_SIGNUP=true` and leave `SIGNUP_CODE` blank — then anyone
  with the link can register their own account.

---

## Good to know

- **⚠️ Your data resets on restart (free tier) — this breaks the LOS webhook.** The free
  plan's disk is *ephemeral*: every restart or redeploy wipes accounts, **your webhook
  token/URL**, and any loans Zapier has sent. So your webhook URL changes on each deploy and
  a configured Zap stops working. Fine for a quick demo, **not** for a live Arive→Zapier
  integration. To make it permanent:
  1. Render → your service → **Settings** → change the instance to a **paid plan** (Starter,
     ~$7/mo). Disks aren't available on free.
  2. Render → your service → **Disks** → **Add Disk**: Name `loandr-data`, Mount Path
     `/var/data`, Size `1 GB`.
  3. Render → **Environment** → add `DATA_DIR` = `/var/data` → Save (it redeploys).

  After that, your account, webhook URL, and received loans persist across restarts — so the
  webhook URL you paste into Zapier stays valid. (The paid plan also stops the app from
  sleeping, so webhooks land instantly.)
- **Security:** the login-token secret (`JWT_SECRET`) is auto-generated by Render, and the
  app no longer ships any default/demo passwords in production — you set `ADMIN_PASSWORD`
  and `OWNER_PASSWORD` yourself in Step 3. If you ever forget to set `ADMIN_PASSWORD`, the
  app generates a random one (and logs a warning) instead of using a guessable default. The
  login screen is also marked **"Preview build"** and asks people not to enter real borrower
  data — fitting until you move to a permanent database (below).
- **Custom domain (e.g. `app.yourcompany.com`):** in Render, open the service →
  **Settings → Custom Domains** → add your domain and follow the DNS instructions. HTTPS is
  automatic and free.
- **Updates deploy automatically.** Any time you push to the deployed branch, Render
  rebuilds and redeploys.

---

## Alternative hosts (also work, via the included Dockerfile)

This repo includes a [`Dockerfile`](Dockerfile), so any container host works the same way:

- **Railway** (https://railway.app): New Project → Deploy from GitHub repo → it detects the
  Dockerfile → deploy. Add the same env vars (`NODE_ENV=production`, `ADMIN_PASSWORD`,
  `JWT_SECRET`).
- **Fly.io** (https://fly.io): `fly launch` (uses the Dockerfile), then `fly deploy`.
- **Google Cloud Run / any Docker host:** build and run the image; it listens on `$PORT`.

---

## When you're ready for a *real* production launch

The preview above is perfect for testing. To run this as a serious business product, these
are the upgrades (I can do all of them when you're ready):

1. **Permanent database** — swap the JSON file store for PostgreSQL (Render/Railway both
   offer a free/cheap managed Postgres). This makes accounts and data permanent.
2. **Real LOS integrations** — wire actual Arive / ICE Encompass / Calyx / BytePro APIs in
   place of the current borrower sandbox (`server/src/routes/los.js`).
3. **Email + e‑sign** — send pre-approval letters via a real email service (the button is a
   `mailto:` placeholder today).
4. **Lender-exact pricing** — replace the national rate-card estimates in
   `src/lib/finance.ts` with your actual PMI/MIP/fee schedules and live rate feeds.
5. **A paid instance** so the app never sleeps, plus monitoring and backups.

Tell me which of these you want and I'll set them up.
