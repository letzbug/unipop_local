window.UniHybrid = (function(){
  const remote=()=>window.UniRemote?.enabled?.();

  async function getDisplays(defaults){
    if(remote()){
      try{
        const rows=await UniRemote.ensureDefaultDisplays(defaults);
        return rows.map(r=>({
          id:r.slug,name:r.name,location:r.location||r.name,enabled:r.enabled!==false
        }));
      }catch(e){
        console.error('Remote displays failed',e);
      }
    }
    return UniStore.getDisplays();
  }

  async function addDisplay(name){
    const local=UniStore.addDisplay(name);
    if(remote()){
      try{await UniRemote.addDisplay(local)}
      catch(e){console.error('Remote addDisplay failed',e)}
    }
    return local;
  }

  async function getAssignment(id){
    if(remote()){
      try{
        const r=await UniRemote.getAssignment(id);
        if(r)return r;
      }catch(e){console.error('Remote getAssignment failed',e)}
    }
    return UniStore.getAssignment(id);
  }

  async function setAssignment(id,payload){
    // always preserve local fallback
    UniStore.setAssignment(id,payload);

    if(remote()){
      try{return await UniRemote.setAssignment(id,payload)}
      catch(e){
        console.error('Remote setAssignment failed',e);
        if(!window.UNIPOP_SUPABASE.localFallback) throw e;
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

  async function heartbeat(id,extra){
    UniStore.heartbeat(id,extra);
    if(remote()){
      try{await UniRemote.heartbeat(id,extra)}
      catch(e){console.error('Remote heartbeat failed',e)}
    }
  }

  async function addPrint(evt){
    UniStore.addPrint(evt);
    if(remote()){
      try{await UniRemote.addPrint(evt)}
      catch(e){console.error('Remote print failed',e)}
    }
  }

  async function getStatuses(){
    if(remote()){
      try{return await UniRemote.getStatuses()}
      catch(e){console.error('Remote statuses failed',e)}
    }
    return Object.entries(UniStore.getHeartbeats()).map(([display_slug,v])=>({
      display_slug,last_seen:v.ts,course_code:v.courseCode,course_title:v.title,campaign:v.campaign,slide_index:v.slide
    }));
  }

  async function getPrintEvents(){
    if(remote()){
      try{return await UniRemote.getPrintEvents()}
      catch(e){console.error('Remote prints failed',e)}
    }
    return UniStore.getPrints().map(x=>({
      display_slug:x.screenId,course_code:x.courseCode,course_title:x.title,created_at:x.ts
    }));
  }

  return {remote,getDisplays,addDisplay,getAssignment,setAssignment,copyAssignment,heartbeat,addPrint,getStatuses,getPrintEvents};
})();
