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
   $('loadState').innerHTML=`<b>trainings.json live geladen – ${currentCount} aktuelle/zukünftige UniPop-Kurse.</b><br><span class="note">Quelle: Franks Magic / main<br>${courses.length} UniPop-Kurse insgesamt verfügbar. Bei einer Suche wird automatisch auch im Archiv gesucht.</span>`;
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
     d.onclick=async()=>{
       selected=c;
       await fill();
       renderCourses($('search').value);
       updateEditingPreview();
     };
     $('courseList').appendChild(d);
   });

   if(!visible.length){
     $('courseList').innerHTML='<div class="note">Keine passenden Kurse gefunden.</div>';
   }
 }

 async function fill(){
   if(!selected)return;
   $('title').value=selected.title;
   $('code').value=selected.code;
   $('date').value=selected.date;
   $('time').value=selected.time;
   $('place').value=selected.place;
   $('trainer').value=selected.trainer;
   $('originalText').value=selected.description;
   $('displayText').value=UniData.shorten(selected.description,245);
   $('imgPrev').src=(await UniImageStore.get(selected.id))||'assets/images/placeholder.svg';
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
     image:'',
     displayText:$('displayText').value.trim()
   };
 }

 function renderPlaylist(){
   $('playlist').innerHTML='';

   playlist.forEach((it,i)=>{
     const d=document.createElement('div');
     d.className='course-card playlist-card'+(selected?.id===it.course.id?' active':'');
     d.innerHTML=`
       <div class="playlist-main" role="button" tabindex="0" title="Kurs bearbeiten">
         <b>${i+1}. ${esc(it.course.title)}</b>
         <small>${esc(it.course.code)} · ${esc(it.course.place)}</small>
         <small class="playlist-edit-hint">Klicken zum Bearbeiten</small>
       </div>
       <div class="playlist-actions">
         <button class="btn" data-a="up" title="Nach oben">↑</button>
         <button class="btn" data-a="down" title="Nach unten">↓</button>
         <button class="btn danger" data-a="del">Entfernen</button>
       </div>`;

     const openForEdit=async()=>{
       // Playlist-Daten werden zurück in den Editor geladen.
       selected={...it.course};

       $('title').value=it.course.title||'';
       $('code').value=it.course.code||'';
       $('date').value=it.course.date||'';
       $('time').value=it.course.time||'';
       $('place').value=it.course.place||'';
       $('trainer').value=it.course.trainer||'';
       $('originalText').value=it.course.description||'';
       $('displayText').value=it.displayText||UniData.shorten(it.course.description||'',245);

       // Playlist-Bild hat Vorrang, danach IndexedDB.
       let img=it.image||'';
       if(!img) img=await UniImageStore.get(it.course.id)||'';
       $('imgPrev').src=img||'assets/images/placeholder.svg';
       $('imageInput').value='';

       requestAnimationFrame(()=>requestAnimationFrame(resizeTexts));
       renderCourses($('search').value);
       renderPlaylist();
       updateEditingPreview();

       // Editor sichtbar machen.
       document.getElementById('title')?.scrollIntoView({behavior:'smooth',block:'center'});
     };

     const main=d.querySelector('.playlist-main');
     main.onclick=openForEdit;
     main.onkeydown=e=>{
       if(e.key==='Enter'||e.key===' '){
         e.preventDefault();
         openForEdit();
       }
     };

     d.querySelector('[data-a=up]').onclick=e=>{
       e.stopPropagation();
       if(i>0){
         [playlist[i-1],playlist[i]]=[playlist[i],playlist[i-1]];
         renderPlaylist();
       }
     };
     d.querySelector('[data-a=down]').onclick=e=>{
       e.stopPropagation();
       if(i<playlist.length-1){
         [playlist[i+1],playlist[i]]=[playlist[i],playlist[i+1]];
         renderPlaylist();
       }
     };
     d.querySelector('[data-a=del]').onclick=e=>{
       e.stopPropagation();
       playlist.splice(i,1);
       renderPlaylist();
     };

     $('playlist').appendChild(d);
   });

   if(!playlist.length){
     $('playlist').innerHTML='<div class="note">Noch keine Kurse in der Playlist.</div>';
   }
 }

 function campaignPayload(){
   const cleanItems=playlist.map(it=>({...it,image:''}));
   return {name:$('campaignName').value.trim()||'UniPop Auswahl',items:cleanItems,duration:Number($('duration').value)||14,showQR:$('showQR').checked,showPrint:$('showPrint').checked};
 }
 async function editingPayload(){
   if(!selected){
     return {
       name:'Vorschau',
       items:[],
       duration:Number($('duration').value)||14,
       showQR:$('showQR').checked,
       showPrint:$('showPrint').checked
     };
   }

   const item=currentItem();
   item.image=await UniImageStore.get(selected.id)||'';

   return {
     name:'Vorschau',
     items:[item],
     duration:Number($('duration').value)||14,
     showQR:$('showQR').checked,
     showPrint:$('showPrint').checked
   };
 }
 async function updateEditingPreview(){
   if(!selected)return;
   try{
     const previewPayload=await editingPayload();
     sessionStorage.setItem('unipop_preview_assignment',JSON.stringify(previewPayload));
     $('preview').src='display-preview.html?t='+Date.now();
   }catch(e){
     console.error('Preview storage error',e);
   }
 }
 async function updateCampaignPreview(){
   const p=playlist.length?campaignPayload():await editingPayload();
   sessionStorage.setItem('unipop_preview_assignment',JSON.stringify(p));
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

 $('imageInput').onclick=()=>{
   // Damit auch dieselbe Datei erneut gewählt werden kann.
   $('imageInput').value='';
 };

 $('imageInput').onchange=async e=>{
   const f=e.target.files?.[0];
   if(!f || !selected) return;

   const courseId=selected.id;

   try{
     $('imgPrev').style.opacity='.5';

     // Bestehende Komprimierungsfunktion nutzen, falls vorhanden.
     let dataUrl;
     if(typeof compressImage==='function'){
       dataUrl=await compressImage(f);
     }else{
       dataUrl=await new Promise((resolve,reject)=>{
         const r=new FileReader();
         r.onerror=()=>reject(r.error);
         r.onload=()=>resolve(r.result);
         r.readAsDataURL(f);
       });
     }

     await UniImageStore.set(courseId,dataUrl);

     if(selected && selected.id===courseId){
       $('imgPrev').src=dataUrl;
       $('imgPrev').style.opacity='1';

       // WICHTIG: Preview sofort neu aufbauen.
       updateEditingPreview();
     }
   }catch(err){
     console.error(err);
     $('imgPrev').style.opacity='1';
     alert('Bild konnte nicht übernommen werden: '+(err.message||err));
   }finally{
     $('imageInput').value='';
   }
 };
 $('removeImage').onclick=async()=>{if(!selected)return;await UniImageStore.remove(selected.id);$('imgPrev').src='assets/images/placeholder.svg';$('imgPrev').style.opacity='1';$('imageInput').value='';updateEditingPreview()};

 $('addToPlaylist').onclick=async()=>{
   if(!selected)return;
   const item=currentItem();

   // Das eigentliche Bild bleibt ausschließlich in IndexedDB.
   // In Playlist/localStorage speichern wir KEIN Base64-Bild mehr.
   item.image='';

   const existingIndex=playlist.findIndex(x=>x.course.id===selected.id);
   if(existingIndex>=0){
     playlist[existingIndex]=item;
   }else{
     playlist.push(item);
   }

   renderPlaylist();
   updateEditingPreview();
 };

 ['duration','showQR','showPrint'].forEach(id=>{$(id).addEventListener('change',updateEditingPreview)});

 $('publish').onclick=()=>{
   if(!playlist.length){alert('Bitte zuerst mindestens einen Kurs zur Playlist hinzufügen.');return}
   try{
     UniStore.setAssignment($('screenSelect').value,campaignPayload());
     alert('Playlist gespeichert. Für die echte Fernübertragung zum Display wird später das Backend angeschlossen.');
     refreshStats();
   }catch(e){
     console.error(e);
     alert('Playlist konnte nicht gespeichert werden: '+(e.message||e));
   }
 };

 $('fullPreview').onclick=()=>{
   const w=window.open('about:blank','unipop_full_preview');
   if(!w){
     alert('Bitte Pop-ups für diese Seite erlauben.');
     return;
   }
   (async()=>{
     try{
       await updateCampaignPreview();
       w.location.href='display-preview.html?t='+Date.now();
     }catch(e){
       console.error(e);
       try{w.close()}catch(_){}
       alert('Vorschau konnte nicht geöffnet werden: '+(e.message||e));
     }
   })();
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

 renderCourses(); if(selected){await fill();updateEditingPreview();} else {$('courseList').innerHTML='<div class="note">Keine UniPop-Kurse in trainings.json.</div>'; $('preview').src='about:blank';} renderPlaylist();refreshStats();setInterval(refreshStats,10000);
})();