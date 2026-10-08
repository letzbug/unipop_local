/* UniPop lightweight instant-refresh channel.
   Purpose: tell a running display that its playlist was just published.
   No images or playlist payloads are sent through Realtime; only a tiny signal.
   The existing 5-minute REST poll remains as a fallback. */
window.UniRealtime = (function(){
  const C = window.UNIPOP_SUPABASE || {};
  let client = null;
  const channels = new Map();

  function enabled(){
    return C.enabled !== false && Boolean(C.url && C.anonKey && window.supabase?.createClient);
  }

  function getClient(){
    if(!enabled()) return null;
    if(!client){
      client = window.supabase.createClient(C.url, C.anonKey, {
        auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false},
        realtime:{params:{eventsPerSecond:2}}
      });
    }
    return client;
  }

  function channelName(slug){
    return 'unipop-display-refresh-' + String(slug || '').replace(/[^a-zA-Z0-9_-]/g,'_');
  }

  async function notifyDisplay(slug){
    const c = getClient();
    if(!c || !slug) return false;
    const key = 'send:' + slug;
    let ch = channels.get(key);
    if(!ch){
      ch = c.channel(channelName(slug), {config:{broadcast:{ack:true}}});
      channels.set(key,ch);
      await new Promise((resolve)=>{
        let done=false;
        const t=setTimeout(()=>{if(!done){done=true;resolve();}},1800);
        ch.subscribe((status)=>{
          if(!done && status==='SUBSCRIBED'){
            done=true; clearTimeout(t); resolve();
          }
        });
      });
    }
    try{
      const result = await ch.send({
        type:'broadcast',
        event:'playlist-published',
        payload:{display_slug:String(slug), ts:Date.now()}
      });
      return result === 'ok' || result === 'timed out' ? result === 'ok' : true;
    }catch(err){
      console.warn('Realtime refresh signal failed; 5-minute fallback remains active.',err);
      return false;
    }
  }

  function listenDisplay(slug,onRefresh){
    const c = getClient();
    if(!c || !slug || typeof onRefresh!=='function') return ()=>{};
    const key = 'listen:' + slug;
    if(channels.has(key)) return ()=>{};

    let lastSignal=0;
    const ch = c.channel(channelName(slug));
    ch.on('broadcast',{event:'playlist-published'},()=>{
      const now=Date.now();
      if(now-lastSignal<1500) return;
      lastSignal=now;
      try{ onRefresh(); }catch(err){ console.error('Realtime display refresh failed',err); }
    }).subscribe((status)=>{
      if(status==='CHANNEL_ERROR' || status==='TIMED_OUT'){
        console.warn('Realtime unavailable; display keeps 5-minute polling fallback.');
      }
    });
    channels.set(key,ch);
    return ()=>{
      try{ c.removeChannel(ch); }catch(_){}
      channels.delete(key);
    };
  }

  return {enabled,notifyDisplay,listenDisplay};
})();
