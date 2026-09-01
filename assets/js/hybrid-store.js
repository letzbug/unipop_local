window.UniHybrid = (function(){
  const remote=()=>window.UniRemote?.enabled?.();

  async function getDisplays(defaults){
    let local=UniStore.getDisplays();
    const existing=new Set(local.map(x=>x.id));
    let changed=false;
    (defaults||[]).forEach(d=>{
      if(!existing.has(d.id)){local.push({...d});changed=true}
    });
    if(changed) UniStore.saveDisplays(local);

    if(remote()){
      try{
        const rows=await Promise.race([
          UniRemote.ensureDefaultDisplays(defaults),
          new Promise((_,rej)=>setTimeout(()=>rej(new Error('Supabase display timeout')),5000))
        ]);
        if(Array.isArray(rows) && rows.length){
          const seen=new Set();
          const mapped=rows
            .map(r=>({id:r.slug,name:r.name,location:r.location||r.name,enabled:r.enabled!==false}))
            .filter(d=>{
              if(!d.id || seen.has(d.id)) return false;
              seen.add(d.id);
              return true;
            });
          UniStore.saveDisplays(mapped);
          return mapped;
        }
      }catch(e){ console.warn('Remote displays unavailable, local fallback',e); }
    }
    return local;
  }

  async function addDisplay(name){
    const local=UniStore.addDisplay(name);
    if(remote()){
      try{
        // IMPORTANT: wait until the display really exists in Supabase before
        // the builder can copy/publish a playlist to it. Otherwise a playlist
        // may only exist in this browser's localStorage (race condition).
        const saved=await Promise.race([
          UniRemote.addDisplay(local),
          new Promise((_,rej)=>setTimeout(()=>rej(new Error('Supabase display save timeout')),5500))
        ]);
        return saved?{id:saved.slug,name:saved.name,location:saved.location||saved.name,enabled:saved.enabled!==false}:local;
      }catch(e){
        console.error('Remote addDisplay failed',e);
        if(!window.UNIPOP_SUPABASE?.localFallback) throw e;
        throw new Error('Der neue Screen konnte nicht in Supabase gespeichert werden. Bitte erneut versuchen.');
      }
    }
    return local;
  }

  async function getAssignment(id){
    const local=UniStore.getAssignment(id);
    if(remote()){
      try{
        const r=await Promise.race([
          UniRemote.getAssignment(id),
          new Promise((_,rej)=>setTimeout(()=>rej(new Error('Supabase assignment timeout')),4500))
        ]);
        if(r){
          try{ UniStore.setAssignment(id,r); }catch(_){}
          return r;
        }
      }catch(e){ console.warn('Remote assignment failed, local fallback',e); }
    }
    return local;
  }

  async function setAssignment(id,payload){
    UniStore.setAssignment(id,payload);
    if(remote()){
      try{
        return await Promise.race([
          UniRemote.setAssignment(id,payload),
          new Promise((_,rej)=>setTimeout(()=>rej(new Error('Supabase save timeout')),5500))
        ]);
      }catch(e){
        console.warn('Remote save failed, local copy kept',e);
        if(!window.UNIPOP_SUPABASE?.localFallback) throw e;
      }
    }
    return UniStore.getAssignment(id);
  }

  async function copyAssignment(source,target){
    const a=await getAssignment(source);
    if(!a?.items?.length) throw new Error('Am Quell-Standort ist keine Playlist gespeichert.');
    const clone=JSON.parse(JSON.stringify(a));
    clone.name=(a.name||'UniPop Auswahl')+' – Kopie';
    return setAssignment(target,clone);
  }

  function heartbeat(id,extra){
    UniStore.heartbeat(id,extra);
    if(remote()) UniRemote.heartbeat(id,extra).catch(e=>console.warn('Remote heartbeat failed',e));
  }

  function addPrint(evt){
    UniStore.addPrint(evt);
    if(remote()) UniRemote.addPrint(evt).catch(e=>console.warn('Remote print failed',e));
  }

  async function getStatuses(){
    const local=Object.entries(UniStore.getHeartbeats()).map(([display_slug,v])=>({
      display_slug,last_seen:v.ts,course_code:v.courseCode,course_title:v.title,campaign:v.campaign,slide_index:v.slide
    }));
    if(remote()){
      try{
        return await Promise.race([
          UniRemote.getStatuses(),
          new Promise((_,rej)=>setTimeout(()=>rej(new Error('Supabase status timeout')),4500))
        ]);
      }catch(e){ console.warn('Remote statuses failed, local fallback',e); }
    }
    return local;
  }

  async function getPrintEvents(){
    const local=UniStore.getPrints().map(x=>({
      display_slug:x.screenId,course_code:x.courseCode,course_title:x.title,created_at:x.ts
    }));
    if(remote()){
      try{
        return await Promise.race([
          UniRemote.getPrintEvents(),
          new Promise((_,rej)=>setTimeout(()=>rej(new Error('Supabase print timeout')),4500))
        ]);
      }catch(e){ console.warn('Remote prints failed, local fallback',e); }
    }
    return local;
  }


  async function saveCourseImage(courseId,dataUrl){
    // Always keep local preview copy.
    await UniImageStore.set(courseId,dataUrl);

    if(remote()){
      try{
        return await UniRemote.uploadImage(courseId,dataUrl);
      }catch(e){
        console.warn('Remote image upload failed; local copy kept',e);
        if(!window.UNIPOP_SUPABASE?.localFallback) throw e;
      }
    }
    return '';
  }

  function getRemoteImageUrl(courseId){
    return remote() ? UniRemote.getPublicImageUrl(courseId) : '';
  }

  return {remote,getDisplays,addDisplay,getAssignment,setAssignment,copyAssignment,heartbeat,addPrint,getStatuses,getPrintEvents,saveCourseImage,getRemoteImageUrl};
})();