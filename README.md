# Family Tree

A private, multi-family tree app built with React + Vite on Supabase (auth, database, photo storage, realtime chat).
Each family is a separate tenant with its own tree, admins, members and chat.

## Setup

1. In your Supabase project, open **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql) and run it. It creates the tables, the
   permission rules, the `photos` storage bucket and enables realtime.
2. In **Authentication → URL Configuration**, add your site URL (e.g. `http://localhost:5173`)
   to the redirect URLs so confirmation and sign-in links work.
3. `.env` needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. `npm install && npm run dev`.

**Setting up a family** — the sign-in screen's *Set up your family's tree* button (or a
`?setup` link) starts a guided wizard: create your account → name the family → add the oldest
ancestor you know → add their children → review → create. Nothing is saved until the review
step, and the organiser finishes with an invite link to share. If Supabase requires email
confirmation, the draft is kept and setup resumes at the review step after the link is clicked.

**Joining a family** — relatives sign up and enter the invite code, or open the invite link
(`https://your-site/?join=CODE`). People can belong to several families and switch between them.

**Public link** — 1st-level admins can switch on a read-only public page from the family menu
(`https://your-site/?tree=okafor-7k2p9qrx`). Visitors need no account and can browse and search
the tree, but can't edit, chat or see the invite code. *Hide details of living relatives* is on by
default: living people then appear by name only, and the database withholds their photos, dates
and write-ups so they never reach a visitor's browser. *New link* retires the old one.

While `AUTH_DISABLED` is `true` in `src/lib/demo.ts`, login is skipped and the app runs on
sample data saved in your browser (two families; join the second with code `MENSAH24`). Try
`/?setup` for the sign-up and family setup flow, `/?tree=okafor-demo` for a public page, and
`/?reset-demo` to start over.

## How it works

- **Families (tenants)**: every person, admin grant, chat message and photo belongs to one family.
  Row-level security only lets members of a family read it. The family menu (tap the family name)
  switches families, shares the invite code, renames the family and manages members.
- **Cards** show the photo, name and a living (green dot) / deceased (†, greyed photo) marker.
- **Tap** a card: it centres and opens details (dates, write-up, **ADD**). ADD is only active
  for admins of that branch.
- **Double-tap** a card: shows/hides its children. Siblings are ordered by date of birth.
- **Find** searches by name, date of birth and/or date of death and shows each match with its
  parent (“up link”) card.
- **Dates**: give a year, month + year, or a full date. A partial date is stored as the last day
  of the period (`1950` → 31 Dec 1950, `Feb 1952` → 29 Feb 1952) but only the given parts are shown.
- **Admins**: 1st-level admins edit anything and can appoint admins at any level. 2nd-level admins
  edit and appoint admins only within the branch they were given (that person + descendants).
  These rules are enforced by row-level security in the database, not just the UI.
- **Chat**: a General room for everyone and private one-to-one conversations, live via Supabase Realtime.
- **Birthdays**: a banner on the day, a list of upcoming birthdays for living people, and optional
  device notifications.
