(async function(){
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

 function qr(url){return 'https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=10&data='+encodeURIComponent(url||UNIPOP_CONFIG.qrFallback)}
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
 function hideExternalStage(){
   const stage=$('externalStage'),img=$('externalStageImg');
   if(stage){stage.classList.remove('active','cover','contain');stage.setAttribute('aria-hidden','true')}
   if(img){img.removeAttribute('src')}
 }
 function showExternalStage(url,fit){
   const stage=$('externalStage'),img=$('externalStageImg');
   if(!stage||!img)return false;
   stage.classList.remove('cover','contain');
   stage.classList.add(fit==='cover'?'cover':'contain');
   stage.classList.add('active');
   stage.setAttribute('aria-hidden','false');
   img.src=url||'';
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
   setHero(image,'cover');
   $('qrImg').src=currentQr;$('qrArea').style.display=assignment.showQR===false?'none':'block';$('printBar').style.display=assignment.showPrint===false?'none':'flex';
   requestAnimationFrame(()=>window.UniDisplayFit&&window.UniDisplayFit());
   UniHybrid.heartbeat(screenId,{courseCode:c.code,title:c.title,campaign:assignment.name||'',slide:slideIndex});
 }
 async function showExternal(inj,slideIndex){
   current={type:'external-image',...inj};currentQr='';
   // Dedicated fullscreen layer: no UniPop overlay, logo, text, QR or print UI can sit above it.
   showExternalStage(inj.image_url,inj.fit||'contain');
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

 await loadActiveInjections();runtime=buildRuntime();await play();
 setInterval(()=>{
   if(!current)return;
   if(current.type==='external-image')UniHybrid.heartbeat(screenId,{courseCode:'INJECT',title:(current.organization||current.display_name||'External content'),campaign:'UniPop Local · Inject',slide:idx});
   else if(current.course)UniHybrid.heartbeat(screenId,{courseCode:current.course.code,title:current.course.title,campaign:assignment.name||'',slide:idx});
 },30000);

 const remoteRefresh=Math.max(10,Number(window.UNIPOP_SUPABASE?.refreshSeconds)||20);
 setInterval(async()=>{
   try{
     const [fresh,injects]=await Promise.all([
       UniHybrid.getAssignment(screenId),
       window.UniInject?UniInject.getActiveInjections(screenId):Promise.resolve([])
     ]);
     const assignmentChanged=Boolean(fresh?.items?.length&&JSON.stringify(fresh)!==JSON.stringify(assignment));
     const injectChanged=JSON.stringify(injects||[])!==JSON.stringify(activeInjections||[]);
     if(assignmentChanged)assignment=fresh;
     if(injectChanged)activeInjections=injects||[];
     if(assignmentChanged||injectChanged){runtime=buildRuntime();idx=0;await play()}
   }catch(e){console.error('Display refresh failed; current rotation continues.',e)}
 },remoteRefresh*1000);
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
     const image=current.imageUrl||await UniImageStore.get(c.id)||'';
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
