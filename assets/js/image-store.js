window.UniImageStore = (function(){
  const DB_NAME='unipop_display_images';
  const STORE='images';
  const VERSION=1;

  function db(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,VERSION);
      req.onupgradeneeded=()=>{
        const d=req.result;
        if(!d.objectStoreNames.contains(STORE)){
          d.createObjectStore(STORE,{keyPath:'courseId'});
        }
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('IndexedDB konnte nicht geöffnet werden'));
    });
  }

  async function set(courseId,dataUrl){
    const d=await db();
    return new Promise((resolve,reject)=>{
      const tx=d.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put({courseId:String(courseId),dataUrl,updatedAt:new Date().toISOString()});
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error||new Error('Bild konnte nicht gespeichert werden'));
    });
  }

  async function get(courseId){
    const d=await db();
    return new Promise((resolve,reject)=>{
      const tx=d.transaction(STORE,'readonly');
      const req=tx.objectStore(STORE).get(String(courseId));
      req.onsuccess=()=>resolve(req.result?.dataUrl||'');
      req.onerror=()=>reject(req.error||new Error('Bild konnte nicht geladen werden'));
    });
  }

  async function remove(courseId){
    const d=await db();
    return new Promise((resolve,reject)=>{
      const tx=d.transaction(STORE,'readwrite');
      tx.objectStore(STORE).delete(String(courseId));
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error||new Error('Bild konnte nicht entfernt werden'));
    });
  }

  async function clear(){
    const d=await db();
    return new Promise((resolve,reject)=>{
      const tx=d.transaction(STORE,'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error||new Error('Bildspeicher konnte nicht geleert werden'));
    });
  }

  return {set,get,remove,clear};
})();