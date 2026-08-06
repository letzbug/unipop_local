(async function(){
 const qs=new URLSearchParams(location.search),screenId=qs.get('screen')||UNIPOP_CONFIG.defaultScreen,$=id=>document.getElementById(id);
 let assignment=UniStore.getAssignment(screenId),idx=0,current=null,currentQr='';
 if(!assignment?.items?.length){try{const c=(await UniData.loadCourses())[0];assignment={name:'Auto',items:[{course:c,image:await UniImageStore.get(c.id)||'',displayText:UniData.shorten(c.description,245)}],duration:UNIPOP_CONFIG.slideSeconds,showQR:true,showPrint:true}}catch(e){return}}
 function qr(url){return 'https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=10&data='+encodeURIComponent(url||UNIPOP_CONFIG.qrFallback)}
 async function show(i){
   const it=assignment.items[i%assignment.items.length],c=it.course;current=it;currentQr=qr(c.url);
   $('dTitle').textContent=c.title||'Cours UniPop';$('dSubtitle').textContent=c.subtitle||c.subject||'';$('dDesc').textContent=it.displayText||UniData.shorten(c.description,245);$('dDate').textContent=c.date||'';$('dTime').textContent=c.time||'';$('dPlace').textContent=c.place||'';$('dTrainer').textContent=c.trainer||'UniPop';$('dCode').textContent='Code : '+(c.code||'—');
   const image=it.image||await UniImageStore.get(c.id)||''; if(image){$('heroImg').src=image;$('heroImg').style.display='block';$('noImage').style.display='none'}else{$('heroImg').style.display='none';$('noImage').style.display='block'}
   $('qrImg').src=currentQr;$('qrArea').style.display=assignment.showQR===false?'none':'block';$('printBar').style.display=assignment.showPrint===false?'none':'flex';
   requestAnimationFrame(()=>window.UniDisplayFit&&window.UniDisplayFit());
   UniStore.heartbeat(screenId,{courseCode:c.code,title:c.title,campaign:assignment.name||'',slide:i%assignment.items.length});
 }
 await show(idx); const seconds=Math.max(5,Number(assignment.duration)||UNIPOP_CONFIG.slideSeconds); if(assignment.items.length>1)setInterval(async()=>{idx=(idx+1)%assignment.items.length;await show(idx)},seconds*1000);setInterval(()=>{if(current)UniStore.heartbeat(screenId,{courseCode:current.course.code,title:current.course.title,campaign:assignment.name||'',slide:idx})},30000);
 function doPrint(){
 if(assignment.showPrint===false||!current)return;

 const allowed=UniStore.canPrint(screenId), toast=$('toast');
 if(!allowed.ok){
   toast.textContent=allowed.reason;
   toast.classList.add('show');
   setTimeout(()=>toast.classList.remove('show'),1800);
   return;
 }

 // Fenster MUSS direkt aus dem Benutzer-Klick geöffnet werden.
 const w=window.open('about:blank','unipop_flyer','width=900,height=1000');
 if(!w){
   toast.textContent='Veuillez autoriser les fenêtres pop-up pour imprimer.';
   toast.classList.add('show');
   setTimeout(()=>toast.classList.remove('show'),2600);
   return;
 }

 const c=current.course;
 UniStore.addPrint({screenId,courseCode:c.code,title:c.title});

 toast.textContent='Votre flyer est en cours d’impression…';
 toast.classList.add('show');
 setTimeout(()=>toast.classList.remove('show'),1800);

 (async()=>{
   try{
     const image=await UniImageStore.get(c.id)||'';
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
     const qr=esc(currentQr||'');
     const photo=image ? `<img class="photo" src="${image}" alt="">` : `<div class="photo missing">UniPop</div>`;

     const doc=`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
*{box-sizing:border-box}
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
.lower{height:39%;display:grid;grid-template-columns:58% 42%}
.photo{width:100%;height:100%;object-fit:cover;display:block;background:#e9ebef}
.photo.missing{display:grid;place-items:center;color:#0D1C55;font-size:28pt;font-weight:800}
.descpanel{background:#0D1C55;color:#fff;padding:8mm 8mm 7mm;display:flex;flex-direction:column;min-height:0}
.badge{width:30mm;height:30mm;border-radius:50%;display:grid;place-items:center;text-align:center;background:#B6DEDF;color:#0D1C55;font-size:8.8pt;font-weight:800;line-height:1.15;margin-bottom:5mm}
.descpanel h3{font-size:11pt;letter-spacing:.03em;margin:0 0 4mm;flex:0 0 auto}
.desc{font-size:10.5pt;line-height:1.34;overflow:hidden;flex:1 1 auto;min-height:0}
.footer{position:absolute;left:0;right:0;bottom:0;height:9%;background:#07102f;display:flex;align-items:center;padding:5mm 15mm}
.footer img{height:16mm;width:auto;display:block}
@page{size:A4 portrait;margin:0}
@media print{html,body,.page{width:210mm;height:297mm}}
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
      <div class="qr"><img src="${qr}" alt="QR"><div class="scan">Scannez-moi !</div></div>
    </div>
  </section>
  <section class="lower">
    ${photo}
    <div class="descpanel">
      <h3>DESCRIPTION</h3>
      <div id="printDesc" class="desc">${desc}</div>
    </div>
  </section>
  <footer class="footer"><img src="${logoUrl}" alt="UniPop"></footer>
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
