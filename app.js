/* Salon Collage — offline-first, local-only field capture. No API calls or remote dependencies. */
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const KEYS = ['supplier','booth','contact','reference','application','benefit','notes','priority','nextAction','actionDetail','solutionOther','tapeDetails','activationOther','activationConditions','functionsOther','liaisonOther','processOther','surfaceOther','technicalNotes'];
const TAXONOMY = {
  solution: ['Colle','Scotch / ruban adhésif','Film / pastille adhésive','Autre'],
  activation: ['UV','Chaleur','Pression (PSA)','Humidité','Air ambiant','Mélange 2K','Hotmelt (refroidissement)','Autre'],
  functions: ['Positionnement','Structurel','Optique','Étanchéité','Blocage / freinage','Protection','Maintien','Autre'],
  liaison: ['Rigide','Semi-souple','Souple','Autre'],
  process: ['Manuel','Jetting','Dispensing','Robotisé','UV LED','UV Mercure','1K','2K','Autre'],
  surface: ['IPA','Dégraissage','Plasma','Corona','Primaire','Micro-abrasion','Nettoyage optique','Autre']
};
const TAX_DOM = {solution:'#solutionChips',activation:'#activationChips',functions:'#functionChips',liaison:'#liaisonChips',process:'#processChips',surface:'#surfaceChips'};
const ACTION_LABELS = {samples:'Échantillons',test:'Essai à organiser',documentation:'Documentation',contact:'À recontacter',none:'Aucune action','':'À définir'};
const PRIORITY_LABELS = {high:'Prioritaire',medium:'À regarder',low:'Information'};
const VIEWS = ['Home','Edit','Plan','Export'];
const initialEntry = () => ({
  id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+'-'+Math.random().toString(36).slice(2),
  createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
  supplier:'',booth:'',contact:'',reference:'',application:'',benefit:'',notes:'',priority:'medium',nextAction:'',actionDetail:'',
  solutionOther:'',tapeDetails:'',activationOther:'',activationConditions:'',functionsOther:'',liaisonOther:'',processOther:'',surfaceOther:'',technicalNotes:'',
  solution:[],activation:[],functions:[],liaison:[],process:[],surface:[]
});
let db, entries=[], selectedId=null, saveTimer=null, selectedFilter='all', activeView='Home', recorder=null, audioStream=null, audioChunks=[];
let toastTimer, editorUpdateCounter=0;

