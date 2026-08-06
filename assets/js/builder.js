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

 try{
   courses=await UniData.loadCourses();
   if(courses.length){
     $('loadState').innerHTML=`<b>${courses.length} aktuelle/zukünftige UniPop-Kurse geladen</b><br><span class="note">Quelle: ${esc(window.UNIPOP_JSON_SOURCE||'trainings.json')}<br>Filter: organisateur.code = UNIPOP · Kursbeginn ab heute.</span>`;
   }else{
     const total=window.UNIPOP_JSON_UNIPOP_TOTAL??0;
     $('loadState').innerHTML=`<b>trainings.json erfolgreich geladen – momentan 0 aktuelle/zukünftige UniPop-Kurse.</b><br><span class="note">Quelle: ${esc(window.UNIPOP_JSON_SOURCE||'trainings.json')}<br>${total} UniPop-Datensätze sind insgesamt in der Datei, aber keiner beginnt ab heute. Sobald die neue Kursrunde in trainings.json erscheint, wird sie automatisch angezeigt.</span>`;
   }
   selected=courses[0]||null;
 }catch(e){
   $('loadState').innerHTML=`<b>trainings.json konnte nicht geladen werden.</b><br><span class="note">${esc(e.message)}</span>`;console.error(e);return
 }

 function renderCourses(f=''){
   const q=f.toLowerCase();
   $('courseList').innerHTML='';
   courses.filter(c=>(c.title+' '+c.code+' '+c.place+' '+c.subject).toLowerCase().includes(q)).slice(0,300).forEach(c=>{
     const d=document.createElement('div');
     d.className='course-card'+(selected?.id===c.id?' active':'');
     d.innerHTML=`<b>${esc(c.title)}</b><small>${esc(c.code)} · ${esc(c.subject)}</small><small>${esc(c.date)} · ${esc(c.place)}</small>`;
     d.onclick=()=>{
       selected=c;
       fill();
       renderCourses($('search').value);
       updateEditingPreview(); // sofort den neu gewählten Kurs anzeigen
     };
     $('courseList').appendChild(d);
   });
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

 $('imageInput').onchange=e=>{
   const f=e.target.files?.[0];if(!f||!selected)return;
   const r=new FileReader();
   r.onload=()=>{UniStore.setImage(selected.id,r.result);$('imgPrev').src=r.result;updateEditingPreview()};
   r.readAsDataURL(f);
 };
 $('removeImage').onclick=()=>{if(!selected)return;UniStore.setImage(selected.id,'');$('imgPrev').src='assets/images/placeholder.svg';updateEditingPreview()};

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

 renderCourses(); if(selected){fill();updateEditingPreview();} else {$('courseList').innerHTML='<div class="note">Zurzeit keine UniPop-Kurse ab heute in trainings.json.</div>'; $('preview').src='about:blank';} renderPlaylist();refreshStats();setInterval(refreshStats,10000);
})();