#!/usr/bin/env node
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateConfig,registryURL,statsURL,normalizePackage,normalizeStats} from '../web/model.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config=validateConfig(JSON.parse(await fs.readFile(path.join(root,'web/config.json'),'utf8')));
async function request(url){const response=await fetch(url,{headers:{'User-Agent':'CoolCode PackagePulse https://coolcode.ca/packagepulse/'},signal:AbortSignal.timeout(config.requestTimeoutMs)});if(!response.ok)throw new Error(`HTTP ${response.status}: ${url}`);const text=await response.text();if(Buffer.byteLength(text)>config.maxResponseBytes)throw new Error('Response exceeds configured limit');return JSON.parse(text);}
const packages=[];
for(const name of [...new Set(config.defaultPackages)]){const capturedAt=new Date().toISOString();const pkg=normalizePackage(await request(registryURL(name)),name,capturedAt);let stats=null,statsError='';try{stats=normalizeStats(await request(statsURL(name,config.statsPeriod)),name,config.statsPeriod);}catch(error){statsError=error.message;console.warn(`Optional CDN stats unavailable for ${name}`);}packages.push({pkg,stats,statsError});console.log(`${name}: ${pkg.versions.length} versions`);}
const target=path.join(root,'web/data/defaults.json');await fs.mkdir(path.dirname(target),{recursive:true});const temporary=target+'.tmp';await fs.writeFile(temporary,JSON.stringify({schemaVersion:1,capturedAt:new Date().toISOString(),packages})+'\n');await fs.rename(temporary,target);console.log('Saved validated retained default captures.');
