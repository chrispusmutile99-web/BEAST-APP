(() => {
'use strict';
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const STORE='beastFinalV6'; // Bumped to merge everything
const emptyState=()=>({profile:null,balance:0,tx:[],banks:[],myProducts:[],publicProducts:[],card:{type:'Preview only',frozen:false,active:false}});
let S=load(),toastTimer=null;

function load(){try{return {...emptyState(),...JSON.parse(localStorage.getItem(STORE)||'{}')}}catch{return emptyState()}}
function save(){localStorage.setItem(STORE,JSON.stringify(S))}
function fmt(n){return 'KSh '+Number(n||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})}
function toast(msg){$('#toast').textContent=msg;$('#toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),3200)}

// ROUTER
function go(id){
  $$('.page').forEach(p=>p.classList.remove('active'));
  const target = $('#'+id); if(target) target.classList.add('active');
  closeMenu(); scrollTo(0,0);
  $$('.bnav-btn').forEach(b=>b.classList.toggle('active', b.dataset.page === id));
  if(id === 'home' || id === 'history') render();
  if(id === 'banks') renderBanks();
  if(id === 'market') { renderMarket(); resetMarketToggle(); }
  if(id === 'travel') resetTravel();
  if(id === 'card') renderCard();
}

// AUTH
$('#goToLogin').onclick = () => go('login');
$('#goToRegister').onclick = () => go('register');

$('#registerForm').onsubmit = (e) => {
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  S.profile = { name: f.get('name'), phone: f.get('phone'), beastId: 'BEAST-' + Math.floor(100000 + Math.random() * 900000) };
  S.balance = 5000; // Give demo balance
  save(); loginSuccess();
};

$('#loginForm').onsubmit = (e) => {
  e.preventDefault();
  if(!S.profile) return toast('Please register first.');
  loginSuccess();
};

function loginSuccess() {
  $('#beast-nav').classList.remove('hidden');
  $('#aiFloatBtn').classList.remove('hidden');
  go('home'); toast('Logged in successfully');
}

// RENDER DATA
function render() {
  if(!S.profile) return;
  $('#hello').textContent = S.profile.name.split(' ')[0];
  $('#beastId').textContent = S.profile.beastId;
  $('#balance').textContent = S.balance.toLocaleString('en-KE', {minimumFractionDigits:2});
  const txHtml = S.tx.map(t => `<p><b>${t.note}</b><br>${fmt(t.amount)}</p>`).join('');
  $('#recent').innerHTML = txHtml || 'No activity yet.';
  $('#historyList').innerHTML = txHtml || 'No activity yet.';
}

function renderBanks() {
  $('#banksList').innerHTML = S.banks.map(b => `<p><b>${b.bank}</b><br>${b.acc}</p>`).join('') || 'No accounts linked.';
}

// MONEY ACTIONS
$('#sendForm').onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const amt = Number(f.get('amount')); if(amt > S.balance) return toast('Insufficient balance'); S.balance -= amt; S.tx.unshift({note: 'Sent to ' + f.get('recipient'), amount: amt}); save(); go('home'); toast('Money sent!'); };
$('#withdrawForm').onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const amt = Number(f.get('amount')); if(amt > S.balance) return toast('Insufficient balance'); S.balance -= amt; S.tx.unshift({note: 'Withdrawn to ' + f.get('dest'), amount: amt}); save(); go('home'); toast('Withdrawal successful!'); };
$('#lipaForm').onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const amt = Number(f.get('amount')); if(amt > S.balance) return toast('Insufficient balance'); S.balance -= amt; S.tx.unshift({note: 'Paid ' + f.get('merchant'), amount: amt}); save(); go('home'); toast('Payment successful!'); };
$('#bankForm').onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); S.banks.push({bank: f.get('bank'), acc: f.get('acc')}); save(); renderBanks(); e.target.reset(); toast('Bank linked!'); };

