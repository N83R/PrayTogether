# Prayer Wall NFC Prototype

A mobile-first static prototype for an NFC-linked church/youth ministry prayer wall.

## How to run

Open `index.html` in a browser. No build step is required.

For the best local testing experience, you can serve the folder with:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/?t=DEMO01
```

The `?t=DEMO01` query string simulates a unique NFC tag ID.

## Admin

Click `Admin` in the top right.

Prototype password:

```text
prayadmin
```

The admin dashboard can approve, hide, delete, extend, search, and filter posts.

## Prototype behavior

- Uses browser `localStorage` as a mock database.
- Prayers and praises have expiration dates.
- Prayer actions are counted as “Prayers Offered.”
- The “Pray for Someone” page shows one random prayer and does not show counts before praying.
- Submissions go through a simple content filter.
- Reported posts auto-hide after 3 reports.
- Tag IDs are stored when a URL includes `?t=TAGID`.

## Next production steps

Replace localStorage with a real database such as Supabase, Firebase, SQLite, or Postgres.

Add:

- Real auth for admin dashboard.
- Server-side moderation.
- Server-side rate limiting.
- Hashed IP/device fingerprints on the backend.
- Scheduled cleanup/expiration jobs.
- Better profanity/hate/spam filtering.
- HTTPS hosting and domain setup.
- Optional PWA install support.
