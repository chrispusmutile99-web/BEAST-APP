document.addEventListener("DOMContentLoaded", () => {
"use strict";

const STORAGE_KEY   = "beast_superapp_v1";
const SESSION_KEY   = "beast_superapp_session_v1";
const THEME_KEY     = "beast_superapp_theme";
const SERVER_URL    = "https://beast-server-8u92.onrender.com";
const MIN_PASSWORD_LENGTH = 6;
const MAX_BULK_ROWS = 200;

const REGISTERED_AGENTS = { "0712345678": "BEAST Agent", "0720000000": "Safaricom Agent", "AGENT-001": "Demo Agent 1" };
const SOURCE_NAMES = { mpesa: "M-PESA", tkash: "T-Kash", airtel: "Airtel", bank: "Bank", card: "Card", wallet: "BEAST Wallet" };
const SOURCE_ICONS = { mpesa: "📱", tkash: "📲", airtel: "📲", bank: "🏦", card: "💳", wallet: "🐾" };
const ALL_SOURCES = ["mpesa","wallet","bank","card","airtel","tkash"];
const BANK_LIST = [ "ABC Bank","Absa Bank Kenya","Co-operative Bank","Equity Bank","KCB Bank","NCBA Bank","Prime Bank","Family Bank","Other" ];

const MAX_PIN_ATTEMPTS = 3; const PIN_LOCKOUT_MS = 30 * 1000; const AUTO_LOCK_MS = 2 * 60 * 1000;
const BUYER_SUCCESS_MS = 5000; const BUYER_SESSION_MS = 60 * 1000;

const DEMO_BUYERS = [
  { phone: "0722000001", nationalId: "11111111", pin: "1111", name: "Alice Njeri", sources: { mpesa: { enabled: true, balance: 12500 }, wallet: { enabled: true, balance: 0 }, bank: { enabled: true, balance: 8000, bankName: "Equity Bank" }, card: { enabled: true, balance: 15000, cardName: "Visa", last4: "4321" }, airtel: { enabled: true, balance: 2500 }, tkash: { enabled: false, balance: 0 } } },
  { phone: "0722000002", nationalId: "22222222", pin: "2222", name: "Brian Otieno", sources: { mpesa: { enabled: true, balance: 3200 }, wallet: { enabled: true, balance: 500 }, bank: { enabled: true, balance: 2500, bankName: "KCB Bank" }, card: { enabled: false, balance: 0 }, airtel: { enabled: true, balance: 1000 }, tkash: { enabled: true, balance: 800 } } }
];

function defaultState(){
  return {
    registered: false, user: { name: "", phone: "", nationalId: "", beastId: "", pinHash: "", pinSalt: "", passwordHash: "", passwordSalt: "" },
    sources: { mpesa: { balance: 5000, enabled: true, account: "0712345678" }, tkash: { balance: 1000, enabled: true, account: "0712345678" }, airtel: { balance: 1000, enabled: true, account: "0712345678" }, bank: { balance: 0, enabled: false, account: "", bankName: "" }, card: { balance: 0, enabled: false, account: "", cardName: "", last4: "" }, wallet: { balance: 0, enabled: true, account: "BEAST-WALLET" } },
    receiving: { wallet: { enabled: true }, pochi: { enabled: false, phone: "" }, till: { enabled: false, number: "" }, paybill: { enabled: false, number: "", account: "" }, bank: { enabled: false, bankName: "", account: "" }, card: { enabled: false, cardName: "", last4: "" } },
    currentSource: "mpesa", chat: [], transactions: [], notifications: [], securityEvents: [],
    settings: { notifications: true, screenSecurity: true, biometric: false, dark: true },
    security: { failedPinAttempts: 0, lockoutUntil: 0 }, buyerSecurity: { failedPinAttempts: 0, lockoutUntil: 0 }, recentBuyers: [], savedBulkLists: {}
  };
}

function loadState(){
  try{
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(saved){
      const base = defaultState();
      return { ...base, ...saved, user: { ...base.user, ...(saved.user || {}) }, sources: { ...base.sources, ...(saved.sources || {}) }, receiving: { ...base.receiving, ...(saved.receiving || {}) }, settings: { ...base.settings, ...(saved.settings || {}) }, security: { ...base.security, ...(saved.security || {}) }, buyerSecurity: { ...base.buyerSecurity, ...(saved.buyerSecurity || {}) }, savedBulkLists: saved.savedBulkLists || {} };
    }
  }catch(e){}
  return defaultState();
}

const state = loadState();
let sessionToken = sessionStorage.getItem(SESSION_KEY) || null;
let pendingAction = null, cameraStream = null, autoLockTimer = null, buyerSession = null, buyerStep = 1, buyerSuccessTimer = null, buyerSessionTimer = null, bulkRows = [], socket = null, currentAnnouncement = null;

function $(id){ return document.getElementById(id); }
function money(v){ return `KES ${Number(v || 0).toLocaleString("en-KE",{ minimumFractionDigits:2, maximumFractionDigits:2 })}`; }
function normalizePhone(value=""){ let p = String(value).trim().replace(/\s+/g,"").replace(/-/g,""); if(p.startsWith("+254")) p = "0" + p.slice(4); else if(p.startsWith("254")) p = "0" + p.slice(3); return p; }
function validPhone(value){ return /^(07|01)\d{8}$/.test(normalizePhone(value)); }

function normalizeRecipient(value=""){
  let v = String(value).trim().toUpperCase();
  if(v.startsWith("BEAST-")) return v;
  if(/^\d{6}$/.test(v)) return `BEAST-${v}`;
  return normalizePhone(v);
}

function internationalPhone(value){ const p = normalizePhone(value); return validPhone(p) ? "+254" + p.slice(1) : ""; }
function validAgent(v){ return String(v || "").trim().length >= 4; }
function validAccount(v){ return /^[A-Za-z0-9][A-Za-z0-9\- ]{3,}$/.test(String(v || "").trim()); }
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function randomDigits(n){ return Math.floor(Math.random() * Math.pow(10,n)).toString().padStart(n,"0"); }
function randomHex(bytes){ const arr = new Uint8Array(bytes); crypto.getRandomValues(arr); return Array.from(arr).map(b => b.toString(16).padStart(2,"0")).join(""); }
function generateReference(){ return `BST-${Date.now().toString().slice(-8)}-${randomDigits(3)}`; }
function escapeHTML(v){ return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function dateText(v){ return new Date(v).toLocaleString("en-KE"); }
function toast(msg){ const el = $("toast"); if(!el) return; el.textContent = msg; el.classList.add("show"); clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove("show"), 2600); }

async function hashValue(value, saltHex){ const data = new TextEncoder().encode(saltHex + ":" + value); const digest = await crypto.subtle.digest("SHA-256", data); return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,"0")).join(""); }
async function setPin(pin){ state.user.pinSalt = randomHex(16); state.user.pinHash = await hashValue(pin, state.user.pinSalt); }
async function verifyPin(pin){ if(!state.user.pinHash || !state.user.pinSalt) return false; return (await hashValue(pin, state.user.pinSalt)) === state.user.pinHash; }
async function setPassword(pw){ state.user.passwordSalt = randomHex(16); state.user.passwordHash = await hashValue(pw, state.user.passwordSalt); }
async function verifyPasswordLocal(pw){ if(!state.user.passwordHash || !state.user.passwordSalt) return false; return (await hashValue(pw, state.user.passwordSalt)) === state.user.passwordHash; }

