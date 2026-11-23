# Run Package Pulse on Cloudflare Workers

This optional deployment serves the complete Package Pulse application and a small API from one Worker. The Worker fetches public npm metadata and jsDelivr request totals, then shares successful responses for 15 minutes. Repeated visitors can use the same capture instead of each making another provider request. Receipts retain the original provider retrieval timestamp.

**No API key, secret, database, paid service registration or software installation on your PC is required.** You need your existing Cloudflare account and its GitHub repository connection. The normal CoolCode/GitHub Pages deployment continues working independently.

## Connect the repository

In Cloudflare, open **Workers & Pages → Create application** and choose the **Worker / import Git repository** flow. Select **`jsdyer/packagepulse`**.

Use these settings on the setup screen:

| Setting | Value |
| --- | --- |
| Project / Worker name | `packagepulse` |
| Production branch | `main` |
| Root directory | Repository root: leave blank or `/` |
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |
| Preview command, if enabled | `npx wrangler preview` |
| Protect with Cloudflare Access | Off for this public tool |
| Variables / secrets to add | None |
| Build API token | Let Cloudflare create its normal build token |

Choose **Deploy**. Do not select the Pages flow, change the root to `cloudflare`, or enter an output folder in the dashboard. The committed `wrangler.jsonc` already declares `dist-worker` as the asset directory and `worker/index.mjs` as the API handler. The pinned Wrangler development dependency is installed during the build.

The build command runs `scripts/build_worker.py`. It produces the normal static app, copies it to the separate `dist-worker/` directory, and sets that copy's `apiBase` to `/api`. It removes the CoolCode-only root-relative visit-counter script. Neither generated directory nor credentials are committed.

## Test before adding a domain

1. Open the `workers.dev` URL that Cloudflare shows after deployment.
2. Open `/api/health` on that same host. It should return `"service":"packagepulse"` and `"status":"ok"`.
3. Open `/api/package?name=preact`. It should return npm package JSON. The Network panel shows `X-PackagePulse-Cache: MISS` or `HIT` and `X-PackagePulse-Captured-At`.
4. In the app, search for `express` and `@sveltejs/kit`. Results should appear under **Provider lookup · shared cache**, with their retrieval dates. Search names are not restricted to the default examples.

The health route verifies the Worker, not upstream availability. A successful package lookup additionally verifies its provider connection. Missing jsDelivr statistics are shown as unavailable without hiding a valid npm record.

## Add `packages.hackme.ca`

After the `workers.dev` test succeeds, open the Worker's **Settings → Domains & Routes → Add → Custom Domain**. Enter **`packages.hackme.ca`**. Cloudflare creates the DNS record and certificate for this hostname in your existing `hackme.ca` zone. Do not create a CNAME pointing it at `coolcode.ca`.

The app and API will then share this hostname:

- App: `https://packages.hackme.ca/`
- Health: `https://packages.hackme.ca/api/health`
- Package lookup: `https://packages.hackme.ca/api/package?name=preact`

Only this subdomain is attached to the Worker; this setup does not move the `hackme.ca` root site or CoolCode. These are proposed URLs until you complete the domain setup.

## Configuration and later changes

Commit ordinary changes to `main`; Cloudflare rebuilds the connected Worker automatically. The existing GitHub Actions workflow also continues publishing the original CoolCode tool.

| File / value | What to change |
| --- | --- |
| `web/config.json` | Default package examples, chart length, browser timeout and response limit |
| `wrangler.jsonc`: `CACHE_TTL_SECONDS` | Shared cache lifetime; default 900 seconds, maximum 3600 |
| `wrangler.jsonc`: `UPSTREAM_TIMEOUT_MS` | Provider deadline including the response stream; default 25000 ms, maximum 60000 |
| `wrangler.jsonc`: `MAX_RESPONSE_BYTES` | Streamed metadata guard; default 40000000 bytes, maximum 80000000 |
| `wrangler.jsonc`: `ALLOWED_ORIGIN` | The additional allowed browser origin; currently `https://coolcode.ca` |

Configuration lives in source so new deployments reproduce it. For large packages, keep browser and Worker limits consistent. `apiBase: null` keeps GitHub Pages calling the public APIs directly. The Worker build automatically overrides only its own copy to `/api`. If you later want CoolCode to use your Worker too, set the source config's `apiBase` to `https://packages.hackme.ca/api` after that hostname works. This is optional.

There is no saved watchlist, cron job or historical database here. Retained default examples come from the existing GitHub refresh workflow; download JSON receipts to preserve additional comparisons. Cache hits are not new observations.

## Privacy, safeguards and troubleshooting

The browser sends public package names to Cloudflare. On a cache miss, the Worker sends them to npm or jsDelivr. No visitor cookies, authorization headers or submitted URLs are forwarded. Provider responses stream with a byte/time guard instead of being buffered in Worker memory. Only the two fixed metadata providers are supported; tarball downloads and arbitrary URLs are not proxied. Redirects are rejected. Provider errors are not cached, and cache failure does not prevent a normal lookup.

Cloudflare logs and sampled traces are enabled to diagnose deployment/runtime failures. Platform diagnostics may contain request URLs, including public package names. Application error logs contain only the source kind and timeout state, not the package query or provider body. Do not enter private package names.

| Symptom | Check |
| --- | --- |
| Build cannot find files | Root must be the repository root; build is `npm run build` |
| Worker name mismatch | Use `packagepulse`, matching `wrangler.jsonc` |
| `/api/health` returns HTML or 404 | Confirm you created a Worker using this repo and configuration |
| Provider HTTP 404 | Verify the public package name, without a version or full URL |
| Provider HTTP 429 | Wait briefly; upstream request limits still apply |
| HTTP 502 | Check returned fixed error code and Workers logs; this can be a provider error, timeout, redirect, content-type or size issue |
| Fetch fails while reading a large response | Check response-size/deadline guards; an incomplete stream is never stored as a successful complete response |
| Custom domain does not load | Finish the Worker's Custom Domain setup and wait for its certificate; test the working `workers.dev` hostname separately |

## Local checks (optional)

```sh
npm ci
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -v
npm run build
npx wrangler deploy --dry-run
npm run dev
```

Current setup references: [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [static assets and bindings](https://developers.cloudflare.com/workers/static-assets/binding/), and [custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/). Checked 23 November 2026.
