(() => {
'use strict';
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const STORE='beastPrototypeV3';
const emptyState=()=>({profile:null,balance:0,tx:[],banks:[],settings:{destination:'BEAST Wallet',destNumber:'',destName:''},card:{type:'Preview only',frozen:false,active:false},locked:false});
let S=load(),recipientOK=false,buyerOK=false,agentOK=false,businessOK=false,toastTimer=null;

function load(){try{return {...emptyState(),...JSON.parse(localStorage.getItem(STORE)||'{}')}}catch{return emptyState()}}
function save(){localStorage.setItem(STORE,JSON.stringify(S))}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function fmt(n){return 'KSh '+Number(n||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})}
function fee(n){return n>0?Math.min(100,Math.max(5,Math.ceil(n*.01))):0}
function toast(msg){$('#toast').textContent=msg;$('#toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),3200)}

// ================= ROUTER =================
function go(id){
  const p=$('#'+id);
  if(!p)return;
  
  // Hide all pages
  $$('.page').forEach(x=>x.classList.remove('active'));
  // Show target
  p.classList.add('active');
  
  closeMenu();
  scrollTo(0,0);
  
  // Update new bottom nav highlight
  $$('#beast-nav .bnav-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.page === id);
  });
  // Close "More" sheet if open
  $('#beast-more').classList.add('hidden');

  // Call specific render functions
  if(id==='home')render();
  if(id==='receive')refreshDestination();
  if(id==='withdraw')refreshWithdrawBank();
  if(id==='banks')renderBanks();
  if(id==='card')renderCard();
  if(id==='history')renderHistory();
  if(id==='shield')setShieldReady();
}

// Bind all buttons with data-page attribute
$$('[data-page]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();go(b.dataset.page)}));

function closeMenu(){$('#drawer').classList.remove('open');$('#scrim').classList.add('hidden')}
$('#menuOpen').onclick=()=>{$('#drawer').classList.add('open');$('#scrim').classList.remove('hidden')};
$('#menuClose').onclick=closeMenu;
$('#scrim').onclick=closeMenu;

// "More" Bottom Sheet logic
$('#moreBtn').onclick = () => { $('#beast-more').classList.remove('hidden'); };
$('#bm-close').onclick = () => { $('#beast-more').classList.add('hidden'); };

// ================= MONEY LOGIC =================
function tx(type,amount,note){S.tx.unshift({type,amount:Number(amount),note,date:new Date().toISOString()});save();render()}
function txHtml(t){return `<p><b>${esc(t.note)}</b><br><small>${esc(new Date(t.date).toLocaleString())}</small><br>${fmt(t.amount)}</p>`}

function render(){
  if(S.profile){
    $('#hello').textContent=S.profile.name.split(/\s+/)[0];
    $('#beastId').textContent=S.profile.beastId;
    $('#cardholder').textContent=S.profile.name.toUpperCase();
    $('#cardBeastId').textContent='BEAST ID • '+S.profile.beastId;
  }
  $('#balance').textContent=Number(S.balance||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
  $('#recent').innerHTML=S.tx.slice(0,4).map(txHtml).join('')||'No activity yet.';
  renderBanks();
  renderCard();
}

function scan(title='SECURITY SCAN IN PROGRESS',message='Please wait while the demo security sequence runs.'){
  go('shield');
  $('#shieldStatus').textContent=title;
  $('#shieldMessage').textContent=message;
  $('#scanProgress').style.width='0%';
  $('#scannerVisual').classList.add('scanning');
  let p=0;
  const interval=setInterval(()=>{
    p+=10;
    $('#scanProgress').style.width=p+'%';
    if(p>=100){
      clearInterval(interval);
      $('#scannerVisual').classList.remove('scanning');
      $('#shieldStatus').textContent='DEMO CHECK COMPLETE';
      $('#shieldMessage').textContent='This animation does not verify identity or detect fraud. Live checks are not connected.';
    }
  },90);
}

function setShieldReady(){
  if(!$('#scanProgress').style.width||$('#scanProgress').style.width==='0%'){
    $('#shieldStatus').textContent='READY TO SCAN';
    $('#shieldMessage').textContent='Security checks are simulated in this prototype.';
  }
}

$('#scanNow').onclick=()=>scan();
$('#cameraCheck').onclick=async()=>{
  if(!navigator.mediaDevices?.getUserMedia)return toast('Camera API unavailable in this browser.');
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}});
    stream.getTracks().forEach(t=>t.stop());
    toast('Camera permission tested. No face verification was performed.');
  }catch{
    toast('Camera permission denied or camera unavailable.');
  }
};
$('#lockdown').onclick=()=>{S.locked=true;save();toast('DEMO ACCOUNT LOCKED locally. A live version must enforce lockout on the server.')};
$('#verifyIdentity').onclick=()=>toast('Live identity/name verification is not connected. Use demo details only.');
$('#terms').onclick=()=>alert('BEAST prototype terms: demo only; no real financial services, identity verification, card issuance or transfers are active.');

