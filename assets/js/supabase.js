window.UniRemote = (function(){
  const C=window.UNIPOP_SUPABASE||{};
  const enabled=()=>Boolean(C.enabled && C.url && C.anonKey);

  function headers(extra={}){
    return {
      apikey:C.anonKey,
      Authorization:'Bearer '+C.anonKey,
      'Content-Type':'application/json',
      Prefer:'return=representation',
      ...extra
    };
  }

  async function req(path,opts={}){
    if(!enabled()) throw new Error('Supabase nicht konfiguriert');
    const url=C.url.replace(/\/$/,'')+'/rest/v1/'+path;
    const controller=new AbortController();
    const timeoutMs=Math.max(1500,Number(opts.timeoutMs)||4500);
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const r=await fetch(url,{
        method:opts.method||'GET',
        headers:headers(opts.headers||{}),
        body:opts.body!==undefined?JSON.stringify(opts.body):undefined,
        cache:'no-store',
        signal:controller.signal
      });
      if(!r.ok){
        const txt=await r.text().catch(()=> '');
        throw new Error('Supabase '+r.status+(txt?' – '+txt:''));
      }
      if(r.status===204) return null;
      const t=await r.text();
      return t?JSON.parse(t):null;
    }catch(e){
      if(e?.name==='AbortError') throw new Error('Supabase timeout');
      throw e;
    }finally{
      clearTimeout(timer);
    }
  }

  function esc(v){return encodeURIComponent(String(v??''))}

  async function getDisplays(){
    const rows=await req('displays?select=*&order=name.asc');
    return rows||[];
  }

  async function ensureDefaultDisplays(defaults){
    if(!enabled()) return [];
    const rows=await getDisplays();
    const existing=new Set(rows.map(x=>x.slug));
    const missing=(defaults||[]).filter(x=>!existing.has(x.id)).map(x=>({
      slug:x.id,name:x.name,location:x.location||x.name,enabled:x.enabled!==false
    }));
    if(missing.length){
      await req('displays',{
        method:'POST',
        headers:{Prefer:'resolution=merge-duplicates,return=representation'},
        body:missing
      });
    }
    return getDisplays();
  }

  async function addDisplay(d){
    const rows=await req('displays',{
      method:'POST',
      body:{slug:d.id,name:d.name,location:d.location||d.name,enabled:d.enabled!==false}
    });
    return rows?.[0]||null;
  }

  async function getAssignment(slug){
    const rows=await req(
      'display_playlists?select=display_slug,name,duration,show_qr,show_print,items,updated_at&display_slug=eq.'+esc(slug)+'&limit=1'
    );
    const r=rows?.[0];
    if(!r)return null;
    return {
      name:r.name||'UniPop Auswahl',
      duration:Number(r.duration)||14,
      showQR:r.show_qr!==false,
      showPrint:r.show_print!==false,
      items:Array.isArray(r.items)?r.items:[],
      publishedAt:r.updated_at||''
    };
  }

  async function setAssignment(slug,payload){
    const body={
      display_slug:slug,
      name:payload.name||'UniPop Auswahl',
      duration:Number(payload.duration)||14,
      show_qr:payload.showQR!==false,
      show_print:payload.showPrint!==false,
      items:payload.items||[],
      updated_at:new Date().toISOString()
    };

    const rows=await req('display_playlists?on_conflict=display_slug',{
      method:'POST',
      headers:{Prefer:'resolution=merge-duplicates,return=representation'},
      body
    });
    return rows?.[0]||body;
  }

  async function heartbeat(slug,extra={}){
    const body={
      display_slug:slug,
      last_seen:new Date().toISOString(),
      course_code:extra.courseCode||null,
      course_title:extra.title||null,
      campaign:extra.campaign||null,
      slide_index:Number.isFinite(extra.slide)?extra.slide:null
    };
    await req('display_status?on_conflict=display_slug',{
      method:'POST',
      headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
      body
    });
  }

  async function getStatuses(){
    return await req('display_status?select=*')||[];
  }

  async function addPrint(evt){
    const body={
      display_slug:evt.screenId||evt.display_slug||'',
      course_code:evt.courseCode||'',
      course_title:evt.title||'',
      created_at:new Date().toISOString()
    };
    await req('print_events',{method:'POST',headers:{Prefer:'return=minimal'},body});
  }

  async function getPrintEvents(){
    return await req('print_events?select=*&order=created_at.desc&limit=5000')||[];
  }

  async function copyAssignment(source,target){
    const a=await getAssignment(source);
    if(!a?.items?.length) throw new Error('Am Quell-Standort ist keine Playlist gespeichert.');
    a.name=(a.name||'UniPop Auswahl')+' – Kopie';
    return setAssignment(target,a);
  }


  function imagePath(courseId){
    return encodeURIComponent(String(courseId||'course'));
  }

  function getPublicImageUrl(courseId){
    if(!enabled()) return '';
    return C.url.replace(/\/$/,'')+
      '/storage/v1/object/public/course-images/'+imagePath(courseId);
  }

  async function uploadImage(courseId,dataUrl){
    if(!enabled()) throw new Error('Supabase nicht konfiguriert');
    if(!dataUrl) throw new Error('Kein Bild vorhanden');

    const blob=await (await fetch(dataUrl)).blob();
    const url=C.url.replace(/\/$/,'')+
      '/storage/v1/object/course-images/'+imagePath(courseId);

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),10000);
    try{
      const r=await fetch(url,{
        method:'POST',
        headers:{
          apikey:C.anonKey,
          Authorization:'Bearer '+C.anonKey,
          'Content-Type':blob.type||'image/jpeg',
          'x-upsert':'true'
        },
        body:blob,
        signal:controller.signal
      });
      if(!r.ok){
        const txt=await r.text().catch(()=> '');
        throw new Error('Bild-Upload '+r.status+(txt?' – '+txt:''));
      }
      return getPublicImageUrl(courseId)+'?v='+Date.now();
    }catch(e){
      if(e?.name==='AbortError') throw new Error('Bild-Upload Timeout');
      throw e;
    }finally{
      clearTimeout(timer);
    }
  }

  return {
    enabled,
    getDisplays,
    ensureDefaultDisplays,
    addDisplay,
    getAssignment,
    setAssignment,
    heartbeat,
    getStatuses,
    addPrint,
    getPrintEvents,
    copyAssignment,
    uploadImage,
    getPublicImageUrl
  };
})();
