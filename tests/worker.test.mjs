import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../worker/index.mjs';
import {lookupURL} from '../web/model.mjs';

const context = {waitUntil:promise=>promise};
const env = {ALLOWED_ORIGIN:'https://coolcode.ca',ASSETS:{fetch:async()=>new Response('static asset')}};
const request = (path, options={}) => new Request('https://packages.example'+path,options);
const sample = () => Response.json({name:'@test/another',versions:{'1.0.0':{}},'dist-tags':{latest:'1.0.0'}});

test('lookup transport keeps GitHub Pages direct and supports optional scoped-package Worker calls',()=>{
  assert.equal(lookupURL('package','vue'), 'https://registry.npmjs.org/vue');
  assert.equal(lookupURL('package','@test/another','month','/api'), '/api/package?name=%40test%2Fanother');
  assert.equal(lookupURL('stats','vue','week','https://packages.hackme.ca/api'), 'https://packages.hackme.ca/api/stats?name=vue&period=week');
  assert.throws(()=>lookupURL('package','vue','month','http://bad.example/api'));
});

test('serves assets, health and two fixed upstreams without forwarding visitor credentials',async()=>{
  const calls=[];
  const worker=createWorker({cache:()=>null,fetcher:async(url,opts)=>{calls.push([url,opts]);return sample();}});
  assert.equal(await (await worker.fetch(request('/'),env,context)).text(),'static asset');
  assert.equal((await (await worker.fetch(request('/api/health'),env,context)).json()).status,'ok');
  for(const path of ['/api/package?name=%40test%2Fanother','/api/stats?name=%40test%2Fanother&period=week']) {
    const response=await worker.fetch(request(path,{headers:{Authorization:'Bearer private',Cookie:'private=yes'}}),env,context);
    assert.equal(response.status,200);await response.json();
  }
  assert.equal(calls[0][0],'https://registry.npmjs.org/%40test%2Fanother');
  assert.equal(calls[1][0],'https://data.jsdelivr.com/v1/stats/packages/npm/%40test/another?period=week');
  for(const [,opts]of calls){assert.equal(opts.redirect,'manual');assert.equal(opts.headers.Authorization,undefined);assert.equal(opts.headers.Cookie,undefined);}
});

test('rejects arbitrary hosts, malformed names, duplicates, unexpected fields and unsupported methods before fetch',async()=>{
  let calls=0;
  const worker=createWorker({cache:()=>null,fetcher:async()=>{calls++;return sample();}});
  for(const path of ['/api/package?name=https://private.example','/api/package?name=vue&name=preact','/api/package?name=vue&url=https://private.example','/api/stats?name=vue&period=../private']) {
    assert.equal((await worker.fetch(request(path),env,context)).status,400);
  }
  assert.equal((await worker.fetch(request('/api/unknown'),env,context)).status,404);
  assert.equal((await worker.fetch(request('/api/package?name=vue',{method:'POST'}),env,context)).status,405);
  assert.equal((await worker.fetch(request('/api/package?name=vue',{headers:{Origin:'https://bad.example'}}),env,context)).status,403);
  assert.equal(calls,0);
});

test('does not follow redirects, cache provider failures or leak upstream bodies',async()=>{
  let calls=0,puts=0;
  for(const status of [302,404,429,500]) {
    const worker=createWorker({cache:()=>({match:async()=>null,put:async()=>puts++}),fetcher:async()=>{calls++;return new Response('private failure detail',{status,headers:{Location:'https://private.example'}});}});
    const response=await worker.fetch(request('/api/package?name=vue'),env,context),text=await response.text();
    assert.equal(response.status,status===404?404:status===429?429:502);assert.ok(!text.includes('private'));assert.equal(response.headers.get('Location'),null);
  }
  assert.equal(calls,4);assert.equal(puts,0);
});

test('shared cache retains original retrieval time and applies CORS for each caller',async()=>{
  let calls=0,saved;const pending=[];
  const worker=createWorker({now:()=>new Date('2026-11-23T15:00:00Z'),cache:()=>({match:async()=>saved?.clone(),put:async(key,value)=>{saved=new Response(await value.text(),{headers:value.headers});}}),fetcher:async()=>{calls++;return sample();}});
  const first=await worker.fetch(request('/api/package?name=vue',{headers:{Origin:'https://coolcode.ca'}}),env,{waitUntil:p=>pending.push(p)});
  assert.equal(first.headers.get('X-PackagePulse-Cache'),'MISS');await first.json();await Promise.all(pending);
  const second=await worker.fetch(request('/api/package?name=vue',{headers:{Origin:'https://packages.example'}}),env,context);
  assert.equal(second.headers.get('X-PackagePulse-Cache'),'HIT');assert.equal(second.headers.get('X-PackagePulse-Captured-At'),'2026-11-23T15:00:00.000Z');
  assert.equal(second.headers.get('Access-Control-Allow-Origin'),'https://packages.example');assert.equal(saved.headers.get('Access-Control-Allow-Origin'),null);assert.equal(calls,1);await second.json();
});

test('cache failures do not invalidate successful metadata',async()=>{
  for(const store of [()=>{throw Error('cache');},()=>({match:async()=>{throw Error('cache');},put:()=>{throw Error('cache');}})]){
    const worker=createWorker({cache:store,fetcher:async()=>sample()});
    const response=await worker.fetch(request('/api/package?name=vue'),env,context);assert.equal(response.status,200);assert.equal((await response.json()).name,'@test/another');
  }
});

test('rejects non-JSON and bounds content length as well as streamed data',async()=>{
  const options={...env,MAX_RESPONSE_BYTES:'10'};
  for(const response of [new Response('not json'),new Response('123',{headers:{'Content-Type':'application/json','Content-Length':'99'}})]){
    const result=await createWorker({cache:()=>null,fetcher:async()=>response}).fetch(request('/api/package?name=vue'),options,context);assert.equal(result.status,502);await result.text();
  }
  const result=await createWorker({cache:()=>null,fetcher:async()=>new Response('012345678901',{headers:{'Content-Type':'application/json'}})}).fetch(request('/api/package?name=vue'),options,context);
  await assert.rejects(()=>result.text());
});