function showToast(message){ const el=$('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3000); }
function displayDate(date){try{return new Intl.DateTimeFormat('fr-CH',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(date));}catch{return '-'}}
function escapeHtml(raw){return String(raw??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function uid(){return (crypto.randomUUID?.() || Date.now()+'-'+Math.random().toString(36).slice(2));}
function csvSafe(x){let s=String(x??'');if(/^[=+@\-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}

function openDb(){return new Promise((resolve,reject)=>{
  if(!('indexedDB' in window))return reject(new Error('IndexedDB non disponible'));
  let req=indexedDB.open('salonCollageLocal',1);
  req.onupgradeneeded=()=>{
    const db=req.result;
    if(!db.objectStoreNames.contains('entries'))db.createObjectStore('entries',{keyPath:'id'});
    if(!db.objectStoreNames.contains('media')){const store=db.createObjectStore('media',{keyPath:'id'});store.createIndex('byEntry','entryId');}
  };
  req.onerror=()=>reject(req.error);
  req.onsuccess=()=>resolve(req.result);
});}
function transact(table,mode,action){return new Promise((resolve,reject)=>{
  const tx=db.transaction(table,mode), store=tx.objectStore(table);let result;
  tx.onerror=()=>reject(tx.error||new Error('Échec de stockage'));
  tx.oncomplete=()=>resolve(result);
  action(store,(x)=>{result=x});
});}
function storeAll(table){return transact(table,'readonly',(s,set)=>{let r=s.getAll();r.onsuccess=()=>set(r.result);});}
function storePut(table,obj){return transact(table,'readwrite',s=>s.put(obj));}
function storeDelete(table,id){return transact(table,'readwrite',s=>s.delete(id));}
function byEntry(entryId){return transact('media','readonly',(s,set)=>{let r=s.index('byEntry').getAll(entryId);r.onsuccess=()=>set(r.result);});}
function mediaCount(entryId){return transact('media','readonly',(s,set)=>{let r=s.index('byEntry').count(entryId);r.onsuccess=()=>set(r.result);});}
async function refreshEntries(){entries=(await storeAll('entries')).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));renderList();}
function getCurrent(){return entries.find(e=>e.id===selectedId);}
function updateNetwork(){const offline=!navigator.onLine;const badge=$('#networkBadge');badge.classList.toggle('offline',offline);$('#networkText').textContent=offline?'Hors connexion':'Stockage local';}
function setView(name){activeView=name;VIEWS.forEach(v=>$('#view'+v).hidden=v!==name);$('#tabHome').classList.toggle('active',name==='Home');$('#tabPlan').classList.toggle('active',name==='Plan');$('#tabExport').classList.toggle('active',name==='Export');window.scrollTo({top:0,behavior:'instant'});}

function renderList(){
  $('#statTotal').textContent=entries.filter(e=>e.supplier.trim()).length;
  $('#statInterest').textContent=entries.filter(e=>e.priority==='high'&&e.supplier.trim()).length;
  $('#statActions').textContent=entries.filter(e=>e.nextAction&&!['none'].includes(e.nextAction)&&e.supplier.trim()).length;
  const term=$('#searchInput').value.trim().toLocaleLowerCase('fr');
  const visible=entries.filter(e=>{
    if(!e.supplier.trim())return false;
    if(selectedFilter==='high'&&e.priority!=='high')return false;
    if(selectedFilter==='todo'&&(!e.nextAction||e.nextAction==='none'))return false;
    return !term || [e.supplier,e.booth,e.contact,e.reference,e.application,e.benefit].some(x=>String(x||'').toLocaleLowerCase('fr').includes(term));
  });
  $('#emptyState').hidden=!!visible.length;
  $('#entriesList').innerHTML=visible.map(e=>{
    const synopsis=[e.reference,e.application,e.benefit].filter(Boolean).join(' · ')||'Fiche créée — ajouter une solution ou une application';
    return `<button type="button" class="entry-card" data-entry="${escapeHtml(e.id)}">
      <div class="entry-topline"><span class="entry-date">${escapeHtml(displayDate(e.createdAt))}</span><span class="priority-badge ${escapeHtml(e.priority)}">${escapeHtml(PRIORITY_LABELS[e.priority]||'À regarder')}</span></div>
      <h3>${escapeHtml(e.supplier)}</h3><p class="entry-detail">${escapeHtml(synopsis)}</p>
      <div class="entry-bottom"><span class="entry-action">${escapeHtml(ACTION_LABELS[e.nextAction]||'À définir')}</span><span class="entry-arrow">↗</span></div>
    </button>`;
  }).join('');
  $$('#entriesList [data-entry]').forEach(button=>button.addEventListener('click',()=>openEditor(button.dataset.entry)));
}
function renderTaxonomy(entry){Object.entries(TAX_DOM).forEach(([key,dom])=>{
  $(dom).innerHTML=TAXONOMY[key].map(value=>`<button type="button" class="tech-chip ${(entry[key]||[]).includes(value)?'selected':''}" data-group="${key}" data-value="${escapeHtml(value)}">${escapeHtml(value)}</button>`).join('');
});}
function renderEditor(entry){
  KEYS.forEach(k=>{const e=$('#entryForm').elements.namedItem(k);if(e)e.value=entry[k]|| (k==='priority'?'medium':'');});
  $('#editorHeading').textContent=entry.supplier?.trim()||'Nouvelle visite';
  $('#entryCounter').textContent='FICHE · '+displayDate(entry.createdAt).toLocaleUpperCase('fr');
  $('#saveStatus').textContent='Enregistré sur ce téléphone';
  renderTaxonomy(entry);
  $('#advancedDetails').open=false;
  renderMedia(entry.id);
}
async function openEditor(id){
  await flushSave();
  selectedId=id;
  const entry=getCurrent();
  if(!entry){showToast('Fiche introuvable');return;}
  renderEditor(entry);setView('Edit');$('#supplier').focus({preventScroll:true});
}
async function newEntry(){
  await flushSave();
  const entry=initialEntry();await storePut('entries',entry);entries.unshift(entry);
  selectedId=entry.id;renderEditor(entry);setView('Edit');renderList();$('#supplier').focus({preventScroll:true});
}
function formToEntry(){const old=getCurrent();if(!old)return null;
  const out={...old,updatedAt:new Date().toISOString()};
  KEYS.forEach(k=>{const f=$('#entryForm').elements.namedItem(k);if(f)out[k]=f.value});
  Object.keys(TAX_DOM).forEach(k=>out[k]=[...$$(TAX_DOM[k]+' .tech-chip.selected')].map(x=>x.dataset.value));
  return out;
}
function markSaving(){
  $('#saveStatus').textContent='Enregistrement...';
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>persistForm(),500);
}
async function persistForm(){
  clearTimeout(saveTimer);saveTimer=null;
  if(!selectedId)return;
  const entry=formToEntry();if(!entry)return;
  const seq=++editorUpdateCounter;
  try{await storePut('entries',entry);
    const idx=entries.findIndex(e=>e.id===entry.id);
    if(idx>=0)entries[idx]=entry;
    if(activeView==='Edit'&&seq===editorUpdateCounter)$('#saveStatus').textContent='Enregistré sur ce téléphone';
    $('#editorHeading').textContent=entry.supplier.trim()||'Nouvelle visite';
    renderList();
  }catch(e){console.error(e);$('#saveStatus').textContent='⚠ Sauvegarde impossible';showToast('Échec de sauvegarde : vérifier le stockage');}
}
async function flushSave(){if(saveTimer)await persistForm();}
async function returnHome(){
  const recordingInProgress=!!recorder&&recorder.state==='recording';
  if(recordingInProgress){stopRecording();showToast('Mémo vocal terminé');}
  await flushSave();
  // Remove an entirely untouched draft; never hide real captures from an export.
  const entry=getCurrent();
  if(!recordingInProgress && entry && ![entry.supplier,entry.booth,entry.contact,entry.reference,entry.application,entry.benefit,entry.notes,entry.actionDetail,...KEYS.filter(k=>k.endsWith('Other')||['tapeDetails','activationConditions','technicalNotes'].includes(k)).map(k=>entry[k])].some(v=>String(v||'').trim()) && !Object.keys(TAX_DOM).some(k=>(entry[k]||[]).length) && !entry.nextAction && entry.priority==='medium' && !(await mediaCount(entry.id))){
    await storeDelete('entries',entry.id);
  }
  selectedId=null;await refreshEntries();setView('Home');
}
async function deleteCurrent(){if(!selectedId)return;
  await flushSave();
  const entry=getCurrent();
  if(!confirm(`Supprimer la fiche « ${entry?.supplier||'sans nom'} » et toutes ses photos / audios ?`))return;
  clearTimeout(saveTimer);saveTimer=null;
  const mid=selectedId;
  const all=await byEntry(mid);
  for(const m of all)await storeDelete('media',m.id);
  await storeDelete('entries',mid);
  selectedId=null;await refreshEntries();setView('Home');showToast('Fiche supprimée');
}

async function processPhoto(file){
  // Downsize large camera photos for reliable mobile storage and compact exports.
  const image=await createImageBitmap(file);
  const max=1600,ratio=Math.min(1,max/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*ratio);canvas.height=Math.round(image.height*ratio);
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas indisponible');ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close?.();
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Compression photo impossible')),'image/jpeg',.8));
  return blob;
}
async function addPhoto(file,kind){if(!file||!selectedId)return;
  const parent=selectedId;
  try{
    showToast('Traitement de la photo...');
    const blob=await processPhoto(file);
    await storePut('media',{id:uid(),entryId:parent,kind,blob,mime:'image/jpeg',name:(kind==='product'?'solution':'contact')+'.jpg',createdAt:new Date().toISOString()});
    if(selectedId===parent)await renderMedia(parent);showToast('Photo enregistrée hors ligne');
  }catch(e){console.error(e);showToast('Impossible d’enregistrer cette photo');}
}
async function renderMedia(entryId){
  const all=await byEntry(entryId);if(selectedId!==entryId)return;
  const pics=all.filter(x=>x.kind==='product'||x.kind==='contact');
  const gallery=$('#photoGallery');
  gallery.querySelectorAll('img[data-bloburl]').forEach(el=>URL.revokeObjectURL(el.dataset.bloburl));
  gallery.innerHTML=pics.map(item=>`<div class="photo-thumb"><img data-media="${escapeHtml(item.id)}" alt="Photo ${escapeHtml(item.kind)}"/><button data-remove="${escapeHtml(item.id)}" type="button" aria-label="Supprimer la photo">×</button><span>${item.kind==='product'?'Solution':'Contact'}</span></div>`).join('');
  for(const item of pics){const img=gallery.querySelector(`img[data-media="${CSS.escape(item.id)}"]`);if(img){const url=URL.createObjectURL(item.blob);img.src=url;img.dataset.bloburl=url;}}
  gallery.querySelectorAll('button[data-remove]').forEach(btn=>btn.addEventListener('click',()=>deleteMedia(btn.dataset.remove,entryId)));
  const sounds=all.filter(x=>x.kind==='audio'),audio=$('#audioList');
  audio.querySelectorAll('audio[data-bloburl]').forEach(el=>URL.revokeObjectURL(el.dataset.bloburl));
  audio.innerHTML=sounds.map((m,i)=>`<div class="audio-row"><audio controls preload="none" data-media="${escapeHtml(m.id)}"></audio><button type="button" data-remove="${escapeHtml(m.id)}" aria-label="Supprimer le mémo vocal">✕</button></div>`).join('');
  for(const item of sounds){const el=audio.querySelector(`audio[data-media="${CSS.escape(item.id)}"]`);if(el){const url=URL.createObjectURL(item.blob);el.src=url;el.dataset.bloburl=url;}}
  audio.querySelectorAll('button[data-remove]').forEach(btn=>btn.addEventListener('click',()=>deleteMedia(btn.dataset.remove,entryId)));
}
async function deleteMedia(id,entryId){if(!confirm('Supprimer ce média ?'))return;
  await storeDelete('media',id);if(selectedId===entryId)await renderMedia(entryId);showToast('Média supprimé');
}
async function toggleRecording(){
  if(recorder&&recorder.state==='recording'){stopRecording();return;}
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){showToast('Enregistrement audio non pris en charge');return;}
  const capturedId=selectedId;
  try{
    audioStream=await navigator.mediaDevices.getUserMedia({audio:true});
    if(!selectedId||selectedId!==capturedId){audioStream.getTracks().forEach(t=>t.stop());return;}
    const formats=['audio/webm;codecs=opus','audio/webm','audio/mp4'];
    const kind=formats.find(x=>MediaRecorder.isTypeSupported(x));
    recorder=new MediaRecorder(audioStream,kind?{mimeType:kind}:undefined);audioChunks=[];
    recorder.ondataavailable=e=>{if(e.data?.size)audioChunks.push(e.data);};
    recorder.onstop=async()=>{
      const blob=new Blob(audioChunks,{type:recorder?.mimeType||'audio/webm'});
      audioStream?.getTracks().forEach(t=>t.stop());audioStream=null;
      $('#audioButton').classList.remove('recording');$('#audioButton').textContent='● Enregistrer';
      if(blob.size>0){try{await storePut('media',{id:uid(),entryId:capturedId,kind:'audio',blob,mime:blob.type,name:'memo-audio',createdAt:new Date().toISOString()});if(selectedId===capturedId)await renderMedia(capturedId);showToast('Mémo vocal enregistré');}catch(e){console.error(e);showToast('Mémo vocal non sauvegardé');}}
    };
    recorder.start();$('#audioButton').classList.add('recording');$('#audioButton').textContent='■ Terminer';
  }catch(e){console.error(e);showToast('Micro non autorisé ou indisponible');}
}
function stopRecording(){if(recorder?.state==='recording')recorder.stop();}

function toCsv(rows){
  const columns=[['Date','createdAt'],['Fournisseur','supplier'],['Stand','booth'],['Contact','contact'],['Solution / référence','reference'],['Application','application'],['Intérêt / gain','benefit'],['Notes','notes'],['Priorité','priority'],['Action','nextAction'],['Précision action','actionDetail'],['Nature de solution','solution'],['Nature - autre','solutionOther'],['Ruban / film - caractéristiques','tapeDetails'],['Prise / activation','activation'],['Activation - autre','activationOther'],['Conditions de prise','activationConditions'],['Axe 1 Fonction','functions'],['Fonction - autre','functionsOther'],['Axe 2 Liaison','liaison'],['Liaison - autre','liaisonOther'],['Axe 3 Industrialisation','process'],['Industrialisation - autre','processOther'],['Axe 4 Surface','surface'],['Surface - autre','surfaceOther'],['Notes techniques','technicalNotes']];
  return '\ufeff'+[columns.map(x=>csvSafe(x[0])).join(';'),...rows.map(row=>columns.map(([,k])=>csvSafe(Array.isArray(row[k])?row[k].join(' / '):k==='nextAction'?(ACTION_LABELS[row[k]]||''):k==='priority'?(PRIORITY_LABELS[row[k]]||''):row[k])).join(';'))].join('\r\n');
}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30_000);}
function dateStamp(){return new Date().toISOString().slice(0,10);}
function exportCsv(){if(!entries.length){showToast('Aucune fiche à exporter');return;}
  downloadBlob(new Blob([toCsv(entries)],{type:'text/csv;charset=utf-8'}),`salon-collage-${dateStamp()}.csv`);showToast('CSV téléchargé');
}
function blobAsDataUrl(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(r.error);r.onload=()=>resolve(r.result);r.readAsDataURL(blob);});}
// Self-contained report: photographs are embedded so the report remains viewable offline.
// From a computer, Print > Save as PDF; then OneNote > Insert > File Printout.
async function buildOneNoteHtml(allMedia){
  const retained=entries.filter(e=>e.supplier.trim()||[e.reference,e.application,e.notes,e.benefit].some(x=>String(x||'').trim()));
  const photos=new Map();
  for(const m of allMedia.filter(m=>m.kind==='product'||m.kind==='contact')){
    const list=photos.get(m.entryId)||[];
    list.push({kind:m.kind,data:await blobAsDataUrl(m.blob)});
    photos.set(m.entryId,list);
  }
  const cell=(name,value)=>value?`<div class="detail"><div class="label">${escapeHtml(name)}</div><div class="value">${escapeHtml(value)}</div></div>`:'';
  const sorted=[...retained].sort((a,b)=>({high:0,medium:1,low:2}[a.priority]??1)-({high:0,medium:1,low:2}[b.priority]??1));
  const rows=sorted.map((e,i)=>{
    const contentPhotos=(photos.get(e.id)||[]).map(p=>`<figure><img src="${p.data}" alt="${p.kind==='contact'?'Carte de visite':'Solution / produit'}"><figcaption>${p.kind==='contact'?'Carte de visite':'Solution / produit'}</figcaption></figure>`).join('');
    const audioCount=allMedia.filter(m=>m.entryId===e.id&&m.kind==='audio').length;
    const axes=[['Nature de solution',e.solution],['Prise / activation',e.activation],['Fonction',e.functions],['Liaison',e.liaison],['Industrialisation',e.process],['Préparation de surface',e.surface]].filter(([,v])=>Array.isArray(v)&&v.length).map(([k,v])=>cell(k,v.join(', '))).join('');
    return `<section class="supplier"><div class="section-head"><span>FICHE ${i+1} / ${sorted.length}</span><span>${escapeHtml(displayDate(e.createdAt))}</span></div><h2>${escapeHtml(e.supplier||'Fournisseur non renseigné')}</h2><div class="meta"><span class="chip">${escapeHtml(PRIORITY_LABELS[e.priority]||'À regarder')}</span><span class="chip action">${escapeHtml(ACTION_LABELS[e.nextAction]||'À définir')}</span></div>
    <div class="details">${cell('Stand',e.booth)}${cell('Contact / société',e.contact)}${cell('Solution / référence',e.reference)}${cell('Application potentielle',e.application)}${cell('Intérêt / gain potentiel',e.benefit)}${cell('Notes de visite',e.notes)}${cell('Suite à donner',ACTION_LABELS[e.nextAction]||'À définir')}${cell('Précision / échéance',e.actionDetail)}${axes}${cell('Solution – autre',e.solutionOther)}${cell('Scotch / ruban – caractéristiques',e.tapeDetails)}${cell('Activation – autre',e.activationOther)}${cell('Conditions de prise',e.activationConditions)}${cell('Fonction – autre',e.functionsOther)}${cell('Liaison – autre',e.liaisonOther)}${cell('Industrialisation – autre',e.processOther)}${cell('Préparation de surface – autre',e.surfaceOther)}${cell('Notes techniques',e.technicalNotes)}</div>
    ${contentPhotos?`<div class="photos">${contentPhotos}</div>`:''}${audioCount?`<div class="audio-notice">${audioCount} mémo(s) audio — fichiers inclus séparément dans le ZIP complet.</div>`:''}</section>`;
  }).join('\n');
  return `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Salon Collage – Rapport OneNote</title><style>
  *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#20352d;background:#f4f7f4;margin:0;line-height:1.46}.wrap{max-width:900px;margin:auto;padding:36px 22px}.cover{background:#153c36;color:white;padding:38px 36px;border-radius:14px;margin-bottom:24px}h1{font-size:30px;line-height:1.18;margin:10px 0 8px}h2{font-size:24px;margin:13px 0 8px}.eyebrow{font-size:11px;letter-spacing:2px;font-weight:bold;opacity:.78}.sub{font-size:13px;opacity:.85}.supplier{background:#fff;border:1px solid #dce6dd;border-radius:12px;margin:0 0 22px;padding:25px 29px;break-inside:avoid-page}.section-head{display:flex;justify-content:space-between;color:#668074;font-size:10px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #e5eee7;padding-bottom:11px}.meta{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 20px}.chip{font-size:11px;border-radius:999px;padding:5px 10px;background:#e9f3e8;color:#2b6c4b;font-weight:bold}.chip.action{background:#eff2f1;color:#4d6b62}.details{display:grid;grid-template-columns:1fr 1fr;gap:16px 24px}.detail{min-width:0;break-inside:avoid}.label{font-size:10px;color:#5c7d6b;font-weight:750;text-transform:uppercase;letter-spacing:.7px;margin-bottom:5px}.value{font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere}.photos{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:22px}.photos figure{margin:0;break-inside:avoid}.photos img{width:100%;height:auto;max-height:350px;object-fit:contain;border-radius:6px;border:1px solid #e1e8e1}.photos figcaption{font-size:10px;color:#64786c;margin-top:4px}.audio-notice{margin-top:15px;padding:10px 12px;background:#f5f8f5;border-left:3px solid #6a977d;font-size:12px}.help{background:#fff;padding:18px 22px;border-radius:10px;border:1px solid #e1e7e1;margin-bottom:26px;font-size:12px;color:#637267}.help strong{color:#214a39}
  @media print{body{background:white}.wrap{max-width:none;padding:0}.cover{border-radius:0;print-color-adjust:exact;-webkit-print-color-adjust:exact}.supplier{border:0;border-top:1px solid #bccfc3;border-radius:0;margin:0;padding:18px 0;break-before:page}.supplier:first-of-type{break-before:auto}.help{display:none}.details{grid-template-columns:1fr 1fr}.photos img{max-height:290px}@page{size:A4;margin:14mm}}
  @media(max-width:580px){.wrap{padding:10px}.cover{padding:24px}.supplier{padding:18px 15px}.details{grid-template-columns:1fr}.photos{grid-template-columns:1fr}}
  </style></head><body><div class="wrap"><div class="cover"><div class="eyebrow">CARNET FOURNISSEURS · RAPPORT DE VISITE</div><h1>Salon Collage</h1><div class="sub">${sorted.length} fiche(s) fournisseur · Édition du ${escapeHtml(displayDate(new Date().toISOString()))}</div></div>
  <div class="help"><strong>Pour OneNote :</strong> ouvrir ce fichier dans Edge/Chrome sur le PC, faire <strong>Ctrl+P → Enregistrer en PDF</strong>, puis dans OneNote <strong>Insertion → Impression du fichier</strong>. Les photos sont intégrées au PDF. Les mémos vocaux restent dans le ZIP et peuvent être joints séparément. Aucun transfert automatique vers OneNote.</div>
  ${rows||'<p>Aucune visite saisie.</p>'}</div></body></html>`;
}
async function exportOneNote(){
  if(!entries.length){showToast('Aucune fiche à exporter');return;}
  const button=$('#exportOneNote');button.disabled=true;
  try{const html=await buildOneNoteHtml(await storeAll('media'));
    downloadBlob(new Blob([html],{type:'text/html;charset=utf-8'}),`salon-collage-rapport-onenote-${dateStamp()}.html`);
    showToast('Rapport OneNote téléchargé');
  }catch(e){console.error(e);showToast('Impossible de préparer le rapport');}
  finally{button.disabled=false;}
}
function dataUrlBlob(data){const [h,body]=data.split(',');if(!body)throw new Error('Données image invalides');const mime=(h.match(/data:([^;]+)/)||[])[1]||'application/octet-stream';const bin=atob(body);const buff=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)buff[i]=bin.charCodeAt(i);return new Blob([buff],{type:mime});}
async function fullBackup(allMedia){return {
  kind:'SalonCollageBackup',version:1,exportedAt:new Date().toISOString(),entries:entries.map(e=>({...e})),
  media:await Promise.all(allMedia.map(async m=>({id:m.id,entryId:m.entryId,kind:m.kind,name:m.name,mime:m.mime,createdAt:m.createdAt,data:await blobAsDataUrl(m.blob)})))
};}
// Small dependency-free ZIP (STORE, no compression): files readable by standard ZIP tools.
const textEncoder=new TextEncoder();
function write16(v,n){v.push(n&255,(n>>>8)&255);}
function write32(v,n){v.push(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255);}
const crcTable=(()=>{const a=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;a.push(c>>>0);}return a;})();
function crc32(bytes){let c=0xffffffff;for(const byte of bytes)c=crcTable[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
async function makeZip(files){
  const blocks=[],central=[];let offset=0;const date=new Date();
  const t=((date.getHours()&31)<<11)|((date.getMinutes()&63)<<5)|((Math.floor(date.getSeconds()/2))&31);
  const d=(((date.getFullYear()-1980)&127)<<9)|(((date.getMonth()+1)&15)<<5)|(date.getDate()&31);
  for(const {name,blob} of files){
    const filename=textEncoder.encode(name);const data=new Uint8Array(await blob.arrayBuffer());const crc=crc32(data);
    const l=[];write32(l,0x04034b50);write16(l,20);write16(l,0x0800);write16(l,0);write16(l,t);write16(l,d);write32(l,crc);write32(l,data.length);write32(l,data.length);write16(l,filename.length);write16(l,0);
    blocks.push(new Uint8Array(l),filename,data);
    const c=[];write32(c,0x02014b50);write16(c,20);write16(c,20);write16(c,0x0800);write16(c,0);write16(c,t);write16(c,d);write32(c,crc);write32(c,data.length);write32(c,data.length);write16(c,filename.length);write16(c,0);write16(c,0);write16(c,0);write16(c,0);write32(c,0);write32(c,offset);
    central.push(new Uint8Array(c),filename);offset+=l.length+filename.length+data.length;
  }
  const csize=central.reduce((n,x)=>n+x.length,0);const end=[];
  write32(end,0x06054b50);write16(end,0);write16(end,0);write16(end,files.length);write16(end,files.length);write32(end,csize);write32(end,offset);write16(end,0);
  return new Blob([...blocks,...central,new Uint8Array(end)],{type:'application/zip'});
}
async function exportZip(){
  if(!entries.length){showToast('Aucune fiche à exporter');return;}
  const button=$('#exportZip');button.disabled=true;button.textContent='Préparation du ZIP...';
  try{
    const allMedia=await storeAll('media');const backup=await fullBackup(allMedia);
    const files=[
      {name:'salon-collage-rapport-onenote.html',blob:new Blob([await buildOneNoteHtml(allMedia)],{type:'text/html;charset=utf-8'})},
      {name:'salon-collage-tableau.csv',blob:new Blob([toCsv(entries)],{type:'text/csv;charset=utf-8'})},
      {name:'sauvegarde.json',blob:new Blob([JSON.stringify(backup)],{type:'application/json'})},
      {name:'LIRE-MOI.txt',blob:new Blob(['SALON COLLAGE - EXPORT COMPLET\n\n1. Pour OneNote : ouvrir salon-collage-rapport-onenote.html sur PC, imprimer en PDF puis utiliser OneNote > Insertion > Impression du fichier.\n2. Ouvrir salon-collage-tableau.csv avec Excel.\n3. Les photos et audios originaux sont dans le dossier medias. Les audios ne sont pas inclus dans le PDF.\n4. Le fichier sauvegarde.json permet de restaurer les fiches dans l’application sur un téléphone ou navigateur.\n\nAucune donnée n\'est envoyée à un serveur par l\'application.\n'],{type:'text/plain'})}
    ];
    allMedia.forEach(m=>{let ext=m.kind==='audio'?(m.mime?.includes('mp4')?'m4a':'webm'):'jpg';const parent=entries.find(e=>e.id===m.entryId);const safe=(parent?.supplier||'sans-nom').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9-_]+/g,'-').slice(0,35)||'sans-nom';files.push({name:`medias/${safe}_${m.id.slice(0,8)}_${m.kind}.${ext}`,blob:m.blob});});
    const zip=await makeZip(files);
    downloadBlob(zip,`salon-collage-complet-${dateStamp()}.zip`);showToast('ZIP complet téléchargé');
  }catch(e){console.error(e);showToast('Export impossible — réessayer');}
  finally{button.disabled=false;button.innerHTML='Télécharger le ZIP complet <span>↗</span>';}
}
async function importJson(file){if(!file)return;
  try{
    const json=JSON.parse(await file.text());
    if(json.kind!=='SalonCollageBackup'||json.version!==1||!Array.isArray(json.entries)||!Array.isArray(json.media))throw new Error('Format non reconnu');
    if(!confirm(`Importer ${json.entries.length} fiches et ${json.media.length} médias ? Les éléments ayant le même identifiant seront remplacés.`))return;
    for(const e of json.entries){if(typeof e.id!=='string')continue;await storePut('entries',e);}
    for(const m of json.media){if(typeof m.id!=='string'||typeof m.data!=='string')continue;const {data,...record}=m;record.blob=dataUrlBlob(data);await storePut('media',record);}
    await refreshEntries();setView('Home');showToast('Sauvegarde restaurée');
  }catch(e){console.error(e);showToast('Import impossible : fichier non compatible');}
}
function bindControls(){
  ['#newEntryHero','#newEntryEmpty','#tabNew'].forEach(s=>$(s).addEventListener('click',newEntry));
  $('#brandHome').addEventListener('click',returnHome);
  $('#brandHome').addEventListener('keydown',e=>{if(e.key==='Enter')returnHome();});
  $('#tabHome').addEventListener('click',returnHome);
  ['#tabExport','#homeExport'].forEach(s=>$(s).addEventListener('click',async()=>{await flushSave();setView('Export');}));
  $('#backHome').addEventListener('click',returnHome);
  $('#finishEdit').addEventListener('click',async()=>{await flushSave();if(getCurrent()&&!getCurrent().supplier.trim()){showToast('Indiquez le fournisseur pour retrouver la fiche');$('#supplier').focus();return;}await returnHome();showToast('Visite enregistrée');});
  $('#exportBack').addEventListener('click',returnHome);
  $('#deleteEntry').addEventListener('click',deleteCurrent);
  $('#searchInput').addEventListener('input',renderList);
  $$('.filter').forEach(button=>button.addEventListener('click',()=>{selectedFilter=button.dataset.filter;$$('.filter').forEach(b=>b.classList.toggle('active',b===button));renderList();}));
  $('#entryForm').addEventListener('input',markSaving);
  $('#entryForm').addEventListener('change',markSaving);
  $('#entryForm').addEventListener('submit',e=>e.preventDefault());
  Object.values(TAX_DOM).forEach(id=>$(id).addEventListener('click',e=>{const chip=e.target.closest('.tech-chip');if(!chip)return;chip.classList.toggle('selected');markSaving();}));
  $('#photoProduct').addEventListener('change',async e=>{await addPhoto(e.target.files?.[0],'product');e.target.value='';});
  $('#photoContact').addEventListener('change',async e=>{await addPhoto(e.target.files?.[0],'contact');e.target.value='';});
  $('#audioButton').addEventListener('click',toggleRecording);
  $('#exportOneNote').addEventListener('click',exportOneNote);
  $('#exportCsv').addEventListener('click',exportCsv);
  $('#exportZip').addEventListener('click',exportZip);
  $('#importJson').addEventListener('change',async e=>{await importJson(e.target.files?.[0]);e.target.value='';});
  window.addEventListener('online',updateNetwork);window.addEventListener('offline',updateNetwork);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&saveTimer)persistForm();});
  window.addEventListener('beforeunload',()=>{if(saveTimer)persistForm();});
}
async function init(){
  try{db=await openDb();bindControls();updateNetwork();await refreshEntries();
    if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
    if('serviceWorker' in navigator && (location.protocol==='https:' || ['localhost','127.0.0.1'].includes(location.hostname))){
      navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(e=>console.warn('Offline install unavailable',e));
    }
  }catch(e){console.error(e);$('#entriesList').innerHTML='<p style="color:#ad4f44;padding:20px">Le stockage local du navigateur est indisponible. Ouvrir le site dans Chrome normal (pas en navigation privée) et vérifier les autorisations.</p>';$('#emptyState').hidden=true;showToast('Stockage local non disponible');}
}
init();
