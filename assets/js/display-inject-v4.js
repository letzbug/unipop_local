(async function(){
 console.info("UniPop Display Inject Fullscreen v4 loaded");
 const qs=new URLSearchParams(location.search),screenId=qs.get('screen')||UNIPOP_CONFIG.defaultScreen,$=id=>document.getElementById(id);
 const screenEl=document.querySelector('.display-screen');
 let assignment=UniStore.getAssignment(screenId),idx=0,current=null,currentQr='',activeInjections=[],runtime=[],slideTimer=null;
 try{
   const remoteAssignment=await Promise.race([
     UniHybrid.getAssignment(screenId),
     new Promise(resolve=>setTimeout(()=>resolve(null),4500))
   ]);
   if(remoteAssignment?.items?.length) assignment=remoteAssignment;
 }catch(e){console.warn('Remote assignment startup skipped',e)}
 if(!assignment?.items?.length){try{const c=(await UniData.loadCourses())[0];assignment={name:'Auto',items:[{course:c,image:await UniImageStore.get(c.id)||'',displayText:UniData.shorten(c.description,245)}],duration:UNIPOP_CONFIG.slideSeconds,showQR:true,showPrint:true}}catch(e){return}}

 // Optional daily-program alternation, controlled per display from the Builder.
 // Cycle: 60s UniPop Local -> 60s daily program -> repeat.
 const DAILY_PROGRAM_DEFAULT_URL='https://letzbug.github.io/signage/';
 const DAILY_PROGRAM_MS=60*1000;
 let dailyProgramTimer=null,dailyProgramShowing=false;
 function dailyMeta(){
   const items=Array.isArray(assignment?.items)?assignment.items:[];
   return items.find(it=>it&&it.__unipopDisplayMeta)?.__unipopDisplayMeta||{};
 }
 function dailyEnabled(){
   const meta=dailyMeta();
   return assignment?.showDailyProgram===true || meta.showDailyProgram===true;
 }
 function dailyUrl(){
   const meta=dailyMeta();
   return assignment?.dailyProgramUrl || meta.dailyProgramUrl || DAILY_PROGRAM_DEFAULT_URL;
 }
 function ensureDailyProgramStage(){
   let stage=document.getElementById('dailyProgramStage');
   let frame=document.getElementById('dailyProgramFrame');
   if(stage&&frame)return {stage,frame};
   stage=document.createElement('div');
   stage.id='dailyProgramStage';
   Object.assign(stage.style,{position:'fixed',inset:'0',width:'100vw',height:'100vh',zIndex:'2147483647',background:'#000',display:'none',overflow:'hidden',margin:'0',padding:'0'});
   frame=document.createElement('iframe');
   frame.id='dailyProgramFrame';
   frame.title='Tagesprogramm';
   frame.setAttribute('allow','autoplay; fullscreen');
   frame.setAttribute('referrerpolicy','no-referrer-when-downgrade');
   Object.assign(frame.style,{display:'block',width:'100%',height:'100%',border:'0',margin:'0',padding:'0',background:'#000'});
   stage.appendChild(frame);
   document.body.appendChild(stage);
   return {stage,frame};
 }
 function hideDailyProgram(){
   const {stage}=ensureDailyProgramStage();
   stage.style.display='none';
   stage.style.visibility='hidden';
   dailyProgramShowing=false;
 }
 function showDailyProgram(){
   const {stage,frame}=ensureDailyProgramStage();
   const wanted=dailyUrl();
   if(frame.dataset.currentUrl!==wanted){frame.src=wanted;frame.dataset.currentUrl=wanted}
   // externalStageV4 uses the same maximum z-index. Put the daily-program
   // layer last in the DOM every time so it is guaranteed to stay on top.
   document.body.appendChild(stage);
   stage.style.display='block';
   stage.style.visibility='visible';
   dailyProgramShowing=true;
   console.info('UniPop daily program SHOW', {screenId,wanted});
 }
 function stopDailyProgramCycle(){
   if(dailyProgramTimer){clearInterval(dailyProgramTimer);dailyProgramTimer=null}
   hideDailyProgram();
 }
 function startDailyProgramCycle(){
   stopDailyProgramCycle();
   if(!dailyEnabled()){
     console.info('UniPop daily program disabled', {screenId,assignment});
     return;
   }
   // Preload while Local is visible so the switch is instant after one minute.
   const {frame}=ensureDailyProgramStage();
   const wanted=dailyUrl();
   if(frame.dataset.currentUrl!==wanted){frame.src=wanted;frame.dataset.currentUrl=wanted}
   hideDailyProgram();
   console.info('UniPop daily program enabled', {screenId,wanted});
   dailyProgramTimer=setInterval(()=>{
     if(!dailyEnabled()){stopDailyProgramCycle();return}
     if(dailyProgramShowing)hideDailyProgram();else showDailyProgram();
   },DAILY_PROGRAM_MS);
 }

 function qr(url){return 'https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=10&data='+encodeURIComponent(url||UNIPOP_CONFIG.qrFallback)}
 function freshUrl(url,version){
   if(!url||/^(data:|blob:)/i.test(url))return url||'';
   // IMPORTANT: an uploaded course image already carries its own immutable
   // ?v=<timestamp> URL. Never append the playlist's publishedAt timestamp to
   // such a URL: republishing text/layout would otherwise create a brand-new
   // CDN URL for every image and force the kiosks to download the whole rotation
   // again. Only use the fallback version when the media URL has no own version.
   try{
     const u=new URL(url,location.href);
     if(u.searchParams.has('v')||u.searchParams.has('_ucv'))return u.href;
     if(version)u.searchParams.set('_ucv',String(version));
     return u.href;
   }catch(_){
     if(/[?&](?:v|_ucv)=/i.test(String(url))||!version)return String(url);
     const sep=String(url).includes('?')?'&':'?';
     return String(url)+sep+'_ucv='+encodeURIComponent(String(version));
   }
 }

 // Persistent on-device image cache for kiosk displays.
 // The display still polls Supabase for playlist/injection metadata, but an image
 // is downloaded only once for a given version URL. Cache Storage survives page
 // reloads and browser restarts, so the hourly self-healing reload does not pull
 // the whole rotation from Supabase again.
 const DISPLAY_IMAGE_CACHE='unipop-display-images-v1';
 const displayImageObjectUrls=new Map();
 async function cachedDisplayImage(url,version){
   const versioned=freshUrl(url,version);
   if(!versioned||/^(data:|blob:)/i.test(versioned))return versioned||'';
   if(displayImageObjectUrls.has(versioned))return displayImageObjectUrls.get(versioned);
   if(!('caches' in window))return versioned;
   try{
     const cache=await caches.open(DISPLAY_IMAGE_CACHE);
     let response=await cache.match(versioned,{ignoreMethod:true});
     if(!response){
       response=await fetch(versioned,{cache:'no-store'});
       if(!response.ok)throw new Error('image '+response.status);
       await cache.put(versioned,response.clone());

       // Remove older cached versions of this same Storage object, while keeping
       // all other course images. This prevents the kiosk cache from growing forever.
       try{
         const current=new URL(versioned,location.href);
         const keys=await cache.keys();
         await Promise.all(keys.map(req=>{
           try{
             const old=new URL(req.url);
             return old.origin===current.origin && old.pathname===current.pathname && old.href!==current.href
               ? cache.delete(req)
               : Promise.resolve(false);
           }catch(_){return Promise.resolve(false)}
         }));
       }catch(_){}
     }
     const blob=await response.blob();
     const objectUrl=URL.createObjectURL(blob);
     displayImageObjectUrls.set(versioned,objectUrl);
     return objectUrl;
   }catch(e){
     console.warn('Local display image cache fallback',e);
     return versioned;
   }
 }
 function shuffle(list){
   const a=[...(list||[])];
   for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
   return a;
 }
 function buildRuntime(){
   const courses=(assignment?.items||[]).filter(x=>x?.course);
   const now=Date.now();
   const external=shuffle((activeInjections||[]).filter(x=>x?.image_url&&x.enabled!==false&&new Date(x.starts_at).getTime()<=now&&new Date(x.ends_at).getTime()>=now));
   if(!external.length) return courses.map(item=>({type:'course',item}));
   if(!courses.length) return [];

   // Hard rule: two UniPop slides for every one external slide.
   // The longer side determines the cycle length so all UniPop courses and all
   // active external images are represented. External order is reshuffled each cycle.
   const blocks=Math.max(Math.ceil(courses.length/2),external.length);
   const out=[];let ci=0;
   for(let b=0;b<blocks;b++){
     out.push({type:'course',item:courses[ci%courses.length]});ci++;
     out.push({type:'course',item:courses[ci%courses.length]});ci++;
     out.push({type:'external-image',item:external[b%external.length]});
   }
   return out;
 }
 async function loadActiveInjections(){
   try{activeInjections=window.UniInject?await UniInject.getActiveInjections(screenId):[]}
   catch(e){console.warn('Inject refresh skipped; standard UniPop content continues.',e);activeInjections=[]}
 }
 function setHero(image,fit='cover'){
   const hero=$('heroImg');
   hero.style.objectFit=fit==='contain'?'contain':'cover';
   hero.style.background='#0D1C55';
   if(image){
     hero.style.display='none';$('noImage').style.display='block';
     hero.onload=()=>{hero.style.display='block';$('noImage').style.display='none'};
     hero.onerror=()=>{hero.removeAttribute('src');hero.style.display='none';$('noImage').style.display='block'};
     hero.src=image;
   }else{
     hero.removeAttribute('src');hero.style.display='none';$('noImage').style.display='block';
   }
 }
 function setExternalChromeHidden(hidden){
   const selectors=['.hero-overlay','.display-logo','.display-content','.avail','#qrArea','#printBar','#aiGeneratedBadge'];
   selectors.forEach(sel=>{
     const el=document.querySelector(sel);
     if(!el)return;
     if(hidden){
       if(el.dataset.injectPrevDisplay===undefined) el.dataset.injectPrevDisplay=el.style.display||'';
       el.style.setProperty('display','none','important');
     }else{
       const prev=el.dataset.injectPrevDisplay;
       el.style.removeProperty('display');
       if(prev!==undefined&&prev!=='') el.style.display=prev;
       delete el.dataset.injectPrevDisplay;
     }
   });
 }
 function ensureExternalStage(){
   let stage=document.getElementById('externalStageV4');
   let img=document.getElementById('externalStageImgV4');
   if(stage&&img)return {stage,img};
   stage=document.createElement('div');
   stage.id='externalStageV4';
   stage.setAttribute('aria-hidden','true');
   Object.assign(stage.style,{
     position:'fixed',left:'0',top:'0',right:'0',bottom:'0',
     width:'100vw',height:'100vh',zIndex:'2147483647',
     background:'#000',display:'none',overflow:'hidden',margin:'0',padding:'0'
   });
   img=document.createElement('img');
   img.id='externalStageImgV4';
   img.alt='';
   Object.assign(img.style,{
     display:'block',width:'100%',height:'100%',margin:'0',padding:'0',border:'0',
     objectFit:'contain',background:'#000'
   });
   stage.appendChild(img);
   document.body.appendChild(stage);
   return {stage,img};
 }
 function hideExternalStage(){
   const {stage,img}=ensureExternalStage();
   stage.style.display='none';
   stage.setAttribute('aria-hidden','true');
   img.removeAttribute('src');
 }
 function showExternalStage(url,fit){
   const {stage,img}=ensureExternalStage();
   img.style.objectFit=fit==='cover'?'cover':'contain';
   img.src=url||'';
   if(dailyProgramShowing){
     stage.style.display='none';
     stage.setAttribute('aria-hidden','true');
     const daily=document.getElementById('dailyProgramStage');
     if(daily)document.body.appendChild(daily);
     return true;
   }
   stage.style.display='block';
   stage.setAttribute('aria-hidden','false');
   return true;
 }
 async function showCourse(it,slideIndex){
   hideExternalStage();
   const c=it.course;current=it;screenEl?.classList.remove('external-slide');
   setExternalChromeHidden(false);
   const aiBadge=$('aiGeneratedBadge');if(aiBadge)aiBadge.style.display=(it.aiGenerated||c.aiGenerated)?'block':'none';
   currentQr=qr(c.courseUrl||c.url||UNIPOP_CONFIG.qrFallback);
   $('dTitle').textContent=c.title||'Cours UniPop';$('dSubtitle').textContent=c.subtitle||c.subject||'';$('dDesc').textContent=it.displayText||UniData.shorten(c.description,245);$('dDate').textContent=c.date||'';$('dTime').textContent=c.time||'';$('dPlace').textContent=c.place||'';$('dTrainer').textContent=c.trainer||'UniPop';$('dCode').textContent='Code : '+(c.code||'—');
   let image=it.imageUrl||it.image||UniHybrid.getRemoteImageUrl(c.id)||'';
   if(!image)image=await UniImageStore.get(c.id)||'';
   const cachedImage=await cachedDisplayImage(image,it.updated_at||it.updatedAt||assignment.publishedAt||'');
   setHero(cachedImage,'cover');
   $('qrImg').src=currentQr;$('qrArea').style.display=assignment.showQR===false?'none':'block';$('printBar').style.display=assignment.showPrint===false?'none':'flex';
   requestAnimationFrame(()=>window.UniDisplayFit&&window.UniDisplayFit());
   UniHybrid.heartbeat(screenId,{courseCode:c.code,title:c.title,campaign:assignment.name||'',slide:slideIndex});
 }
 async function showExternal(inj,slideIndex){
   current={type:'external-image',...inj};currentQr='';
   // Dedicated fullscreen layer: no UniPop overlay, logo, text, QR or print UI can sit above it.
   const cachedImage=await cachedDisplayImage(inj.image_url,inj.updated_at||inj.created_at||'');
   showExternalStage(cachedImage,inj.fit||'contain');
   UniHybrid.heartbeat(screenId,{courseCode:'INJECT',title:(inj.organization||inj.display_name||'External content'),campaign:'UniPop Local · Inject',slide:slideIndex});
 }
 async function showRuntime(slideIndex){
   if(!runtime.length)return;
   const entry=runtime[slideIndex%runtime.length];
   if(entry.type==='external-image')await showExternal(entry.item,slideIndex);
   else await showCourse(entry.item,slideIndex);
 }
 function secondsFor(entry){return entry?.type==='external-image'?Math.max(5,Number(entry.item?.duration_seconds)||10):Math.max(5,Number(assignment.duration)||UNIPOP_CONFIG.slideSeconds)}
 async function play(){
   clearTimeout(slideTimer);
   if(!runtime.length)return;
   if(idx>=runtime.length){idx=0;runtime=buildRuntime()}
   await showRuntime(idx);
   const wait=secondsFor(runtime[idx]);
   slideTimer=setTimeout(async()=>{idx++;if(idx>=runtime.length){idx=0;runtime=buildRuntime()}await play()},wait*1000);
 }

 await loadActiveInjections();runtime=buildRuntime();await play();startDailyProgramCycle();
 // Diagnostic shortcut: append &dailytest=1 to a display URL to force the
 // Tagesprogramm layer immediately, independent of the Builder setting.
 if(qs.get('dailytest')==='1'){assignment.showDailyProgram=true;showDailyProgram();}
 const heartbeatMs=Math.max(30,Number(window.UNIPOP_SUPABASE?.heartbeatSeconds)||120)*1000;
 setInterval(()=>{
   if(!current)return;
   if(current.type==='external-image')UniHybrid.heartbeat(screenId,{courseCode:'INJECT',title:(current.organization||current.display_name||'External content'),campaign:'UniPop Local · Inject',slide:idx});
   else if(current.course)UniHybrid.heartbeat(screenId,{courseCode:current.course.code,title:current.course.title,campaign:assignment.name||'',slide:idx});
 },heartbeatMs);

 // Auto-sync: public screens update themselves without anybody touching the browser.
 // The interval comes from supabase-config.js to keep Supabase traffic low.
 let refreshBusy=false;
 async function refreshRemoteContent(){
   if(refreshBusy)return;
   refreshBusy=true;
   try{
     const [fresh,injects]=await Promise.all([
       UniHybrid.getAssignment(screenId),
       window.UniInject?UniInject.getActiveInjections(screenId):Promise.resolve([])
     ]);

     const freshHasItems=Boolean(fresh?.items?.length);
     const assignmentChanged=Boolean(
       freshHasItems && (
         fresh.publishedAt!==assignment?.publishedAt ||
         JSON.stringify(fresh)!==JSON.stringify(assignment)
       )
     );
     const injectChanged=JSON.stringify(injects||[])!==JSON.stringify(activeInjections||[]);

     if(assignmentChanged){
       const previousDaily=dailyEnabled();
       const previousDailyUrl=dailyUrl();
       assignment=fresh;
       try{UniStore.setAssignment(screenId,fresh)}catch(_){}
       if(previousDaily!==dailyEnabled() || previousDailyUrl!==dailyUrl()){
         startDailyProgramCycle();
       }
     }
     if(injectChanged)activeInjections=injects||[];

     if(assignmentChanged||injectChanged){
       runtime=buildRuntime();
       idx=0;
       await play();
       console.info('UniPop display auto-synced', {screenId,assignmentChanged,injectChanged});
     }
   }catch(e){
     console.error('Display auto-sync failed; current rotation continues.',e);
   }finally{
     refreshBusy=false;
   }
 }
 const remoteRefresh=Math.max(30,Number(window.UNIPOP_SUPABASE?.refreshSeconds)||60);
 setInterval(refreshRemoteContent,remoteRefresh*1000);

 // Self-healing refresh: once per hour the page reloads itself to pick up any
 // newly deployed HTML/JS/CSS build as well. It happens automatically on-site.
 setTimeout(()=>location.reload(),24*60*60*1000);
 function doPrint(){
 if(assignment.showPrint===false||!current||current.type==='external-image')return;

 const allowed=UniStore.canPrint(screenId), toast=$('toast');
 if(!allowed.ok){
   toast.textContent=allowed.reason;
   toast.classList.add('show');
   setTimeout(()=>toast.classList.remove('show'),1800);
   return;
 }

 // Unsichtbarer Druck-Frame. Mit Chromium --kiosk-printing erfolgt der Ausdruck dialoglos.
 const oldFrame=document.getElementById('unipopPrintFrame');
 if(oldFrame) oldFrame.remove();
 const printFrame=document.createElement('iframe');
 printFrame.id='unipopPrintFrame';
 printFrame.setAttribute('aria-hidden','true');
 printFrame.style.position='fixed';
 printFrame.style.width='1px';
 printFrame.style.height='1px';
 printFrame.style.right='0';
 printFrame.style.bottom='0';
 printFrame.style.border='0';
 printFrame.style.opacity='0';
 printFrame.style.pointerEvents='none';
 document.body.appendChild(printFrame);
 const w=printFrame.contentWindow;

 const c=current.course;
 UniHybrid.addPrint({screenId,courseCode:c.code,title:c.title});

 toast.textContent='Votre flyer est en cours d’impression…';
 toast.classList.add('show');
 setTimeout(()=>toast.classList.remove('show'),1800);

 (async()=>{
   try{
     let image=current.imageUrl||current.image||UniHybrid.getRemoteImageUrl(c.id)||'';
     if(!image)image=await UniImageStore.get(c.id)||'';
     image=await cachedDisplayImage(image,current.updated_at||current.updatedAt||assignment.publishedAt||'');
     const logoUrl=new URL('assets/images/unipop-logo.png',location.href).href;
     const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({
       '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
     }[m]));

     const title=esc(c.title||'');
     const subtitle=esc(c.subtitle||c.subject||'');
     const desc=esc(c.description||current.displayText||'');
     const date=esc(c.date||'');
     const time=esc(c.time||'');
     const place=esc(c.place||'');
     const trainer=esc(c.trainer||'UniPop');
     const code=esc(c.code||'—');
     const printLink=c.courseUrl||c.url||UNIPOP_CONFIG.qrFallback;
     const qrImage=esc(qr(printLink));
     const aiPrintLabel=(current.aiGenerated||c.aiGenerated)
       ? `<div class="print-ai-label">AI-generated</div>` : '';
     const photo=image
       ? `<div class="photo-wrap"><img class="photo" src="${image}" alt="">${aiPrintLabel}</div>`
       : `<div class="photo missing">UniPop</div>`;

     const doc=`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
html,body{margin:0;padding:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#151622}
.page{width:210mm;height:297mm;position:relative;overflow:hidden;background:#fff}
.top{height:52%;padding:12mm 15mm 7mm}
.kicker{font-size:10.5pt;font-weight:800;letter-spacing:.04em;color:#0D1C55;margin-bottom:9mm}
h1{font-size:33pt;line-height:1.02;letter-spacing:-.025em;text-transform:uppercase;color:#0D1C55;margin:0;max-width:150mm}
h2{font-size:17pt;line-height:1.15;font-weight:400;margin:4mm 0 0}
.info{display:grid;grid-template-columns:1fr 49mm;gap:10mm;align-items:end;margin-top:14mm}
.meta{display:grid;gap:5mm;font-size:12pt}
.meta-row{display:grid;grid-template-columns:10mm 1fr;align-items:center}
.ico{color:#0D1C55;font-size:18pt}
.code{font-size:9.5pt;color:#666;margin-top:1mm}
.qr{text-align:center}
.qr img{width:45mm;height:45mm;padding:2mm;border:1.1mm solid #0D1C55;border-radius:4mm;background:#fff}
.scan{margin-top:2mm;font-family:"Segoe Print","Bradley Hand",cursive;font-style:italic;font-size:14pt;transform:rotate(-4deg);color:#0D1C55}
.lower{height:39%;display:grid;grid-template-columns:58% 42%;transform:translateY(-5mm)}
.photo{width:100%;height:100%;object-fit:cover;display:block;background:#e9ebef}
.photo.missing{display:grid;place-items:center;color:#0D1C55;font-size:28pt;font-weight:800}
.descpanel{background:#0D1C55;color:#fff;padding:8mm 8mm 7mm;display:flex;flex-direction:column;min-height:0}
.badge{width:30mm;height:30mm;border-radius:50%;display:grid;place-items:center;text-align:center;background:#B6DEDF;color:#0D1C55;font-size:8.8pt;font-weight:800;line-height:1.15;margin-bottom:5mm}
.descpanel h3{font-size:11pt;letter-spacing:.03em;margin:0 0 4mm;flex:0 0 auto}
.desc{font-size:10.5pt;line-height:1.34;overflow:hidden;flex:1 1 auto;min-height:0}
.footer{position:absolute;left:0;right:0;bottom:5mm;height:9%;background:#07102f;color:#fff;display:grid;grid-template-columns:34mm 1fr 48mm;align-items:center;gap:7mm;padding:3mm 10mm}
.footer-logo{height:100%;display:flex;align-items:center;justify-content:center;border-right:.3mm solid rgba(255,255,255,.75);padding-right:7mm}
.footer-logo img{max-height:16mm;max-width:28mm;width:auto;display:block}
.footer-contact,.footer-address{font-size:7.5pt;line-height:1.45;display:flex;flex-direction:column;gap:.7mm}
.footer-contact strong{font-size:8pt;margin-bottom:.5mm}
.footer-address{border-left:.3mm solid rgba(255,255,255,.75);padding-left:7mm}
.bottom-blue-strip{position:absolute;left:0;right:0;bottom:0;height:5mm;background:#07102f;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
@page{size:A4 portrait;margin:0}
@media print{
html,body,.page{width:210mm;height:297mm}
.page{background:#fff!important}
.descpanel{background:#0D1C55!important;color:#fff!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
.footer{background:#07102f!important;color:#fff!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
}
</style>
</head>
<body>
<div class="page">
  <section class="top">
    <h1>${title}</h1>
    <h2>${subtitle}</h2>
    <div class="info">
      <div class="meta">
        <div class="meta-row"><span class="ico">▦</span><span>${date}</span></div>
        <div class="meta-row"><span class="ico">◷</span><span>${time}</span></div>
        <div class="meta-row"><span class="ico">⌖</span><span>${place}</span></div>
        <div class="meta-row"><span class="ico">♙</span><span>${trainer}</span></div>
        <div class="code">Code du cours : ${code}</div>
      </div>
      <div class="qr"><img src="${qrImage}" alt="QR"><div class="scan">Scannez-moi !</div></div>
    </div>
  </section>
  <section class="lower">
    ${photo}
    <div class="descpanel">
      <h3>DESCRIPTION</h3>
      <div id="printDesc" class="desc">${desc}</div>
    </div>
  </section>
  <footer class="footer">
    <div class="footer-logo"><img src="${logoUrl}" alt="UniPop"></div>
    <div class="footer-contact">
      <strong>Informations sur les cours UniPop:</strong>
      <span>Tél. : (+352) 247 56400</span>
      <span>e-Mail : info@unipop.lu</span>
      <span>☎ de 8:00 à 12h00 et de 13h00 à 17h00</span>
    </div>
    <div class="footer-address">
      <span>Site Belval</span>
      <span>14, Porte de France</span>
      <span>L-4360 Esch-sur-Alzette</span>
    </div>
  </footer>
  <div class="bottom-blue-strip"></div>
</div>
<script>
(function(){
  function fitDescription(){
    const box=document.getElementById('printDesc');
    if(!box)return;

    const original=box.textContent.trim();
    const fallback=${JSON.stringify(current.displayText||'')};

    function fits(){
      return box.scrollHeight<=box.clientHeight+1 && box.scrollWidth<=box.clientWidth+1;
    }

    function applyAndFit(text,startPt,minPt){
      box.textContent=text||'';
      let size=startPt;
      box.style.fontSize=size+'pt';
      box.style.lineHeight='1.34';

      while(!fits() && size>minPt){
        size-=0.2;
        box.style.fontSize=size+'pt';
      }
      return fits();
    }

    // Prefer the complete original text.
    if(!applyAndFit(original,10.5,6.2)){
      // If it would become uncomfortably tiny, use the display advertising text.
      applyAndFit(fallback||original,10.5,6.2);
    }
  }

  const imgs=[...document.images];
  Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(r=>{img.onload=img.onerror=r})))
    .then(()=>{
      fitDescription();
      setTimeout(()=>{window.focus();window.print()},300);
    });
})();
<\/script>
</body>
</html>`;

     w.document.open();
     w.document.write(doc);
     w.document.close();
     setTimeout(()=>{try{printFrame.remove()}catch(_){}},5000);
   }catch(err){
     console.error(err);
     try{
       w.document.open();
       w.document.write('<p style="font-family:Arial;padding:30px">Erreur lors de la préparation du flyer.</p>');
       w.document.close();
     }catch(_){}
   }
 })();
}
 $('printBar').onclick=doPrint;addEventListener('keydown',e=>{if(e.key==='F9'){e.preventDefault();doPrint()}});
})();
