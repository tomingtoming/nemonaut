import {readFile,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {assertGolden,tolerances} from './compare.mjs';import {retiredFields} from './retired.mjs';
const version=process.argv.includes('--v3')?3:process.argv.includes('--v2')?2:1;
// v1/v2 were recorded on the retired JS solver: they can be replayed (checked) but not re-recorded.
if(version<3&&process.argv.includes('--record'))throw Error('Golden v1/v2 are frozen: their recording solver (JS Rapier) is retired');
const file=new URL(`../../tests/golden/js-v${version}.json`,import.meta.url),record=process.argv.includes('--record');
if(record){
 // A recording is determined by the committed sources and the committed engine Wasm. dist/ is their
 // untracked build, so it is rebuilt here, before anything is imported from it.
 const root=new URL('../../',import.meta.url),git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 const revision=git('rev-parse','HEAD');
 if(git('status','--porcelain','--','src','engine','tools/golden'))throw Error('Commit src/, engine/ and tools/golden/ before recording a baseline');
 const rapierRevision=/^rapier3d\s*=.*\brev\s*=\s*"([0-9a-f]{40})"/m.exec(await readFile(new URL('engine/Cargo.toml',root),'utf8'))?.[1];
 if(!rapierRevision)throw Error('engine/Cargo.toml does not pin rapier3d by git rev');
 const engineWasmSHA256=createHash('sha256').update(await readFile(new URL('src/engine/orbital_engine.wasm',root))).digest('hex');
 execFileSync(process.execPath,['tools/build.mjs','--quiet'],{cwd:root,stdio:'inherit'});
 const {scenarios}=await import('./scenarios-v3.mjs'),{replay}=await import('./replay-js.mjs');
 const definitions=scenarios(),cases=definitions.map(definition=>({definition,expected:replay(definition)}));
 const baseline={version,provenance:{revision,node:process.version,platform:process.platform,arch:process.arch,physics:'rust-wasm',rapierRevision,engineWasmSHA256,recordedAt:new Date().toISOString()},tolerances,cases};
 await writeFile(file,JSON.stringify(baseline,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({recorded:cases.length,revision}));
}else{
 const {replay}=await import('./replay-js.mjs');
 const baseline=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
 const retired=retiredFields(version,baseline.cases.map(c=>c.definition.name));
 for(const {definition,expected} of baseline.cases){const skip=retired.get(definition.name)??[],result=assertGolden(expected,replay(definition),{mode:definition.mode,limits:baseline.tolerances,retired:skip});console.log(JSON.stringify({case:definition.name,pass:true,maxToleranceRatio:result.maxRatio,...(skip.length?{retiredFields:skip}:{})}));}
}
