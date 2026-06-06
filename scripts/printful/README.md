# Printful trial (ADR 0001, D1-revisited)

We're trialling **two interchangeable ways** to turn a design into a product image,
modelled behind the shared `MockupRenderer` contract (`packages/shared/src/mockup.ts`):

| source     | where                                   | speed            | control | print-match |
| ---------- | --------------------------------------- | ---------------- | ------- | ----------- |
| `local`    | `apps/web` `ShirtPreview` (in-browser)  | instant          | total   | we calibrate |
| `printful` | this dir (server-side, hosted Mockup Gen) | async, polled  | their templates | guaranteed |

This folder is the **server-side** `printful` path. It needs `PRINTFUL_API_KEY`
(a Printful private token) in `.env.local` — never commit it. With no key set,
every command fails with a clear message and the app falls back to local/mock.

## Files

- `client.ts` — dependency-light Printful v1 REST client (`fetch` + bearer token).
- `catalog-map.ts` — maps our `ProductType`/colour/size → Printful product/variant ids.
  **IDs are unverified placeholders** until you fill them from the live catalog.
- `renderer.ts` — `PrintfulRenderer implements MockupRenderer` (upload → create task → poll).
- `cli.ts` — runnable trial commands.

## Try it (once the token is in `.env.local`)

```bash
bun run printful:check                 # verify the token (GET /store)
bun run printful:discover "t-shirt"    # find catalog product ids by keyword
bun run printful:variants 71           # list a product's variant ids (color/size → id)

# Then fill scripts/printful/catalog-map.ts with the real ids and flip verified:true.

# High-level (uses the map):
bun run printful:mockup --product tshirt --color black --size M --art https://…/art.png
# Raw ids (skips the map, good for a first smoke test):
bun run printful:mockup --product-id 71 --variant-id 4012 --art https://…/art.png
```

Notes:
- `--art` must be a **public https URL** — Printful fetches it. A `data:` URL (what the
  local path uses) must first be uploaded to Storage / the File Library.
- The command prints the hosted mockup URL **and** the wall-clock time, so you can
  compare it directly against the instant local SVG preview for the same artwork.
