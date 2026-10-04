# Refreshing the user manual

The manual is a static page the app serves itself, at `web/public/manual/`,
reachable at <https://mauzohalisi.com/manual/> and from the sidebar.

Its screenshots are taken from the running app against seeded data, never
drawn or described, so a screen that changes shows up here as a wrong picture
rather than as prose nobody checks.

## When to refresh

Whenever a screen in a documented chapter changes shape: the POS, products,
inventory, debts, expenses, the dashboard, the sales calendar, report
settings, users, subscription, or one of the four business-type screens.
Changing a button's wording counts, because the manual quotes button names
exactly.

## How

Postgres and the repo's `backend/.env` must be set up for local development.

```sh
# 1. Seed the shop the screenshots are taken of.
#    Five shops under one owner, one per business type, with about a month
#    and a half of trading. Safe to re-run: it deletes its own account first,
#    and it refuses to run against anything but a local database.
cd backend && npx ts-node --transpile-only prisma/seed-manual.ts

# 2. Start both servers and leave them running.
cd backend && npm run dev
cd web && npm run dev

# 3. Capture. Writes straight into web/public/manual/shots/.
cd tools/manual && npm i && npm run shoot

# 4. Shrink them. 2880px PNGs are four times the size they need to be.
cd ../../web/public/manual/shots && for f in *.png; do sips -Z 1600 "$f"; done
```

Then look at the result at <http://localhost:5173/manual/index.html>, in both
languages, before committing.

## Three traps

**The subscription page needs payment keys.** Without `SPLASHPAY_*` in
`backend/.env` it renders "Online payment is not switched on yet" instead of
the plan chooser. Any placeholder value will do for a capture; nothing presses
Pay. Take them back out afterwards.

**The page's script must stay in `manual.js`.** The app is served under
`script-src 'self'`, so an inline `<script>` is blocked in production and only
appears to work on the dev server, which sends no CSP.

**Phone numbers in the seed must stay un-dialable.** They are photographed and
published beside invented debts and invented guests. The seed issues them from
`+25575400xxxx`, which is a placeholder block; a plausible number would sooner
or later be a real subscriber listed publicly as owing money they do not owe.

## Editing the text

`web/public/manual/index.html` holds both languages at once. Every piece of
copy exists twice, tagged `lang="en"` and `lang="sw"`, and CSS hides whichever
one you are not reading. Add both or the page will show a gap in one language.