const demoBuyerHashes = {};
async function buildDemoBuyerHashes(){ for(const b of DEMO_BUYERS){ const salt = randomHex(16); demoBuyerHashes[b.phone] = { salt, hash: await hashValue(b.pin, salt) }; } }
async function verifyDemoBuyerPin(phone, pin){ const entry = demoBuyerHashes[phone]; if(!entry) return false; return (await hashValue(pin, entry.salt)) === entry.hash; }

function mpesaSendFee(a){ a=Number(a||0); if(a<=100)return 0; if(a<=500)return 7; if(a<=1000)return 13; if(a<=1500)return 23; if(a<=2500)return 33; if(a<=3500)return 53; if(a<=5000)return 57; if(a<=7500)return 78; if(a<=10000)return 90; if(a<=15000)return 100; if(a<=20000)return 105; return 108; }
function mpesaWithdrawFee(a){ a=Number(a||0); if(a<=100)return 11; if(a<=1500)return 29; if(a<=2500)return 29; if(a<=3500)return 52; if(a<=5000)return 69; if(a<=7500)return 87; if(a<=10000)return 115; if(a<=15000)return 167; if(a<=20000)return 185; if(a<=35000)return 197; if(a<=50000)return 278; return 309; }
function tkashSendFee(a){ a=Number(a||0); if(a<=100)return 0; if(a<=500)return 6; if(a<=1000)return 13; if(a<=1500)return 21; if(a<=2500)return 33; if(a<=3500)return 47; if(a<=5000)return 57; if(a<=7500)return 67; if(a<=10000)return 88; if(a<=20000)return 93; return 103; }
function airtelSendFee(a){ a=Number(a||0); if(a<=100)return 0; if(a<=500)return 7; if(a<=1000)return 13; if(a<=1500)return 33; if(a<=2500)return 53; if(a<=3500)return 57; if(a<=5000)return 78; if(a<=7500)return 90; if(a<=10000)return 100; return 110; }
function bankFee(a){ a=Number(a||0); if(a<=1000)return 0; if(a<=5000)return 5; return 20; }
function cardFee(a){ return Math.round(Number(a||0) * 0.029); }

function providerCost(source, amount, type = "send"){
  amount = Number(amount || 0);
  if(source === "wallet") return 0;
  if(source === "mpesa") return type === "withdraw" ? mpesaWithdrawFee(amount) : mpesaSendFee(amount);
  if(source === "tkash") return tkashSendFee(amount);
  if(source === "airtel") return airtelSendFee(amount);
  if(source === "bank") return bankFee(amount);
  if(source === "card") return cardFee(amount);
  return 0;
}

function beastWalletFee(amount){ const mpesa = mpesaSendFee(Number(amount) || 0); return Math.max(0, mpesa - 3); }
function externalSplit(source, amount, type = "send"){ const fee = providerCost(source, amount, type); const beastCut = Math.round(fee * 0.4); const providerKeeps = fee - beastCut; return { fee, beastCut, providerKeeps }; }

function costPreview(source, amount, type = "send"){
  const amt = Number(amount) || 0;
  if(amt <= 0) return `<b>Cost preview</b><br>Enter an amount.`;
  if(source === "wallet"){ const fee = beastWalletFee(amt); return `<b>BEAST Wallet</b><br>Amount: ${money(amt)}<br>BEAST fee: ${money(fee)}<br><br><strong>Total: ${money(amt + fee)}</strong>`; }
  const { fee } = externalSplit(source, amt, type);
  return `<b>Cost preview</b><br>Amount: ${money(amt)}<br>${SOURCE_NAMES[source] || source} fee: ${money(fee)}<br><br><strong>Total: ${money(amt + fee)}</strong>`;
}

function setTheme(dark){ state.settings.dark = dark; document.documentElement.dataset.theme = dark ? "dark" : "light"; localStorage.setItem(THEME_KEY, dark ? "dark" : "light"); save(); }
function loadTheme(){ const t = localStorage.getItem(THEME_KEY) || "dark"; setTheme(t === "dark"); }
function isLoggedIn(){ return state.registered && sessionToken === "active"; }
function startSession(){ sessionToken = "active"; sessionStorage.setItem(SESSION_KEY, sessionToken); }
function endSession(){ sessionToken = null; sessionStorage.removeItem(SESSION_KEY); }

const screenMap = {
  welcome:"welcomeScreen", login:"loginScreen", registration:"registrationScreen", money:"moneyScreen", send:"sendScreen", bulk:"bulkScreen", receive:"receiveScreen", withdraw:"withdrawScreen", lipa:"lipaScreen", history:"historyScreen", statements:"statementsScreen", chat:"chatScreen", calls:"callsScreen", connect:"connectScreen", profile:"profileScreen", premium:"premiumScreen", security:"securityScreen", notifications:"notificationsScreen", settings:"settingsScreen"
};

