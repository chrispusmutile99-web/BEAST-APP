(() => {
'use strict';
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const STORE='beastPrototypeV4'; // Bumped version to force update
const emptyState=()=>({profile:null,balance:0,tx:[],banks:[],settings:{destination:'BEAST Wallet',destNumber:'',destName:''},card:{type:'Preview only',frozen:false,active:false},locked:false});
let S=load(),recipientOK=false,agentOK=false,businessOK=false,toastTimer=null;

function load(){try{return {...emptyState(),...JSON.parse(localStorage.getItem(STORE)||'{}')}}catch{return emptyState()}}
function save(){localStorage.setItem(STORE,JSON.stringify(S))}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function fmt(n){return 'KSh '+Number(n||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})}
function fee(n){return n>0?Math.min(100,Math.max(5,Math.ceil(n*.01))):0}
function toast(msg){$('#toast').textContent=msg;$('#toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),3200)}

// ROUTER
function go(id){
  const p=$('#'+id); if(!p)return;
  $$('.page').forEach(x=>x.classList.remove('active')); p.classList.add('active');
  closeMenu(); scrollTo(0,0);
  $$('#beast-nav .bnav-btn').forEach(b=>{ b.classList.toggle('active', b.dataset.page === id); });
  if(id==='home')render();
  if(id==='card')renderCard();
  if(id==='travel') travelShowWelcome();
  if(id==='market') resetMarketToggle();
  if(id==='ai') resetAIGrid();
}
$$('[data-page]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();go(b.dataset.page)}));
function closeMenu(){$('#drawer').classList.remove('open');$('#scrim').classList.add('hidden')}
$('#menuOpen').onclick=()=>{$('#drawer').classList.add('open');$('#scrim').classList.remove('hidden')};
$('#menuClose').onclick=closeMenu; $('#scrim').onclick=closeMenu;
$('#moreBtn').onclick = () => { $('#beast-more').classList.remove('hidden'); };
$('#bm-close').onclick = () => { $('#beast-more').classList.add('hidden'); };

// BASIC MONEY LOGIC
function render(){
  if(S.profile){
    $('#hello').textContent=S.profile.name.split(/\s+/)[0];
    $('#beastId').textContent=S.profile.beastId;
  }
  $('#balance').textContent=Number(S.balance||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
  $('#recent').innerHTML=S.tx.slice(0,4).map(t=>`<p><b>${t.note}</b><br>${fmt(t.amount)}</p>`).join('')||'No activity yet.';
}

$('#registerForm').onsubmit=e=>{
  e.preventDefault();
  const f=new FormData(e.currentTarget);
  let seq=Number(localStorage.getItem('beastDemoSeq')||0)+1;
  localStorage.setItem('beastDemoSeq',seq);
  S=emptyState();
  S.profile={phone:f.get('phone'),id:f.get('id'),name:f.get('name'),beastId:'BEAST-'+String(seq).padStart(6,'0')};
  save();
  go('home');
  toast('Demo account created.');
};

// ================= UPDATED CARD LOGIC =================
function renderCard(){
  if(!S.profile) return;
  
  $('#cardholder').textContent = S.profile.name.toUpperCase();
  $('#cardBeastId').textContent = 'BEAST ID • ' + S.profile.beastId;
  $('#cardLast4').textContent = S.profile.beastId.slice(-4);
  
  const visual = $('#beastCardVisual');
  const typeLabel = $('#cardTypeLabel');
  const statusBox = $('#cardStatus');
  const controls = $('#cardControls');
  const getOptions = $('#getCardOptions');
  const notice = $('#cardNotice');

  visual.classList.remove('frozen', 'active-card');

  if(S.card.type === 'Preview only') {
    typeLabel.textContent = 'PREVIEW';
    statusBox.textContent = 'STATUS: PREVIEW ONLY';
    statusBox.className = 'panel status-panel';
    controls.classList.add('hidden');
    getOptions.classList.remove('hidden');
    notice.classList.remove('hidden');
  } 
  else if (S.card.type === 'Virtual') {
    typeLabel.textContent = 'VIRTUAL CARD';
    getOptions.classList.add('hidden');
    notice.classList.add('hidden');
    controls.classList.remove('hidden');
    visual.classList.add('active-card');
    
    if(S.card.frozen) {
      visual.classList.add('frozen');
      statusBox.textContent = 'STATUS: FROZEN ❄️';
      statusBox.className = 'panel status-panel frozen';
      $('#freeze').textContent = 'UNFREEZE CARD ☀️';
    } else {
      statusBox.textContent = 'STATUS: ACTIVE ✅';
      statusBox.className = 'panel status-panel active';
      $('#freeze').textContent = 'FREEZE CARD ❄️';
    }
  }
  else if (S.card.type === 'Physical ordered') {
    typeLabel.textContent = 'PHYSICAL ORDER';
    statusBox.textContent = 'STATUS: ORDER PLACED (Awaiting Delivery)';
    statusBox.className = 'panel status-panel';
    getOptions.classList.add('hidden');
    controls.classList.add('hidden');
    notice.classList.add('hidden');
  }
}

$('#getVirtual').onclick = () => {
  S.card.type = 'Virtual'; S.card.active = true; S.card.frozen = false; save(); renderCard(); toast('Virtual card activated!');
};

$('#orderPhysical').onclick = () => {
  const cost = 100;
  if(S.balance < cost) return toast('Insufficient balance (KSh 100 required).');
  if(!confirm(`Pay KSh ${cost} from wallet for physical card? (Demo only)`)) return;
  S.balance -= cost; S.card.type = 'Physical ordered'; save(); renderCard(); render(); toast('Physical card ordered!');
};

$('#freeze').onclick = () => { S.card.frozen = !S.card.frozen; save(); renderCard(); };
$('#cardQr').onclick = () => { alert('QR Code generated.'); };

// ================= TRAVEL LOGIC =================
function travelShowWelcome() {
  $('#travelWelcome').classList.remove('hidden');
  $('#travelPassenger').classList.add('hidden');
  $('#travelDriverRegister').classList.add('hidden');
  $('#travelRadarUI').classList.add('hidden');
  $('#travelActiveTrip').classList.add('hidden');
  $('#travelTripCompleted').classList.add('hidden');
}

$('#backToWelcomePassenger').onclick = () => { $('#travelPassenger').classList.add('hidden'); $('#travelWelcome').classList.remove('hidden'); };
$('#backToWelcome').onclick = travelShowWelcome;

$('#btnPassengerMode').onclick = () => { $('#travelWelcome').classList.add('hidden'); $('#travelPassenger').classList.remove('hidden'); };
$('#btnDriverMode').onclick = () => {
  $('#travelWelcome').classList.add('hidden');
  if (localStorage.getItem('beastDriverReg')) {
    $('#travelRadarUI').classList.remove('hidden');
    $('#radarScanner').classList.add('scanning');
  } else {
    $('#travelDriverRegister').classList.remove('hidden');
  }
};

$('#travelDriverForm').onsubmit = (e) => {
  e.preventDefault();
  if(!confirm('Pay KSh 200 monthly subscription? (Demo)')) return;
  localStorage.setItem('beastDriverReg', 'true');
  $('#travelDriverRegister').classList.add('hidden');
  $('#travelRadarUI').classList.remove('hidden');
  $('#radarScanner').classList.add('scanning');
  setTimeout(() => {
    $('#travelDriverRequests').innerHTML = `<div class="passenger-card"><b>Passenger</b><br><small>Malava Junction</small><br><button class="btn primary full" style="margin-top:8px;" onclick="alert('Accepted!')">Accept Ride</button></div>`;
  }, 3000);
};

$('#travelPassengerForm').onsubmit = (e) => {
  e.preventDefault();
  $('#travelPassengerForm').classList.add('hidden');
  $('#passengerWaiting').classList.remove('hidden');
  setTimeout(() => {
    $('#passengerWaiting').innerHTML = '<h3>Driver Found!</h3><p>John Mwangi is on the way.</p>';
  }, 3000);
};

// ================= MARKET / BUSINESS LOGIC =================
function resetMarketToggle() {
  $('#btnShopMode').classList.add('active'); $('#btnBusinessMode').classList.remove('active');
  $('#shopMode').classList.remove('hidden'); $('#businessMode').classList.add('hidden');
}
$('#btnShopMode').onclick = resetMarketToggle;
$('#btnBusinessMode').onclick = () => {
  $('#btnBusinessMode').classList.add('active'); $('#btnShopMode').classList.remove('active');
  $('#businessMode').classList.remove('hidden'); $('#shopMode').classList.add('hidden');
};

// ================= AI LOGIC =================
let currentAIMode = '';
function resetAIGrid() { $('#aiSelectionGrid').classList.remove('hidden'); $('#aiChatContainer').classList.add('hidden'); }
$('#backToAIGrid').onclick = resetAIGrid;

$$('.ai-card').forEach(card => {
  card.onclick = () => {
    currentAIMode = card.dataset.ai;
    $('#aiChatTitle').textContent = card.querySelector('b').textContent;
    $('#aiSelectionGrid').classList.add('hidden');
    $('#aiChatContainer').classList.remove('hidden');
    const chatBox = $('#aiChatMessages'); chatBox.innerHTML = '';
    let greeting = `Hello! I am your ${card.querySelector('b').textContent}. How can I help?`;
    if(currentAIMode === 'fraud') greeting = "Security scan active. No suspicious activity detected.";
    if(currentAIMode === 'business') greeting = "Welcome, Merchant. Your sales are up 12% this week.";
    addMessage('ai', greeting);
  };
});

function addMessage(sender, text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `msg ${sender}`; msgDiv.textContent = text;
  $('#aiChatMessages').appendChild(msgDiv);
  $('#aiChatMessages').scrollTop = $('#aiChatMessages').scrollHeight;
}

$('#aiSendBtn').onclick = () => {
  const input = $('#aiInputBox'); const text = input.value.trim(); if(!text) return;
  addMessage('user', text); input.value = '';
  setTimeout(() => {
    let reply = "I'm analyzing that for you...";
    if(currentAIMode === 'admin') reply = "Total revenue this month is KES 650,000.";
    if(currentAIMode === 'customer') reply = "To send money, tap 'Money' then 'Send'.";
    if(currentAIMode === 'fraud') reply = "Scan complete. 0 high-risk alerts found.";
    if(currentAIMode === 'business') reply = "Top product: Smart Watch (45 units).";
    if(currentAIMode === 'advertising') reply = "Suggested ad: '🔥 Get 20% off today!'";
    if(currentAIMode === 'analytics') reply = "Net profit this month is KES 300,000.";
    addMessage('ai', reply);
  }, 1200);
};

$('#aiInputBox').addEventListener('keypress', (e) => { if (e.key === 'Enter') $('#aiSendBtn').click(); });

// INITIAL LOAD
if(S.profile){go('home')}else{go('register')}
})();