$('#registerForm').onsubmit=e=>{
  e.preventDefault();
  const f=new FormData(e.currentTarget);
  let seq=Number(localStorage.getItem('beastDemoSeq')||0)+1;
  localStorage.setItem('beastDemoSeq',seq);
  S=emptyState();
  S.profile={phone:f.get('phone'),id:f.get('id'),name:f.get('name'),beastId:'BEAST-'+String(seq).padStart(6,'0')};
  save();
  scan('INITIALIZING BEAST SHIELD','Demo registration scan. No government identity service is connected.');
  setTimeout(()=>{
    go('home');
    toast('Demo account created locally. BEAST ID is not globally reserved.');
  },1200);
};

function demoName(v){
  if(!String(v||'').trim())return '';
  const names=['Amina Wanjiku','Brian Otieno','Grace Njeri','Kevin Mwangi','Faith Atieno'];
  return names[String(v).replace(/\D/g,'').split('').reduce((a,c)=>a+Number(c),0)%names.length];
}

$('#verifyRecipient').onclick=()=>{
  const v=$('#sendForm [name=recipient]').value;
  const n=demoName(v);
  if(!n)return toast('Enter a recipient first.');
  recipientOK=true;
  $('#recipientName').textContent=n+' · DEMO ONLY';
  toast('Mock recipient only; no real lookup was performed.');
};

$('#sendAmount').oninput=()=>{
  const n=Number($('#sendAmount').value)||0;
  $('#sendFee').textContent=fmt(fee(n));
  $('#sendTotal').textContent=fmt(n+fee(n));
};

$('#sendForm').onsubmit=e=>{
  e.preventDefault();
  const f=new FormData(e.currentTarget),n=Number(f.get('amount'));
  if(S.locked)return toast('Demo account is locked.');
  if(!recipientOK)return toast('Verify the recipient first.');
  if(n<=0||n+fee(n)>S.balance)return toast('Insufficient demo wallet balance.');
  scan('CHECKING PAYMENT','Demo risk scan before a simulated transfer.');
  setTimeout(()=>{
    S.balance-=n+fee(n);
    tx('send',n+fee(n),'Demo send to '+f.get('recipient'));
    recipientOK=false;
    e.currentTarget.reset();
    go('home');
    toast('Demo only. No money moved.');
  },1050);
};

function refreshDestination(){
  const s=S.settings||emptyState().settings;
  $('#destination').textContent=s.destination+(s.destNumber?' · '+s.destNumber:'');
  $('#destinationSummary').textContent=s.destination;
  $('#destinationNumberSummary').textContent=s.destNumber?'Linked reference: '+mask(s.destNumber)+' · '+(s.destName||'Name not verified'):'No linked reference saved. Set a destination in Payment settings.';
  $('#destinationSelect').value=s.destination;
  $('#destinationForm [name=destNumber]').value=s.destNumber||'';
  $('#destinationForm [name=destName]').value=s.destName||'';
}

function mask(v){
  const x=String(v||'');
  return x.length>4?'••••'+x.slice(-4):x;
}