const SENSITIVE_FIELDS = [ "regPin","regPin2","regPassword","regPassword2","loginPassword","loginPin", "sendAmount","sendPhone","withdrawAmount","withdrawMobileAmount","withdrawMobilePhone","agentNumber","lipaAmount","depositAmount","agentDepositAmount","authorizationPin", "oldPin","newPin","confirmNewPin","buyerLoginPhone","buyerLoginNationalId","buyerLoginPin","buyerPayAmount", "bulkList","chatInput","recipientId","searchInput" ];

function clearSensitiveFields(){ SENSITIVE_FIELDS.forEach(id => { const el = $(id); if(el) el.value = ""; }); ["recipientVerification","agentVerification","lipaVerification","agentDepositVerification"].forEach(id => $(id)?.classList.add("hidden")); }

function showScreen(name){
  const screen = screenMap[name] || name;
  document.querySelectorAll(".app-screen").forEach(el => el.classList.remove("active"));
  const target = $(screen); if(target) target.classList.add("active");
  document.querySelectorAll("[data-tab]").forEach(t => t.classList.toggle("active", t.dataset.tab === getTabForScreen(name)));
  clearSensitiveFields(); closeMenu(); resetAutoLock();
  if(name === "receive"){ resetBuyerFlow(); renderReceiveSellerLine(); }
  if(name === "statements") renderStatements();
  if(name === "bulk") resetBulkFlow();
  if(name === "chat") renderChat();
  if(name === "history") fetchHistory();
  window.scrollTo({ top:0, behavior:"smooth" }); renderEverything();
}

function getTabForScreen(name){ if(["money","send","bulk","receive","withdraw","lipa","history","statements"].includes(name)) return "money"; if(name === "chat") return "chat"; if(name === "calls") return "calls"; if(name === "connect") return "connect"; if(["profile","premium","security","notifications","settings"].includes(name)) return "profile"; return null; }
function openMenu(){ $("menuDrawer")?.classList.add("open"); $("drawerBackdrop")?.classList.add("open"); }
function closeMenu(){ $("menuDrawer")?.classList.remove("open"); $("drawerBackdrop")?.classList.remove("open"); }
function resetAutoLock(){ clearTimeout(autoLockTimer); if(!isLoggedIn()) return; autoLockTimer = setTimeout(() => { if(!isLoggedIn()) return; addSecurity("Session auto-locked."); save(); showScreen("login"); toast("Session locked."); }, AUTO_LOCK_MS); }

/* ================= AUTH (Unchanged) ================= */
function setupWelcome(){
  $("goRegisterButton")?.addEventListener("click", () => showScreen("registration"));
  $("goLoginButton")?.addEventListener("click", () => { if(!state.registered){ toast("No BEAST account yet."); showScreen("registration"); return; } showScreen("login"); });
}

function setupLogin(){
  $("loginSubmitButton")?.addEventListener("click", async () => {
    const phone = normalizePhone($("loginPhone")?.value || ""); const password = $("loginPassword")?.value || "";
    if(!validPhone(phone)){ toast("Enter valid phone."); return; }
    if(password.length < MIN_PASSWORD_LENGTH){ toast(`Min ${MIN_PASSWORD_LENGTH} characters.`); return; }
    if(phone === state.user.phone) {
      const ok = await verifyPasswordLocal(password);
      if(!ok){ addSecurity("Failed login."); save(); toast("Incorrect password."); return; }
      $("loginPassword").value = ""; authorize("Login", () => { startSession(); save(); showScreen("money"); }); return;
    }
    const btn = $("loginSubmitButton"); btn.textContent = "CHECKING..."; btn.disabled = true;
    try {
      const res = await fetch(SERVER_URL + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, passwordHash: await hashValue(password, "demo-salt") }) });
      const data = await res.json();
      if (!data.ok) { toast(data.error); btn.textContent = "CONTINUE"; btn.disabled = false; return; }
      state.user = data.user; state.registered = true; state.sources = defaultState().sources; 
      save(); $("loginPassword").value = ""; authorize("Login", () => { startSession(); save(); showScreen("money"); });
    } catch (e) { toast("Network error."); btn.textContent = "CONTINUE"; btn.disabled = false; }
  });
  $("backToWelcomeFromLogin")?.addEventListener("click", () => showScreen("welcome"));
}

