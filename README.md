# ☕ Caféos

A real-time café business valuation tool powered by your Square POS data.

---

## Setup Guide

### Step 1 — Create a Square Developer Account

1. Go to https://developer.squareup.com and sign in with your Square account
2. Click **"Create your first application"**
3. Name it **"Caféos"**
4. Click **Create**

### Step 2 — Get your API credentials

1. Inside your new app, click the **OAuth** tab on the left
2. You'll need two values:
   - **Application ID** (shown at the top)
   - **Application Secret** (click "Show" to reveal it)
3. Keep this page open — you'll need these shortly

### Step 3 — Deploy to Vercel

1. Install Vercel CLI: `npm install -g vercel`
2. Inside this project folder, run: `vercel`
3. Follow the prompts (link to your account, create new project)
4. Once deployed, note your URL (e.g. `https://cafe-valuator.vercel.app`)

### Step 4 — Add your Square Redirect URI

1. Back in the Square Developer portal, under the **OAuth** tab
2. Find **Redirect URL** and add:
   ```
   https://cafeos.com.au/api/square/callback
   ```
   Also add `http://localhost:3000/api/square/callback` for local testing.
3. Click **Save**

### Step 5 — Set environment variables in Vercel

In your Vercel dashboard → Project → Settings → Environment Variables, add:

| Variable | Value |
|----------|-------|
| `SQUARE_APPLICATION_ID` | Your Application ID from Step 2 |
| `SQUARE_APPLICATION_SECRET` | Your Application Secret from Step 2 |
| `NEXT_PUBLIC_APP_URL` | `https://cafeos.com.au` |
| `SQUARE_ENVIRONMENT` | `sandbox` for testing, `production` for live data |
| `SESSION_SECRET` | Any random string (generate at https://generate-secret.vercel.app/32) |

### Step 6 — Connect cafeos.com.au to Vercel

1. In Vercel dashboard → Project → **Settings → Domains**
2. Add `cafeos.com.au` and `www.cafeos.com.au`
3. Vercel will show DNS records — add these in your domain registrar (wherever you bought cafeos.com.au)
4. DNS propagation takes 5–30 minutes

### Step 7 — Redeploy

After adding environment variables, redeploy:
```bash
vercel --prod
```

### Step 7 — Test with Sandbox first

- Set `SQUARE_ENVIRONMENT=sandbox` initially
- Square provides test merchant accounts at https://developer.squareup.com/docs/devtools/sandbox/overview
- Once working, switch to `production`

---

## Running locally

```bash
# Copy the example env file
cp .env.local.example .env.local

# Fill in your credentials in .env.local

# Install dependencies
npm install

# Start dev server
npm run dev
```

Visit http://localhost:3000

Don't forget to add `http://localhost:3000/api/square/callback` as a redirect URI in Square for local testing.

---

## How the valuation works

The app pulls your completed orders from Square and calculates:

- **Gross sales** — total revenue from Square
- **Annualised sales** — monthly average × 12 (smooths seasonal variation)
- **EBITDA** — estimated profit after COGS and operating expenses
- **Revenue valuation** — annualised sales × revenue multiple (0.3x–1.0x for cafés)
- **EBITDA valuation** — EBITDA × EBITDA multiple (2x–4x for cafés)
- **Midpoint** — blended average of both methods

You can adjust COGS %, operating expense %, and both multiples in the dashboard.

---

## Security

- Square credentials are never stored — only the OAuth access token (encrypted in a cookie)
- No data is stored on any server
- Users can disconnect at any time, which clears the session

---

## Tech stack

- **Next.js 14** — React framework
- **Square API** — OAuth + Orders API
- **Vercel** — hosting and serverless functions