$$('[data-receive-tab]').forEach(b=>b.onclick=()=>{
  const t=b.dataset.receiveTab;
  $$('[data-receive-tab]').forEach(x=>x.classList.toggle('active',x===b));
  $('#receiveCollect').classList.toggle('hidden',t!=='collect');
  $('#receiveSettings').classList.toggle('hidden',t!=='settings');
  $('#receiveMovement').classList.toggle('hidden',t!=='movement');
});

$('#destinationForm').onsubmit=e=>{
  e.preventDefault();
  const f=new FormData(e.currentTarget);
  S.settings={destination:f.get('destination'),destNumber:f.get('destNumber'),destName:f.get('destName')};
  save();
  refreshDestination();
  toast('Default destination saved locally for this demo.');
};

$('#buyerLogin').onsubmit=e=>{
  e.preventDefault();
  scan('CHECKING BUYER SESSION','This is a visual demo only; buyer credentials are not verified.');
  setTimeout(()=>{
    buyerOK=true;
    $('#buyerLogin').classList.add('hidden');
    $('#collectForm').classList.remove('hidden');
    go('receive');
    $('#receiveCollect').classList.remove('hidden');
    toast('Demo buyer session only. No identity check.');
  },900);
};

$('#collectForm').onsubmit=e=>{
  e.preventDefault();
  const f=new FormData(e.currentTarget),n=Number(f.get('amount'));
  if(!buyerOK)return toast('Buyer session required.');
  if(n<=0)return toast('Enter a valid amount.');
  scan('AUTHORIZING DEMO COLLECTION','No actual payment provider is connected.');
  setTimeout(()=>{
    const dest=S.settings.destination;
    $('#collectResult').textContent=`Demo collection simulated for ${fmt(n)} to ${dest}. No money was transferred. Returning to buyer login.`;
    $('#collectResult').classList.remove('hidden');
    $('#collectForm').reset();
    $('#collectForm').classList.add('hidden');
    $('#buyerLogin').classList.remove('hidden');
    buyerOK=false;
    go('receive');
  },1100);
};

$('#movementForm').onsubmit=e=>{
  e.preventDefault();
  toast('Payment provider not connected; movement was not processed.');
};

function refreshWithdrawBank(){
  const b=S.banks.find(x=>x.type==='Bank Account');
  $('#linkedBankSummary').textContent=b?`${b.provider} · ${b.nickname} · ${mask(b.reference)} · ${b.holder}`:'No linked bank saved. Add one under Linked Accounts.';
}

$('#withdrawSource').onchange=()=>{
  refreshWithdrawBank();
  if($('#withdrawSource').value==='Linked Bank Account'&&!S.banks.some(x=>x.type==='Bank Account'))toast('Link a bank account first.');
};

$('#verifyAgent').onclick=()=>{
  const v=$('#withdrawForm [name=destination]').value,n=demoName(v);
  if(!n)return toast('Enter destination details.');
  agentOK=true;
  $('#agentName').textContent=n+' · DEMO ONLY';
};

$('#withdrawForm [name=amount]').oninput=e=>$('#withdrawFee').textContent=fmt(fee(Number(e.target.value)||0));

$('#withdrawForm').onsubmit=e=>{
  e.preventDefault();
  const f=new FormData(e.currentTarget),n=Number(f.get('amount'));
  if(S.locked)return toast('Demo account is locked.');
  if(f.get('source')==='Linked Bank Account'&&!S.banks.some(x=>x.type==='Bank Account'))return toast('Link a bank account before selecting it.');
  if(!agentOK)return toast('Verify destination first.');
  if(n<=0||n+fee(n)>S.balance)return toast('Insufficient demo balance.');
  scan('CHECKING WITHDRAWAL','Simulated security check. No payout will occur.');
  setTimeout(()=>{
    S.balance-=n+fee(n);
    tx('withdraw',n+fee(n),'Demo withdrawal to '+f.get('destination'));
    agentOK=false;
    go('home');
    toast('Demo only; no money moved.');
  },1000);
};

const serviceButtons=$$('[data-service]');
let currentService='Pochi la Biashara';

