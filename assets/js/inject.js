(async function(){
 const $=id=>document.getElementById(id); let profile=null,screens=[],selectedFile=null,rows=[];
 function msg(el,text,type='ok'){el.textContent=text;el.className='msg show '+type;setTimeout(()=>{if(el.textContent===text)el.className='msg'},5200)}
 function fmtInput(d){const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,16)}
 function initDates(){const now=new Date(),end=new Date(now.getTime()+7*86400000);$('startsAt').value=fmtInput(now);$('endsAt').value=fmtInput(end)}
 function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
 function status(r){const n=Date.now(),a=new Date(r.starts_at).getTime(),b=new Date(r.ends_at).getTime();if(!r.enabled)return ['Désactivé','st-off'];if(a>n)return ['Planifié','st-future'];if(b<n)return ['Terminé','st-expired'];return ['Actif','st-active']}
 function renderScreens(){
   $('screenChoices').innerHTML=screens.map((s,i)=>`<div class="screen-choice"><input id="sc_${esc(s.slug)}" type="checkbox" value="${esc(s.slug)}" ${i===0?'checked':''}><label for="sc_${esc(s.slug)}">▣ ${esc(s.name||s.slug)}</label></div>`).join('')||'<div class="empty">Aucun écran n’est attribué à ce compte.</div>';
   const preview=$('previewScreen');
   if(preview){
     preview.innerHTML=screens.map(s=>`<option value="${esc(s.slug)}">${esc(s.name||s.slug)}</option>`).join('')||'<option value="">Aucun écran disponible</option>';
     preview.disabled=!screens.length;
   }
   const previewBtn=$('previewBtn');if(previewBtn)previewBtn.disabled=!screens.length;
 }
 function renderMine(){
   if(!rows.length){$('myContent').innerHTML='<div class="empty">Aucune publication pour le moment.</div>';return}
   $('myContent').innerHTML=rows.map(r=>{const [st,cl]=status(r);return `<div class="content-row"><img src="${esc(r.image_url)}" alt=""><div class="content-main"><b>${esc(r.screen_slug)} · ${Number(r.duration_seconds)||10}s</b><small>${new Date(r.starts_at).toLocaleString('fr-LU')} → ${new Date(r.ends_at).toLocaleString('fr-LU')}</small><span class="status-badge ${cl}">${st}</span></div><div class="row-actions">${r.enabled?`<button class="mini-btn" data-act="toggle" data-id="${r.id}">Désactiver</button>`:`<button class="mini-btn" data-act="toggle" data-id="${r.id}">Activer</button>`}<button class="mini-btn" data-act="delete" data-id="${r.id}">Supprimer</button></div></div>`}).join('');
 }
 async function loadMine(){try{rows=await UniInject.myInjections();renderMine()}catch(e){$('myContent').innerHTML='<div class="empty">'+esc(e.message)+'</div>'}}
 async function openApp(){
   try{profile=await UniInject.myProfile();if(!profile||profile.active===false){await UniInject.signOut();throw new Error('Ce compte n’est pas autorisé ou a été désactivé.')}screens=await UniInject.myScreens();$('userOrg').textContent=profile.organization||profile.display_name||profile.email;$('authView').classList.add('hidden');$('appView').classList.remove('hidden');renderScreens();initDates();await loadMine()}catch(e){$('appView').classList.add('hidden');$('authView').classList.remove('hidden');msg($('authMsg'),e.message,'err')}
 }
 $('loginTab').onclick=()=>{$('loginTab').classList.add('active');$('activateTab').classList.remove('active');$('loginForm').classList.remove('hidden');$('activateForm').classList.add('hidden')};
 $('activateTab').onclick=()=>{$('activateTab').classList.add('active');$('loginTab').classList.remove('active');$('activateForm').classList.remove('hidden');$('loginForm').classList.add('hidden')};
 $('loginForm').onsubmit=async e=>{e.preventDefault();try{await UniInject.signIn($('loginEmail').value,$('loginPassword').value);await openApp()}catch(err){msg($('authMsg'),err.message,'err')}};
 $('activateForm').onsubmit=async e=>{e.preventDefault();const email=$('actEmail').value.trim(),code=$('actCode').value.trim().toUpperCase(),pass=$('actPassword').value;try{if(!(await UniInject.verifyInvite(email,code)))throw new Error('Code d’activation invalide ou accès non autorisé.');const result=await UniInject.signUp(email,pass,code);if(result?.access_token){await openApp()}else{msg($('authMsg'),'Compte créé. Consultez votre e-mail pour confirmer l’adresse, puis connectez-vous.','ok');$('loginEmail').value=email;$('loginTab').click()}}catch(err){msg($('authMsg'),err.message,'err')}};
 $('logoutBtn').onclick=async()=>{await UniInject.signOut();location.reload()};
 $('previewBtn').onclick=()=>{
   const slug=$('previewScreen')?.value;
   if(!slug)return;
   const url=new URL('display.html',location.href);
   url.searchParams.set('screen',slug);
   url.searchParams.set('preview','1');
   const w=window.open(url.href,'_blank','noopener,noreferrer');
   if(!w)alert('La fenêtre d’aperçu a été bloquée par le navigateur. Autorisez les fenêtres pop-up pour UniPop Local.');
 };
 const zone=$('uploadZone'),input=$('imageInput');zone.onclick=()=>input.click();zone.ondragover=e=>{e.preventDefault();zone.classList.add('drag')};zone.ondragleave=()=>zone.classList.remove('drag');zone.ondrop=e=>{e.preventDefault();zone.classList.remove('drag');const f=e.dataTransfer.files?.[0];if(f)chooseFile(f)};input.onchange=()=>{if(input.files?.[0])chooseFile(input.files[0])};
 function chooseFile(f){if(!/^image\/(jpeg|png|webp)$/i.test(f.type)){msg($('publishMsg'),'Format non pris en charge. Utilisez JPG, PNG ou WebP.','err');return}if(f.size>12*1024*1024){msg($('publishMsg'),'Image trop volumineuse (maximum 12 Mo).','err');return}selectedFile=f;const url=URL.createObjectURL(f);$('imagePreview').src=url;$('imagePreview').style.display='block';$('uploadPrompt').classList.add('hidden')}
 $('publishBtn').onclick=async()=>{const btn=$('publishBtn');try{if(!selectedFile)throw new Error('Sélectionnez une image.');const checked=[...document.querySelectorAll('#screenChoices input:checked')].map(x=>x.value);if(!checked.length)throw new Error('Sélectionnez au moins un écran.');const limit=Number(profile?.max_active_per_screen)||5;for(const slug of checked){const used=rows.filter(r=>r.screen_slug===slug&&r.enabled&&new Date(r.ends_at).getTime()>=Date.now()).length;if(used>=limit)throw new Error(`Limite atteinte pour ${screens.find(s=>s.slug===slug)?.name||slug} : maximum ${limit} publications actives.`)}const a=new Date($('startsAt').value),b=new Date($('endsAt').value);if(!Number.isFinite(a.getTime())||!Number.isFinite(b.getTime())||b<=a)throw new Error('La date de fin doit être postérieure à la date de début.');btn.disabled=true;btn.textContent='Publication…';const uploaded=await UniInject.uploadImage(selectedFile);let created=[];try{for(const screen_slug of checked){created.push(await UniInject.createInjection({screen_slug,image_url:uploaded.url,image_path:uploaded.path,original_name:selectedFile.name,starts_at:a.toISOString(),ends_at:b.toISOString(),duration_seconds:Number($('durationSec').value)||10,fit:$('imageFit').value||'contain'}))}}catch(err){if(!created.length)try{await UniInject.removeImage(uploaded.path)}catch(_){}throw err}msg($('publishMsg'),created.length+' publication(s) enregistrée(s).','ok');selectedFile=null;input.value='';$('imagePreview').style.display='none';$('imagePreview').removeAttribute('src');$('uploadPrompt').classList.remove('hidden');await loadMine()}catch(err){msg($('publishMsg'),err.message,'err')}finally{btn.disabled=false;btn.textContent='Publier le contenu'}};
 $('refreshMine').onclick=loadMine;$('myContent').onclick=async e=>{const b=e.target.closest('[data-act]');if(!b)return;const row=rows.find(x=>x.id===b.dataset.id);if(!row)return;try{if(b.dataset.act==='toggle')await UniInject.updateInjection(row.id,{enabled:!row.enabled});if(b.dataset.act==='delete'){if(!confirm('Supprimer définitivement cette publication ?'))return;await UniInject.deleteInjection(row)}await loadMine()}catch(err){alert(err.message)}};
 if(await UniInject.validSession())await openApp();
})();
