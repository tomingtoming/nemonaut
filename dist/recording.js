const $=s=>document.querySelector(s);
const record=document.createElement('button');record.textContent='● 録画開始';record.style.cssText='position:absolute;right:18px;top:70px;z-index:30';$('#viewport').append(record);
let recorder,frames=[],videoUrl,started=0;
const output=document.createElement('canvas');output.width=1280;output.height=720;const ctx=output.getContext('2d');
function paint(){requestAnimationFrame(paint);if(!recorder||recorder.state!=='recording')return;
ctx.fillStyle='#16242e';ctx.fillRect(0,0,1280,720);const source=$('#scene');ctx.drawImage(source,0,0,1280,720);
ctx.fillStyle='rgba(14,24,33,.85)';ctx.fillRect(0,0,1280,82);ctx.fillRect(0,650,1280,70);ctx.fillStyle='#eef7fa';ctx.font='bold 26px sans-serif';ctx.fillText($('#craftName').value,26,35);ctx.font='18px sans-serif';ctx.fillStyle='#efaf70';ctx.fillText('ORBITAL FOUNDRY / LIVE FLIGHT TEST',26,64);
ctx.fillStyle='#fff';ctx.font='22px sans-serif';const flying=!$('#flightHud').hidden;
ctx.fillText(flying?`高度 ${$('#alt').textContent} m    速度 ${$('#speed').textContent} m/s    上昇率 ${$('#vspeed').textContent} m/s`:'組立確認 / 12部品の試作機',26,680);
ctx.font='17px sans-serif';ctx.fillText(flying?$('#flightStatus').textContent:'滑走路で離陸を試験します',26,707);ctx.textAlign='right';ctx.fillText(`${((performance.now()-started)/1000).toFixed(1)} s`,1250,40);ctx.textAlign='left';}
requestAnimationFrame(paint);
record.onclick=()=>{if(recorder?.state==='recording'){recorder.stop();record.disabled=true;return;}
const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));if(!mime){record.textContent='録画非対応';return;}
frames=[];started=performance.now();const stream=output.captureStream(30);recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5000000});
recorder.ondataavailable=e=>{if(e.data.size)frames.push(e.data);};recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());if(videoUrl)URL.revokeObjectURL(videoUrl);videoUrl=URL.createObjectURL(new Blob(frames,{type:mime}));let link=$('#recordingDownload');if(!link){link=document.createElement('a');link.id='recordingDownload';link.style.cssText='position:absolute;right:18px;top:110px;z-index:30;background:#172832;padding:12px;color:white';$('#viewport').append(link);}link.href=videoUrl;link.download='swift-mk2-flight.webm';link.textContent='録画をダウンロード';record.textContent='● 録画開始';record.disabled=false;};recorder.start(1000);record.textContent='■ 録画停止';};