// CARD LOGIC
function renderCard(){
  if(!S.profile) return;
  $('#cardholder').textContent = S.profile.name.toUpperCase();
  $('#cardBeastId').textContent = 'BEAST ID • ' + S.profile.beastId;
  $('#cardLast4').textContent = S.profile.beastId.slice(-4);
  const visual = $('#beastCardVisual'); const typeLabel = $('#cardTypeLabel'); const statusBox = $('#cardStatus'); const controls = $('#cardControls'); const getOptions = $('#getCardOptions'); const notice = $('#cardNotice');
  visual.classList.remove('frozen', 'active-card');
  if(S.card.type === 'Preview only') {
    typeLabel.textContent = 'PREVIEW'; statusBox.textContent = 'STATUS: PREVIEW ONLY'; statusBox.className = 'panel status-panel';
    controls.classList.add('hidden'); getOptions.classList.remove('hidden'); notice.classList.remove('hidden');
  } else if (S.card.type === 'Virtual') {
    typeLabel.textContent = 'VIRTUAL CARD'; getOptions.classList.add('hidden'); notice.classList.add('hidden'); controls.classList.remove('hidden'); visual.classList.add('active-card');
    if(S.card.frozen) { visual.classList.add('frozen'); statusBox.textContent = 'STATUS: FROZEN ❄️'; statusBox.className = 'panel status-panel frozen'; $('#freeze').textContent = 'UNFREEZE CARD ☀️'; } 
    else { statusBox.textContent = 'STATUS: ACTIVE ✅'; statusBox.className = 'panel status-panel active'; $('#freeze').textContent = 'FREEZE CARD ❄️'; }
  } else if (S.card.type === 'Physical ordered') {
    typeLabel.textContent = 'PHYSICAL ORDER'; statusBox.textContent = 'STATUS: ORDER PLACED (Awaiting Delivery)'; statusBox.className = 'panel status-panel';
    getOptions.classList.add('hidden'); controls.classList.add('hidden'); notice.classList.add('hidden');
  }
}
$('#getVirtual').onclick = () => { S.card.type = 'Virtual'; S.card.active = true; S.card.frozen = false; save(); renderCard(); toast('Virtual card activated!'); };
$('#orderPhysical').onclick = () => { const cost = 100; if(S.balance < cost) return toast('Insufficient balance (KSh 100 required).'); if(!confirm(`Pay KSh ${cost} from wallet for physical card? (Demo only)`)) return; S.balance -= cost; S.card.type = 'Physical ordered'; save(); renderCard(); render(); toast('Physical card ordered!'); };
$('#freeze').onclick = () => { S.card.frozen = !S.card.frozen; save(); renderCard(); };
$('#cardQr').onclick = () => { alert('QR Code generated.'); };

// TRAVEL LOGIC
function resetTravel() {
  $('#travelWelcome').classList.remove('hidden'); $('#travelPassenger').classList.add('hidden');
  $('#travelDriverRegister').classList.add('hidden'); $('#travelRadarUI').classList.add('hidden');
}
$('#backToWelcomePassenger').onclick = resetTravel; $('#backToWelcome').onclick = resetTravel;
$('#btnPassengerMode').onclick = () => { $('#travelWelcome').classList.add('hidden'); $('#travelPassenger').classList.remove('hidden'); };
$('#btnDriverMode').onclick = () => { $('#travelWelcome').classList.add('hidden'); if (localStorage.getItem('beastDriverReg')) { $('#travelRadarUI').classList.remove('hidden'); $('#radarScanner').classList.add('scanning'); } else { $('#travelDriverRegister').classList.remove('hidden'); } };
$('#travelDriverForm').onsubmit = (e) => { e.preventDefault(); if(!confirm('Pay KSh 200 monthly subscription? (Demo)')) return; localStorage.setItem('beastDriverReg', 'true'); $('#travelDriverRegister').classList.add('hidden'); $('#travelRadarUI').classList.remove('hidden'); $('#radarScanner').classList.add('scanning'); };
$('#travelPassengerForm').onsubmit = (e) => { e.preventDefault(); $('#travelPassengerForm').classList.add('hidden'); $('#passengerWaiting').classList.remove('hidden'); setTimeout(() => { $('#passengerWaiting').innerHTML = '<h3>Driver Found!</h3><p>John Mwangi is on the way.</p>'; }, 3000); };

// MARKET & 12 BUSINESS TOOLS
function resetMarketToggle() {
  $('#btnShopMode').classList.add('active'); $('#btnBusinessMode').classList.remove('active');
  $('#shopMode').classList.remove('hidden'); $('#businessMode').classList.add('hidden');
}
$('#btnShopMode').onclick = resetMarketToggle;
$('#btnBusinessMode').onclick = () => {
  $('#btnBusinessMode').classList.add('active'); $('#btnShopMode').classList.remove('active');
  $('#businessMode').classList.remove('hidden'); $('#shopMode').classList.add('hidden');
};

