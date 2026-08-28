window.UniInject = (function(){
  const C=window.UNIPOP_SUPABASE||{};
  const SESSION_KEY='unipop_inject_session_v1';
  const enabled=()=>Boolean(C.enabled&&C.url&&C.anonKey);
  const base=()=>String(C.url||'').replace(/\/$/,'');

  function jsonHeaders(token,extra={}){
    return {
      apikey:C.anonKey,
      Authorization:'Bearer '+(token||C.anonKey),
      'Content-Type':'application/json',
      ...extra
    };
  }
  async function responseJson(r){
    const t=await r.text();
    let data=null;
    try{data=t?JSON.parse(t):null}catch(_){data=t}
    if(!r.ok){
      const msg=(data&&typeof data==='object'&&(data.msg||data.message||data.error_description||data.hint||data.details))||String(data||r.statusText||'Erreur');
      throw new Error(msg);
    }
    return data;
  }
  function saveSession(s){
    if(!s){localStorage.removeItem(SESSION_KEY);return null}
    const clean={access_token:s.access_token||'',refresh_token:s.refresh_token||'',expires_at:s.expires_at||0,expires_in:s.expires_in||0,user:s.user||null};
    localStorage.setItem(SESSION_KEY,JSON.stringify(clean));
    return clean;
  }
  function session(){
    try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch(_){return null}
  }
  async function refresh(){
    const s=session();
    if(!s?.refresh_token)return null;
    const r=await fetch(base()+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:jsonHeaders(null),body:JSON.stringify({refresh_token:s.refresh_token})});
    return saveSession(await responseJson(r));
  }
  async function validSession(){
    let s=session();
    if(!s?.access_token)return null;
    const now=Math.floor(Date.now()/1000);
    if(s.expires_at&&s.expires_at-now<90){
      try{s=await refresh()}catch(_){saveSession(null);return null}
    }
    return s;
  }
  async function authFetch(path,opts={}){
    let s=await validSession();
    if(!s)throw new Error('Veuillez vous connecter.');
    let r=await fetch(path,{...opts,headers:{...jsonHeaders(s.access_token),...(opts.headers||{})}});
    if(r.status===401&&s.refresh_token){
      s=await refresh();
      r=await fetch(path,{...opts,headers:{...jsonHeaders(s.access_token),...(opts.headers||{})}});
    }
    return r;
  }
  async function rest(path,opts={},requiresAuth=true){
    if(!enabled())throw new Error('Supabase n’est pas configuré.');
    const url=base()+'/rest/v1/'+path;
    const r=requiresAuth?await authFetch(url,opts):await fetch(url,{...opts,headers:{...jsonHeaders(null),...(opts.headers||{})}});
    return responseJson(r);
  }
  async function rpc(name,args={},requiresAuth=true){
    return rest('rpc/'+name,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(args)},requiresAuth);
  }
  async function signIn(email,password){
    const r=await fetch(base()+'/auth/v1/token?grant_type=password',{method:'POST',headers:jsonHeaders(null),body:JSON.stringify({email:String(email||'').trim(),password})});
    return saveSession(await responseJson(r));
  }
  async function signUp(email,password,activationCode=''){
    const r=await fetch(base()+'/auth/v1/signup',{method:'POST',headers:jsonHeaders(null),body:JSON.stringify({email:String(email||'').trim(),password,data:{unipop_inject:true,inject_code:String(activationCode||'').trim().toUpperCase()}})});
    const data=await responseJson(r);
    if(data?.access_token)saveSession(data);
    return data;
  }
  async function signOut(){
    const s=session();
    if(s?.access_token){
      try{await fetch(base()+'/auth/v1/logout',{method:'POST',headers:jsonHeaders(s.access_token)})}catch(_){}
    }
    saveSession(null);
  }
  async function verifyInvite(email,code){
    const out=await rpc('verify_inject_invite',{p_email:String(email||'').trim().toLowerCase(),p_code:String(code||'').trim()},false);
    return out===true||(Array.isArray(out)&&out[0]===true);
  }
  async function myProfile(){
    const s=await validSession();
    if(!s?.user?.id)return null;
    const rows=await rest('inject_profiles?select=*&user_id=eq.'+encodeURIComponent(s.user.id)+'&limit=1');
    return rows?.[0]||null;
  }
  async function myScreens(){
    const s=await validSession();
    if(!s?.user?.id)return [];
    const rows=await rest('inject_user_screens?select=display_slug&user_id=eq.'+encodeURIComponent(s.user.id));
    const displays=await rest('displays?select=slug,name,location,enabled&enabled=eq.true&order=name.asc',{},false);
    const allowed=new Set((rows||[]).map(x=>x.display_slug));
    return (displays||[]).filter(d=>allowed.has(d.slug));
  }
  async function myInjections(){
    const s=await validSession();
    if(!s?.user?.id)return [];
    return await rest('media_injections?select=*&user_id=eq.'+encodeURIComponent(s.user.id)+'&order=created_at.desc')||[];
  }
  function safeExt(file){
    const n=String(file?.name||'image.jpg');
    const ext=(n.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
    return ['jpg','jpeg','png','webp'].includes(ext)?ext:'jpg';
  }
  async function uploadImage(file){
    const s=await validSession();
    if(!s?.user?.id)throw new Error('Veuillez vous connecter.');
    if(!file)throw new Error('Sélectionnez une image.');
    const id=(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(16).slice(2));
    const path=s.user.id+'/'+id+'.'+safeExt(file);
    const url=base()+'/storage/v1/object/inject-images/'+path.split('/').map(encodeURIComponent).join('/');
    const r=await fetch(url,{method:'POST',headers:{apikey:C.anonKey,Authorization:'Bearer '+s.access_token,'Content-Type':file.type||'image/jpeg','x-upsert':'false'},body:file});
    await responseJson(r);
    return {path,url:base()+'/storage/v1/object/public/inject-images/'+path.split('/').map(encodeURIComponent).join('/')};
  }
  async function removeImage(path){
    if(!path)return;
    const url=base()+'/storage/v1/object/inject-images/'+String(path).split('/').map(encodeURIComponent).join('/');
    const r=await authFetch(url,{method:'DELETE'});
    if(!r.ok)throw new Error('Impossible de supprimer l’image.');
  }
  async function createInjection(data){
    const s=await validSession();
    if(!s?.user?.id)throw new Error('Veuillez vous connecter.');
    const body={...data,user_id:s.user.id,enabled:true};
    const rows=await rest('media_injections',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(body)});
    return rows?.[0]||null;
  }
  async function updateInjection(id,patch){
    const rows=await rest('media_injections?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(patch)});
    return rows?.[0]||null;
  }
  async function deleteInjection(row){
    await rest('media_injections?id=eq.'+encodeURIComponent(row.id),{method:'DELETE',headers:{Prefer:'return=minimal'}});
    if(row?.image_path){
      try{
        const left=await rest('media_injections?select=id&image_path=eq.'+encodeURIComponent(row.image_path)+'&limit=1');
        if(!left?.length)await removeImage(row.image_path);
      }catch(e){console.warn('Image cleanup skipped',e)}
    }
  }
  async function getActiveInjections(screenSlug){
    if(!enabled())return [];
    const now=new Date().toISOString();
    try{
      const q='media_injections?select=id,screen_slug,image_url,starts_at,ends_at,duration_seconds,fit,organization,display_name,created_at&screen_slug=eq.'+encodeURIComponent(screenSlug)+'&enabled=eq.true&starts_at=lte.'+encodeURIComponent(now)+'&ends_at=gte.'+encodeURIComponent(now)+'&order=created_at.asc';
      return await rest(q,{},false)||[];
    }catch(e){
      // Compatibility rule: if Inject is not installed yet, the existing display must keep working.
      console.warn('Inject module unavailable; normal UniPop playlist continues.',e);
      return [];
    }
  }
  async function allProfiles(){return await rest('inject_profiles?select=*&order=created_at.desc')||[]}
  async function allUserScreens(){return await rest('inject_user_screens?select=*&order=display_slug.asc')||[]}
  async function allInvites(){return await rest('inject_invites?select=*&order=created_at.desc')||[]}
  async function allInjections(){return await rest('media_injections?select=*&order=created_at.desc&limit=500')||[]}
  async function allDisplays(){return await rest('displays?select=slug,name,location,enabled&order=name.asc',{},false)||[]}
  async function createInvite(payload){
    const rows=await rest('inject_invites',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
    return rows?.[0]||null;
  }
  async function updateInvite(id,patch){
    const rows=await rest('inject_invites?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(patch)});
    return rows?.[0]||null;
  }
  async function deleteInvite(id){return rest('inject_invites?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{Prefer:'return=minimal'}})}
  async function updateProfile(userId,patch){
    const rows=await rest('inject_profiles?user_id=eq.'+encodeURIComponent(userId),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(patch)});
    return rows?.[0]||null;
  }
  async function replaceUserScreens(userId,slugs){
    await rest('inject_user_screens?user_id=eq.'+encodeURIComponent(userId),{method:'DELETE',headers:{Prefer:'return=minimal'}});
    if(slugs?.length){
      await rest('inject_user_screens',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(slugs.map(display_slug=>({user_id:userId,display_slug})))});
    }
  }
  async function sha256(text){
    const bytes=new TextEncoder().encode(String(text||''));
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  function activationCode(){
    const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const a=new Uint32Array(8);crypto.getRandomValues(a);
    return [...a].map(v=>chars[v%chars.length]).join('');
  }

  return {enabled,session,validSession,signIn,signUp,signOut,verifyInvite,myProfile,myScreens,myInjections,uploadImage,removeImage,createInjection,updateInjection,deleteInjection,getActiveInjections,allProfiles,allUserScreens,allInvites,allInjections,allDisplays,createInvite,updateInvite,deleteInvite,updateProfile,replaceUserScreens,sha256,activationCode};
})();
