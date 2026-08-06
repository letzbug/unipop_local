(function(){
  const cfg=window.UNIPOP_CONFIG;
  const cleanHtml=s=>String(s||'')
    .replace(/<br\s*\/?>/gi,' ')
    .replace(/<[^>]*>/g,' ')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/\s+/g,' ')
    .trim();

  function parseDate(v){
    if(!v) return null;
    const s=String(v).trim();
    let m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(m) return new Date(+m[3],+m[2]-1,+m[1],0,0,0,0);
    m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m) return new Date(+m[1],+m[2]-1,+m[3],0,0,0,0);
    const d=new Date(s);
    return isNaN(d)?null:new Date(d.getFullYear(),d.getMonth(),d.getDate(),0,0,0,0);
  }
  function dateFR(v){
    const d=parseDate(v);
    if(!d) return v?String(v):'';
    return new Intl.DateTimeFormat('fr-LU',{day:'2-digit',month:'long',year:'numeric'}).format(d);
  }
  function trainers(v){
    if(!Array.isArray(v)) return '';
    return v.map(x=>[x.prenom,x.nom].filter(Boolean).join(' ')).filter(Boolean).join(', ');
  }
  function place(a){
    if(!a) return '';
    if(typeof a==='string') return a;
    return [a.nom,a.localite].filter(Boolean).join(', ');
  }
  function normalize(x){
    const start=parseDate(x.dateDebut);
    return {
      id:String(x.coursId||x.id||x.coursCode||''),
      code:String(x.coursCode||x.coursId||x.id||''),
      title:String(x.intitule||''),
      subtitle:String(x.matiereNom||x.categorieNom||''),
      description:cleanHtml(x.description||''),
      info:cleanHtml(x.renseignements||''),
      date:dateFR(x.dateDebut),
      startDate:start?start.toISOString():'',
      dateEnd:dateFR(x.dateFin),
      time:String(x.horairePrevu||((x.horaires||[]).map(h=>[h.jour,h.heure,h.duree].filter(Boolean).join(' ')).join(' · '))||''),
      place:place(x.adresseCours),
      address:x.adresseCours||{},
      trainer:trainers(x.enseignants)||'UniPop',
      url:String(x.onlineRegistrationUrl||cfg.qrFallback),
      places:Number.isFinite(x.nbPlaces)?x.nbPlaces:null,
      registered:Number.isFinite(x.nbInscrits)?x.nbInscrits:null,
      level:String(x.niveau||''),
      language:String(x.langueCoursNom||''),
      category:String(x.categorieNom||''),
      subject:String(x.matiereNom||''),
      organiser:String(x.organisateur?.code||''),
      raw:x
    };
  }
  async function fetchOne(url){
    const r=await fetch(url,{cache:'no-store',mode:'cors',credentials:'omit',headers:{'Accept':'application/json,text/plain,*/*'}});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const text=await r.text();
    let d; try{d=JSON.parse(text)}catch(e){throw new Error('Antwort ist kein gültiges JSON')}
    if(Array.isArray(d)) return d;
    for(const k of ['cours','courses','items','data']) if(Array.isArray(d?.[k])) return d[k];
    throw new Error('Unbekannte JSON-Struktur');
  }
  async function loadCourses(){
    let lastErr;
    for(const url of cfg.jsonUrls){
      try{
        const raw=await fetchOne(url);
        const today=new Date(); today.setHours(0,0,0,0);
        const courses=raw
          .filter(x=>x.organisateur?.code===cfg.organiserCode)
          .map(normalize)
          .filter(c=>{
            const d=c.startDate?new Date(c.startDate):null;
            return !d || d>=today; // heute + Zukunft
          })
          .sort((a,b)=>{
            const da=a.startDate?new Date(a.startDate).getTime():Number.MAX_SAFE_INTEGER;
            const db=b.startDate?new Date(b.startDate).getTime():Number.MAX_SAFE_INTEGER;
            return da-db || a.title.localeCompare(b.title,'fr');
          });
        if(courses.length){window.UNIPOP_JSON_SOURCE=url;return courses}
      }catch(e){lastErr=e;console.warn('trainings.json failed:',url,e)}
    }
    throw new Error((lastErr?.message||'Unbekannter Fehler')+' | Quelle: '+(cfg.jsonUrls?.[0]||'keine'));
  }
  function shorten(text,max=245){
    const t=cleanHtml(text);
    if(t.length<=max) return t;
    const sentences=t.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[];
    let out='';
    for(const s0 of sentences){
      const s=s0.trim(); if(!s) continue;
      const candidate=(out?out+' ':'')+s;
      if(candidate.length>max) break;
      out=candidate;
    }
    if(out.length>=Math.min(90,max*.42)) return out;
    let cut=t.slice(0,max-1).replace(/\s+\S*$/,'').replace(/[,:;\-\s]+$/,'');
    return cut+'…';
  }
  window.UniData={loadCourses,normalize,shorten,cleanHtml,parseDate};
})();