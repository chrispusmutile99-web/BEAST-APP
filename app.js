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

// ROUTER
function go(id){
  const p=$('#'+id); if(!p)return;
  $$('.page').forEach(x=>x.classList.remove('active')); p.classList.add('active');
  closeMenu(); scrollTo(0,0);
  $$('#beast-nav .bnav-btn').forEach(b=>{ b.classList.toggle('active', b.dataset.page === id); });
  if(id==='home')render();
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

// [MONEY LOGIC OMITTED FOR BREVITY - INSERT YOUR EXISTING MONEY LOGIC HERE]
// Note: Keep your existing render(), scan(), etc. functions here.

// ================= COMBINED MARKET/BUSINESS LOGIC =================
function resetMarketToggle() {
  $('#btnShopMode').classList.add('active');
  $('#btnBusinessMode').classList.remove('active');
  $('#shopMode').classList.remove('hidden');
  $('#businessMode').classList.add('hidden');
}

$('#btnShopMode').onclick = () => {
  $('#btnShopMode').classList.add('active'); $('#btnBusinessMode').classList.remove('active');
  $('#shopMode').classList.remove('hidden'); $('#businessMode').classList.add('hidden');
};

$('#btnBusinessMode').onclick = () => {
  $('#btnBusinessMode').classList.add('active'); $('#btnShopMode').classList.remove('active');
  $('#businessMode').classList.remove('hidden'); $('#shopMode').classList.add('hidden');
};

// ================= BEAST AI LOGIC =================
let currentAIMode = '';

function resetAIGrid() {
  $('#aiSelectionGrid').classList.remove('hidden');
  $('#aiChatContainer').classList.add('hidden');
}

$('#backToAIGrid').onclick = resetAIGrid;

$$('.ai-card').forEach(card => {
  card.onclick = () => {
    currentAIMode = card.dataset.ai;
    const title = card.querySelector('b').textContent;
    $('#aiChatTitle').textContent = title;
    $('#aiSelectionGrid').classList.add('hidden');
    $('#aiChatContainer').classList.remove('hidden');
    
    // Initial AI greeting based on mode
    const chatBox = $('#aiChatMessages');
    chatBox.innerHTML = '';
    let greeting = `Hello! I am your ${title}. How can I help you today?`;
    if(currentAIMode === 'fraud') greeting = "Security scan active. No suspicious activity detected in your account.";
    if(currentAIMode === 'business') greeting = "Welcome, Merchant. Your sales are up 12% this week. What would you like to know?";
    if(currentAIMode === 'advertising') greeting = "Ready to create a campaign? Tell me about the product you want to advertise.";
    
    addMessage('ai', greeting);
  };
});

function addMessage(sender, text) {
  const chatBox = $('#aiChatMessages');
  const msgDiv = document.createElement('div');
  msgDiv.className = `msg ${sender}`;
  msgDiv.textContent = text;
  chatBox.appendChild(msgDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
}

$('#aiSendBtn').onclick = () => {
  const input = $('#aiInputBox');
  const text = input.value.trim();
  if(!text) return;
  
  addMessage('user', text);
  input.value = '';
  
  // Simulate AI typing delay
  setTimeout(() => {
    let reply = "I'm analyzing that for you...";
    
    if(currentAIMode === 'admin') {
      if(text.toLowerCase().includes('earn') || text.toLowerCase().includes('revenue')) reply = "Total revenue this month is KES 650,000. Marketplace brought in KES 100,000 and Business Accounts brought in KES 250,000.";
      else if(text.toLowerCase().includes('expense')) reply = "Operating expenses are currently at KES 350,000. Your highest cost is marketing at KES 70,000.";
    } 
    else if(currentAIMode === 'customer') {
      if(text.toLowerCase().includes('send')) reply = "To send money, tap 'Money' on the bottom nav, then select 'Send'. Enter the recipient's phone or BEAST ID and the amount.";
      else if(text.toLowerCase().includes('receipt')) reply = "You can find all your receipts in the 'History' tab in the More menu.";
      else reply = "I can help you with sending money, checking your balance, and finding receipts. What do you need?";
    }
    else if(currentAIMode === 'fraud') {
      reply = "Scan complete. 0 high-risk alerts found. Your account is secure.";
    }
    else if(currentAIMode === 'business') {
      if(text.toLowerCase().includes('best') || text.toLowerCase().includes('sold')) reply = "Your top-selling product this week is the 'Smart Watch' with 45 units sold.";
      else reply = "Your sales are up 12% this week. Would you like to see the inventory report?";
    }
    else if(currentAIMode === 'advertising') {
      reply = "Here is a suggested ad for your product: '🔥 Get 20% off today! Premium quality guaranteed. Order now on BEAST.' Budget: KES 1,000 for 3 days.";
    }
    else if(currentAIMode === 'analytics') {
      reply = "Net profit this month is KES 300,000. Cash position looks healthy. Would you like to download the full PDF report?";
    }
    
    addMessage('ai', reply);
  }, 1200);
};

// Allow Enter key to send
$('#aiInputBox').addEventListener('keypress', function (e) {
  if (e.key === 'Enter') $('#aiSendBtn').click();
});

// INITIAL LOAD
if(S.profile){go('home')}else{go('register')}
})();