function renderMarket() {
  if(S.publicProducts.length === 0) {
    S.publicProducts = [ { name: 'Running Shoes', price: 3500, icon: '👟', seller: 'BEAST Store' }, { name: 'Headphones', price: 1200, icon: '🎧', seller: 'BEAST Store' } ];
    save();
  }
  $('#publicProductList').innerHTML = S.publicProducts.map(p => `
    <div class="product-card">
      <div class="prod-img">${p.icon}</div>
      <b>${p.name}</b>
      <small>KES ${p.price}</small>
      <button class="btn primary full" style="padding:8px; font-size:12px; margin-top:8px;" onclick="buyProduct(${p.price}, '${p.name}')">Buy Now</button>
    </div>
  `).join('');
}
function buyProduct(price, name) { if(price > S.balance) return toast('Insufficient balance'); S.balance -= price; S.tx.unshift({note: 'Bought ' + name, amount: price}); save(); render(); toast('Purchase successful!'); }

function showMyProducts() {
  $('#businessMode').classList.add('hidden'); $('#myProductsView').classList.remove('hidden'); $('#fabAddProduct').classList.remove('hidden');
  if(S.myProducts.length === 0) { $('#myProductsList').innerHTML = '<p class="muted" style="text-align:center; margin-top:20px;">No products yet. Tap the + button to add.</p>'; return; }
  $('#myProductsList').innerHTML = S.myProducts.map(p => `
    <div class="product-list-item"><div class="icon">${p.icon}</div><div class="info"><b>${p.name}</b><small>KES ${p.price} · ${p.stock} in stock</small></div><button class="btn secondary" style="width:auto; padding:8px 12px; font-size:12px;">Edit</button></div>
  `).join('');
}
function showBusinessDashboard() { $('#myProductsView').classList.add('hidden'); $('#businessMode').classList.remove('hidden'); $('#fabAddProduct').classList.add('hidden'); }

// WIZARD
let currentStep = 1; let wizardData = {};
function openWizard() {
  currentStep = 1; wizardData = {};
  $('#wizardStep1').classList.remove('hidden'); $('#wizardStep2').classList.add('hidden'); $('#wizardStep3').classList.add('hidden'); $('#wizardStep4').classList.add('hidden');
  updateProgress(); $('#wizardModal').classList.remove('hidden');
}
function closeWizard() { $('#wizardModal').classList.add('hidden'); }
function nextStep(step) {
  if(step === 2) { const form = $('#wizardForm1'); if(!form.reportValidity()) return; const f = new FormData(form); wizardData.name = f.get('name'); wizardData.category = f.get('category'); wizardData.desc = f.get('desc'); }
  if(step === 4) { const form = $('#wizardForm3'); if(!form.reportValidity()) return; const f = new FormData(form); wizardData.price = Number(f.get('price')); wizardData.stock = Number(f.get('stock')); }
  currentStep = step; $('#wizardStep1').classList.add('hidden'); $('#wizardStep2').classList.add('hidden'); $('#wizardStep3').classList.add('hidden'); $('#wizardStep4').classList.add('hidden');
  $(`#wizardStep${step}`).classList.remove('hidden'); updateProgress();
}
function updateProgress() { $$('.w-progress-bar').forEach((bar, i) => { bar.classList.toggle('active', i < currentStep); }); }
function publishProduct() {
  const isBoosted = $('#boostCheckbox').checked; const boostCost = 500;
  if(isBoosted && S.balance < boostCost) return toast('Insufficient balance for Boost (KES 500).');
  if(isBoosted) { S.balance -= boostCost; S.tx.unshift({note: 'Boosted ' + wizardData.name, amount: boostCost}); }
  const newProduct = { name: wizardData.name, price: wizardData.price, stock: wizardData.stock, icon: '📦', seller: S.profile.name };
  S.myProducts.push(newProduct); S.publicProducts.unshift(newProduct);
  save(); closeWizard(); toast(isBoosted ? 'Product published and boosted!' : 'Product published!');
  showMyProducts(); renderMarket();
}

// AI
$('#aiFloatBtn').onclick = () => {
  const input = prompt("BEAST AI: How can I help you? (Try: send, withdraw, history)");
  if(!input) return; const lower = input.toLowerCase();
  if(lower.includes('send')) toast("Go to Money > Send.");
  else if(lower.includes('history')) toast("Go to Money > History.");
  else toast("I can help you find Send, Withdraw, or History.");
};

// NAV
$('#moreBtn').onclick = () => $('#beast-more').classList.remove('hidden');
$('#bm-close').onclick = () => $('#beast-more').classList.add('hidden');
$$('[data-page]').forEach(b => b.onclick = () => go(b.dataset.page));

// INIT
if(S.profile) { loginSuccess(); } else { go('register'); }
})();