function renderLipaFields(){
  const wrap=$('#lipaFields');
  wrap.innerHTML='';
  $('#lipaTitle').textContent=currentService;
  $('#tKashChoiceWrap').classList.toggle('hidden',currentService!=='T-Kash');
  let fields=[];
  let service=currentService;
  if(service==='T-Kash')service=$('#tKashChoice').value==='Pay Bill'?'Paybill':'Buy Goods / Till';
  if(service==='Pochi la Biashara')fields=[['phone','Phone number','Enter business phone number']];
  else if(service==='Buy Goods / Till')fields=[['business','Till number','Enter Till number']];
  else if(service==='Paybill')fields=[['business','Business number','Enter business number'],['account','Account number','Enter account number']];
  else if(service==='GlobalPay'){
    fields=[];
    wrap.innerHTML='<div class="verify-box">Selected payment method <b>BEAST Card</b><p class="muted">Use your BEAST Card concept for eligible BEAST ecosystem payments only.</p><button type="button" class="btn secondary full" id="openCard">VIEW BEAST CARD</button></div>';
    setTimeout(()=>{if($('#openCard'))$('#openCard').onclick=()=>go('card')},0);
  } else fields=[['business','Service / operator number','Enter service number'],['account','Account / reference number','Enter reference']];
  
  fields.forEach(([name,label,placeholder])=>{
    const l=document.createElement('label');
    l.textContent=label;
    const i=document.createElement('input');
    i.name=name;i.placeholder=placeholder;i.required=true;
    l.appendChild(i);
    wrap.appendChild(l);
  });
  businessOK=false;
  $('#businessName').textContent='Not verified';
}

serviceButtons.forEach(b=>b.onclick=()=>{
  serviceButtons.forEach(x=>x.classList.toggle('selected',x===b));
  currentService=b.dataset.service;
  renderLipaFields();
  $('#lipaForm').scrollIntoView({behavior:'smooth',block:'start'});
});

$('#tKashChoice').onchange=renderLipaFields;
renderLipaFields();

$('#lipaForm [name=amount]').oninput=e=>$('#lipaFee').textContent=fmt(fee(Number(e.target.value)||0));

$('#verifyBusiness').onclick=()=>{
  const input=$('#lipaFields input');
  if(currentService!=='GlobalPay'&&!input?.value.trim())return toast('Enter the required payment details.');
  businessOK=true;
  $('#businessName').textContent=(currentService==='GlobalPay'?'BEAST Card':demoName(input.value))+' · DEMO ONLY';
  toast('Mock verification only; no business lookup occurred.');
};

$('#lipaForm').onsubmit=e=>{
  e.preventDefault();
  const f=new FormData(e.currentTarget),n=Number(f.get('amount'));
  if(S.locked)return toast('Demo account is locked.');
  if(!businessOK)return toast('Verify payment details first.');
  if(n<=0||n+fee(n)>S.balance)return toast('Insufficient demo wallet balance.');
  scan('CHECKING LIPA NA PAYMENT','Simulated verification only; no provider is connected.');
  setTimeout(()=>{
    S.balance-=n+fee(n);
    tx('lipa',n+fee(n),'Demo '+currentService+' payment');
    go('home');
    toast('Demo only; no money moved.');
  },1000);
};

function renderBanks(){
  const box=$('#banksList');
  if(!box)return;
  box.innerHTML=S.banks.length?S.banks.map((b,i)=>`<div class="verify-box"><b>${esc(b.provider)}</b><br>${esc(b.type)} · ${esc(b.nickname)}<br>${esc(mask(b.reference))} · ${esc(b.holder)}<br><button class="btn secondary remove-bank" data-index="${i}">REMOVE DEMO LINK</button></div>`).join(''):'No linked accounts yet.';
  $$('.remove-bank').forEach(b=>b.onclick=()=>{
    S.banks.splice(Number(b.dataset.index),1);
    save();renderBanks();refreshWithdrawBank();
    toast('Demo account link removed.');
  });
}

$('#bankForm').onsubmit=e=>{
  e.preventDefault();
  const f=new FormData(e.currentTarget);
  S.banks.push({type:f.get('type'),provider:f.get('provider'),nickname:f.get('nickname'),reference:f.get('reference'),holder:f.get('holder')});
  save();renderBanks();refreshWithdrawBank();
  e.currentTarget.reset();
  toast('Demo account saved locally. Ownership not verified.');
};

