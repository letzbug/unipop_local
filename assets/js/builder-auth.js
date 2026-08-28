(function(){
  const $=id=>document.getElementById(id);
  const scripts=[
    'assets/js/config.js',
    'assets/js/store.js',
    'assets/js/supabase.js',
    'assets/js/hybrid-store.js',
    'assets/js/image-store.js',
    'assets/js/data.js',
    'assets/js/builder.js'
  ];
  let started=false;

  function message(text,type='err'){
    const el=$('builderAuthMsg');
    el.textContent=text||'';
    el.className='auth-msg'+(text?' show '+type:'');
  }
  function setBusy(on){
    const b=$('builderLoginBtn');
    b.disabled=on;
    b.textContent=on?'Prüfe Zugang…':'Display Builder öffnen';
  }
  function loadScript(src){
    return new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=src;
      s.onload=resolve;
      s.onerror=()=>reject(new Error('Datei konnte nicht geladen werden: '+src));
      document.body.appendChild(s);
    });
  }
  async function startBuilder(profile){
    if(started)return;
    started=true;
    $('builderAdminIdentity').textContent=profile.display_name||profile.email||'Administrator';
    $('builderAuth').classList.add('hidden');
    $('builderApp').classList.remove('hidden');
    try{
      for(const src of scripts) await loadScript(src);
    }catch(err){
      started=false;
      $('builderApp').classList.add('hidden');
      $('builderAuth').classList.remove('hidden');
      message(err.message||String(err));
    }
  }
  async function authorize(){
    const s=await UniInject.validSession();
    if(!s)return false;
    const p=await UniInject.myProfile();
    if(!p||p.active===false||p.role!=='admin'){
      throw new Error('Dieser Zugang ist nicht für den Display Builder autorisiert.');
    }
    await startBuilder(p);
    return true;
  }

  $('builderLoginForm').addEventListener('submit',async e=>{
    e.preventDefault();
    message('');setBusy(true);
    try{
      await UniInject.signIn($('builderEmail').value,$('builderPassword').value);
      await authorize();
    }catch(err){
      try{await UniInject.signOut()}catch(_){}
      message(err.message||'Anmeldung fehlgeschlagen.');
    }finally{setBusy(false)}
  });
  $('builderLogout').addEventListener('click',async()=>{
    await UniInject.signOut();
    location.reload();
  });

  (async()=>{
    try{
      if(!UniInject.enabled())throw new Error('Supabase ist nicht konfiguriert.');
      await authorize();
    }catch(err){
      message(err.message||String(err));
    }
  })();
})();
