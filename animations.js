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

// Logo Cash Boost animé : favicon, barre du haut et écran de connexion
(function(){
  function addLogo(){
    try{
      if(!document.querySelector('link[rel~="icon"]')){
        var l=document.createElement('link');
        l.rel='icon';l.type='image/svg+xml';l.href='logo-mark.svg';
        document.head.appendChild(l);
      }
      var brand=document.querySelector('.topbar .brand');
      if(brand&&!brand.querySelector('.brand-logo')){
        var im=new Image();
        im.src='logo-mark.svg';im.alt='';im.className='brand-logo';
        im.setAttribute('aria-hidden','true');
        im.style.cssText='width:30px;height:30px;display:block;flex:none';
        brand.insertBefore(im,brand.firstChild);
        brand.style.display='inline-flex';
        brand.style.alignItems='center';
        brand.style.gap='8px';
      }
      var au=document.querySelector('.auth-brand .logo');
      if(au&&au.getAttribute('src')!=='logo-mark.svg'){
        au.src='logo-mark.svg';
        au.style.cssText='width:84px;height:84px;border-radius:0;box-shadow:none;background:none;border:0;padding:0;overflow:visible';
      }
    }catch(_){}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addLogo);
  else addLogo();
})();

// Intro de l'écran de démarrage : l'anneau se dessine, le « $ » apparaît, puis le nom monte en fondu
(function(){
  try{
    var svg=document.querySelector('#bootSplash .cbl');
    if(!svg)return;
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    var ring=svg.querySelector('circle[stroke="url(#cbl-ring)"]');
    if(ring){
      ring.setAttribute('class','cbl-ring');
      ring.setAttribute('pathLength','1000');
      ring.setAttribute('transform','rotate(-90 200 200)');
    }
    var st=document.createElement('style');
    st.textContent=
      '.cbl .cbl-ring{stroke-dasharray:1000;stroke-dashoffset:1000;animation:cblRing .9s .1s cubic-bezier(.5,0,.2,1) forwards}'+
      '.cbl .cbl-coin{transform:scale(0);animation:cblPop .6s .5s cubic-bezier(.2,1.5,.4,1) forwards,cblPulse 3.2s 1.2s ease-in-out infinite}'+
      '#bootSplash .splash-title,#bootSplash .splash-tag{opacity:0;animation:cblRise .6s ease-out forwards}'+
      '#bootSplash .splash-title{animation-delay:.9s}#bootSplash .splash-tag{animation-delay:1.1s}'+
      '@keyframes cblRing{to{stroke-dashoffset:0}}'+
      '@keyframes cblPop{to{transform:scale(1)}}'+
      '@keyframes cblRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(st);
  }catch(_){}
})();
