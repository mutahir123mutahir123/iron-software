# Iron Merchant Management System

Private, single-business management system for an iron/steel merchant.
Source of truth for business rules: `Iron_Merchant_Software_Core_Understanding.docx`.
Build plan: `architect.txt`.

## Stack

- Next.js (App Router) + React + TypeScript + Tailwind CSS
- Supabase (hosted project) — PostgreSQL, Auth, RLS
- Business logic enforced in PostgreSQL transactions/RPCs, not in React

## Database workflow (remote-only — no local Docker stack)

The linked hosted Supabase project is the only database. Migrations live in
`supabase/migrations/` and are applied with the Supabase CLI:

```bash
npx supabase migration list --remote   # check status
npx supabase db push --remote          # apply pending migrations
```

Default owner profile, business settings, document sequences, expense
categories and the default chart of accounts are seeded automatically per
owner by the `handle_new_user` trigger on signup.

There is no local Supabase/Docker setup for this project.

## Configuration

`.env.local` (never commit):

- `NEXT_PUBLIC_SUPABASE_URL` — hosted project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key (browser-safe)
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only

## Development

```bash
npm install
npm run dev    # http://localhost:3000
npm run lint   # eslint
npx tsc --noEmit
npm run build
```

See `work-completed.md` for phase progress.
