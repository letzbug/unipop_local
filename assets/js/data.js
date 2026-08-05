(function(){
  const cfg=window.UNIPOP_CONFIG;
  const cleanHtml=s=>String(s||'').replace(/<br\s*\/?>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
  function dateFR(v){
    if(!v) return '';
    const m=String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    let d=m?new Date(+m[3],+m[2]-1,+m[1]):new Date(v);
    if(isNaN(d)) return String(v);
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
    return {
      id:String(x.coursId||x.id||x.coursCode||''),
      code:String(x.coursCode||x.coursId||x.id||''),
      title:String(x.intitule||''),
      subtitle:String(x.matiereNom||x.categorieNom||''),
      description:cleanHtml(x.description||''),
      info:cleanHtml(x.renseignements||''),
      date:dateFR(x.dateDebut),
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
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const data=await r.json();
    if(!Array.isArray(data)) throw new Error('JSON root is not an array');
    return data;
  }
  async function loadCourses(){
    let lastErr;
    for(const url of cfg.jsonUrls){
      try{
        const raw=await fetchOne(url);
        const courses=raw.filter(x=>x.organisateur?.code===cfg.organiserCode).map(normalize);
        if(courses.length) return courses;
      }catch(e){lastErr=e; console.warn('trainings.json failed:',url,e)}
    }
    throw lastErr||new Error('trainings.json konnte nicht geladen werden');
  }
  function shorten(text,max=245){
    const t=cleanHtml(text);
    if(t.length<=max) return t;
    const sentences=t.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[];
    let out='';
    for(const s0 of sentences){
      const s=s0.trim();
      if(!s) continue;
      const candidate=(out?out+' ':'')+s;
      if(candidate.length>max) break;
      out=candidate;
    }
    if(out.length>=Math.min(90,max*.45)) return out;
    let cut=t.slice(0,max-1);
    cut=cut.replace(/\s+\S*$/,'').replace(/[,:;\-\s]+$/,'');
    return cut+'…';
  }
  window.UniData={loadCourses,normalize,shorten,cleanHtml};
})();