function renderCard(){
  if(!S.profile)return;
  $('#cardholder').textContent=S.profile.name.toUpperCase();
  $('#cardBeastId').textContent='BEAST ID • '+S.profile.beastId;
  $('#cardTypeLabel').textContent=S.card.type==='Virtual'?'VIRTUAL':S.card.type==='Physical ordered'?'PHYSICAL ORDER':'PREVIEW';
  $('#cardLast4').textContent=S.profile.beastId.slice(-4);
  $('#cardStatus').innerHTML='<b>Card status:</b> '+esc(S.card.frozen?'FROZEN':S.card.active?'ACTIVE (DEMO)':S.card.type==='Physical ordered'?'ORDER PLACED (DEMO)':S.card.type==='Virtual'?'VIRTUAL PREVIEW':'Preview only')+(S.card.frozen?'<p>Demo card is frozen in this browser.</p>':'');
}

$('#getVirtual').onclick=()=>{S.card.type='Virtual';S.card.active=true;save();renderCard();toast('Free virtual card preview enabled. No real card issued.')};
$('#orderPhysical').onclick=()=>{
  if(!confirm('Place a DEMO physical-card order at proposed KSh 100? This will not charge you or place a real order.'))return;
  S.card.type='Physical ordered';save();renderCard();
  toast('Demo order status saved. No payment or fulfilment occurred.');
};
$('#freeze').onclick=()=>{S.card.frozen=!S.card.frozen;save();renderCard();toast(S.card.frozen?'Demo card frozen locally.':'Demo card unfrozen locally.')};
$('#activateCard').onclick=()=>{
  if(S.card.type!=='Physical ordered')return toast('Order a physical card in the demo first.');
  scan('CARD ACTIVATION CHECK','Demo activation only; card issuer is not connected.');
  setTimeout(()=>{S.card.active=true;save();renderCard();toast('Demo activation state saved. No physical card was activated.')},900);
};
$('#cardQr').onclick=()=>alert('BEAST account QR is a placeholder in this prototype. A live QR should contain a short-lived signed payment token, not private account data.');

function renderHistory(){$('#historyList').innerHTML=S.tx.map(txHtml).join('')||'No transactions yet.'}
$('#logout').onclick=()=>{go('register');toast('Returned to registration. Local demo data remains in this browser.')};

// ================= BEAST Travel Logic =================
const TRAVEL_STORE='beastTravelDemoV1';
const TRAVEL_API_DEFAULT='https://beast-server-8u92.onrender.com';

function travelLoad(){
  try{
    const v=JSON.parse(localStorage.getItem(TRAVEL_STORE)||'{}');
    return {rides:Array.isArray(v.rides)?v.rides:[],driver:v.driver||null};
  }catch{return {rides:[],driver:null}}
}

