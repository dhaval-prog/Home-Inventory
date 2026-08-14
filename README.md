# Home Inventory — "Where Is It?"

Map out your home — rooms, furniture, and everything stored inside — so you
can always answer one question: **where exactly is this thing?**

Built with Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, and
Supabase (Postgres + Auth + Storage).

## Features

- Email/password auth (sign up, log in, forgot/reset password)
- Home creation with 1 BHK / 2 BHK / 3 BHK / Custom layouts that auto-generate rooms
- Visual room → furniture → storage location → item hierarchy, with nested
  storage locations supported at the database level
- Add furniture from category presets, add storage locations (shelves,
  drawers, sections…) with smart presets per furniture type
- Add items with category, description, quantity, container, tags, photo
- Global search with live suggestions, matching item name/category/tags as
  well as the room/furniture/storage location they live in
- Voice search & voice add-item — tap the mic in the search bar to find
  things ("where is my passport?") or add them ("add my black headphones to
  the bedroom wardrobe, second shelf") by speaking. Works out of the box with
  a built-in rule-based parser; optionally upgrade to Gemini for richer
  understanding by setting `GEMINI_API_KEY`. Falls back to plain text search
  in browsers without speech recognition support
- Full breadcrumb path everywhere an item appears (`Home → Room → Furniture
  → Storage Location → Container → Item`)
- Move item between any room/furniture/storage location
- Favorites and Important Items views
- Dashboard with home stats, recently added items, and most-used storage areas
- Responsive UI: sidebar nav on desktop, bottom nav + quick-add on mobile
- Row Level Security — every table is scoped to `auth.uid()`, enforced in
  Postgres, not just the UI

## 1. Local setup

```bash
npm install
cp .env.example .env.local
# fill in the Supabase values (see below), then:
npm run dev
```

## 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Once it's provisioned, open **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 3. Add the database tables

1. In the Supabase dashboard, open **SQL Editor → New query**.
2. Paste the entire contents of [`supabase/schema.sql`](./supabase/schema.sql)
   and run it.

This creates:

- `profiles`, `homes`, `rooms`, `furniture`, `storage_locations`, `items`
- A trigger that creates a `profiles` row automatically on sign up
- Row Level Security policies on every table, scoped to `auth.uid()`
- An `item-photos` storage bucket with policies so users can only manage
  files inside their own `user_id/` folder

Safe to re-run — it uses `create table if not exists` and drops/recreates
policies before creating them.

## 4. Configure authentication

Email/password auth works out of the box once the schema above is applied.

In **Authentication → URL Configuration**, set:

- **Site URL**: your deployed URL (e.g. `https://your-app.vercel.app`), or
  `http://localhost:3000` while developing locally
- **Redirect URLs**: add both your local (`http://localhost:3000/auth/callback`)
  and production (`https://your-app.vercel.app/auth/callback`) callback URLs

The architecture is already set up to add **Google** or **Apple** sign-in
later: enable the provider under **Authentication → Providers** in Supabase,
then add a button that calls `supabase.auth.signInWithOAuth({ provider })` —
no schema or session-handling changes required.

## 5. Environment variables

Copy `.env.example` to `.env.local` (and to your Vercel project's
Environment Variables) and fill in:

| Variable | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SITE_URL` | Your app's public URL (used in password-reset emails) |
| `GEMINI_API_KEY` *(optional)* | Free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — enables richer voice search/add understanding. Server-side only, never exposed to the browser. Voice search works fully without it. |

Never commit real keys — `.env.local` is already gitignored.

## 6. Connect to GitHub

```bash
git remote add origin <your-repo-url>
git push -u origin main
```

## 7. Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import the GitHub repo.
2. Add the three environment variables from step 5 (set
   `NEXT_PUBLIC_SITE_URL` to the `https://<project>.vercel.app` domain Vercel
   assigns you, or your custom domain).
3. Deploy. Vercel runs `next build` automatically — no extra configuration
   needed.
4. Back in Supabase, add the deployed URL to **Authentication → URL
   Configuration → Redirect URLs** (`https://your-app.vercel.app/auth/callback`).

## Project structure

```
src/
  app/
    (auth)/            login, signup, forgot-password, reset-password
    (app)/              authenticated app shell: dashboard, home, items, search…
    auth/callback/      Supabase OAuth/PKCE code exchange route
  components/
    ui/                 shadcn/ui primitives
    nav/, home/, items/, search/, settings/, shared/
  lib/
    actions/            Server Actions (homes, rooms, furniture, storage, items, auth…)
    supabase/            browser/server Supabase clients + middleware session refresh
    constants.ts         room/furniture templates, item categories, tags, icon map
    location.ts          in-memory breadcrumb path resolution (home → … → item)
supabase/
  schema.sql             full schema + RLS policies + storage bucket setup
```

## Data model

```
User
 └─ Home (1bhk | 2bhk | 3bhk | custom)
     └─ Room
         └─ Furniture
             └─ Storage Location (self-referencing parent_id — supports
                unlimited nesting, e.g. Shelf → Box → Pouch, for future use)
                 └─ Item (category, quantity, container, tags, photo,
                    favorite/important flags, reserved qr_code column)
```

Every table carries its own `user_id`, so RLS policies are a simple
`user_id = auth.uid()` check rather than deep join-based rules — and every
insert is validated the same way via `with check`.

## Roadmap (not in this MVP)

- AI-powered natural language search ("where are my winter clothes?")
- QR code generation/scanning for storage boxes (the `items.qr_code` column
  and public `item-photos` bucket are already in place for this)
- Barcode scanning, voice search
- Sharing a home with family members / multiple users per home
