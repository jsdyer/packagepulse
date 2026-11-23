# Package Pulse

[Open Package Pulse](https://coolcode.ca/packagepulse/) to inspect a public npm package’s release history, publisher tags, current maintainers, direct dependencies and dated jsDelivr CDN requests. Compare any two package names, including scoped names such as `@sveltejs/kit`. No registration, API key, package installation or backend is required.

<!-- coolcode:guide -->
Enter any public npm package, optionally add a second, and choose Look up live. The latest publisher tag can differ from the newest release; CDN requests are not npm downloads or unique users.
<!-- /coolcode:guide -->

## Use the tool

The page begins with real, dated captures for the configured defaults. These let you explore immediately without upstream availability. They are explicitly labeled retained captures. Choose **Look up live** to fetch current metadata; a failed live request is shown as a failure, never replaced silently with an older result.

- Compare current `latest` tags, the number of retained version records, days since the latest-tag version was published and monthly stable/prerelease activity.
- Filter the complete release ledger by version text and release channel; **Show more releases** paginates the visible records without discarding older versions.
- Expand a version for its runtime, peer and optional dependencies, engines, license and unpacked size when supplied.
- Compare the latest-tag versions’ declared runtime dependencies. This is not a resolved dependency graph or bundle-size calculation.
- Save a timestamped JSON receipt, or export all loaded release records as CSV. CSV cells are protected against spreadsheet formula interpretation.

A package with few releases is not necessarily abandoned. The public npm record does not establish ownership history, support commitments, security or suitability. Use [Dependency X-Ray](https://coolcode.ca/dependencyxray/) for advisory investigation.

## Expand or customize

Edit **[`web/config.json`](web/config.json)**. No application logic or count constants need changing. Any valid public package remains searchable, whether or not it appears in this file.

```json
{
  "defaultPackages": ["express", "@sveltejs/kit"],
  "examplePackages": ["express", "@sveltejs/kit", "vue", "preact", "vite", "typescript", "fastify", "astro"],
  "statsPeriod": "month",
  "requestTimeoutMs": 30000,
  "maxResponseBytes": 40000000,
  "releasePageSize": 30,
  "timelineMonths": 18
}
```

- `defaultPackages`: one or two packages for the comparison desk. Two is the number of comparison columns, not an allowed-package list.
- `examplePackages`: any number of shortcut buttons. Buttons fill the first field; they do not automatically send requests.
- `statsPeriod`: a jsDelivr period such as `month`, `week` or an available historical month. The returned coverage dates are shown. See the [period API](https://data.jsdelivr.com/v1/stats/periods) for availability.
- `releasePageSize`: displayed rows per pagination step, not a collection cap.
- `timelineMonths`: calendar months to chart. Other release records remain searchable and exportable.
- `requestTimeoutMs` and `maxResponseBytes`: explicit resource guards, not package eligibility rules. Increase them for an unusually large public record if needed.

**Publishing config edits:** commit to `main`. The workflow refreshes retained defaults, checks the app, and publishes GitHub Pages. Alternatively choose **Actions → Package Pulse · Check and publish → Run workflow**, with **Refresh retained default packages** enabled. The normal command-line build remains offline.

A new default can also be looked up immediately through the live form before refreshing its retained capture. To refresh locally:

```sh
node scripts/refresh.mjs
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -v
python3 scripts/build.py
```

The refresh script reads the same config as the browser. It validates all npm records before atomically replacing `web/data/defaults.json`. A failed npm collection retains the previous file and fails publication. Optional missing jsDelivr statistics are preserved as unavailable, not fabricated as zero. Defaults refresh weekly on Tuesday at 08:17 UTC as well as successful main-branch updates; public-repository schedules can be disabled after inactivity. No historical database is claimed: download receipts to preserve your own comparisons.

## Sources, dates and limits

- [npm public package metadata](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md): full metadata from `https://registry.npmjs.org/{package}`. Maintainers are the current public names; emails are excluded. Published timestamps come from `time[version]`; missing dates remain unknown. The publisher’s `latest` dist-tag may point to an older release. Unpublished versions can disappear from the provider record.
- [jsDelivr public API](https://github.com/jsdelivr/data.jsdelivr.com): `GET /v1/stats/packages/npm/{package}?period=month`. This is CDN request volume across the package, not npm installations or unique people. Available data are delayed; the API’s actual from/through dates are displayed. No usage report does not establish zero activity. The documented API is free; sustained 100+ requests per minute requires contacting jsDelivr. Package Pulse performs only explicit individual lookups and a tiny default refresh.

Both services support cross-origin browser requests. API availability and upstream data may change. No guarantee of complete historic versions or accurate publisher metadata is made. Source URLs and retrieval timestamps are included in each receipt. Repository/homepage links are restricted to HTTP(S); provider text is rendered as text, never HTML. Dependencies are metadata only: no tarballs, install scripts or package code run.

## Privacy

The initial view reads files from CoolCode only. **Look up live** sends public package names, your IP address and ordinary request metadata to npm and jsDelivr. Do not enter private package names if you do not want those names sent. There is no account, API secret, local storage, saved watchlist or background polling. Results live in tab memory unless you choose to download them. CoolCode’s shared counter records aggregate opens separately; package inputs are not sent to that counter.

## Optional Cloudflare Worker

[Follow the Workers setup guide](docs/cloudflare-workers.md) to deploy a second copy, for example at `packages.hackme.ca`, with a same-origin API and shared 15-minute cache. No key or database is needed. The existing GitHub Pages deployment remains a direct browser app.

The Worker only retrieves npm package metadata and jsDelivr statistics; it cannot proxy arbitrary URLs or run package code. Cached results preserve their provider retrieval timestamps and are labeled **Provider lookup · shared cache**. For this deployment, names are sent to Cloudflare, which contacts the providers on cache misses. Cloudflare diagnostics may retain public package request URLs. The guide explains cache/resource settings, exact dashboard fields, domain setup, tests and troubleshooting.

## Development

Source is in `web/`, pure transformations in `web/model.mjs`, the collector in `scripts/refresh.mjs`. The standard-library Python builder copies static assets and injects reviewed metadata and shared reporting links. `dist/` is generated and ignored.

Run the three check commands above. GitHub Actions additionally runs `tests/browser_smoke.py` in Chromium with deterministic mocked live APIs, exercises a package outside the configured defaults, exports CSV, checks text rendering and verifies a 390px viewport. Browser tests are test-only dependencies. The browser app has no framework or runtime dependency installation. The optional Worker uses pinned Wrangler build tooling; `npm run build` creates its separate ignored `dist-worker/` output.
