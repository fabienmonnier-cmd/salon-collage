/* Navigation dans le hall — repérage manuel par stand, jamais GPS indoor supposé. */
'use strict';
(() => {
  const mapRoot = 'https://abeteefoameurope26.mapyourshow.com/8_0/exhview/index.cfm';
  const directory = 'https://www.adhesivesandbondingexpo-europe.com/exhibitor-list/';
  // Exemples relevés dans l'annuaire officiel le 4 novembre 2026. Liste non exhaustive.
  const official = [
    {name:'3F GmbH', booth:'307'}, {name:'ADESIA',booth:'810'},
    {name:'Akustifoam Teknik Sunger',booth:'217'},
    {name:'Alanto Limited',booth:'700'}, {name:'ALEMO d.o.o.',booth:'632'},
    {name:'Alessiohitech',booth:'221'},
    {name:'Anhui Yijiayi Technology',booth:'1001'},
    {name:'Aper S.r.l.',booth:'613'},
    {name:'ASTORPLAST Klebetechnik',booth:'725'}
  ];
  const el = id => document.getElementById(id);
  const normalize = s => String(s || '').trim().toUpperCase().replace(/[^0-9A-Z-]/g,'').slice(0,9);
  const valid = s => /^[0-9]{2,4}[A-Z]?$/.test(normalize(s));
  const clean = s => String(s || '').trim();
  const store = key => {try{return localStorage.getItem(key)||'';}catch{return '';}};
  const save = (key,val) => {try{localStorage.setItem(key,val);}catch{}};
  let current = normalize(store('salonCollageCurrentBooth'));
  let target = normalize(store('salonCollageDestinationBooth'));
  let targetName = store('salonCollageDestinationName');
  let scanStream=null,scanInterval=null,scanning=false;

  function known(){
    const seen=new Set();
    const result=[];
    const add=(name,booth,source)=>{
      const key=normalize(booth);if(!key||!name||seen.has(key+name.toLowerCase()))return;
      seen.add(key+name.toLowerCase());result.push({name:clean(name),booth:key,source});
    };
    (typeof entries!=='undefined'?entries:[]).forEach(e=>add(e.supplier,e.booth,'Visité'));
    official.forEach(e=>add(e.name,e.booth,'Annuaire'));
    return result;
  }
  function linkBooth(booth){const b=normalize(booth);return valid(b)?mapRoot+'?selectedBooth='+encodeURIComponent(b):mapRoot;}
  function setCurrent(v){
    const b=normalize(v);if(!valid(b)){showToast('Saisir un numéro de stand valide (ex. 725)');return;}
    current=b;save('salonCollageCurrentBooth',current);el('planCurrentStand').value=current;
    draw();showToast('Position repérée : stand '+current);
  }
  function setTarget(booth,name){
    const b=normalize(booth);if(!valid(b)){showToast('Numéro de stand requis (ex. 810)');return;}
    target=b;targetName=clean(name)||'Stand '+b;
    save('salonCollageDestinationBooth',target);
    save('salonCollageDestinationName',targetName);
    el('planDestinationStand').value=target;
    el('planDestinationName').value=targetName;
    draw();
  }
  function draw(){
    const active = !!target&&valid(target);
    const hasStart=valid(current);
    el('planPositionLabel').textContent=hasStart?'Stand '+current:'Position non définie';
    el('planTargetLabel').textContent=active?(targetName+' · stand '+target):'Destination à choisir';
    el('planLocateStart').href=hasStart?linkBooth(current):mapRoot;
    el('planLocateStart').textContent=hasStart?'Voir mon stand '+current+' sur le plan ↗':'Ouvrir le plan général ↗';
    el('planLocateTarget').href=active?linkBooth(target):mapRoot;
    el('planLocateTarget').textContent=active?'Localiser '+target+' sur le plan ↗':'Chercher le fournisseur sur le plan ↗';
    el('planArrived').disabled=!active;
    el('planCreateVisit').disabled=!active;
    if(!active)el('planGuidance').textContent='Chercher un fournisseur ci-dessous ou saisir un numéro de stand.';
    else if(!hasStart)el('planGuidance').textContent='Destination choisie. Indiquez un stand à proximité pour connaître votre point de départ.';
    else if(current===target)el('planGuidance').textContent='Vous êtes au stand de destination. Vous pouvez enregistrer la visite.';
    else el('planGuidance').textContent='Départ : stand '+current+' → arrivée : stand '+target+'. Ouvrez le plan officiel pour repérer les allées. Trajet automatique non disponible sans données de circulation validées.';
  }
  function search(){
    const q=clean(el('planQuery').value).toLowerCase();
    if(!q){el('planResults').innerHTML='<p class="plan-empty">Recherchez un exposant ou saisissez son numéro de stand. L’annuaire embarqué est partiel.</p>';return;}
    const found=known().filter(x=>x.name.toLowerCase().includes(q)||x.booth.includes(q)).slice(0,15);
    const holder=el('planResults');holder.replaceChildren();
    if(!found.length){const p=document.createElement('p');p.className='plan-empty';p.textContent='Aucun résultat local. Recherchez dans l’annuaire officiel ou saisissez le numéro de stand.';holder.appendChild(p);return;}
    for(const x of found){
      const btn=document.createElement('button');btn.type='button';btn.className='plan-result';
      const label=document.createElement('span');label.textContent=x.name;
      const badge=document.createElement('strong');badge.textContent='Stand '+x.booth;
      const meta=document.createElement('small');meta.textContent=x.source;
      btn.append(label,badge,meta);btn.addEventListener('click',()=>{setTarget(x.booth,x.name);el('planQuery').value=x.name;holder.replaceChildren();});
      holder.appendChild(btn);
    }
  }
  function recognizedStand(raw){
    const str=clean(raw);
    if(valid(str))return normalize(str);
    const match=str.match(/(?:selectedBooth=|(?:stand|booth|bth)\s*[:#=\/-]?\s*)([0-9]{2,4}[A-Z]?)/i);
    return match&&valid(match[1])?normalize(match[1]):'';
  }
  function stopScan(){
    scanning=false;
    if(scanInterval){clearInterval(scanInterval);scanInterval=null;}
    if(scanStream){scanStream.getTracks().forEach(track=>track.stop());scanStream=null;}
    const video=el('planCamera');video.pause();video.srcObject=null;
    el('planScanPanel').hidden=true;
  }
  async function scan(){
    if(!('BarcodeDetector' in window)){showToast('Scanner QR indisponible. Saisissez le stand manuellement.');return;}
    if(!navigator.mediaDevices?.getUserMedia){showToast('Caméra non disponible sur ce navigateur');return;}
    try{
      const scanner=new BarcodeDetector({formats:['qr_code']});
      scanStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});
      const video=el('planCamera');video.srcObject=scanStream;video.playsInline=true;el('planScanPanel').hidden=false;
      await video.play();scanning=true;
      let busy=false;
      scanInterval=setInterval(async()=>{
        if(!scanning||busy||video.readyState<2)return;
        busy=true;
        try{const codes=await scanner.detect(video);for(const code of codes){const b=recognizedStand(code.rawValue);if(b){setCurrent(b);stopScan();return;}if(code.rawValue){showToast('QR reconnu, mais sans numéro de stand identifiable');stopScan();return;}}}
        catch(err){console.warn('Erreur lecture QR',err);}
        finally{busy=false;}
      },650);
    }catch(e){stopScan();showToast('Caméra refusée ou scanner indisponible');}
  }
  function activate(){
    el('planCurrentStand').value=current;el('planDestinationStand').value=target;el('planDestinationName').value=targetName;
    draw();search();
  }
  function bind(){
    el('tabPlan').addEventListener('click',async()=>{await flushSave();setView('Plan');activate();});
    el('planBack').addEventListener('click',async()=>{stopScan();await returnHome();});
    el('planSetCurrent').addEventListener('click',()=>setCurrent(el('planCurrentStand').value));
    el('planSetTarget').addEventListener('click',()=>setTarget(el('planDestinationStand').value,el('planDestinationName').value));
    el('planQuery').addEventListener('input',search);
    el('planScanQR').addEventListener('click',scan);
    el('planStopScan').addEventListener('click',stopScan);
    el('planArrived').addEventListener('click',()=>{if(valid(target))setCurrent(target);});
    el('planCreateVisit').addEventListener('click',async()=>{
      if(!valid(target))return;
      stopScan();await newEntry();
      const supplier=el('entryForm').elements.namedItem('supplier');const booth=el('entryForm').elements.namedItem('booth');
      supplier.value=targetName.startsWith('Stand ')?'':targetName;
      booth.value=target;markSaving();
      supplier.focus({preventScroll:true});
      showToast('Fiche préparée pour le stand '+target);
    });
    el('planDirectory').href=directory;
    el('planOpenMap').href=mapRoot;
    el('planFrameWrapper').addEventListener('toggle',event=>{
      if(event.target.open && !el('planMapFrame').src)el('planMapFrame').src=mapRoot;
    });
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stopScan();});
    activate();
  }
  bind();
})();
