// Reuse the existing controls and event handlers across workshop/flight views.
export function mountFlightLayout(){
 const header=document.querySelector('header'),right=header.querySelector('.headright');
 const name=document.querySelector('#craftName');header.insertBefore(name,right);
 const files=document.createElement('div');files.className='craftFiles';
 for(const id of ['save','load','examples'])files.append(document.getElementById(id));
 header.insertBefore(files,right);

 const inspector=document.querySelector('#inspector'),orbit=document.querySelector('.orbitpanel');
 orbit.classList.add('flightNavigation');
 inspector.querySelector('.panelhead').after(orbit);
 for(const id of ['descentPanel','capturePanel','transferPanel'])inspector.insertBefore(document.getElementById(id),orbit);
 for(const id of ['transferPanel','capturePanel','descentPanel']){
  const panel=document.getElementById(id),help=panel.querySelector(':scope > small');
  if(help){const details=document.createElement('details');details.className='flightHelp';
   const summary=document.createElement('summary');summary.textContent='操作手順と計器の前提';details.append(summary,help);panel.append(details);}
 }
 const warpHelp=document.createElement('details');warpHelp.className='flightHelp';
 warpHelp.innerHTML='<summary>時間倍率の条件</summary>';
 for(const el of [...orbit.children])if(el.tagName==='SMALL'&&!el.id)warpHelp.append(el);
 orbit.append(warpHelp);
 const navigation=document.createElement('div');navigation.id='flightQuickNav';
 const warp=document.querySelector('#warp'),status=document.querySelector('#warpStatus'),inspect=status.nextElementSibling;
 navigation.append(document.querySelector('#openOrbitMap'),warp.closest('label'),document.querySelector('#orbitInfo'),document.querySelector('#maneuverHud'),status);
 if(inspect?.tagName==='BUTTON')navigation.append(inspect);
 document.querySelector('#flightHud').append(navigation);
 const bottom=document.querySelector('.flightbottom'),extra=document.createElement('details');extra.className='flightExtra';
 extra.innerHTML='<summary>駆動系・トリム・キー操作</summary><div class="flightExtraBody"></div>';
 for(const el of [...bottom.children])if(el.tagName==='LABEL'||el.tagName==='SPAN'||el.id==='actuatorControls'||el.id==='aeroFlight')extra.lastElementChild.append(el);
 bottom.append(extra);
 document.querySelector('#thermalPanel').open=false;
}
