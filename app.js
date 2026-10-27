(() => {
'use strict';
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const STORE='beastFinalV5';
const emptyState=()=>({profile:null,balance:0,tx:[],banks:[],myProducts:[],publicProducts:[],driver:false,passenger:false});
let S=load(),toastTimer=null;

function load(){try{return {...emptyState(),...JSON.parse(localStorage.getItem(STORE)||'{}')}}catch{return emptyState()}}
function save(){localStorage.setItem(STORE,JSON.stringify(S))}
function fmt(n){return 'KSh '+Number(n||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})}
function toast(msg){$('#toast').textContent=msg;$('#toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),3200)}

function go(id){
  $$('.page').forEach(p=>p.classList.remove('active'));
  const target = $('#'+id); if(target) target.classList.add('active');
  scrollTo(0,0);
  $$('.bnav-btn').forEach(b=>b.classList.toggle('active', b.dataset.page === id));
  if(id === 'home' || id === 'history') render();
  if(id === 'banks') renderBanks();
  if(id === 'market') renderMarket();
  if(id === 'travel') resetTravel();
}

// AUTH
$('#goToLogin').onclick = () => go('login');
$('#goToRegister').onclick = () => go('register');

$('#registerForm').onsubmit = (e) => {
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  S.profile = { name: f.get('name'), phone: f.get('phone'), beastId: 'BEAST-' + Math.floor(100000 + Math.random() * 900000) };
  S.balance = 5000;
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

// TRAVEL LOGIC
function resetTravel() {
  $('#travelWelcome').classList.remove('hidden');
  $('#travelPassenger').classList.add('hidden');
  $('#travelDriverRegister').classList.add('hidden');
  $('#travelRadarUI').classList.add('hidden');
}
$('#btnPassengerMode').onclick = () => { $('#travelWelcome').classList.add('hidden'); $('#travelPassenger').classList.remove('hidden'); };
$('#backToWelcomePassenger').onclick = resetTravel;
$('#btnDriverMode').onclick = () => {
  $('#travelWelcome').classList.add('hidden');
  if (S.driver) { $('#travelRadarUI').classList.remove('hidden'); } else { $('#travelDriverRegister').classList.remove('hidden'); }
};
$('#backToWelcome').onclick = resetTravel;
$('#travelDriverForm').onsubmit = (e) => {
  e.preventDefault();
  if(!confirm('Pay KSh 200 monthly subscription? (Demo)')) return;
  S.driver = true; save();
  $('#travelDriverRegister').classList.add('hidden'); $('#travelRadarUI').classList.remove('hidden');
};
$('#travelPassengerForm').onsubmit = (e) => {
  e.preventDefault(); toast('Searching for a driver...'); 
  setTimeout(() => { toast('Driver found!'); resetTravel(); }, 2000);
};

// MARKET & BUSINESS LOGIC
$('#tabMarketplace').onclick = () => {
  $('#tabMarketplace').classList.add('active'); $('#tabMyBusiness').classList.remove('active');
  $('#marketplaceView').classList.remove('hidden'); $('#myBusinessView').classList.add('hidden');
  $('#myProductsView').classList.add('hidden'); $('#fabAddProduct').classList.add('hidden');
  renderMarket();
};

$('#tabMyBusiness').onclick = () => {
  $('#tabMyBusiness').classList.add('active'); $('#tabMarketplace').classList.remove('active');
  $('#myBusinessView').classList.remove('hidden'); $('#marketplaceView').classList.add('hidden');
  $('#myProductsView').classList.add('hidden'); $('#fabAddProduct').classList.add('hidden');
};

function showMyProducts() {
  $('#myBusinessView').classList.add('hidden');
  $('#myProductsView').classList.remove('hidden');
  $('#fabAddProduct').classList.remove('hidden');
  renderMyProducts();
}

function showBusinessDashboard() {
  $('#myProductsView').classList.add('hidden');
  $('#myBusinessView').classList.remove('hidden');
  $('#fabAddProduct').classList.add('hidden');
}

function renderMarket() {
  if(S.publicProducts.length === 0) {
    S.publicProducts = [
      { name: 'Running Shoes', price: 3500, icon: '👟', seller: 'BEAST Store' },
      { name: 'Headphones', price: 1200, icon: '🎧', seller: 'BEAST Store' }
    ];
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

function renderMyProducts() {
  if(S.myProducts.length === 0) {
    $('#myProductsList').innerHTML = '<p class="muted" style="text-align:center; margin-top:20px;">No products yet. Tap the + button to add.</p>';
    return;
  }
  $('#myProductsList').innerHTML = S.myProducts.map(p => `
    <div class="product-list-item">
      <div class="icon">${p.icon}</div>
      <div class="info"><b>${p.name}</b><small>KES ${p.price} · ${p.stock} in stock</small></div>
      <button class="btn secondary" style="width:auto; padding:8px 12px; font-size:12px;">Edit</button>
    </div>
  `).join('');
}

function buyProduct(price, name) {
  if(price > S.balance) return toast('Insufficient balance');
  S.balance -= price; S.tx.unshift({note: 'Bought ' + name, amount: price});
  save(); render(); toast('Purchase successful!');
}

// WIZARD
let currentStep = 1;
let wizardData = {};

function openWizard() {
  currentStep = 1; wizardData = {};
  $('#wizardStep1').classList.remove('hidden');
  $('#wizardStep2').classList.add('hidden');
  $('#wizardStep3').classList.add('hidden');
  $('#wizardStep4').classList.add('hidden');
  updateProgress();
  $('#wizardModal').classList.remove('hidden');
}

function closeWizard() { $('#wizardModal').classList.add('hidden'); }

function nextStep(step) {
  if(step === 2) {
    const form = $('#wizardForm1');
    if(!form.reportValidity()) return;
    const f = new FormData(form);
    wizardData.name = f.get('name');
    wizardData.category = f.get('category');
    wizardData.desc = f.get('desc');
  }
  if(step === 4) {
    const form = $('#wizardForm3');
    if(!form.reportValidity()) return;
    const f = new FormData(form);
    wizardData.price = Number(f.get('price'));
    wizardData.stock = Number(f.get('stock'));
  }
  currentStep = step;
  $('#wizardStep1').classList.add('hidden'); $('#wizardStep2').classList.add('hidden');
  $('#wizardStep3').classList.add('hidden'); $('#wizardStep4').classList.add('hidden');
  $(`#wizardStep${step}`).classList.remove('hidden');
  updateProgress();
}

function updateProgress() {
  $$('.w-progress-bar').forEach((bar, i) => { bar.classList.toggle('active', i < currentStep); });
}

function publishProduct() {
  const isBoosted = $('#boostCheckbox').checked;
  const boostCost = 500;
  if(isBoosted && S.balance < boostCost) return toast('Insufficient balance for Boost (KES 500).');
  if(isBoosted) { S.balance -= boostCost; S.tx.unshift({note: 'Boosted ' + wizardData.name, amount: boostCost}); }
  
  const newProduct = { name: wizardData.name, price: wizardData.price, stock: wizardData.stock, icon: '📦', seller: S.profile.name };
  S.myProducts.push(newProduct);
  S.publicProducts.unshift(newProduct);
  save(); closeWizard();
  toast(isBoosted ? 'Product published and boosted!' : 'Product published!');
  showMyProducts(); renderMarket();
}

// AI
$('#aiFloatBtn').onclick = () => {
  const input = prompt("BEAST AI: How can I help you? (Try: send, withdraw, history)");
  if(!input) return;
  const lower = input.toLowerCase();
  if(lower.includes('send')) toast("Go to Money > Send.");
  else if(lower.includes('history')) toast("Go to Money > History.");
  else toast("I can help you find Send, Withdraw, or History.");
};

// NAV
$('#moreBtn').onclick = () => go('home'); // Placeholder for More menu
$$('[data-page]').forEach(b => b.onclick = () => go(b.dataset.page));

// INIT
if(S.profile) { loginSuccess(); } else { go('register'); }
renderMarket();
})();