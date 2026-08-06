(async function(){
 const $=id=>document.getElementById(id),cfg=UNIPOP_CONFIG;
 const esc=v=>String(v??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]||m));
 let courses=[],selected=null,playlist=[];

 cfg.screens.forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.name;$('screenSelect').appendChild(o)});
 $('screenSelect').value=cfg.defaultScreen;

 function autoResize(el){
   if(!el) return;
   el.style.height='0px';
   const h=Math.max(46, el.scrollHeight + 2);
   el.style.height=h+'px';
 }
 function resizeTexts(){autoResize($('originalText'));autoResize($('displayText'))}

 function compressImage(file,maxW=1600,maxH=900,quality=.84){
   return new Promise((resolve,reject)=>{
     const reader=new FileReader();
     reader.onerror=()=>reject(reader.error||new Error('Datei konnte nicht gelesen werden'));
     reader.onload=()=>{
       const img=new Image();
       img.onerror=()=>reject(new Error('Bild konnte nicht geladen werden'));
       img.onload=()=>{
         let w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
         const scale=Math.min(1,maxW/w,maxH/h);
         w=Math.max(1,Math.round(w*scale)); h=Math.max(1,Math.round(h*scale));
         const canvas=document.createElement('canvas');
         canvas.width=w; canvas.height=h;
         const ctx=canvas.getContext('2d');
         ctx.drawImage(img,0,0,w,h);
         // PNG mit Transparenz bleibt PNG, sonst platzsparendes JPEG.
         const isPng=/png$/i.test(file.type)||/\.png$/i.test(file.name);
         const type=isPng?'image/png':'image/jpeg';
         try{ resolve(canvas.toDataURL(type,isPng?undefined:quality)); }
         catch(e){ reject(e); }
       };
       img.src=reader.result;
     };
     reader.readAsDataURL(file);
   });
 }

 try{
   courses=await UniData.loadCourses();
   const today=new Date(); today.setHours(0,0,0,0);
   const currentCount=courses.filter(c=>!c.startDate || new Date(c.startDate)>=today).length;
   $('loadState').innerHTML=`<b>trainings.json erfolgreich geladen – ${currentCount} aktuelle/zukünftige UniPop-Kurse.</b><br><span class="note">Quelle: ${esc(window.UNIPOP_JSON_SOURCE||'trainings.json')}<br>${courses.length} UniPop-Kurse insgesamt verfügbar. Bei einer Suche wird automatisch auch im Archiv gesucht.</span>`;
   selected=(courses.find(c=>!c.startDate || new Date(c.startDate)>=today) || courses[0] || null);
 }catch(e){
   $('loadState').innerHTML=`<b>trainings.json konnte nicht geladen werden.</b><br><span class="note">${esc(e.message)}</span>`;console.error(e);return
 }

 function renderCourses(f=''){
   const q=f.trim().toLowerCase();
   const today=new Date(); today.setHours(0,0,0,0);
   const prevMonthStart=new Date(today.getFullYear(), today.getMonth()-1, 1, 0,0,0,0);

   const matchesText=c=>(c.title+' '+c.code+' '+c.place+' '+c.subject+' '+c.description).toLowerCase().includes(q);
   let visible;

   if(!q){
     // Standardansicht: nur heute + Zukunft.
     visible=courses.filter(c=>{
       const d=c.startDate?new Date(c.startDate):null;
       return !d || d>=today;
     });
   }else{
     // Suche: zuerst ab dem 1. des Vormonats.
     visible=courses.filter(c=>{
       if(!matchesText(c)) return false;
       const d=c.startDate?new Date(c.startDate):null;
       return !d || d>=prevMonthStart;
     });

     // Wenn kein Treffer: automatisch im gesamten Archiv suchen,
     // damit weiterhin Content aus älteren Kursen erstellt werden kann.
     if(!visible.length){
       visible=courses.filter(matchesText);
     }
   }

   visible.sort((a,b)=>{
     const da=a.startDate?new Date(a.startDate).getTime():Number.MAX_SAFE_INTEGER;
     const db=b.startDate?new Date(b.startDate).getTime():Number.MAX_SAFE_INTEGER;
     return da-db || a.title.localeCompare(b.title,'fr');
   });

   $('courseList').innerHTML='';

   visible.slice(0,300).forEach(c=>{
     const d=document.createElement('div');
     const courseDate=c.startDate?new Date(c.startDate):null;
     const archived=courseDate && courseDate<prevMonthStart;
     d.className='course-card'+(selected?.id===c.id?' active':'');
     d.innerHTML=`<b>${esc(c.title)}</b>
       <small>${esc(c.code)} · ${esc(c.subject)}</small>
       <small>${esc(c.date)} · ${esc(c.place)}</small>
       ${archived && q ? '<span class="archive-pill">ARCHIV</span>' : ''}`;
     d.onclick=()=>{
       selected=c;
       fill();
       renderCourses($('search').value);
       updateEditingPreview();
     };
     $('courseList').appendChild(d);
   });

   if(!visible.length){
     $('courseList').innerHTML='<div class="note">Keine passenden Kurse gefunden.</div>';
   }
 }

 function fill(){
   if(!selected)return;
   $('title').value=selected.title;
   $('code').value=selected.code;
   $('date').value=selected.date;
   $('time').value=selected.time;
   $('place').value=selected.place;
   $('trainer').value=selected.trainer;
   $('originalText').value=selected.description;
   $('displayText').value=UniData.shorten(selected.description,245);
   $('imgPrev').src=UniStore.getImage(selected.id)||'assets/images/placeholder.svg';
   // Wichtig: Datei-Input beim Kurswechsel zurücksetzen.
   // Sonst feuert "change" bei einem weiteren Upload je nach Browser nicht zuverlässig.
   $('imageInput').value='';
   requestAnimationFrame(()=>requestAnimationFrame(resizeTexts));
 }

 function currentItem(){
   return {
     course:{...selected,
       title:$('title').value.trim(),
       code:$('code').value.trim(),
       date:$('date').value.trim(),
       time:$('time').value.trim(),
       place:$('place').value.trim(),
       trainer:$('trainer').value.trim(),
       description:$('originalText').value.trim()
     },
     image:UniStore.getImage(selected.id)||'',
     displayText:$('displayText').value.trim()
   };
 }

 function renderPlaylist(){
   $('playlist').innerHTML='';
   playlist.forEach((it,i)=>{
     const d=document.createElement('div');d.className='course-card';
     d.innerHTML=`<b>${i+1}. ${esc(it.course.title)}</b><small>${esc(it.course.code)} · ${esc(it.course.place)}</small>
       <div class="playlist-actions"><button class="btn" data-a="up">↑</button><button class="btn" data-a="down">↓</button><button class="btn danger" data-a="del">Entfernen</button></div>`;
     d.querySelector('[data-a=up]').onclick=()=>{if(i>0){[playlist[i-1],playlist[i]]=[playlist[i],playlist[i-1]];renderPlaylist()}};
     d.querySelector('[data-a=down]').onclick=()=>{if(i<playlist.length-1){[playlist[i+1],playlist[i]]=[playlist[i],playlist[i+1]];renderPlaylist()}};
     d.querySelector('[data-a=del]').onclick=()=>{playlist.splice(i,1);renderPlaylist()};
     $('playlist').appendChild(d);
   });
   if(!playlist.length)$('playlist').innerHTML='<div class="note">Noch keine Kurse in der Playlist.</div>';
 }

 function campaignPayload(){
   return {name:$('campaignName').value.trim()||'UniPop Auswahl',items:playlist,duration:Number($('duration').value)||14,showQR:$('showQR').checked,showPrint:$('showPrint').checked};
 }
 function editingPayload(){
   return {name:'Vorschau',items:selected?[currentItem()]:[],duration:Number($('duration').value)||14,showQR:$('showQR').checked,showPrint:$('showPrint').checked};
 }
 function updateEditingPreview(){
   if(!selected)return;
   sessionStorage.setItem('unipop_preview_assignment',JSON.stringify(editingPayload()));
   $('preview').src='display-preview.html?t='+Date.now();
 }
 function updateCampaignPreview(){
   sessionStorage.setItem('unipop_preview_assignment',JSON.stringify(playlist.length?campaignPayload():editingPayload()));
 }

 $('search').oninput=e=>renderCourses(e.target.value);
 $('shorten').onclick=()=>{
   $('displayText').value=UniData.shorten($('originalText').value,245);
   requestAnimationFrame(()=>autoResize($('displayText')));
   updateEditingPreview();
 };
 ['originalText','displayText'].forEach(id=>$(id).addEventListener('input',()=>{autoResize($(id));updateEditingPreview()}));
 ['title','code','date','time','place','trainer'].forEach(id=>$(id).addEventListener('input',updateEditingPreview));

 $('imageInput').onclick=()=>{
   // Schon vor der Auswahl leeren: dadurch feuert "change" auch,
   // wenn danach dieselbe Datei oder eine andere Datei gewählt wird.
   $('imageInput').value='';
 };

 $('imageInput').onchange=async e=>{
   const f=e.target.files?.[0];
   if(!f||!selected)return;

   const courseId=selected.id;
   const prev=$('imgPrev').src;

   try{
     $('imgPrev').style.opacity='.45';
     const dataUrl=await compressImage(f);

     // Testweise speichern; bei vollem localStorage klare Fehlermeldung.
     try{
       UniStore.setImage(courseId,dataUrl);
     }catch(storageErr){
       throw new Error('Browser-Speicher für Bilder ist voll. Bitte ein altes Bild entfernen.');
     }

     if(selected && selected.id===courseId){
       $('imgPrev').src=dataUrl;
       $('imgPrev').style.opacity='1';
       updateEditingPreview();
     }
   }catch(err){
     console.error(err);
     $('imgPrev').style.opacity='1';
     if(prev)$('imgPrev').src=prev;
     alert('Bild konnte nicht übernommen werden: '+(err.message||err));
   }finally{
     // Nach jedem Versuch wieder zurücksetzen.
     $('imageInput').value='';
   }
 };
 $('removeImage').onclick=()=>{if(!selected)return;UniStore.setImage(selected.id,'');$('imgPrev').src='assets/images/placeholder.svg';$('imgPrev').style.opacity='1';$('imageInput').value='';updateEditingPreview()};

 $('addToPlaylist').onclick=()=>{
   if(!selected)return;
   const item=currentItem(),idx=playlist.findIndex(x=>x.course.id===selected.id);
   if(idx>=0)playlist[idx]=item;else playlist.push(item);
   renderPlaylist();
 };

 ['duration','showQR','showPrint'].forEach(id=>{$(id).addEventListener('change',updateEditingPreview)});
 $('publish').onclick=()=>{
   if(!playlist.length){alert('Bitte zuerst mindestens einen Kurs zur Playlist hinzufügen.');return}
   UniStore.setAssignment($('screenSelect').value,campaignPayload());
   alert('Playlist gespeichert. Für die echte Fernübertragung wird später das Backend angeschlossen.');
   refreshStats();
 };
 $('fullPreview').onclick=()=>{
   updateCampaignPreview();
   window.open('display-preview.html','_blank');
 };

 function refreshStats(){
   const s=UniStore.stats();$('stToday').textContent=s.today;$('stWeek').textContent=s.week;$('stYear').textContent=s.year;$('stTotal').textContent=s.total;
   const hb=UniStore.getHeartbeats();$('screenTable').innerHTML='';
   cfg.screens.forEach(sc=>{
     const last=hb[sc.id]?.ts?new Date(hb[sc.id].ts):null,on=last&&(Date.now()-last<120000),tr=document.createElement('tr');
     tr.innerHTML=`<td>${esc(sc.name)}</td><td><span class="status-dot ${on?'':'off'}"></span>${on?'ONLINE':'OFFLINE'}</td><td>${last?last.toLocaleString('fr-LU'):'—'}</td>`;$('screenTable').appendChild(tr)
   });
   $('topTable').innerHTML='';
   UniStore.byCourse().slice(0,10).forEach(x=>{const tr=document.createElement('tr');tr.innerHTML=`<td>${esc(x.title)}</td><td>${esc(x.code)}</td><td>${x.total}</td>`;$('topTable').appendChild(tr)})
 }

 renderCourses(); if(selected){fill();updateEditingPreview();} else {$('courseList').innerHTML='<div class="note">Keine UniPop-Kurse in trainings.json.</div>'; $('preview').src='about:blank';} renderPlaylist();refreshStats();setInterval(refreshStats,10000);
})();