# Splitzy

Split shared expenses with friends. Every expense goes in a **bucket** (Food, Cab, Groceries, Rent… or your own). Debts are tracked per person *per bucket*: if P owes N ₹50 for a cab and N later owes P ₹50 for a cab, they cancel out. Different buckets never mix, so you can clear Cab today and Groceries next week, or clear everything at once. Splits can be equal, exact amounts or percent. Each person has their own login. Only a group's owner can let people in. They hand out **one-time codes**, and every person who uses a code still needs the owner's approval.

Works on laptop and phone. Glass UI with light and dark themes.

| Layer | Tech | Hosting (free) |
|---|---|---|
| Frontend | React, Vite, Tailwind | Vercel |
| Auth + Database | Supabase (Postgres, row level security) | Supabase free tier |

## Try it locally (demo mode, no setup)

```bash
npm install
npm run dev        # http://localhost:5180
```

Without Supabase keys the app runs in **demo mode** with sample people and groups stored in your browser. Use the **Demo** pill (bottom-left) to switch person and try both sides of a flow:

1. As **Pranav** (owner of Goa Trip), open Goa Trip → Members → *New code*.
2. Switch to **Rahul**, go to *Join* (key icon), enter the code → "Request sent".
3. Switch back to **Pranav**. The request shows on Home and in the group. Approve it.

All demo passwords are `demo`. *Reset demo data* is in the same menu.

## Deploy for free

### 1. Database: Supabase
1. Create a free project at [supabase.com](https://supabase.com) (pick the region nearest you, e.g. Mumbai).
2. **SQL Editor** → New query → paste all of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   Already ran an older `schema.sql`? Instead run the files in [`supabase/migrations`](supabase/migrations) you haven't run yet, in order (`001_upi_ids.sql`, `002_profile_picture.sql`, then `003_group_picture.sql`).
3. **Authentication → Sign In / Providers → Email**: either keep *Confirm email* on, or turn it off so people can use the app straight after signing up. Supabase's built-in mailer only sends a few emails per hour; add custom SMTP (e.g. Resend's free tier) if many people will sign up.
4. **Project Settings → API keys**: copy the *Project URL* and the *publishable* key (or the legacy *anon* key).

### 2. Frontend: Vercel
1. Push this repo to GitHub.
2. [vercel.com](https://vercel.com) → *Add New Project* → import the repo. Vite is detected automatically.
3. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` → **Deploy**.
4. Back in Supabase → **Authentication → URL Configuration**: set *Site URL* to your Vercel URL and add `https://<your-app>.vercel.app/**` to *Redirect URLs* (needed for email confirmation and password reset links).

### 3. Keep it awake
Free Supabase projects pause after 7 days without activity. In GitHub → repo *Settings → Secrets and variables → Actions*, add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. The [keep-alive workflow](.github/workflows/keepalive.yml) then pings the database twice a week.

## Local development against Supabase

```bash
cp .env.example .env    # fill in the two values
npm run dev
```

## How access works

All rules live in the database ([`supabase/schema.sql`](supabase/schema.sql)), so a modified browser can't get around them:

- Browsers can only **read** rows the user is allowed to see (row level security). Every **write** goes through a database function that checks permissions.
- Invite codes are 8 characters, single use, expire after 1 hour to 7 days, and can be revoked. Redeeming one only creates a *join request*.
- Only the owner can approve or decline requests, create codes, remove members, rename or delete the group.
- Someone with a pending request sees the group's name, nothing else.
- Members can add, edit and delete expenses. Payments can be recorded by the payer, the receiver or the owner. A payment belongs to one bucket and can't exceed what's owed in it.
- **Pay by UPI.** Everyone can add their UPI ID in Settings (only their group-mates can see it). When you clear a debt to someone with a UPI ID, the app opens your UPI app with their ID, the amount and a note filled in (Android: your default app; iPhone: pick GPay / PhonePe / Paytm; laptop: a QR code to scan). You then tap "I've paid" and it goes to them to confirm.
- **A payment only clears a debt once the person being paid confirms it.** When the payer records it, it shows in the receiver's bell (top right) to Confirm or Decline. If the receiver records it themselves, it clears immediately. While pending, the same amount can't be sent twice. A payer can withdraw a pending payment. Only the receiver or the owner can undo a confirmed one.
- Members can leave, and owners can remove them, only once that person is settled up.

## Tests

```bash
npm test     # split maths: rounding, percent splits, debt simplification
```