let travelState=travelLoad();
function travelSave(){localStorage.setItem(TRAVEL_STORE,JSON.stringify(travelState))}
function travelId(){return 'TR-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase()}
function travelSafe(v){return esc(v||'')}

function travelSetMode(mode){
  $$('[data-travel-mode]').forEach(b=>b.classList.toggle('active',b.dataset.travelMode===mode));
  $('#travelPassenger').classList.toggle('hidden',mode!=='passenger');
  $('#travelDriver').classList.toggle('hidden',mode!=='driver');
  $('#travelBackend').classList.toggle('hidden',mode!=='backend');
  if(mode==='driver')travelRenderDriver();
  if(mode==='passenger')travelRenderPassenger();
}

$$('[data-travel-mode]').forEach(b=>b.addEventListener('click',()=>travelSetMode(b.dataset.travelMode)));

function travelRideCard(r,driver=false){
  const statusLabels={requested:'Searching (demo)',accepted:'Accepted by demo driver',picked:'Passenger picked up',completed:'Completed',cancelled:'Cancelled'};
  let buttons='';
  if(driver&&r.status==='requested')buttons=`<button class="btn primary travel-accept" data-ride="${r.id}">ACCEPT DEMO RIDE</button>`;
  if(!driver&&['requested','accepted'].includes(r.status))buttons=`<button class="btn secondary travel-cancel" data-ride="${r.id}">CANCEL DEMO REQUEST</button>`;
  if(driver&&r.status==='accepted')buttons=`<button class="btn primary travel-picked" data-ride="${r.id}">MARK PICKED UP</button>`;
  if(driver&&r.status==='picked')buttons=`<button class="btn secondary travel-complete" data-ride="${r.id}">COMPLETE DEMO RIDE</button>`;
  return `<article class="travel-ride"><strong>${travelSafe(r.id)} · ${travelSafe(statusLabels[r.status]||r.status)}</strong><br><b>${travelSafe(r.town)}</b> · ${travelSafe(r.vehicle)}<br>Pickup: ${travelSafe(r.pickup)}<br>Destination: ${travelSafe(r.destination)}${r.note?'<br>Note: '+travelSafe(r.note):''}${r.driverName?'<br>Driver: '+travelSafe(r.driverName):''}<div class="ride-actions">${buttons}</div></article>`;
}

function travelBindRideButtons(){
  $$('.travel-accept').forEach(b=>b.onclick=()=>{
    const r=travelState.rides.find(x=>x.id===b.dataset.ride);
    if(!r)return;
    if(r.status!=='requested'){toast('Sorry, this passenger has already been picked up or the request is no longer available.');travelRenderDriver();return}
    r.status='accepted';r.driverName=travelState.driver?.name||'Demo Driver';r.driverVehicle=travelState.driver?.vehicle||'Unverified vehicle';r.acceptedAt=new Date().toISOString();
    travelSave();travelRenderDriver();travelRenderPassenger();
    toast('Demo ride accepted. No real passenger or driver was notified.');
  });
  $$('.travel-picked').forEach(b=>b.onclick=()=>{
    const r=travelState.rides.find(x=>x.id===b.dataset.ride);
    if(!r)return;
    if(r.status!=='accepted'){toast('Ride is no longer available.');return}
    r.status='picked';r.pickedAt=new Date().toISOString();
    travelSave();travelRenderDriver();travelRenderPassenger();
    toast('Marked picked up in this browser demo.');
  });
  $$('.travel-complete').forEach(b=>b.onclick=()=>{
    const r=travelState.rides.find(x=>x.id===b.dataset.ride);
    if(!r||r.status!=='picked')return;
    r.status='completed';r.completedAt=new Date().toISOString();
    travelSave();travelRenderDriver();travelRenderPassenger();
    toast('Demo ride completed. No payment was processed.');
  });
  $$('.travel-cancel').forEach(b=>b.onclick=()=>{
    const r=travelState.rides.find(x=>x.id===b.dataset.ride);
    if(!r||!['requested','accepted'].includes(r.status))return;
    r.status='cancelled';
    travelSave();travelRenderPassenger();travelRenderDriver();
    toast('Demo request cancelled locally.');
  });
}

function travelRenderPassenger(){
  const box=$('#travelPassengerRides');
  if(!box)return;
  const list=travelState.rides.slice().reverse();
  box.innerHTML=list.length?list.map(r=>travelRideCard(r,false)).join(''):'No demo ride requests yet.';
  travelBindRideButtons();
}

function travelRenderDriver(){
  const box=$('#travelDriverRequests');
  if(!box)return;
  const profile=travelState.driver;
  
  // Toggle UI based on registration
  const hasProfile = !!profile;
  $('#travelDriverForm').classList.toggle('hidden', hasProfile);
  $('#travelRadarUI').classList.toggle('hidden', !hasProfile);

  if(!hasProfile) return;

  const list=travelState.rides.filter(r=>r.status==='requested'||(r.status==='accepted'&&r.driverName===profile?.name)||(r.status==='picked'&&r.driverName===profile?.name));
  const compatible=list.filter(r=>!profile||r.town.toLowerCase()===profile.town.toLowerCase());
  const filtered=compatible.filter(r=>!profile||r.vehicle==='Any available'||r.vehicle===profile.vehicle);
  box.innerHTML=filtered.length?filtered.map(r=>travelRideCard(r,true)).join(''):'No matching demo requests.';
  travelBindRideButtons();
}

$('#travelRideForm').onsubmit=e=>{
  e.preventDefault();
  const f=new FormData(e.currentTarget);
  const ride={
    id:travelId(),
    town:String(f.get('town')).trim(),
    pickup:String(f.get('pickup')).trim(),
    destination:String(f.get('destination')).trim(),
    vehicle:String(f.get('vehicle')),
    note:String(f.get('note')||'').trim(),
    status:'requested',
    createdAt:new Date().toISOString()
  };
  travelState.rides.push(ride);
  travelSave();travelRenderPassenger();
  $('#travelRadarStatus').textContent='Demo request saved locally. No GPS scan or real driver search was performed.';
  e.currentTarget.reset();
  toast('Demo ride request created. Live driver matching is not connected.');
};

// ================= DRIVER RADAR LOGIC =================
let currentRadius = 1;
let isScanning = false;

$('#travelDriverForm').onsubmit = (e) => {
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  travelState.driver = {
    name: String(f.get('name')).trim(),
    vehicle: String(f.get('vehicle')),
    town: String(f.get('town')).trim(),
    registration: String(f.get('registration') || '').trim(),
    savedAt: new Date().toISOString()
  };
  travelSave();
  travelRenderDriver();
  toast('Driver profile saved. Ready to scan.');
};

$('#resetDriverProfile').onclick = () => {
  if(confirm('Reset driver profile? You will need to register again.')) {
    travelState.driver = null;
    travelSave();
    travelRenderDriver();
  }
};

$$('.radius-pill').forEach(btn => {
  btn.onclick = () => {
    $$('.radius-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentRadius = Number(btn.dataset.radius);
  };
});

$('#scanRadarBtn').onclick = () => {
  if (isScanning) return;
  isScanning = true;
  
  const radar = $('#radarScanner');
  const btn = $('#scanRadarBtn');
  const status = $('#radarStatus');
  
  radar.classList.add('scanning');
  btn.classList.add('scanning-active');
  btn.innerHTML = '<span class="radar-text">SCANNING...</span>';
  status.textContent = `Scanning for passengers within ${currentRadius}km...`;
  
  setTimeout(() => {
    isScanning = false;
    radar.classList.remove('scanning');
    btn.classList.remove('scanning-active');
    btn.innerHTML = '<span class="radar-icon">🟢</span><span class="radar-text">SCAN FOR<br>PASSENGERS</span>';
    
    const availableRides = travelState.rides.filter(r => r.status === 'requested');
    
    if (availableRides.length > 0) {
      status.textContent = `📡 Found ${availableRides.length} passenger(s) nearby!`;
      toast('Passenger found! Check requests below.');
    } else {
      status.textContent = 'No passengers found in this radius. Try again later.';
      toast('No passengers found.');
    }
    
    travelRenderDriver();
  }, 2500);
};

$('#travelClearRides').onclick=()=>{
  if(!confirm('Clear all BEAST Travel demo rides saved in this browser?'))return;
  travelState.rides=[];
  travelSave();travelRenderPassenger();travelRenderDriver();
  toast('Local demo rides cleared.');
};

$('#travelBackendCheck').onclick=async()=>{
  const out=$('#travelBackendStatus');
  let base=$('#travelApiBase').value.trim().replace(/\/$/,'');
  if(!/^https?:\/\//i.test(base)){out.textContent='Enter a valid server URL beginning with https://';return}
  out.textContent='Checking server root…';
  try{
    const res=await fetch(base+'/',{method:'GET',mode:'cors'});
    out.textContent=`Server root responded with HTTP ${res.status}. This does not confirm Travel API endpoints exist.`;
  }catch(err){
    out.textContent='Could not read the server from this browser (network/CORS/server response). Travel endpoints remain unverified.';
  }
};

travelRenderPassenger();
travelRenderDriver();

// INITIAL LOAD
if(S.profile){go('home')}else{go('register')}
})();