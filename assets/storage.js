(function(){
  const KEY='unipop-local-display-data-v2';
  function load(){
    try{return JSON.parse(localStorage.getItem(KEY))||{prints:[],heartbeat:null,currentCourse:null}}catch(e){return{prints:[],heartbeat:null,currentCourse:null}}
  }
  function save(data){localStorage.setItem(KEY,JSON.stringify(data))}
  function addPrint(course){const d=load();d.prints.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),displayId:UNIPOP_CONFIG.displayId,courseId:course.id,title:course.title,timestamp:new Date().toISOString()});save(d)}
  function heartbeat(course){const d=load();d.heartbeat=new Date().toISOString();d.currentCourse=course?{id:course.id,title:course.title}:d.currentCourse;save(d)}
  function reset(){localStorage.removeItem(KEY)}
  function prints(){return load().prints||[]}
  window.UniPopStore={load,save,addPrint,heartbeat,reset,prints};
})();
