(async function(){
 const $=id=>document.getElementById(id),cfg=UNIPOP_CONFIG;
 const esc=v=>String(v??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]||m));
 let courses=[],selected=null,playlist=[];

 let displays=UniStore.getDisplays();
 // Alte doppelte Standortkarten aus früheren lokalen Versionen entfernen.
 displays=dedupeDisplays(displays);
 UniStore.saveDisplays(displays);
 const standardDisplays=cfg.screens||[];
 let displayListChanged=false;
 standardDisplays.forEach(sd=>{
   if(!displays.some(d=>d.id===sd.id)){displays.push({...sd});displayListChanged=true}
 });
 if(displayListChanged) UniStore.saveDisplays(displays);


 function refillDisplaySelect(){
   const sel=$('screenSelect'),current=sel.value;
   displays=dedupeDisplays(displays);
   sel.innerHTML='';
   displays.forEach(s=>{
     const o=document.createElement('option');
     o.value=s.id;
     o.textContent=s.name;
     sel.appendChild(o);
   });
   sel.value=displays.some(d=>d.id===current)?current:(displays[0]?.id||'');
 }
 refillDisplaySelect();
 $('screenSelect').value=displays.some(d=>d.id===cfg.defaultScreen)?cfg.defaultScreen:(displays[0]?.id||'');

 function autoResize(el){
   if(!el) return;
   el.style.height='0px';
   const h=Math.max(46, el.scrollHeight + 2);
   el.style.height=h+'px';
 }
 function resizeTexts(){autoResize($('originalText'));autoResize($('displayText'))}

 function setBuilderImagePreview(src){
   const img=$('imgPrev');
   if(!img)return;
   img.onerror=()=>{
     img.onerror=null;
     img.src='assets/images/placeholder.svg';
   };
   img.src=src||'assets/images/placeholder.svg';
 }

 let activeDisplayId=$('screenSelect').value||'';
 let displayRenderToken=0;

 function dedupeDisplays(list){
   const map=new Map();
   (list||[]).forEach(d=>{
     const id=String(d?.id||'').trim();
     if(!id)return;
     if(!map.has(id)) map.set(id,{...d,id});
   });
   return [...map.values()];
 }


 function clearDraft(){
   playlist=[];
   $('campaignName').value='UniPop Auswahl';
   $('duration').value='14';
   $('showQR').checked=true;
   $('showPrint').checked=true;
   $('search').value='';
   renderPlaylist();
 }

 async function fillFromPlaylistItem(it){
   if(!it?.course)return;
   selected={...it.course};
   $('title').value=it.course.title||'';
   $('code').value=it.course.code||'';
   $('date').value=it.course.date||'';
   $('time').value=it.course.time||'';
   $('place').value=it.course.place||'';
   $('trainer').value=it.course.trainer||'';
   $('courseUrl').value=it.course.courseUrl||it.course.url||'';
   $('aiGenerated').checked=!!(it.aiGenerated||it.course.aiGenerated);
   $('originalText').value=it.course.description||'';
   $('displayText').value=it.displayText||UniData.shorten(it.course.description||'',245);
   selected._remoteImageUrl=it.imageUrl||UniHybrid.getRemoteImageUrl(it.course.id)||'';
   const localImg=await UniImageStore.get(it.course.id)||'';
   setBuilderImagePreview(localImg||selected._remoteImageUrl||'assets/images/placeholder.svg');
   $('imageInput').value='';
   requestAnimationFrame(()=>requestAnimationFrame(resizeTexts));
 }

 async function renderDisplayCards(){
   const wrap=$('displayCards');
   if(!wrap)return;

   const token=++displayRenderToken;
   const unique=dedupeDisplays(displays);

   // Replace the canonical in-memory list too.
   displays=unique;

   const cards=[];
   for(const d of unique){
     let a=null;
     try{
       a=await UniHybrid.getAssignment(d.id);
     }catch(e){
       console.warn('Assignment card load failed',d.id,e);
     }

     // A newer render started while we were awaiting: abort this stale render.
     if(token!==displayRenderToken)return;

     const el=document.createElement('button');
     el.type='button';
     el.className='display-card'+(d.id===activeDisplayId?' active':'');
     el.dataset.displayId=d.id;
     el.innerHTML=`<span class="display-card-name">${esc(d.name)}</span>
       <span class="display-card-meta">${a?.items?.length ? a.items.length+' Kurse gespeichert' : 'Keine Playlist'}</span>
       <span class="display-card-url">display.html?screen=${esc(d.id)}</span>`;
     el.onclick=()=>loadDisplayPlaylist(d.id);
     cards.push(el);
   }

   if(token!==displayRenderToken)return;

   // One atomic replace instead of append-per-await.
   wrap.replaceChildren(...cards);
 }

 async function loadDisplayPlaylist(id){
   activeDisplayId=id; $('screenSelect').value=id;
   const a=await UniHybrid.getAssignment(id);
   if(a?.items?.length){
     playlist=a.items.map(it=>({
       course:compactCourse(it.course),
       image:'',
       imageUrl:it.imageUrl||UniHybrid.getRemoteImageUrl(it.course?.id)||'',
       displayText:it.displayText||''
     }));
     $('campaignName').value=a.name||'UniPop Auswahl';
     $('duration').value=String(a.duration||14);
     $('showQR').checked=a.showQR!==false;
     $('showPrint').checked=a.showPrint!==false;
     await fillFromPlaylistItem(playlist[0]);
     renderPlaylist();
     await refreshCampaignPreview();
   }else{
     clearDraft();
     if(selected) await updateEditingPreview();
   }
   await renderDisplayCards();
 }

 function refillCopySelects(){
   ['copySource','copyTarget'].forEach(id=>{
     const sel=$(id); sel.innerHTML='';
     displays.forEach(d=>{const o=document.createElement('option');o.value=d.id;o.textContent=d.name;sel.appendChild(o)});
   });
   $('copySource').value=activeDisplayId||displays[0]?.id||'';
   const alt=displays.find(d=>d.id!==$('copySource').value);
   if(alt)$('copyTarget').value=alt.id;
 }

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

   (async()=>{
     try{
       const remoteDisplays=await UniHybrid.getDisplays(cfg.screens);
       if(Array.isArray(remoteDisplays) && remoteDisplays.length){
         displays=dedupeDisplays(remoteDisplays);
         refillDisplaySelect();
         await renderDisplayCards();
       }
     }catch(err){
       console.warn('Supabase display sync skipped',err);
     }
   })();
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
   $('trainer').value=selected.trainer||'';
   $('courseUrl').value=selected.courseUrl||selected.url||'';
   $('aiGenerated').checked=!!selected.aiGenerated;
   $('originalText').value=selected.description;
   $('displayText').value=UniData.shorten(selected.description,245);
   selected._remoteImageUrl=selected._remoteImageUrl||UniHybrid.getRemoteImageUrl(selected.id)||'';
   setBuilderImagePreview((await UniImageStore.get(selected.id))||selected._remoteImageUrl||'assets/images/placeholder.svg');
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
       aiGenerated:$('aiGenerated').checked,
       courseUrl:$('courseUrl').value.trim()||UNIPOP_CONFIG.qrFallback,
       url:$('courseUrl').value.trim()||UNIPOP_CONFIG.qrFallback,
       description:$('originalText').value.trim()
     },
     image:'',
     imageUrl:selected?._remoteImageUrl||UniHybrid.getRemoteImageUrl(selected?.id)||'',
     aiGenerated:$('aiGenerated').checked,
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
       await fillFromPlaylistItem(it);

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
         refreshCampaignPreview();
       }
     };
     d.querySelector('[data-a=down]').onclick=e=>{
       e.stopPropagation();
       if(i<playlist.length-1){
         [playlist[i+1],playlist[i]]=[playlist[i],playlist[i+1]];
         renderPlaylist();
         refreshCampaignPreview();
       }
     };
     d.querySelector('[data-a=del]').onclick=e=>{
       e.stopPropagation();
       playlist.splice(i,1);
       renderPlaylist();
       if(playlist.length) refreshCampaignPreview();
       else updateEditingPreview();
     };

     $('playlist').appendChild(d);
   });

   if(!playlist.length){
     $('playlist').innerHTML='<div class="note">Noch keine Kurse in der Playlist.</div>';
   }
 }

 function compactCourse(c){
   if(!c)return {};
   return {
     id:c.id||'',
     code:c.code||'',
     title:c.title||'',
     subtitle:c.subtitle||'',
     subject:c.subject||'',
     description:c.description||'',
     date:c.date||'',
     startDate:c.startDate||'',
     dateEnd:c.dateEnd||'',
     time:c.time||'',
     place:c.place||'',
     trainer:c.trainer||'',
     aiGenerated:!!c.aiGenerated,
     courseUrl:c.courseUrl||c.url||UNIPOP_CONFIG.qrFallback,
     url:c.courseUrl||c.url||UNIPOP_CONFIG.qrFallback,
     places:c.places??null,
     registered:c.registered??null,
     level:c.level||'',
     language:c.language||'',
     category:c.category||''
   };
 }

 function campaignPayload(){
   const cleanItems=playlist.map(it=>({
     course:compactCourse(it.course),
     image:'',
     imageUrl:it.imageUrl||UniHybrid.getRemoteImageUrl(it.course?.id)||'',
     aiGenerated:!!(it.aiGenerated||it.course?.aiGenerated),
     displayText:it.displayText||''
   }));
   return {
     name:$('campaignName').value.trim()||'UniPop Auswahl',
     items:cleanItems,
     duration:Number($('duration').value)||14,
     showQR:$('showQR').checked,
     showPrint:$('showPrint').checked
   };
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
   item.imageUrl=item.imageUrl||UniHybrid.getRemoteImageUrl(selected.id)||'';

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
     localStorage.setItem('unipop_preview_assignment',JSON.stringify(previewPayload));
     $('preview').src='display-preview.html?t='+Date.now();
   }catch(e){
     console.error('Preview storage error',e);
   }
 }
 async function updateCampaignPreview(){
   const p=playlist.length?campaignPayload():await editingPayload();
   sessionStorage.setItem('unipop_preview_assignment',JSON.stringify(p));
   localStorage.setItem('unipop_preview_assignment',JSON.stringify(p));
 }
 async function refreshCampaignPreview(){
   await updateCampaignPreview();
   $('preview').src='display-preview.html?t='+Date.now();
 }

 $('screenSelect').addEventListener('change',()=>loadDisplayPlaylist($('screenSelect').value));

 $('newDisplayBtn').onclick=()=>{$('newDisplayName').value='';$('displayModal').classList.remove('hidden')};
 $('cancelDisplayBtn').onclick=()=>$('displayModal').classList.add('hidden');
 $('saveDisplayBtn').onclick=async()=>{
   const name=$('newDisplayName').value.trim(); if(!name)return;
   const d=await UniHybrid.addDisplay(name); displays=dedupeDisplays(await UniHybrid.getDisplays(cfg.screens)); refillDisplaySelect();
   $('screenSelect').value=d.id; $('displayModal').classList.add('hidden'); await renderDisplayCards(); loadDisplayPlaylist(d.id);
 };

 $('copyPlaylistBtn').onclick=()=>{refillCopySelects();$('copyModal').classList.remove('hidden')};
 $('cancelCopyBtn').onclick=()=>$('copyModal').classList.add('hidden');
 $('doCopyBtn').onclick=async()=>{
   const source=$('copySource').value,target=$('copyTarget').value;
   if(!source||!target||source===target){alert('Bitte zwei verschiedene Standorte wählen.');return}
   try{
     const copied=await UniHybrid.copyAssignment(source,target);
     if(UniHybrid.remote() && window.UniRemote?.getAssignment){
       const remoteCopy=await UniRemote.getAssignment(target);
       if(!remoteCopy?.items?.length || remoteCopy.items.length!==(copied?.items?.length||0)){
         throw new Error('Die Playlist-Kopie wurde nicht korrekt an Supabase übertragen. Bitte erneut versuchen.');
       }
     }
   }catch(e){
     alert(e.message||e);
     return;
   }
   $('copyModal').classList.add('hidden'); await renderDisplayCards();
   $('screenSelect').value=target; loadDisplayPlaylist(target);
 };

 $('search').oninput=e=>renderCourses(e.target.value);
 $('shorten').onclick=()=>{
   $('displayText').value=UniData.shorten($('originalText').value,245);
   requestAnimationFrame(()=>autoResize($('displayText')));
   updateEditingPreview();
 };
 ['originalText','displayText'].forEach(id=>$(id).addEventListener('input',()=>{autoResize($(id));updateEditingPreview()}));
 ['title','code','date','time','place','trainer','courseUrl'].forEach(id=>$(id).addEventListener('input',updateEditingPreview));
 $('aiGenerated').addEventListener('change',updateEditingPreview);

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

     const remoteUrl=await UniHybrid.saveCourseImage(courseId,dataUrl);
     if(selected && selected.id===courseId && remoteUrl){
       selected._remoteImageUrl=remoteUrl;

       // Falls der Kurs bereits in der Playlist liegt, die neue Remote-Bild-URL
       // SOFORT dort eintragen. Vorher blieb die Playlist auf imageUrl:'' und
       // das entfernte Display konnte das neu gewählte Bild nicht sehen.
       const pi=playlist.findIndex(x=>x.course?.id===courseId);
       if(pi>=0){
         playlist[pi].image='';
         playlist[pi].imageUrl=remoteUrl;
         renderPlaylist();
         await refreshCampaignPreview();
       }
     }

     if(selected && selected.id===courseId){
       setBuilderImagePreview(dataUrl);
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
 $('removeImage').onclick=async()=>{if(!selected)return;await UniImageStore.remove(selected.id);setBuilderImagePreview('assets/images/placeholder.svg');$('imgPrev').style.opacity='1';$('imageInput').value='';updateEditingPreview()};

 $('addToPlaylist').onclick=async()=>{
   if(!selected)return;
   const item=currentItem();
   item.course=compactCourse(item.course);

   // Kein Base64 in der Playlist. Remote-URL verweist auf Supabase Storage.
   item.image='';
   item.imageUrl=item.imageUrl||UniHybrid.getRemoteImageUrl(selected.id)||'';

   const existingIndex=playlist.findIndex(x=>x.course.id===selected.id);
   if(existingIndex>=0){
     playlist[existingIndex]=item;
   }else{
     playlist.push(item);
   }

   renderPlaylist();
   await refreshCampaignPreview();
 };

 ['duration','showQR','showPrint'].forEach(id=>{
   $(id).addEventListener('change',()=>{
     if(playlist.length) refreshCampaignPreview();
     else updateEditingPreview();
   });
 });

 $('publish').onclick=async()=>{
   if(!playlist.length){alert('Bitte zuerst mindestens einen Kurs zur Playlist hinzufügen.');return}
   try{
     const target=$('screenSelect').value||activeDisplayId;

     // Vor dem Veröffentlichen sicherstellen, dass jeder Kurs seine zentrale
     // Bild-URL mit in Supabase bekommt.
     playlist=playlist.map(it=>({
       ...it,
       image:'',
       imageUrl:it.imageUrl||it.course?._remoteImageUrl||UniHybrid.getRemoteImageUrl(it.course?.id)||''
     }));

     const payload=campaignPayload();
     await UniHybrid.setAssignment(target,payload);

     // Remote-Check: bei aktivem Supabase darf die Erfolgsmeldung nur kommen,
     // wenn die Playlist dort wirklich angekommen ist. getAssignment() allein
     // kann sonst auf localStorage zurückfallen und einen falschen Erfolg melden.
     let check;
     if(UniHybrid.remote() && window.UniRemote?.getAssignment){
       check=await UniRemote.getAssignment(target);
       if(!check?.items?.length || check.items.length!==payload.items.length){
         throw new Error('Die Playlist wurde lokal gespeichert, aber nicht korrekt an Supabase übertragen. Bitte erneut veröffentlichen.');
       }
     }else{
       check=await UniHybrid.getAssignment(target);
       if(!check?.items?.length || check.items.length!==payload.items.length){
         throw new Error('Die Playlist konnte nicht dauerhaft gespeichert werden.');
       }
     }

     activeDisplayId=target;
     await renderDisplayCards();
     alert('Playlist für '+(displays.find(d=>d.id===target)?.name||target)+' gespeichert ('+check.items.length+' Kurse).');
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
       // Vor dem Öffnen immer die komplette Playlist speichern.
       await updateCampaignPreview();

       // mode=playlist zwingt die neue Seite dazu, die Playlist aus
       // localStorage zu lesen und eine alte Einzelvorschau zu ignorieren.
       w.location.href='display-preview.html?mode=playlist&t='+Date.now();
     }catch(e){
       console.error(e);
       try{w.close()}catch(_){}
       alert('Vorschau konnte nicht geöffnet werden: '+(e.message||e));
     }
   })();
 };

 async function refreshStats(){
   const events=await UniHybrid.getPrintEvents();
   const now=new Date(),day=new Date(now.getFullYear(),now.getMonth(),now.getDate());
   const week=new Date(day);week.setDate(week.getDate()-((week.getDay()+6)%7));
   const year=new Date(now.getFullYear(),0,1);
   const cnt=start=>events.filter(x=>new Date(x.created_at)>=start).length;
   $('stToday').textContent=cnt(day);
   $('stWeek').textContent=cnt(week);
   $('stYear').textContent=cnt(year);
   $('stTotal').textContent=events.length;

   const statuses=await UniHybrid.getStatuses();
   $('screenTable').innerHTML='';
   displays.forEach(sc=>{
     const st=statuses.find(x=>x.display_slug===sc.id);
     const last=st?.last_seen?new Date(st.last_seen):null;
     const on=last&&(Date.now()-last.getTime()<120000);
     const tr=document.createElement('tr');
     tr.innerHTML=`<td>${esc(sc.name)}</td><td><span class="status-dot ${on?'':'off'}"></span>${on?'ONLINE':'OFFLINE'}</td><td>${last?last.toLocaleString('fr-LU'):'—'}</td>`;
     $('screenTable').appendChild(tr);
   });

   const map={};
   events.forEach(x=>{
     const key=x.course_code||x.course_title||'—';
     map[key]??={code:key,title:x.course_title||key,total:0};
     map[key].total++;
   });
   $('topTable').innerHTML='';
   Object.values(map).sort((a,b)=>b.total-a.total).slice(0,10).forEach(x=>{
     const tr=document.createElement('tr');
     tr.innerHTML=`<td>${esc(x.title)}</td><td>${esc(x.code)}</td><td>${x.total}</td>`;
     $('topTable').appendChild(tr);
   });
 }

 clearDraft(); activeDisplayId=$('screenSelect').value||displays[0]?.id||''; await renderDisplayCards(); renderCourses(); if(selected){await fill();updateEditingPreview();} else {$('courseList').innerHTML='<div class="note">Keine UniPop-Kurse in trainings.json.</div>'; $('preview').src='about:blank';} renderPlaylist();refreshStats();setInterval(()=>refreshStats(),10000);
})();