function setupRegistration(){
  $("backToWelcomeFromRegister")?.addEventListener("click", () => showScreen("welcome"));
  $("regNext1")?.addEventListener("click", () => {
    const name = $("regName").value.trim(); const phone = normalizePhone($("regPhone").value); const nationalId = $("regNationalId").value.trim();
    if(name.length < 2){ toast("Enter name."); return; } if(!validPhone(phone)){ toast("Enter valid phone."); return; } if(nationalId.length < 5){ toast("Enter National ID."); return; }
    state.user.name = name; state.user.phone = phone; state.user.nationalId = nationalId;
    $("regStep1").classList.add("hidden"); $("regStep2").classList.remove("hidden");
  });
  $("regNext2")?.addEventListener("click", async () => {
    const password = $("regPassword").value; const password2 = $("regPassword2").value; const pin = $("regPin").value; const confirmPin = $("regPin2").value;
    if(password.length < MIN_PASSWORD_LENGTH){ toast("Min 6 chars."); return; } if(password !== password2){ toast("Passwords don't match."); return; } if(!/^\d{4}$/.test(pin)){ toast("PIN must be 4 digits."); return; } if(pin !== confirmPin){ toast("PINs don't match."); return; }
    await setPassword(password); await setPin(pin);
    $("registrationSummary").innerHTML = `<b>${escapeHTML(state.user.name)}</b><br>Phone: ${escapeHTML(state.user.phone)}`;
    $("regStep2").classList.add("hidden"); $("regStep3").classList.remove("hidden");
  });
  $("finishRegistration")?.addEventListener("click", async () => {
    const btn = $("finishRegistration"); btn.textContent = "CREATING..."; btn.disabled = true;
    try {
      const payload = { name: state.user.name, phone: state.user.phone, nationalId: state.user.nationalId, pinHash: state.user.pinHash, pinSalt: state.user.pinSalt, passwordHash: state.user.passwordHash, passwordSalt: state.user.passwordSalt };
      const res = await fetch(SERVER_URL + "/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!data.ok) { toast(data.error); btn.textContent = "CREATE BEAST ID"; btn.disabled = false; return; }
      state.user.beastId = data.beastId; state.registered = true;
      startSession(); save(); showScreen("money");
    } catch (e) { toast("Network error."); btn.textContent = "CREATE BEAST ID"; btn.disabled = false; }
  });
}

/* ================= SOURCES (Unchanged) ================= */
function totalBalance(){ return Object.values(state.sources).reduce((t,s) => t + (s.enabled ? Number(s.balance) : 0), 0); }
function renderSources(containerId){
  const container = $(containerId); if(!container) return;
  container.innerHTML = Object.entries(state.sources).map(([key, source]) => {
    const icon = SOURCE_ICONS[key] || "❓"; let details = source.account || "Not linked";
    if(key === "bank" && source.bankName) details = `${source.bankName} • ${source.account}`;
    if(key === "card") details = source.cardName ? `${source.cardName} •••• ${source.last4 || "----"}` : "Not linked";
    const isCurrent = state.currentSource === key && source.enabled;
    return `<div class="source-card ${isCurrent ? "current-source" : ""} ${source.enabled ? "" : "source-disabled"}" data-source="${key}"><div class="source-top"><span class="source-icon">${icon}</span><span class="pill ${source.enabled ? "green" : "red"}">${source.enabled ? "DEMO" : "OFF"}</span></div><div><strong>${SOURCE_NAMES[key]}</strong><small>${escapeHTML(details)}</small>${isCurrent ? `<span class="pill green" style="margin-top:4px;">CURRENT</span>` : ""}</div><strong>${money(source.balance)}</strong></div>`;
  }).join("");
  container.querySelectorAll("[data-source]").forEach(card => { card.addEventListener("click", () => { const key = card.dataset.source; const source = state.sources[key]; if(!source || !source.enabled){ toast(`${SOURCE_NAMES[key]} not linked.`); return; } state.currentSource = key; save(); renderSources("sourceList"); fillSourceSelects(); toast(`${SOURCE_NAMES[key]} is now current.`); }); });
}
function fillSourceSelects(){
  ["sendSource","withdrawSource","withdrawMobileSource","lipaSource","bulkSource"].forEach(id => {
    const select = $(id); if(!select) return; const current = select.value || state.currentSource;
    select.innerHTML = Object.entries(state.sources).filter(([,s]) => s.enabled).map(([key]) => `<option value="${key}">${SOURCE_NAMES[key]}</option>`).join("");
    if(current && state.sources[current]?.enabled) select.value = current;
  });
}

/* ================= TRANSACTIONS ================= */
async function recordTransactionToServer(txn) {
  try { await fetch(SERVER_URL + "/api/transaction", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...txn, beastId: state.user.beastId }) }); } catch(e) {}
}
async function sendInternalToServer(toBeastId, amount, reference) {
  try { const res = await fetch(SERVER_URL + "/api/send-internal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromBeastId: state.user.beastId, toBeastId, amount, reference }) }); return await res.json(); } catch(e) { return { error: "Network error" }; }
}
async function fetchHistory() {
  if(!state.user.beastId) return;
  try { const res = await fetch(SERVER_URL + "/api/transactions/" + state.user.beastId); const data = await res.json(); if(data.ok) { state.transactions = data.transactions; save(); renderHistory(); renderStatements(); } } catch(e) {}
}

function setupSend(){
  $("verifyRecipient")?.addEventListener("click", () => {
    const recipient = normalizeRecipient($("sendPhone").value);
    if (recipient.startsWith("BEAST-")) { if (recipient === state.user.beastId) { toast("Cannot send to yourself."); return; } $("recipientVerification").classList.remove("hidden"); $("recipientVerification").innerHTML = `<strong>✓ BEAST User</strong>${escapeHTML(recipient)}`; $("sendSource").value = "wallet"; $("sendSource").disabled = true; } 
    else { if(!validPhone(recipient)){ toast("Enter valid phone or BEAST ID."); return; } if(recipient === state.user.phone){ toast("Cannot send to yourself."); return; } $("recipientVerification").classList.remove("hidden"); $("recipientVerification").innerHTML = `<strong>✓ Demo recipient</strong>${escapeHTML(recipient)}`; $("sendSource").disabled = false; }
  });

  $("sendMoneyButton")?.addEventListener("click", () => {
    const recipient = normalizeRecipient($("sendPhone").value); let source = $("sendSource").value;
    if (recipient.startsWith("BEAST-")) { if (recipient === state.user.beastId) { toast("Cannot send to yourself."); return; } source = "wallet"; } 
    else { if(!validPhone(recipient)){ toast("Enter valid phone."); return; } if(recipient === state.user.phone){ toast("Cannot send to yourself."); return; } }
    const amount = Number($("sendAmount").value); if(amount <= 0){ toast("Enter amount."); return; }
    let fee = source === "wallet" ? beastWalletFee(amount) : externalSplit(source, amount).fee;
    askConfirmation(buildConfirmHTML({ title:"Confirm send", recipientName: recipient.startsWith("BEAST-") ? "BEAST User" : "Demo recipient", recipient: recipient, amount, source, fee }), () => authorize("Send money", () => { completeTransaction({ type:"Send", amount, source, recipient: recipient, recipientName: recipient.startsWith("BEAST-") ? "BEAST User" : "Demo recipient", description: recipient.startsWith("BEAST-") ? `BEAST transfer to ${recipient}` : `Send to ${recipient}` }); }));
  });
}

function setupWithdraw(){
  // Tabs
  document.querySelectorAll("[data-wtab]").forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.wtab;
      document.querySelectorAll("[data-wtab]").forEach(t => t.classList.toggle("active", t === tab));
      document.querySelectorAll("#withdrawScreen .receive-tab-panel").forEach(p => p.classList.remove("active"));
      $(target === "agent" ? "withdrawAgentTab" : "withdrawMobileTab").classList.add("active");
    });
  });

  // Agent logic
  $("verifyAgent")?.addEventListener("click", () => { const number = ($("agentNumber").value || "").trim(); const store = ($("withdrawStore").value || "").trim(); if(!validAgent(number)){ toast("Enter agent ID."); return; } $("agentVerification").classList.remove("hidden"); $("agentVerification").innerHTML = `<strong>✓ Agent ${escapeHTML(number)}</strong>Store: ${escapeHTML(store)}`; });
  $("withdrawButton")?.addEventListener("click", () => {
    if($("agentVerification").classList.contains("hidden")){ toast("Verify agent first."); return; }
    const amount = Number($("withdrawAmount").value); const source = $("withdrawSource").value; const agent = ($("agentNumber").value || "").trim(); if(amount <= 0){ toast("Enter amount."); return; }
    let fee = source === "wallet" ? beastWalletFee(amount) : externalSplit(source, amount, "withdraw").fee;
    askConfirmation(buildConfirmHTML({ title:"Confirm Withdraw", recipientName:"Agent", recipient: agent, amount, source, fee }), () => authorize("Withdrawal", () => { completeTransaction({ type:"Withdraw", amount, source, recipient: agent, recipientName:"Agent", description:"Agent cash out", providerType:"withdraw" }); }));
  });

  // Mobile logic
  $("withdrawMobilePhone")?.addEventListener("input", updateMobileWithdrawPreview);
  $("withdrawMobileAmount")?.addEventListener("input", updateMobileWithdrawPreview);
  $("withdrawMobileButton")?.addEventListener("click", () => {
    const phone = normalizePhone($("withdrawMobilePhone").value); const amount = Number($("withdrawMobileAmount").value); if(!validPhone(phone)){ toast("Enter valid phone."); return; } if(amount <= 0){ toast("Enter amount."); return; }
    askConfirmation(buildConfirmHTML({ title:"Mobile Withdraw", recipientName:"Mobile Money", recipient: phone, amount, source: "wallet", fee: beastWalletFee(amount) }), () => authorize("Withdraw", () => { completeTransaction({ type:"Withdraw", amount, source:"wallet", recipient: phone, recipientName:"Mobile Money", description:"Withdraw to Mobile" }); }));
  });
}

