import {readFile,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {scenarios} from './scenarios.mjs';import {replay} from './replay-js.mjs';import {assertGolden,tolerances} from './compare.mjs';
const file=new URL('../../tests/golden/js-v1.json',import.meta.url),record=process.argv.includes('--record');
if(record){
 const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 if(execFileSync('git',['status','--porcelain','--','dist'],{encoding:'utf8'}).trim())throw Error('Commit the runtime before recording a baseline');
 const paths=execFileSync('git',['ls-files','dist'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(p=>p.endsWith('.js'));
 const hash=createHash('sha256');for(const path of paths){hash.update(path+'\0');hash.update(await readFile(path));}
 const definitions=scenarios(),cases=definitions.map(definition=>({definition,expected:replay(definition)}));
 const baseline={version:1,provenance:{revision,node:process.version,platform:process.platform,arch:process.arch,rapier:'0.21.0',runtimeJavaScriptSHA256:hash.digest('hex'),recordedAt:new Date().toISOString()},tolerances,cases};
 await writeFile(file,JSON.stringify(baseline,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({recorded:cases.length,revision}));
}else{
 const baseline=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
 for(const {definition,expected} of baseline.cases){const result=assertGolden(expected,replay(definition),{mode:definition.mode,limits:baseline.tolerances});console.log(JSON.stringify({case:definition.name,pass:true,maxToleranceRatio:result.maxRatio}));}
}
