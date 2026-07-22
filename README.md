# Prayer Wall

A mobile-first, NFC-linked church/youth ministry prayer wall with an optional Supabase backend.

## Current modes

- **Demo mode:** Leave `config.js` blank. Data stays in browser `localStorage`.
- **Shared mode:** Configure Supabase. Prayer requests, praises, prayer counts, reports, and admin changes become cumulative across devices.

## Supabase setup

1. Create a Supabase project.
2. Open **SQL Editor** and run all of `supabase-schema.sql`.
3. In **Authentication > Users**, create the administrator account that will access the admin dashboard.
4. Open **Project Settings > API** and copy the project URL and publishable/anon key.
5. Paste those values into `config.js`.
6. Serve the project over HTTP rather than opening `index.html` directly.

```bash
python3 -m http.server 8000
```

Then visit:

```text
http://localhost:8000/?t=DEMO01
```

The `?t=DEMO01` query string simulates a unique NFC tag ID.

## Database behavior

- Public visitors can read active, unexpired posts.
- Public visitors can submit prayers and praises.
- Prayer counts are incremented atomically in PostgreSQL.
- Reports are stored centrally; a post is automatically hidden after three reports.
- Prayer activity statistics are calculated from the shared action log.
- Only authenticated Supabase users can view and modify the full admin dataset.
- Row Level Security is enabled on exposed tables.

## Important production follow-ups

The current text filter still runs in the browser. Before a broad public launch, move moderation and rate limiting to a Supabase Edge Function or another trusted server environment. Also consider CAPTCHA/Turnstile and server-generated privacy-preserving request fingerprints to reduce spam and repeated clicks.


## Moderation upgrade

After the base schema has been installed, run `supabase-moderation-migration.sql` in the Supabase SQL Editor.

This upgrade:

- Imports the unchanged `better-profane-words` 1.0.3 reference set.
- Automatically publishes clean submissions.
- Holds matched submissions as `pending` for administrator review.
- Records the matched terms, categories, maximum intensity, and moderation source.
- Pulls an active post from the public wall after three user reports and sends it to `pending` review.
- Forces public submissions through the `submit_post` database function so browser-side moderation cannot be bypassed.

The original third-party reference files and license are preserved under `vendor/better-profane-words/`.
