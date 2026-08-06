(function(){
  const P='unipop_display_suite_';
  const get=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(P+k));return v??d}catch(e){return d}};
  const set=(k,v)=>localStorage.setItem(P+k,JSON.stringify(v));

  function slugifyDisplayName(name){
    return String(name||'')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/ß/g,'ss')
      .replace(/[^a-z0-9]+/g,'-')
      .replace(/^-+|-+$/g,'')
      .slice(0,60);
  }

  function defaultDisplays(){
    return (window.UNIPOP_CONFIG?.screens||[]).map(x=>({...x}));
  }

  window.UniStore={
    // NEW: display registry
    getDisplays(){
      const saved=get('displays',null);
      if(Array.isArray(saved) && saved.length) return saved;
      const defs=defaultDisplays();
      set('displays',defs);
      return defs;
    },
    saveDisplays(displays){
      set('displays',displays);
      return displays;
    },
    addDisplay(name){
      const clean=String(name||'').trim();
      if(!clean) throw new Error('Name fehlt');
      const list=this.getDisplays();
      let id=slugifyDisplayName(clean)||('display-'+Date.now());
      const base=id;
      let n=2;
      while(list.some(x=>x.id===id)) id=base+'-'+n++;
      const d={id,name:clean,location:clean,enabled:true};
      list.push(d);
      this.saveDisplays(list);
      return d;
    },

    // ORIGINAL storage methods unchanged
    getAssignments(){return get('assignments',{})},
    setAssignment(screenId,payload){
      const a=this.getAssignments();
      a[screenId]={...payload,publishedAt:new Date().toISOString()};
      try{
        set('assignments',a);
      }catch(e){
        if(e && (e.name==='QuotaExceededError' || e.code===22)){
          throw new Error('Browser-Speicher ist voll. Die Playlist konnte nicht gespeichert werden.');
        }
        throw e;
      }
      this.log({type:'publish',screenId,count:payload.items?.length||0,campaign:payload.name||''});
      return a[screenId];
    },
    getAssignment(id){return this.getAssignments()[id]||null},
    getImages(){return get('images',{})},
    setImage(id,data){const x=this.getImages();if(data)x[id]=data;else delete x[id];set('images',x)},
    getImage(id){return this.getImages()[id]||''},
    getPrints(){return get('prints',[])},
    addPrint(e){const p=this.getPrints();p.push({...e,ts:new Date().toISOString()});set('prints',p);this.log({type:'print',...e})},
    heartbeat(screenId,extra={}){const h=get('heartbeats',{});h[screenId]={ts:new Date().toISOString(),...extra};set('heartbeats',h)},
    getHeartbeats(){return get('heartbeats',{})},
    log(e){const a=get('activity',[]);a.unshift({...e,ts:new Date().toISOString()});set('activity',a.slice(0,300))},
    canPrint(screenId){
      const now=Date.now(),cfg=UNIPOP_CONFIG,p=this.getPrints().filter(x=>x.screenId===screenId),
        hour=p.filter(x=>now-new Date(x.ts).getTime()<3600000);
      if(hour.length>=cfg.maxPrintsPerHour)return{ok:false,reason:'Limite horaire atteinte'};
      const last=p.length?new Date(p[p.length-1].ts).getTime():0,
        remain=Math.ceil((cfg.printCooldownSeconds*1000-(now-last))/1000);
      return remain>0?{ok:false,reason:`Veuillez attendre ${remain}s`}:{ok:true}
    },
    stats(){
      const p=this.getPrints(),n=new Date(),d=new Date(n.getFullYear(),n.getMonth(),n.getDate()),
        w=new Date(d);w.setDate(w.getDate()-((w.getDay()+6)%7));
      const y=new Date(n.getFullYear(),0,1),cnt=s=>p.filter(x=>new Date(x.ts)>=s).length;
      return{today:cnt(d),week:cnt(w),year:cnt(y),total:p.length}
    },
    byCourse(){
      const m={};
      this.getPrints().forEach(x=>{
        const k=x.courseCode||x.title||'—';
        m[k]??={code:k,title:x.title||k,total:0};
        m[k].total++
      });
      return Object.values(m).sort((a,b)=>b.total-a.total)
    }
  };
})();
