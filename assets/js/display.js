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
 const a=UniStore.canPrint(screenId),t=$('toast');
 if(!a.ok){
   t.textContent=a.reason;
   t.classList.add('show');
   setTimeout(()=>t.classList.remove('show'),1800);
   return;
 }

 const printWindow=window.open('flyer.html?wait=1','unipop_flyer','width=900,height=1000');
 if(!printWindow){
   t.textContent='Veuillez autoriser les fenêtres pop-up pour imprimer.';
   t.classList.add('show');
   setTimeout(()=>t.classList.remove('show'),2600);
   return;
 }

 const c=current.course;
 UniStore.addPrint({screenId,courseCode:c.code,title:c.title});

 const payload={
   course:c,
   displayText:current.displayText||'',
   qrUrl:currentQr,
   courseId:c.id,
   createdAt:new Date().toISOString()
 };
 localStorage.setItem('unipop_print_payload',JSON.stringify(payload));

 t.textContent='Votre flyer est en cours d’impression…';
 t.classList.add('show');
 setTimeout(()=>t.classList.remove('show'),1800);

 setTimeout(()=>{
   try{ printWindow.location.href='flyer.html?t='+Date.now(); }
   catch(e){ console.error(e); }
 },120);
}
 $('printBar').onclick=doPrint;addEventListener('keydown',e=>{if(e.key==='F9'){e.preventDefault();doPrint()}});
})();