function updateMobileWithdrawPreview(){
  const box = $("withdrawMobileCostPreview"); if(!box) return; const amount = Number($("withdrawMobileAmount")?.value || 0);
  if(amount <= 0) { box.innerHTML = `<b>Cost preview</b><br>Enter amount.`; return; }
  const fee = beastWalletFee(amount);
  box.innerHTML = `<b>Mobile Transfer</b><br>Amount: ${money(amount)}<br>Fee: ${money(fee)}<br><br><strong>Total: ${money(amount+fee)}</strong>`;
}

function lipaFields(){
  const type = $("lipaType")?.value; if(!$("lipaDestinationFields")) return;
  if(type === "beast"){ $("lipaDestinationFields").innerHTML = `<label>BEAST ID<input id="lipaDestNumber" placeholder="e.g. 835678"></label>`; $("lipaSource").value = "wallet"; $("lipaSource").disabled = true; }
  else { $("lipaSource").disabled = false; if(type === "paybill"){ $("lipaDestinationFields").innerHTML = `<div class="two-col"><label>PayBill<input id="lipaDestNumber" placeholder="123456"></label><label>Account<input id="lipaAccount" placeholder="ACC"></label></div>`; } else if(type === "till"){ $("lipaDestinationFields").innerHTML = `<label>Till<input id="lipaDestNumber" placeholder="123456"></label>`; } else if(type === "pochi"){ $("lipaDestinationFields").innerHTML = `<label>Pochi phone<input id="lipaDestNumber" placeholder="0712345678"></label>`; } else { $("lipaDestinationFields").innerHTML = `<label>Reference<input id="lipaDestNumber" placeholder="Ref"></label>`; } }
}

function setupLipa(){
  $("lipaType")?.addEventListener("change", lipaFields); lipaFields();
  $("verifyLipa")?.addEventListener("click", () => { const value = ($("lipaDestNumber")?.value || "").trim(); if(value.length < 4){ toast("Enter destination."); return; } $("lipaVerification").classList.remove("hidden"); $("lipaVerification").innerHTML = `<strong>✓ Verified</strong>${escapeHTML(value)}`; });
  $("lipaPayButton")?.addEventListener("click", () => {
    if($("lipaVerification").classList.contains("hidden")){ toast("Verify destination first."); return; }
    let dest = $("lipaDestNumber").value; const type = $("lipaType").value; const amount = Number($("lipaAmount").value); let source = $("lipaSource").value;
    if(type === "beast") { dest = normalizeRecipient(dest); source = "wallet"; if(!dest.startsWith("BEAST-")) { toast("Invalid BEAST ID"); return; } }
    if(amount <= 0){ toast("Enter amount."); return; }
    let fee = source === "wallet" ? beastWalletFee(amount) : externalSplit(source, amount).fee;
    askConfirmation(buildConfirmHTML({ title:"Confirm Payment", recipientName: dest.startsWith("BEAST-") ? "BEAST User" : "Business", recipient: dest, amount, source, fee }), () => authorize("Pay", () => { completeTransaction({ type:"Lipa Na", amount, source, recipient: dest, recipientName: dest.startsWith("BEAST-") ? "BEAST User" : "Business", description:`${type} payment` }); }));
  });
}

