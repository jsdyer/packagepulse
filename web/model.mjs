export function packageName(value) {
  if (typeof value !== 'string') throw new TypeError('Enter a public npm package name.');
  const name = value.trim();
  if (!name || name.length > 214 || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name)) throw new Error('Use a package name such as vue or @sveltejs/kit, without a version or URL.');
  return name;
}
export function registryURL(name) { return `https://registry.npmjs.org/${encodeURIComponent(packageName(name))}`; }
export function statsURL(name, period = 'month') { return `https://data.jsdelivr.com/v1/stats/packages/npm/${packageName(name).split('/').map(encodeURIComponent).join('/')}?period=${encodeURIComponent(period)}`; }
export function lookupURL(kind, name, period = 'month', apiBase = null) {
  if (!apiBase) return kind === 'package' ? registryURL(name) : statsURL(name, period);
  if (apiBase !== '/api' && !/^https:\/\/[^/?#]+\/api$/.test(apiBase)) throw new Error('apiBase must be null, /api or an HTTPS origin ending in /api.');
  const params = new URLSearchParams({name:packageName(name)});
  if (kind === 'stats') params.set('period', period);
  return `${apiBase}/${kind}?${params}`;
}
export function npmURL(name) { return `https://www.npmjs.com/package/${packageName(name).split('/').map(encodeURIComponent).join('/')}`; }
const text = value => typeof value === 'string' ? value : '';
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
function pairs(value) { return value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([key, val]) => key && typeof val === 'string')) : {}; }
export function safeURL(value) { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; } }
export function normalizePackage(raw, expectedName, capturedAt = new Date().toISOString()) {
  const name = packageName(expectedName);
  if (!raw || raw.name !== name || !raw.versions || typeof raw.versions !== 'object' || Array.isArray(raw.versions)) throw new Error(`The registry did not return valid metadata for ${name}.`);
  const versions = Object.entries(raw.versions).map(([version, item]) => ({
    version, publishedAt: date(raw.time?.[version]), deprecated: text(item.deprecated), license: text(item.license) || text(item.license?.type),
    dependencies: pairs(item.dependencies), peerDependencies: pairs(item.peerDependencies), optionalDependencies: pairs(item.optionalDependencies),
    engines: pairs(item.engines), unpackedSize: Number.isFinite(item.dist?.unpackedSize) && item.dist.unpackedSize >= 0 ? item.dist.unpackedSize : null,
  })).sort((a,b) => (b.publishedAt || '').localeCompare(a.publishedAt || '') || a.version.localeCompare(b.version));
  if (!versions.length) throw new Error(`${name} has no published versions in this response.`);
  return {name, description:text(raw.description), capturedAt:date(capturedAt), createdAt:date(raw.time?.created), modifiedAt:date(raw.time?.modified),
    tags:pairs(raw['dist-tags']), maintainers:Array.isArray(raw.maintainers) ? [...new Set(raw.maintainers.map(person => text(person.name)).filter(Boolean))] : [],
    homepage:safeURL(raw.homepage), repository:safeURL(text(raw.repository?.url).replace(/^git\+/, '').replace(/\.git$/, '')),
    versions, source:registryURL(name)};
}
export function normalizeStats(raw, name, period = 'month', capturedAt = new Date().toISOString()) {
  const dates = raw?.hits?.dates;
  if (!dates || typeof dates !== 'object' || Array.isArray(dates) || !Number.isFinite(raw.hits.total) || raw.hits.total < 0) throw new Error('CDN usage data is unavailable for this package.');
  const points = Object.entries(dates).filter(([day,n]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(n) && n >= 0).sort(([a],[b]) => a.localeCompare(b));
  return {period, capturedAt:date(capturedAt), hits:raw.hits.total, from:points[0]?.[0] || null, through:points.at(-1)?.[0] || null, points, source:statsURL(name,period)};
}
export function latestRelease(pkg) { return pkg.versions.find(v => v.version === pkg.tags.latest) || null; }
export function ageDays(publishedAt, now = Date.now()) { const time = Date.parse(publishedAt); return Number.isFinite(time) ? Math.max(0, Math.floor((now-time)/86400000)) : null; }
export function releaseBuckets(pkg, months=18, now=Date.now()) {
  const last = new Date(now); if (!Number.isFinite(last.getTime()) || !Number.isInteger(months) || months<1) return [];
  const buckets = Array.from({length:months},(_,i)=>({month:new Date(Date.UTC(last.getUTCFullYear(),last.getUTCMonth()-months+1+i,1)).toISOString().slice(0,7),stable:0,prerelease:0}));
  const map = new Map(buckets.map(b=>[b.month,b]));
  for (const release of pkg.versions) { const bucket = map.get(release.publishedAt?.slice(0,7)); if(bucket) bucket[release.version.includes('-')?'prerelease':'stable']++; }
  return buckets;
}
export function filteredReleases(pkg, query='', channel='all') {
  return pkg.versions.filter(v=>v.version.toLowerCase().includes(query.toLowerCase()) && (channel==='all' || (channel==='stable' ? !v.version.includes('-') : v.version.includes('-'))));
}
export function dependencyDifference(a, b) {
  const first = a?.dependencies || {}, second = b?.dependencies || {};
  return [...new Set([...Object.keys(first),...Object.keys(second)])].sort().map(name=>({name,a:first[name] || null,b:second[name] || null}));
}
export function csvCell(value) { const s=String(value??''); return '"'+(/^[=+\-@\t\r]/.test(s)?"'":'')+s.replaceAll('"','""')+'"'; }
export function releasesCSV(packages) {
  const rows=[['package','version','published_at','deprecated','license','dependencies','source','retrieved_at']];
  for(const pkg of packages) for(const version of pkg.versions) rows.push([pkg.name,version.version,version.publishedAt,version.deprecated,version.license,Object.entries(version.dependencies).map(([n,v])=>`${n}: ${v}`).join('; '),pkg.source,pkg.capturedAt]);
  return rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
export function validateConfig(config) {
  if (!config || !Array.isArray(config.defaultPackages) || config.defaultPackages.length<1 || config.defaultPackages.length>2 || !Array.isArray(config.examplePackages)) throw new Error('Configure one or two default packages and an examplePackages array.');
  [...config.defaultPackages,...config.examplePackages].forEach(packageName);
  for(const key of ['requestTimeoutMs','maxResponseBytes','releasePageSize','timelineMonths']) if(!Number.isInteger(config[key]) || config[key]<1) throw new Error(`Invalid ${key} in config.json.`);
  if(typeof config.statsPeriod!=='string' || !config.statsPeriod.trim()) throw new Error('Choose a jsDelivr statsPeriod.');
  if (config.apiBase != null) lookupURL('package','vue',config.statsPeriod,config.apiBase);
  return config;
}
