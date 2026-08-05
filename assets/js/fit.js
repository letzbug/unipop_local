window.UniDisplayFit = function(){
  const title=document.getElementById('dTitle');
  const desc=document.getElementById('dDesc');
  if(title){
    let px=Math.min(window.innerWidth*0.045,88);
    const min=Math.max(34,window.innerWidth*0.022);
    title.style.fontSize=px+'px';
    while((title.scrollHeight>title.clientHeight || title.scrollWidth>title.clientWidth) && px>min){
      px-=2; title.style.fontSize=px+'px';
    }
  }
  if(desc){
    let px=Math.min(window.innerWidth*0.0125,24);
    const min=Math.max(14,window.innerWidth*0.008);
    desc.style.fontSize=px+'px';
    while(desc.scrollHeight>desc.clientHeight && px>min){px-=1;desc.style.fontSize=px+'px'}
  }
};