/* ================= BULK ================= */
function parseBulkList(text){
  const rows = [], errors = [];
  String(text || "").split(/\r?\n/).map(l => l.trim()).filter(l => l.length).forEach((line, i) => {
    const parts = line.split(/[,\s;]+/).filter(p => p.length);
    if(parts.length < 2){ errors.push(`Line ${i+1}: needs recipient and amount`); return; }
    const recipient = normalizeRecipient(parts[0]); const amount = Number(parts[1]);
    if(!validPhone(recipient) && !recipient.startsWith("BEAST-") && recipient.length < 4){ errors.push(`Line ${i+1}: invalid recipient`); return; }
    if(recipient === state.user.phone || recipient === state.user.beastId){ errors.push(`Line ${i+1}: cannot send to yourself`); return; }
    if(!isFinite(amount) || amount <= 0){ errors.push(`Line ${i+1}: invalid amount`); return; }
    rows.push({ recipient, amount });
  });
  return { rows, errors };
}

function setupBulk(){
  // Load lists
  const savedListSelect = $("savedBulkLists");
  if (savedListSelect) {
    Object.keys(state.savedBulkLists).forEach(name => { savedListSelect.innerHTML += `<option value="${name}">${name}</option>`; });
    savedListSelect.addEventListener("change", (e) => {
      if(!e.target.value) return;
      $("bulkList").value = state.savedBulkLists[e.target.value];
      toast("List loaded.");
    });
  }

  $("saveBulkListButton")?.addEventListener("click", () => {
    const name = prompt("Enter a name for this list (e.g. Staff Salaries):");
    if(!name) return;
    state.savedBulkLists[name] = $("bulkList").value;
    save();
    savedListSelect.innerHTML += `<option value="${name}">${name}</option>`;
    toast("List saved.");
  });

  $("bulkParseButton")?.addEventListener("click", () => {
    const text = $("bulkList")?.value || ""; if(!text.trim()){ toast("Paste a list."); return; }
    const { rows, errors } = parseBulkList(text);
    if(errors.length){ $("bulkPreview").innerHTML = `<div class="bulk-errors"><b>${errors.length} problem(s)</b>${errors.map(e => `<div>• ${escapeHTML(e)}</div>`).join("")}</div>`; bulkRows = []; return; }
    if(!rows.length){ toast("No valid rows."); return; } if(rows.length > MAX_BULK_ROWS){ toast(`Max ${MAX_BULK_ROWS} rows.`); return; }
    bulkRows = rows;
    const source = $("bulkSource")?.value || state.currentSource; let totalAmount = 0, totalFee = 0;
    rows.forEach(r => { totalAmount += r.amount; const split = source === "wallet" ? { fee: beastWalletFee(r.amount) } : externalSplit(source, r.amount); totalFee += split.fee; });
    $("bulkPreview").innerHTML = `<div class="bulk-preview"><div class="bulk-summary"><div><small>Recipients</small><strong>${rows.length}</strong></div><div><small>Total amount</small><strong>${money(totalAmount)}</strong></div><div><small>BEAST fees</small><strong>${money(totalFee)}</strong></div></div><div class="bulk-grand"><span>Total deducted</span><strong>${money(totalAmount + totalFee)}</strong></div></div>`;
  });

  $("bulkClearButton")?.addEventListener("click", () => { resetBulkFlow(); toast("Cleared."); });
  $("bulkSendButton")?.addEventListener("click", () => {
    if(!bulkRows.length){ toast("Parse a list first."); return; } const source = $("bulkSource")?.value || state.currentSource; const type = $("bulkType").value;
    const src = state.sources[source]; if(!src || !src.enabled){ toast("Source not enabled."); return; }
    askConfirmation(`<b>Confirm bulk ${type}</b><br><br>Recipients: ${bulkRows.length}<br>Source: ${escapeHTML(SOURCE_NAMES[source])}`, () => authorize("Bulk send", () => executeBulkSend(source, type)));
  });
}

async function executeBulkSend(source, type){
  const src = state.sources[source]; if(!src){ toast("Invalid source."); return; }
  const isWallet = source === "wallet"; const results = []; let succeeded = 0, failed = 0, stoppedAt = null;
  for(const row of bulkRows){
    let fee = isWallet ? beastWalletFee(row.amount) : externalSplit(source, row.amount).fee;
    const total = row.amount + fee;
    if(src.balance < total){ failed++; stoppedAt = row; results.push({ phone: row.recipient, amount: row.amount, status: "failed", reason: "Insufficient balance" }); break; }
    src.balance -= total; succeeded++;
    const txn = { reference: generateReference(), type: type === "lipa" ? "Lipa Na" : "Bulk Send", amount: row.amount, fee, beastCut: fee, providerCost: 0, totalDeducted: total, source, recipient: row.recipient, recipientName: row.recipient.startsWith("BEAST-") ? "BEAST User" : "Demo recipient", description: `Bulk ${type} to ${row.recipient}` };
    state.transactions.unshift({ ...txn, createdAt: new Date().toISOString(), status: "completed" });
    if(row.recipient.startsWith("BEAST-")) { await sendInternalToServer(row.recipient, row.amount, txn.reference); } else { recordTransactionToServer(txn); }
    results.push({ phone: row.recipient, amount: row.amount, status: "sent" });
  }
  addNotification("Bulk complete", `${succeeded} sent, ${failed} failed.`); save();
  const resultBox = $("bulkResult");
  if(resultBox){ resultBox.classList.remove("hidden"); resultBox.innerHTML = `<div class="bulk-result-head"><div><small>Sent</small><strong style="color:var(--green)">${succeeded}</strong></div><div><small>Failed</small><strong style="color:var(--red)">${failed}</strong></div></div><div class="bulk-results">${results.map(r => `<div class="bulk-row ${r.status === "sent" ? "ok" : "bad"}"><span>${r.status === "sent" ? "✓" : "✕"}</span><div><strong>${escapeHTML(r.phone)}</strong><small>${money(r.amount)}${r.reason ? " — " + escapeHTML(r.reason) : ""}</small></div></div>`).join("")}</div>`; }
  toast(`Bulk: ${succeeded} sent, ${failed} failed.`); renderEverything();
}
function resetBulkFlow(){ bulkRows = []; if($("bulkList")) $("bulkList").value = ""; if($("bulkPreview")) $("bulkPreview").innerHTML = ""; if($("bulkResult")){ $("bulkResult").innerHTML = ""; $("bulkResult").classList.add("hidden"); } }

