(() => {
'use strict';
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const STORE='beastFinalV1';
const emptyState=()=>({profile:null,balance:0,tx:[],banks:[]});
let S=load(),toastTimer=null;

function load(){try{return {...emptyState(),...JSON.parse(localStorage.getItem(STORE)||'{}')}}catch{return emptyState()}}
function save(){localStorage.setItem(STORE,JSON.stringify(S))}
function fmt(n){return 'KSh '+Number(n||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})}
function toast(msg){$('#toast').textContent=msg;$('#toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),3200)}

function go(id){
  $$('.page').forEach(p=>p.classList.remove('active'));
  const target = $('#'+id);
  if(target) target.classList.add('active');
  closeMenu(); scrollTo(0,0);
  $$('.bnav-btn').forEach(b=>b.classList.toggle('active', b.dataset.page === id));
  if(id === 'home' || id === 'history') render();
  if(id === 'banks') renderBanks();
}

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

$('#sendForm').onsubmit = (e) => {
  e.preventDefault(); const f = new FormData(e.currentTarget); const amt = Number(f.get('amount'));
  if(amt > S.balance) return toast('Insufficient balance');
  S.balance -= amt; S.tx.unshift({note: 'Sent to ' + f.get('recipient'), amount: amt});
  save(); go('home'); toast('Money sent!');
};

$('#withdrawForm').onsubmit = (e) => {
  e.preventDefault(); const f = new FormData(e.currentTarget); const amt = Number(f.get('amount'));
  if(amt > S.balance) return toast('Insufficient balance');
  S.balance -= amt; S.tx.unshift({note: 'Withdrawn to ' + f.get('dest'), amount: amt});
  save(); go('home'); toast('Withdrawal successful!');
};

$('#lipaForm').onsubmit = (e) => {
  e.preventDefault(); const f = new FormData(e.currentTarget); const amt = Number(f.get('amount'));
  if(amt > S.balance) return toast('Insufficient balance');
  S.balance -= amt; S.tx.unshift({note: 'Paid ' + f.get('merchant'), amount: amt});
  save(); go('home'); toast('Payment successful!');
};

$('#bankForm').onsubmit = (e) => {
  e.preventDefault(); const f = new FormData(e.currentTarget);
  S.banks.push({bank: f.get('bank'), acc: f.get('acc')});
  save(); renderBanks(); e.target.reset(); toast('Bank linked!');
};

$('#tabMarketplace').onclick = () => {
  $('#tabMarketplace').classList.add('active'); $('#tabMyShop').classList.remove('active');
  $('#marketplaceView').classList.remove('hidden'); $('#myShopView').classList.add('hidden');
};
$('#tabMyShop').onclick = () => {
  $('#tabMyShop').classList.add('active'); $('#tabMarketplace').classList.remove('active');
  $('#myShopView').classList.remove('hidden'); $('#marketplaceView').classList.add('hidden');
};

const products = [
  {name: 'Smart Watch', price: 2999, icon: '⌚'},
  {name: 'Running Shoes', price: 3500, icon: '👟'},
  {name: 'Headphones', price: 1200, icon: '🎧'},
  {name: 'Backpack', price: 800, icon: '🎒'}
];

function renderProducts() {
  $('#productList').innerHTML = products.map((p) => `
    <div class="product-card">
      <div class="prod-img">${p.icon}</div>
      <b>${p.name}</b>
      <small>KES ${p.price}</small>
      <button class="btn primary full" style="padding:8px; font-size:12px; margin-top:8px;" onclick="addToCart(${p.price}, '${p.name}')">Add to Cart</button>
    </div>
  `).join('');
}

window.addToCart = (price, name) => {
  if(price > S.balance) return toast('Insufficient balance');
  S.balance -= price; S.tx.unshift({note: 'Bought ' + name, amount: price});
  save(); render(); toast('Added to cart & paid!');
};

$('#aiFloatBtn').onclick = () => $('#aiPanel').classList.toggle('hidden');
$('#aiSendBtn').onclick = () => {
  const input = $('#aiInput').value.toLowerCase();
  const box = $('#aiMessages');
  box.innerHTML += `<br><b>You:</b> ${input}<br><b>AI:</b> `;
  if(input.includes('send')) box.innerHTML += "Go to Money > Send.";
  else if(input.includes('receipt') || input.includes('history')) box.innerHTML += "Go to More > History.";
  else if(input.includes('withdraw')) box.innerHTML += "Go to Money > Withdraw.";
  else box.innerHTML += "I can help you find things like Send Money, History, or Cards.";
  $('#aiInput').value = ''; box.scrollTop = box.scrollHeight;
};

$('#moreBtn').onclick = () => $('#beast-more').classList.remove('hidden');
$('#bm-close').onclick = () => $('#beast-more').classList.add('hidden');
$$('[data-page]').forEach(b => b.onclick = () => go(b.dataset.page));

renderProducts();
if(S.profile) { $('#beast-nav').classList.remove('hidden'); $('#aiFloatBtn').classList.remove('hidden'); go('home'); } else { go('register'); }
})();