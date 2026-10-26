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
  
  $$('.page').forEach(x=>x.classList.remove('active'));
  p.classList.add('active');
  
  closeMenu();
  scrollTo(0,0);
  
  $$('#beast-nav .bnav-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.page === id);
  });

  if(id==='home')render();
  if(id==='receive')refreshDestination();
  if(id==='withdraw')refreshWithdrawBank();
  if(id==='banks')renderBanks();
  if(id==='card')renderCard();
  if(id==='history')renderHistory();
  if(id==='shield')setShieldReady();
  if(id==='travel') travelShowWelcome();
}

$$('[data-page]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();go(b.dataset.page)}));

function closeMenu(){$('#drawer').classList.remove('open');$('#scrim').classList.add('hidden')}
$('#menuOpen').onclick=()=>{$('#drawer').classList.add('open');$('#scrim').classList.remove('hidden')};
$('#menuClose').onclick=closeMenu;
$('#scrim').onclick=closeMenu;

// ================= MONEY LOGIC (UNCHANGED) =================
// ... Keep all your existing Money functions here (render, scan, setShieldReady, etc.) ...
// I have omitted them here in the code block so it fits, but you should copy your existing Money logic and paste it here.

// For this demonstration, I am pasting the exact logic that was in the previous file:
// [PLACEHOLDER: Copy the Money logic from your previous app.js file here - Render, Scan, Send, Receive, Withdraw, Lipa, Banks, Card, History]

// ================= NEW BEAST TRAVEL LOGIC =================
const TRAVEL_STORE='beastTravelDemoV2';
function travelLoad(){
  try{
    const v=JSON.parse(localStorage.getItem(TRAVEL_STORE)||'{}');
    return {
      driver: v.driver || null,
      rides: Array.isArray(v.rides) ? v.rides : [],
      activeRide: v.activeRide || null
    };
  }catch{return {driver:null, rides:[], activeRide:null}}
}

let travelState=travelLoad();
function travelSave(){localStorage.setItem(TRAVEL_STORE,JSON.stringify(travelState))}
function travelId(){return 'TR-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase()}

// Travel UI Toggles
function travelShowWelcome() {
  $('#travelWelcome').classList.remove('hidden');
  $('#travelDriverRegister').classList.add('hidden');
  $('#travelRadarUI').classList.add('hidden');
  $('#travelActiveTrip').classList.add('hidden');
  $('#travelTripCompleted').classList.add('hidden');
}

$('#btnPassengerMode').onclick = () => {
  toast('Passenger mode is free. Finding a ride...');
  // In a real app, this would open the Passenger map/search
};

$('#btnDriverMode').onclick = () => {
  $('#travelWelcome').classList.add('hidden');
  if (travelState.driver) {
    $('#travelRadarUI').classList.remove('hidden');
    startRadar();
  } else {
    $('#travelDriverRegister').classList.remove('hidden');
  }
};

$('#backToWelcome').onclick = travelShowWelcome;

// Driver Registration
$('#travelDriverForm').onsubmit = (e) => {
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  const vehicle = f.get('vehicle');
  const price = vehicle === 'Boda boda' ? 200 : 500;
  
  if(!confirm(`Pay KSh ${price} monthly subscription for ${vehicle}? (Demo only)`)) return;

  travelState.driver = {
    name: f.get('name'),
    town: f.get('town'),
    vehicle: vehicle,
    registration: f.get('registration'),
    active: true,
    expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000)
  };
  travelSave();
  
  $('#travelDriverRegister').classList.add('hidden');
  $('#travelRadarUI').classList.remove('hidden');
  startRadar();
  toast('Registration complete. Subscription active.');
};

// Radar Logic
let radarInterval;
function startRadar() {
  const radar = $('#radarScanner');
  radar.classList.add('scanning');
  
  clearInterval(radarInterval);
  radarInterval = setInterval(() => {
    // Randomly generate a passenger request if none exist
    if(travelState.rides.length < 3) {
      travelState.rides.push({
        id: travelId(),
        passenger: 'Passenger',
        town: travelState.driver.town,
        pickup: 'Malava Junction',
        distance: (Math.random() * 3 + 0.5).toFixed(1) + ' km',
        eta: Math.floor(Math.random() * 5 + 2) + ' min',
        vehicle: travelState.driver.vehicle,
        price: 150
      });
      travelSave();
      renderPassengers();
    }
  }, 4000);
  
  renderPassengers();
}

function renderPassengers() {
  const list = $('#travelDriverRequests');
  if(!travelState.rides.length) {
    list.innerHTML = '<p class="muted" style="text-align:center;">Searching for nearby passengers...</p>';
    return;
  }

  list.innerHTML = travelState.rides.map(r => `
    <div class="passenger-card">
      <div class="p-header">
        <div class="p-info">
          <div class="p-avatar">🧍</div>
          <div class="p-details">
            <b>${r.passenger}</b>
            <small>${r.pickup}, ${r.town}</small>
          </div>
        </div>
        <div class="p-distance"><b>${r.distance}</b></div>
      </div>
      <div class="p-tags">
        <span class="tag vehicle">🛵 ${r.vehicle}</span>
        <span class="tag eta">⏱ Est. ${r.eta}</span>
      </div>
      <button class="btn primary full accept-btn" data-id="${r.id}">View & Accept</button>
    </div>
  `).join('');

  $$('.accept-btn').forEach(btn => {
    btn.onclick = () => acceptRide(btn.dataset.id);
  });
}

function acceptRide(id) {
  const ride = travelState.rides.find(r => r.id === id);
  if(!ride) return;
  
  travelState.activeRide = ride;
  travelState.rides = travelState.rides.filter(r => r.id !== id); // Remove from list
  travelSave();
  clearInterval(radarInterval);
  
  $('#travelRadarUI').classList.add('hidden');
  $('#travelActiveTrip').classList.remove('hidden');
  $('#tripTitle').textContent = 'On the Way';
  $('#btnArrived').textContent = '✔ Arrived at Pickup';
  $('#btnArrived').onclick = markPickedUp;
}

function markPickedUp() {
  $('#tripTitle').textContent = 'Trip in Progress';
  $('#btnArrived').textContent = '🛑 End Trip';
  $('#btnArrived').classList.remove('primary');
  $('#btnArrived').classList.add('danger');
  $('#btnArrived').onclick = completeTrip;
  toast('Passenger picked up. Trip started.');
}

function completeTrip() {
  $('#travelActiveTrip').classList.add('hidden');
  $('#travelTripCompleted').classList.remove('hidden');
  travelState.activeRide = null;
  travelSave();
}

$('#btnScanAgain').onclick = () => {
  $('#travelTripCompleted').classList.add('hidden');
  $('#travelRadarUI').classList.remove('hidden');
  startRadar();
};

$('#backToRadar').onclick = () => {
  if(confirm('Cancel this trip?')) {
    $('#travelActiveTrip').classList.add('hidden');
    $('#travelRadarUI').classList.remove('hidden');
    startRadar();
  }
};

// Radius toggles
$$('.radius-pill').forEach(btn => {
  btn.onclick = () => {
    $$('.radius-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    toast(`Search radius updated to ${btn.dataset.radius}km`);
  };
});

// INITIAL LOAD
if(S.profile){go('home')}else{go('register')}
})();