/* ================= PIN & CONFIRM (Standard) ================= */
function askConfirmation(summaryHTML, onConfirm){ if(!$("confirmModal")){ pendingAction = onConfirm; openPinModal("Confirm"); return; } $("confirmBody").innerHTML = summaryHTML; $("confirmModal").classList.remove("hidden"); $("confirmYes").onclick = () => { $("confirmModal").classList.add("hidden"); onConfirm(); }; $("confirmNo").onclick = () => { $("confirmModal").classList.add("hidden"); pendingAction = null; }; $("confirmClose")?.addEventListener("click", () => { $("confirmModal").classList.add("hidden"); pendingAction = null; }); }
function buildConfirmHTML({title, recipientName, recipient, amount, source, fee}){ const total = Number(amount) + Number(fee); return `<b>${escapeHTML(title)}</b><br><br>Recipient: ${escapeHTML(recipientName)}<br>Destination: ${escapeHTML(recipient)}<br>Source: ${escapeHTML(SOURCE_NAMES[source] || source)}<br><br>Amount: ${money(amount)}<br>Fee: ${money(fee)}<br><br><strong>Total: ${money(total)}</strong>`; }
function openPinModal(purpose){ $("pinPurpose").textContent = purpose; $("authorizationPin").value = ""; if($("pinError")){ $("pinError").textContent = ""; $("pinError").classList.add("hidden"); } $("pinModal").classList.remove("hidden"); setTimeout(() => $("authorizationPin").focus(), 100); }
function authorize(purpose, callback){ pendingAction = callback; openPinModal(purpose); }
function closePin(){ pendingAction = null; $("pinModal").classList.add("hidden"); }
function pinLocked(){ return state.security.lockoutUntil && Date.now() < state.security.lockoutUntil; }
function secondsLeft(){ return Math.ceil((state.security.lockoutUntil - Date.now()) / 1000); }
async function attemptPin(pin){
  if(pinLocked()){ const s = secondsLeft(); if($("pinError")){ $("pinError").textContent = `Locked. Try again in ${s}s.`; $("pinError").classList.remove("hidden"); } return; }
  const ok = await verifyPin(pin);
  if(!ok){ state.security.failedPinAttempts += 1; addSecurity("Failed PIN."); if(state.security.failedPinAttempts >= MAX_PIN_ATTEMPTS){ state.security.lockoutUntil = Date.now() + PIN_LOCKOUT_MS; state.security.failedPinAttempts = 0; save(); if($("pinError")){ $("pinError").textContent = `Too many. Locked ${PIN_LOCKOUT_MS/1000}s.`; $("pinError").classList.remove("hidden"); } return; } save(); if($("pinError")){ $("pinError").textContent = `Incorrect. ${MAX_PIN_ATTEMPTS - state.security.failedPinAttempts} left.`; $("pinError").classList.remove("hidden"); } return; }
  state.security.failedPinAttempts = 0; state.security.lockoutUntil = 0; save();
  const action = pendingAction; closePin(); if(action) action();
}
function setupPin(){ $("confirmPin")?.addEventListener("click", () => { if(buyerSession && $("confirmPin")._buyerHandler) return; attemptPin($("authorizationPin").value); }); $("authorizationPin")?.addEventListener("keydown", e => { if(e.key === "Enter"){ if(buyerSession && $("confirmPin")._buyerHandler) return; attemptPin($("authorizationPin").value); } }); $("cancelPin").onclick = closePin; $("closePinModal").onclick = closePin; }

async function completeTransaction(data){
  const amount = Number(data.amount); let fee, beastCut, providerKeeps, total;
  if(data.source === "wallet"){ fee = beastWalletFee(amount); beastCut = fee; providerKeeps = 0; total = amount + fee; }
  else { const split = externalSplit(data.source, amount, data.providerType || "send"); fee = split.fee; beastCut = split.beastCut; providerKeeps = split.providerKeeps; total = amount + fee; }
  const source = state.sources[data.source]; if(!source || !source.enabled){ toast("Source not enabled."); return; }
  if(source.balance < total){ toast(`Insufficient ${SOURCE_NAMES[data.source]} balance.`); return; }
  source.balance -= total;
  const txn = { reference: generateReference(), type: data.type, amount, fee, beastCut, providerCost: providerKeeps, totalDeducted: total, source: data.source, recipient: data.recipient, recipientName: data.recipientName, description: data.description };
  state.transactions.unshift({ ...txn, createdAt: new Date().toISOString(), status:"completed" });
  if (data.recipient && data.recipient.startsWith("BEAST-")) { const res = await sendInternalToServer(data.recipient, amount, txn.reference); if(res.error) { toast(res.error); source.balance += total; state.transactions.shift(); return; } } 
  else { recordTransactionToServer(txn); }
  addNotification(`${data.type} completed`, `${money(amount)} sent.`); addSecurity(`${data.type} authorized.`); save(); toast(`${data.type} completed. ${money(total)} deducted.`);
  if(data.type === "Send"){ $("sendPhone").value = ""; $("sendAmount").value = ""; $("recipientVerification").classList.add("hidden"); $("sendSource").disabled = false; }
  renderEverything();
}

/* ================= REST OF FUNCTIONS (Unchanged) ================= */
// Paste the rest of the unchanged functions from previous versions here (renderHistory, renderStatements, renderChat, etc.)
// Ensure you keep fetchHistory, setupNav, renderHome, initialize, etc.

