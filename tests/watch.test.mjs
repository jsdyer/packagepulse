import test from 'node:test';
import assert from 'node:assert/strict';
import {compareVersions,versionStatus,parseWatchlist} from '../web/watch.mjs';
test('SemVer precedence follows canonical prerelease sequence, numeric identifiers and build metadata',()=>{
const order=['1.0.0-alpha','1.0.0-alpha.1','1.0.0-alpha.beta','1.0.0-beta','1.0.0-beta.2','1.0.0-beta.11','1.0.0-rc.1','1.0.0'];
for(let i=1;i<order.length;i++){assert.equal(compareVersions(order[i-1],order[i]),-1);assert.equal(compareVersions(order[i],order[i-1]),1);}
assert.equal(compareVersions('v2.10.0+abc','2.9.99+def'),1);assert.equal(compareVersions('1.0.0+one','1.0.0+two'),0);
assert.equal(compareVersions('999999999999999999999.0.0','999999999999999999998.0.0'),1);
});
test('ranges, invalid prerelease numbers and unknown tags do not claim an update',()=>{
for(const v of ['^1.0.0','latest','1.0','1.0.0-01','01.0.0','1.0.0+',''])assert.equal(compareVersions(v,'2.0.0'),null);
assert.equal(versionStatus('3.0.0','2.0.0'),'Installed version is ahead of latest tag');
assert.equal(versionStatus('1.0.0-rc.1','1.0.0'),'Newer latest tag available');
});
test('watchlist validates arbitrary scoped packages, duplicates, bounds, and ignores persisted observations',()=>{
assert.deepEqual(parseWatchlist([{name:'@new/not-configured',installed:' 1.0.0 ',latest:'evil'}]),[{name:'@new/not-configured',installed:'1.0.0'}]);
assert.throws(()=>parseWatchlist([{name:'example',installed:'1'},{name:'example',installed:'2'}]));
assert.throws(()=>parseWatchlist([{name:'https://example.com/',installed:'1'}]));assert.throws(()=>parseWatchlist(Array(51).fill({name:'x',installed:'1'})));
});
