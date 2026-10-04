# Wayfarer

A private travel journal for two: **Been** and **Want to go**, independent comparison rankings, combined scores, visit dates, and notes. A responsive Next.js app that can be added to a phone’s home screen.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci
npm run setup
npm run dev
```

Open http://localhost:3000. The setup command generates a random shared key in `.env.local`. Copy it privately to your partner. There are no accounts. Each browser receives a signed, HttpOnly session cookie that lasts 30 days. Lock the journal on shared devices.

Local development saves to `data/journal.json`. That file and all environment files are excluded from Git. Do not put travel history in `public/`, source code, or a public repository.

## Deploy on Vercel

1. Push this project to an empty **private** GitHub repository and import it into Vercel as a Next.js project.
2. Generate a shared key with `npm run setup`, or use `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Set `JOURNAL_KEY` as a sensitive production environment variable in Vercel. It must be at least 32 characters. Use the generated random key, not a memorable password. Do not prefix it with `NEXT_PUBLIC_`.
3. Create a **private** Vercel Blob store and connect it to the production environment. Vercel supplies `BLOB_STORE_ID`; the server uses Vercel's short-lived OIDC credentials automatically. Older connections using `BLOB_READ_WRITE_TOKEN` also work. Do not use a public Blob store or a client upload token.
4. Deploy or redeploy after connecting storage and setting the key. Do not set `LOCAL_FILE_STORAGE` in Vercel. The app deliberately refuses to use the ephemeral deployment filesystem for persistence.
5. Unlock the production URL on both phones with the same shared key. Set your names in journal settings and import the Travel CSV.

Vercel’s default preview deployment protection may require your Vercel account. Use the production domain for your partner. Configure production hosting access as appropriate for your Vercel plan; the app separately protects every journal read and write with its shared key. Preview deployments should have a separate key and storage, or no storage, so they cannot modify your production journal.

Changing `JOURNAL_KEY` invalidates existing sessions on the next request after redeployment. The private storage remains intact. Anyone with the shared key has full read/write access; both partners are trusted equally. Losing the key requires setting a new one in Vercel. This is lightweight shared authentication, rather than individual accounts.

## File storage

No Supabase, SQL schema, database, or account service. Production stores one JSON file in **private Vercel Blob**. JSON preserves nullable ratings and structured data; CSV is available for importing and exporting.

Private files are read only by server routes after authorization. API responses use `Cache-Control: private, no-store`. Same-origin mutation checks and Strict cookies protect browser requests. The key never appears in URLs or browser storage, and the storage token never reaches the client. The application does not send destinations to map, geocoding, photo, or analytics services. The decorative Venice photograph and fonts are bundled locally.

Writes use Blob ETags to reject stale revisions. When two people edit at once, the second save shows a conflict and keeps the draft open. Detail edits can refresh and merge with the latest journal; comparisons must refresh and restart because the candidate order may have changed. CSV exports include current scores and original imported ratings; private Blob is durable storage, not a versioned backup system. File storage suits a small journal; Vercel Blob may bill usage under your hosting plan.

## Comparison rankings

Open a destination, then choose **Adjust** or **Rank** under your name. Pick the destination you prefer in each side-by-side comparison; **Too close to call** creates a tie. Binary search narrows the insertion position in a few comparisons. Back undoes a choice; nothing is saved until **Save ranking**. Visited comparisons only use visited destinations. Wishlist comparisons ask where you would rather go. Each person and each category has an independent order.

For direct edits, choose **Reorder** above the table, select a person's name, and drag the row handles. Mouse, touch, and keyboard Up/Down keys work. Each move saves immediately and updates scores. Moving a tied destination separates it from the tie; other ties remain intact. Together stays the average of the two personal rankings. Search is disabled while reordering so moves use the complete list. Stale saves are rejected; refresh and repeat the move.

Comparisons have no fixed count limit. They stop when the insertion position is determined or you explicitly choose a tie. The number of comparisons grows with the number of distinct ranked groups.

Imported scores initialize the order, preserving ties. Original numbers remain stored on each destination and visible under **Original ratings**. Previously imported `Region:` metadata supplies missing country/region fields. The app does not infer countries from broad regions.

Displayed scores derive from relative rank: for `g` distinct tie groups, group index `i` scores `10 × (g − 1 − i) / (g − 1)`. A sole group scores 10; unrated entries show a dash. Together averages available personal scores. Reordering one place can change other displayed scores. These numbers describe relative preference, rather than an absolute trip-quality rating.

The comparison approach follows publicly documented [Beli behavior](https://www.linkedin.com/pulse/analytics-user-reviews-beli-does-almost-right-gary-angel-l2vvc), with visual references from its [App Store screenshots](https://apps.apple.com/us/app/beli/id1478375386). Beli's exact score formula is proprietary; the formula above is this app's own, not a claim to reproduce it. This app uses direct comparisons without Beli's initial sentiment buckets.

## Import the Travel tab

In Google Sheets, select **Travel**, then **File → Download → Comma-separated values (.csv)**. In the app, choose **Import CSV** and map:

- destination and optional country;
- each person’s rating column;
- an optional status, date, and notes column.

Check the preview before importing. Ratings must be numbers from 0–10. Blank ratings stay unrated. The status column accepts “Been” / “Visited” and “Want to go” / “Wishlist”, among other common values. If the tab has separate lists side by side, import it twice: select the historical destination/rating columns with the default list **Been**, then select the wishlist columns with default list **Want to go**. Set unrelated columns to None. If each list has its own header row or section, export/copy each section separately with a header row.

Existing destinations are skipped by case-insensitive destination + country. Imports add entries and never replace the journal. Invalid ratings or unrecognized statuses block import so you can fix the mapping. The header row must be the first nonempty row. Up to 2,000 destinations and 2 MB per import are supported. Export creates a standard CSV with both lists and formula-safe text.

Import travel records through the authenticated app. Travel data is stored in private Blob storage, not this repository.

## Phone use

On iPhone, open the production URL in Safari and choose **Share → Add to Home Screen**. On Android, choose **Install app** or **Add to Home screen** from your browser menu. This is a web app with a standalone app manifest and icons; it is not a native App Store/Play Store binary. A network connection is required to read and save the journal. No offline cache of private travel data is created.

## Verification

```sh
npm run typecheck
npm run build
npm test
```

The browser tests require Chromium at `/usr/bin/chromium` (adjust `playwright.config.ts` for another installation). Tests launch a separate server on port 3001 and create an isolated temporary journal, leaving local and production travel files untouched. They cover unauthorized reads, CSRF rejection, cookie tampering, validation, concurrent writes, mobile editing, list switching, reload persistence, CSV deduplication/import/export, and locking.

## Credits

Manrope by Mikhail Sharanda, licensed under the SIL Open Font License (bundled in `public/Manrope-LICENSE.txt`). The bundled Venice photo is from [Unsplash](https://images.unsplash.com/photo-1498307833015-e7b400441eb8), retrieved through the Unsplash image service.