function renderHistory(){ const box = $("historyList"); if(!box) return; if(!state.transactions.length){ box.innerHTML = `<div class="panel muted">No transactions yet.</div>`; return; } box.innerHTML = state.transactions.map(t => { const dir = t.type === "Deposit to BEAST" || t.type === "Agent Deposit" || t.type === "Buyer Payment" || t.type === "Owner Withdrawal" ? "+" : "-"; return `<div class="list-item"><strong>${escapeHTML(t.type)}</strong><span>${dir} ${money(t.amount)}</span><small>${escapeHTML(t.description)}<br>Ref: ${escapeHTML(t.reference)}<br>${dateText(t.createdAt)}</small></div>`; }).join(""); }
function renderStatements(){ const summaryBox = $("statementsSummary"); const listBox = $("statementsList"); if(!summaryBox || !listBox) return; let s = { count: state.transactions.length, received: 0, sent: 0, net: 0, fees: 0 }; state.transactions.forEach(t => { if(t.type === "Buyer Payment" || t.type === "Owner Withdrawal") s.received += t.amount; else s.sent += t.amount; s.fees += t.fee || 0; }); s.net = s.received - s.sent; summaryBox.innerHTML = `<div class="statements-grid"><div class="stat-card"><small>Txns</small><strong>${s.count}</strong></div><div class="stat-card"><small>In</small><strong>${money(s.received)}</strong></div><div class="stat-card"><small>Out</small><strong>${money(s.sent)}</strong></div><div class="stat-card"><small>Net</small><strong>${money(s.net)}</strong></div></div>`; if(!state.transactions.length){ listBox.innerHTML = `<div class="panel muted">No activity.</div>`; return; } listBox.innerHTML = state.transactions.slice(0, 20).map(t => `<div class="list-item"><strong>${t.type}</strong><span>${money(t.amount)}</span></div>`).join(""); }

function renderChat(){ const box = $("chatMessages"); if(!box) return; if(!state.chat.length){ box.innerHTML = `<div class="chat-empty muted">No messages.</div>`; return; } box.innerHTML = state.chat.map(msg => `<div class="chat-bubble ${msg.dir}"><small>${msg.sender}</small><p>${msg.text}</p></div>`).join(""); box.scrollTop = box.scrollHeight; }
function setupChat(){ $("chatForm")?.addEventListener("submit", (e) => { e.preventDefault(); const input = $("chatInput"); const text = input.value.trim(); if(!text) return; state.chat.push({ sender: state.user.name || "YOU", text, dir: "sent" }); input.value = ""; save(); renderChat(); }); $("clearChatBtn")?.addEventListener("click", () => { state.chat = []; save(); renderChat(); }); }

function setupCalls(){ $("phoneCallBtn")?.addEventListener("click", () => { const num = prompt("Enter phone number:"); if(num) window.location.href = "tel:" + num; }); }
function setupConnect(){ $("searchForm")?.addEventListener("submit", (e) => { e.preventDefault(); const q = $("searchInput").value; window.open("https://www.google.com/search?q=" + encodeURIComponent(q), "_blank"); }); }
function renderProfile(){ const box = $("profileDetails"); if(!box) return; box.innerHTML = `<div class="list-item"><strong>${state.user.name}</strong><small>BEAST ID: ${state.user.beastId}<br>Phone: ${state.user.phone}</small></div>`; }
function setupSettings(){ $("themeToggle")?.addEventListener("change", e => setTheme(e.target.checked)); $("resetDemo")?.addEventListener("click", () => { if(confirm("Reset?")){ localStorage.clear(); location.reload(); } }); }
function addNotification(title, message){ state.notifications.unshift({ title, message, createdAt: new Date().toISOString() }); save(); }
function renderNotifications(){ const box = $("notificationList"); if(!box) return; if(!state.notifications.length){ box.innerHTML = `<div class="panel muted">No notifications.</div>`; return; } box.innerHTML = state.notifications.map(n => `<div class="list-item"><strong>${n.title}</strong><small>${n.message}</small></div>`).join(""); }
function addSecurity(message){ state.securityEvents.unshift({ message, createdAt: new Date().toISOString() }); }
function renderSecurity(){ const box = $("securityList"); if(!box) return; if(!state.securityEvents.length){ box.innerHTML = `<div class="muted">No events.</div>`; return; } box.innerHTML = state.securityEvents.map(e => `<div class="list-item"><strong>Event</strong><small>${e.message}</small></div>`).join(""); }

function setupNav(){ document.querySelectorAll("[data-tab]").forEach(btn => btn.addEventListener("click", () => { const tab = btn.dataset.tab; if(!isLoggedIn() && tab !== "connect"){ showScreen("welcome"); return; } showScreen(tab); })); $("menuButton")?.addEventListener("click", openMenu); $("closeMenu")?.addEventListener("click", closeMenu); $("drawerBackdrop")?.addEventListener("click", closeMenu); }
function renderHome(){ if(!isLoggedIn()) return; if($("welcomeText")) $("welcomeText").textContent = `Welcome, ${state.user.name}.`; if($("dashboardBeastId")) $("dashboardBeastId").textContent = state.user.beastId; if($("totalBalance")) $("totalBalance").textContent = money(totalBalance()); }
function renderEverything(){ if(!isLoggedIn()) return; renderHome(); renderSources("sourceList"); renderNotifications(); renderSecurity(); renderProfile(); fillSourceSelects(); renderChat(); }

async function initialize(){ await buildDemoBuyerHashes(); setupWelcome(); setupLogin(); setupRegistration(); setupNav(); setupSend(); setupBulk(); setupReceiveTabs(); setupBuyerFlow(); setupWithdraw(); setupLipa(); setupPin(); setupSettings(); setupSourceManager(); setupChat(); setupCalls(); setupConnect(); setupPremium(); setupReceivingMethods(); loadTheme(); if(!state.registered){ showScreen("welcome"); } else if(!isLoggedIn()){ showScreen("login"); } else { showScreen("money"); } resetBuyerFlow(); resetBulkFlow(); renderEverything(); resetAutoLock(); }
function setupPremium(){ $("premiumBtn")?.addEventListener("click", () => { toast("Premium demo activated."); }); }
function setupReceivingMethods(){}
function resetBuyerFlow(){}
function renderReceiveSellerLine(){}
function updateReceiveBackButton(){}
function setupReceiveTabs(){}
function setupBuyerFlow(){}
function setupSourceManager(){}

initialize();
});
