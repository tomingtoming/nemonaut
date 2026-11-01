import {readFile,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {scenarios as v1} from './scenarios.mjs';import {scenarios as v2} from './scenarios-v2.mjs';import {scenarios as v3} from './scenarios-v3.mjs';import {replay} from './replay-js.mjs';import {assertGolden,tolerances} from './compare.mjs';
const version=process.argv.includes('--v3')?3:process.argv.includes('--v2')?2:1,scenarios=[v1,v2,v3][version-1];
// v1/v2 were recorded on the retired JS solver: they can be replayed (checked) but not re-recorded.
if(version<3&&process.argv.includes('--record'))throw Error('Golden v1/v2 are frozen: their recording solver (JS Rapier) is retired');
const file=new URL(`../../tests/golden/js-v${version}.json`,import.meta.url),record=process.argv.includes('--record');
if(record){
 const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 if(execFileSync('git',['status','--porcelain','--','dist'],{encoding:'utf8'}).trim())throw Error('Commit the runtime before recording a baseline');
 const paths=execFileSync('git',['ls-files','dist'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(p=>p.endsWith('.js'));
 const hash=createHash('sha256');for(const path of paths){hash.update(path+'\0');hash.update(await readFile(path));}
 const definitions=scenarios(),cases=definitions.map(definition=>({definition,expected:replay(definition)}));
 const baseline={version,provenance:{revision,node:process.version,platform:process.platform,arch:process.arch,rapier:'0.21.0',physics:'rust-wasm',runtimeJavaScriptSHA256:hash.digest('hex'),recordedAt:new Date().toISOString()},tolerances,cases};
 await writeFile(file,JSON.stringify(baseline,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({recorded:cases.length,revision}));
}else{
 const baseline=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
 for(const {definition,expected} of baseline.cases){const result=assertGolden(expected,replay(definition),{mode:definition.mode,limits:baseline.tolerances});console.log(JSON.stringify({case:definition.name,pass:true,maxToleranceRatio:result.maxRatio}));}
}
