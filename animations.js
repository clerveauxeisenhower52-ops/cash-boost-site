document.addEventListener('DOMContentLoaded',function(){
  try{
    var els=document.querySelectorAll('.cb-rv,.cbs-card');
    if('IntersectionObserver' in window){
      var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.12});
      els.forEach(function(el){io.observe(el);});
      setTimeout(function(){els.forEach(function(el){el.classList.add('in');});},4000);
    }else{els.forEach(function(el){el.classList.add('in');});}
  }catch(_){document.querySelectorAll('.cb-rv,.cbs-card').forEach(function(el){el.classList.add('in');});}
  var b=document.getElementById('cbhExplore');
  if(!b)return;
  b.addEventListener('click',function(){
    var t=document.getElementById('serviceSearch')||document.getElementById('servicesList');
    var el=(t&&t.closest('.cb-tools'))||document.getElementById('servicesList');
    if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
  });
});
