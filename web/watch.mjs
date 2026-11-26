import {packageName} from './model.mjs';
// SemVer precedence, with a conventional leading v accepted for pasted tags.
export function semver(value){
 if(typeof value!=='string'||value.length>160)return null;
 const m=value.trim().replace(/^v/,'').match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/);
 if(!m)return null;const pre=m[4]?.split('.')||[];if(pre.some(x=>/^\d+$/.test(x)&&x.length>1&&x[0]==='0'))return null;
 return {core:m.slice(1,4).map(BigInt),pre};
}
export function compareVersions(a,b){
 const x=semver(a),y=semver(b);if(!x||!y)return null;
 for(let i=0;i<3;i++)if(x.core[i]!==y.core[i])return x.core[i]>y.core[i]?1:-1;
 if(!x.pre.length||!y.pre.length)return x.pre.length===y.pre.length?0:x.pre.length?-1:1;
 for(let i=0;i<Math.max(x.pre.length,y.pre.length);i++){
  if(x.pre[i]===undefined)return -1;if(y.pre[i]===undefined)return 1;
  const a=x.pre[i],b=y.pre[i];if(a===b)continue;const an=/^\d+$/.test(a),bn=/^\d+$/.test(b);
  if(an&&bn)return BigInt(a)>BigInt(b)?1:-1;if(an!==bn)return an?-1:1;return a>b?1:-1;
 }return 0;
}
export function versionStatus(installed,latest){if(!latest)return 'Not checked';const n=compareVersions(installed,latest);return n===null?'Version format needs review':n===0?'Matches latest tag':n<0?'Newer latest tag available':'Installed version is ahead of latest tag';}
export function parseWatchlist(raw){if(!Array.isArray(raw)||raw.length>50)throw Error('Keep a maximum of 50 packages.');const seen=new Set();return raw.map(row=>{const name=packageName(row.name);if(seen.has(name)||typeof row.installed!=='string'||!row.installed.trim()||row.installed.length>160)throw Error('Each package needs one installed version, up to 160 characters.');seen.add(name);return {name,installed:row.installed.trim()};});}
export function mountWatchlist(lookup){
 const $=id=>document.getElementById(id),el=(t,v)=>{const e=document.createElement(t);if(v!==undefined)e.textContent=v;return e;},key='coolcode:packagepulse:watchlist';let rows=[],observations=new Map();
 const note=t=>$('watch-note').textContent=t;
 function render(){const body=$('watch-rows');body.replaceChildren();$('watch-empty').hidden=rows.length>0;for(const row of rows){const tr=el('tr'),p=observations.get(row.name),status=versionStatus(row.installed,p?.tags.latest);for(const t of [row.name,row.installed,p?.tags.latest||'—',status,p?.capturedAt||'Not checked in this tab'])tr.append(el('td',t));const actions=el('td'),check=el('button','Check'),remove=el('button','Remove');check.type=remove.type='button';check.onclick=()=>lookup(row.name);remove.onclick=()=>{rows=rows.filter(x=>x.name!==row.name);render();note('Removed temporarily. Save to retain this change.');};actions.append(check,remove);tr.append(actions);body.append(tr);}}
 $('watch-form').onsubmit=e=>{e.preventDefault();try{const item=parseWatchlist([{name:$('watch-name').value,installed:$('watch-installed').value}])[0];rows=parseWatchlist([...rows.filter(r=>r.name!==item.name),item]);render();note('Added or updated locally. Choose Save to retain the watchlist.');}catch(e){note(e.message);}};
 $('watch-save').onclick=()=>{try{localStorage.setItem(key,JSON.stringify(rows));note('Watchlist saved on this browser. Later edits require Save again.');}catch{note('Browser storage unavailable. Export your watchlist instead.');}};
 $('watch-forget').onclick=()=>{try{localStorage.removeItem(key);note('Saved copy removed. The current watchlist remains in this tab.');}catch{note('Browser storage unavailable.');}};
 $('watch-export').onclick=()=>{const a=el('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(rows,null,2)],{type:'application/json'}));a.download='package-pulse-watchlist.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
 $('watch-import').onchange=async()=>{const f=$('watch-import').files[0];if(!f)return;try{if(f.size>20000)throw Error('Keep watchlist imports below 20 KB.');rows=parseWatchlist(JSON.parse(await f.text()));render();note('Imported locally. Save if you want to retain this list.');}catch(e){note(e.message);}};
 try{const saved=localStorage.getItem(key);if(saved){rows=parseWatchlist(JSON.parse(saved));note('Saved watchlist restored. No background lookups run.');}}catch{note('Saved watchlist could not be read. Import a backup or start again.');}render();
 return {observe(packages){for(const p of packages)observations.set(p.name,p);render();}};
}
