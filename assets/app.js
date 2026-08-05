(function(){
  const cfg=window.UNIPOP_CONFIG;
  let index=0, locked=false, slideTimer=null;
  const $=id=>document.getElementById(id);
  const els={img:$('courseImage'),availability:$('availability'),title:$('courseTitle'),subtitle:$('courseSubtitle'),date:$('courseDate'),time:$('courseTime'),place:$('coursePlace'),trainer:$('courseTrainer'),qr:$('qrImage'),print:$('printBtn'),status:$('printStatus')};
  function course(){return cfg.courses[index]}
  function qrUrl(url){return 'https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=0&data='+encodeURIComponent(url)}
  function render(){const c=course();els.img.src=c.image;els.title.textContent=c.title;els.subtitle.textContent=c.subtitle;els.date.textContent=c.date;els.time.textContent=c.time;els.place.textContent=c.place;els.trainer.textContent=c.trainer;els.qr.src=qrUrl(c.url);els.availability.style.display=c.available?'grid':'none';UniPopStore.heartbeat(c)}
  function startSlides(){clearInterval(slideTimer);slideTimer=setInterval(()=>{if(locked)return;index=(index+1)%cfg.courses.length;render()},cfg.slideSeconds*1000)}
  function hourCount(){const since=Date.now()-3600000;return UniPopStore.prints().filter(x=>new Date(x.timestamp).getTime()>=since).length}
  function toast(text,ms=2600){els.status.textContent=text;els.status.classList.add('show');setTimeout(()=>els.status.classList.remove('show'),ms)}
  async function printCurrent(){if(locked)return;if(hourCount()>=cfg.hourlyPrintLimit){toast('Limite horaire atteinte. Impression temporairement indisponible.',4200);return}const c=course();locked=true;els.print.disabled=true;UniPopStore.addPrint(c);localStorage.setItem('unipop-print-course',JSON.stringify(c));window.open('flyer.html?autoprint=1','unipopFlyer','width=900,height=1100');let left=cfg.printCooldownSeconds;toast('Votre flyer est en cours d’impression…');const timer=setInterval(()=>{left--;if(left<=0){clearInterval(timer);locked=false;els.print.disabled=false}else{els.print.setAttribute('aria-label','Impression disponible dans '+left+' secondes')}},1000)}
  els.print.addEventListener('click',printCurrent);document.addEventListener('keydown',e=>{if(e.key==='F9'){e.preventDefault();printCurrent()}});
  render();startSlides();setInterval(()=>UniPopStore.heartbeat(course()),30000);
})();
