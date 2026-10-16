/* =========================================================
   BEAST — Super-App (DEMO / PROTOTYPE)

   One app: Money + Chat + Calls + Connect + Profile

   NO REAL MONEY, CHAT, CALLS, OR INTERNET MOVES HERE.
   Everything is simulated.

   SAFETY:
   - Password + PIN hashed with SHA-256 + salt
   - 3 failed PIN attempts → 30s lockout
   - Confirm modal before every money movement
   - Buyer session auto-expires
   - All user input escaped with escapeHTML()

   SERVER:
   - Optional connection to a Render server for
     owner announcements (WebSocket)
   - Set SERVER_URL below to point at your server
   - Leave blank to skip announcements entirely

   STORAGE KEY: beast_superapp_v1
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

"use strict";


/* ================= CONFIG ================= */

const STORAGE_KEY   = "beast_superapp_v1";
const SESSION_KEY   = "beast_superapp_session_v1";
const THEME_KEY     = "beast_superapp_theme";

/*
  Your Render server URL. Leave "" to disable announcements.
  Example: "https://beast-server-8u92.onrender.com"
*/
const SERVER_URL = "https://beast-server-8u92.onrender.com";
const MIN_PASSWORD_LENGTH = 6;
const MAX_BULK_ROWS = 200;

const REGISTERED_AGENTS = {
  "0712345678": "BEAST Demo Safaricom Agent",
  "0720000000": "Safaricom Registered Agent",
  "0711111111": "Safaricom Registered Agent"
};

const REGISTERED_AGENT_CODES = {
  "AGENT-001": "BEAST Demo Agent 001",
  "AGENT-002": "BEAST Demo Agent 002",
  "BEAST-AG":  "BEAST Demo Agent"
};

const SOURCE_NAMES = {
  mpesa:  "M-PESA",
  tkash:  "T-Kash",
  airtel: "Airtel Money",
  bank:   "Bank Account",
  card:   "Card",
  wallet: "BEAST Wallet"
};

const SOURCE_ICONS = {
  mpesa:  "📱",
  tkash:  "📲",
  airtel: "📲",
  bank:   "🏦",
  card:   "💳",
  wallet: "🐾"
};

const ALL_SOURCES = ["mpesa","wallet","bank","card","airtel","tkash"];

const BANK_LIST = [
  "ABC Bank","Absa Bank Kenya","Co-operative Bank","Equity Bank",
  "National Bank of Kenya (NBK)","KCB Bank","NCBA Bank","Prime Bank",
  "Family Bank","Postbank","Stanbic Bank","Standard Chartered",
  "DTB","I&M Bank","Other"
];

const CARD_LIST = ["Visa","Mastercard","BEAST Card","Other"];

const SAMPLE_BALANCE_SOURCES = new Set(["mpesa"]);

const MAX_PIN_ATTEMPTS = 3;
const PIN_LOCKOUT_MS   = 30 * 1000;
const AUTO_LOCK_MS     = 2 * 60 * 1000;
const BUYER_SUCCESS_MS = 5000;
const BUYER_SESSION_MS = 60 * 1000;


/* ================= DEMO BUYERS ================= */

const DEMO_BUYERS = [
  {
    phone: "0722000001", nationalId: "11111111", pin: "1111",
    name: "Alice Njeri",
    sources: {
      mpesa:  { enabled: true, balance: 12500 },
      wallet: { enabled: true, balance: 0 },
      bank:   { enabled: true, balance: 8000,  bankName: "Equity Bank" },
      card:   { enabled: true, balance: 15000, cardName: "Visa", last4: "4321" },
      airtel: { enabled: true, balance: 2500 },
      tkash:  { enabled: false, balance: 0 }
    }
  },
  {
    phone: "0722000002", nationalId: "22222222", pin: "2222",
    name: "Brian Otieno",
    sources: {
      mpesa:  { enabled: true, balance: 3200 },
      wallet: { enabled: true, balance: 500 },
      bank:   { enabled: true, balance: 2500, bankName: "KCB Bank" },
      card:   { enabled: false, balance: 0 },
      airtel: { enabled: true, balance: 1000 },
      tkash:  { enabled: true, balance: 800 }
    }
  },
  {
    phone: "0722000003", nationalId: "33333333", pin: "3333",
    name: "Carol Wambui",
    sources: {
      mpesa:  { enabled: true, balance: 48000 },
      wallet: { enabled: true, balance: 1200 },
      bank:   { enabled: true, balance: 25000, bankName: "Co-operative Bank" },
      card:   { enabled: true, balance: 40000, cardName: "Mastercard", last4: "8765" },
      airtel: { enabled: true, balance: 3000 },
      tkash:  { enabled: true, balance: 500 }
    }
  }
];


/* ================= STATE ================= */

function defaultState(){
  return {
    registered: false,

    user: {
      name: "",
      phone: "",
      nationalId: "",
      beastId: "",
      pinHash: "",
      pinSalt: "",
      passwordHash: "",
      passwordSalt: ""
    },

    sources: {
      mpesa:  { balance: 5000, enabled: true,  account: "0712345678" },
      tkash:  { balance: 1000, enabled: true,  account: "0712345678" },
      airtel: { balance: 1000, enabled: true,  account: "0712345678" },
      bank:   { balance: 0,    enabled: false, account: "", bankName: "" },
      card:   { balance: 0,    enabled: false, account: "", cardName: "", last4: "" },
      wallet: { balance: 0,    enabled: true,  account: "BEAST-WALLET" }
    },

    receiving: {
      wallet:  { enabled: true },
      pochi:   { enabled: false, phone: "" },
      till:    { enabled: false, number: "" },
      paybill: { enabled: false, number: "", account: "" },
      bank:    { enabled: false, bankName: "", account: "" },
      card:    { enabled: false, cardName: "", last4: "" }
    },

    currentSource: "mpesa",

    /* Chat */
    chat: [],

    transactions: [],
    notifications: [],
    securityEvents: [],

    settings: {
      notifications: true,
      screenSecurity: true,
      biometric: false,
      dark: true
    },

    security: {
      failedPinAttempts: 0,
      lockoutUntil: 0
    },

    buyerSecurity: {
      failedPinAttempts: 0,
      lockoutUntil: 0
    },

    recentBuyers: []
  };
}

function loadState(){
  try{
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(saved){
      const base = defaultState();
      return {
        ...base, ...saved,
        user:          { ...base.user,          ...(saved.user || {}) },
        sources:       { ...base.sources,       ...(saved.sources || {}) },
        receiving:     { ...base.receiving,     ...(saved.receiving || {}) },
        settings:      { ...base.settings,      ...(saved.settings || {}) },
        security:      { ...base.security,      ...(saved.security || {}) },
        buyerSecurity: { ...base.buyerSecurity, ...(saved.buyerSecurity || {}) }
      };
    }
  }catch(e){ console.error(e); }
  return defaultState();
}

const state = loadState();
let sessionToken = sessionStorage.getItem(SESSION_KEY) || null;

let pendingAction = null;
let cameraStream = null;
let autoLockTimer = null;
let buyerSession = null;
let buyerStep = 1;
let buyerSuccessTimer = null;
let buyerSessionTimer = null;
let bulkRows = [];
let socket = null;
let currentAnnouncement = null;


/* ================= HELPERS ================= */

function $(id){ return document.getElementById(id); }

function money(v){
  return `KES ${Number(v || 0).toLocaleString("en-KE",{
    minimumFractionDigits:2, maximumFractionDigits:2
  })}`;
}

function normalizePhone(value=""){
  let p = String(value).trim().replace(/\s+/g,"").replace(/-/g,"");
  if(p.startsWith("+254")) p = "0" + p.slice(4);
  else if(p.startsWith("254")) p = "0" + p.slice(3);
  return p;
}

function validPhone(value){ return /^(07|01)\d{8}$/.test(normalizePhone(value)); }

function internationalPhone(value){
  const p = normalizePhone(value);
  return validPhone(p) ? "+254" + p.slice(1) : "";
}

function validAgent(v){ return String(v || "").trim().length >= 4; }

function validAccount(v){
  return /^[A-Za-z0-9][A-Za-z0-9\- ]{3,}$/.test(String(v || "").trim());
}

function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function randomDigits(n){
  return Math.floor(Math.random() * Math.pow(10,n)).toString().padStart(n,"0");
}

function randomHex(bytes){
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2,"0")).join("");
}

function generateBeastId(){ return `BEAST-${randomDigits(6)}`; }

function generateReference(){
  return `BST-${Date.now().toString().slice(-8)}-${randomDigits(3)}`;
}

function escapeHTML(v){
  return String(v ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function dateText(v){ return new Date(v).toLocaleString("en-KE"); }

function toast(msg){
  const el = $("toast");
  if(!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 2600);
}


/* ================= HASHING ================= */

async function hashValue(value, saltHex){
  const data = new TextEncoder().encode(saltHex + ":" + value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2,"0")).join("");
}

async function setPin(pin){
  state.user.pinSalt = randomHex(16);
  state.user.pinHash = await hashValue(pin, state.user.pinSalt);
}

async function verifyPin(pin){
  if(!state.user.pinHash || !state.user.pinSalt) return false;
  return (await hashValue(pin, state.user.pinSalt)) === state.user.pinHash;
}

async function setPassword(pw){
  state.user.passwordSalt = randomHex(16);
  state.user.passwordHash = await hashValue(pw, state.user.passwordSalt);
}

async function verifyPassword(pw){
  if(!state.user.passwordHash || !state.user.passwordSalt) return false;
  return (await hashValue(pw, state.user.passwordSalt)) === state.user.passwordHash;
}

const demoBuyerHashes = {};
async function buildDemoBuyerHashes(){
  for(const b of DEMO_BUYERS){
    const salt = randomHex(16);
    demoBuyerHashes[b.phone] = { salt, hash: await hashValue(b.pin, salt) };
  }
}
async function verifyDemoBuyerPin(phone, pin){
  const entry = demoBuyerHashes[phone];
  if(!entry) return false;
  return (await hashValue(pin, entry.salt)) === entry.hash;
}


/* ================= REAL TARIFFS ================= */

function mpesaSendFee(a){
  a = Number(a || 0);
  if(a <= 100) return 0; if(a <= 500) return 7; if(a <= 1000) return 13;
  if(a <= 1500) return 23; if(a <= 2500) return 33; if(a <= 3500) return 53;
  if(a <= 5000) return 57; if(a <= 7500) return 78; if(a <= 10000) return 90;
  if(a <= 15000) return 100; if(a <= 20000) return 105; return 108;
}

function mpesaWithdrawFee(a){
  a = Number(a || 0);
  if(a <= 100) return 11; if(a <= 1500) return 29; if(a <= 2500) return 29;
  if(a <= 3500) return 52; if(a <= 5000) return 69; if(a <= 7500) return 87;
  if(a <= 10000) return 115; if(a <= 15000) return 167; if(a <= 20000) return 185;
  if(a <= 35000) return 197; if(a <= 50000) return 278; return 309;
}

function tkashSendFee(a){
  a = Number(a || 0);
  if(a <= 100) return 0; if(a <= 500) return 6; if(a <= 1000) return 13;
  if(a <= 1500) return 21; if(a <= 2500) return 33; if(a <= 3500) return 47;
  if(a <= 5000) return 57; if(a <= 7500) return 67; if(a <= 10000) return 88;
  if(a <= 20000) return 93; return 103;
}

function airtelSendFee(a){
  a = Number(a || 0);
  if(a <= 100) return 0; if(a <= 500) return 7; if(a <= 1000) return 13;
  if(a <= 1500) return 33; if(a <= 2500) return 53; if(a <= 3500) return 57;
  if(a <= 5000) return 78; if(a <= 7500) return 90; if(a <= 10000) return 100;
  return 110;
}

function bankFee(a){
  a = Number(a || 0);
  if(a <= 1000) return 0;
  if(a <= 5000) return 5;
  return 20;
}

function cardFee(a){ return Math.round(Number(a || 0) * 0.029); }

function providerCost(source, amount, type = "send"){
  amount = Number(amount || 0);
  if(source === "wallet") return 0;
  if(source === "mpesa") return type === "withdraw" ? mpesaWithdrawFee(amount) : mpesaSendFee(amount);
  if(source === "tkash")  return tkashSendFee(amount);
  if(source === "airtel") return airtelSendFee(amount);
  if(source === "bank")   return bankFee(amount);
  if(source === "card")   return cardFee(amount);
  return 0;
}

function beastFee(amount){
  // Kept for backward compatibility — no longer charged directly
  return 0;
}

/* BEAST Wallet fee = M-PESA send fee − 3 */
function beastWalletFee(amount){
  const mpesa = mpesaSendFee(Number(amount) || 0);
  return Math.max(0, mpesa - 3);
}

/* External split — user pays the provider fee, BEAST takes 40% */
function externalSplit(source, amount, type = "send"){
  const fee = providerCost(source, amount, type);
  const beastCut = Math.round(fee * 0.4);
  const providerKeeps = fee - beastCut;
  return { fee, beastCut, providerKeeps };
}

/* Cost preview — branches on source */
function costPreview(source, amount, type = "send"){
  const amt = Number(amount) || 0;

  if(amt <= 0){
    return `<b>Cost preview</b><br>Enter an amount.`;
  }

  if(source === "wallet"){
    const fee = beastWalletFee(amt);
    const total = amt + fee;
    return `
      <b>BEAST Wallet transfer</b><br>
      Amount: ${money(amt)}<br>
      BEAST fee: ${money(fee)}<br><br>
      <strong>Total: ${money(total)}</strong>
    `;
  }

  const { fee, beastCut, providerKeeps } = externalSplit(source, amt, type);
  const total = amt + fee;
  return `
    <b>Cost preview</b><br>
    Amount: ${money(amt)}<br>
    ${SOURCE_NAMES[source] || source} fee: ${money(fee)}<br><br>
    <strong>Total: ${money(total)}</strong>
  `;
}


/* ================= THEME ================= */

function setTheme(dark){
  state.settings.dark = dark;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  save();
}

function loadTheme(){
  const t = localStorage.getItem(THEME_KEY) || "dark";
  setTheme(t === "dark");
}


/* ================= SESSION ================= */

function isLoggedIn(){
  return state.registered && sessionToken === "active";
}

function startSession(){
  sessionToken = "active";
  sessionStorage.setItem(SESSION_KEY, sessionToken);
}

function endSession(){
  sessionToken = null;
  sessionStorage.removeItem(SESSION_KEY);
}


/* ================= NAVIGATION ================= */

const screenMap = {
  welcome:"welcomeScreen",
  login:"loginScreen",
  registration:"registrationScreen",
  money:"moneyScreen",
  send:"sendScreen",
  bulk:"bulkScreen",
  receive:"receiveScreen",
  withdraw:"withdrawScreen",
  lipa:"lipaScreen",
  history:"historyScreen",
  statements:"statementsScreen",
  chat:"chatScreen",
  calls:"callsScreen",
  connect:"connectScreen",
  profile:"profileScreen",
  premium:"premiumScreen",
  security:"securityScreen",
  notifications:"notificationsScreen",
  settings:"settingsScreen"
};

const SENSITIVE_FIELDS = [
  "regPin","regPin2","regPassword","regPassword2",
  "loginPassword","loginPin",
  "sendAmount","sendPhone","withdrawAmount","agentNumber","lipaAmount",
  "depositAmount","agentDepositAmount","authorizationPin",
  "oldPin","newPin","confirmNewPin","oldPassword","newPassword","confirmNewPassword",
  "buyerLoginPhone","buyerLoginNationalId","buyerLoginPin","buyerPayAmount",
  "bulkList","chatInput","recipientId","searchInput"
];

function clearSensitiveFields(){
  SENSITIVE_FIELDS.forEach(id => { const el = $(id); if(el) el.value = ""; });
  ["recipientVerification","agentVerification","lipaVerification",
   "agentDepositVerification","loginBalance"].forEach(id =>
    $(id)?.classList.add("hidden"));
}

function showScreen(name){
  const screen = screenMap[name] || name;
  document.querySelectorAll(".app-screen").forEach(el => el.classList.remove("active"));
  const target = $(screen);
  if(target) target.classList.add("active");

  document.querySelectorAll("[data-tab]").forEach(t =>
    t.classList.toggle("active", t.dataset.tab === getTabForScreen(name))
  );

  clearSensitiveFields();
  closeMenu();
  resetAutoLock();

  if(name === "receive"){
    resetBuyerFlow();
    renderReceiveSellerLine();
  }
  if(name === "statements") renderStatements();
  if(name === "bulk") resetBulkFlow();
  if(name === "chat") renderChat();

  window.scrollTo({ top:0, behavior:"smooth" });
  renderEverything();
}

function getTabForScreen(name){
  if(["money","send","bulk","receive","withdraw","lipa","history","statements"].includes(name)) return "money";
  if(name === "chat") return "chat";
  if(name === "calls") return "calls";
  if(name === "connect") return "connect";
  if(["profile","premium","security","notifications","settings"].includes(name)) return "profile";
  return null;
}

function openMenu(){
  $("menuDrawer")?.classList.add("open");
  $("drawerBackdrop")?.classList.add("open");
}

function closeMenu(){
  $("menuDrawer")?.classList.remove("open");
  $("drawerBackdrop")?.classList.remove("open");
}


/* ================= AUTO LOCK ================= */

function resetAutoLock(){
  clearTimeout(autoLockTimer);
  if(!isLoggedIn()) return;
  autoLockTimer = setTimeout(() => {
    if(!isLoggedIn()) return;
    addSecurity("Session auto-locked after inactivity.");
    save();
    showScreen("login");
    toast("Session locked.");
  }, AUTO_LOCK_MS);
}


/* ================= WELCOME / LOGIN ================= */

function setupWelcome(){
  $("goRegisterButton")?.addEventListener("click", () => showScreen("registration"));
  $("goLoginButton")?.addEventListener("click", () => {
    if(!state.registered){ toast("No BEAST account yet. Register first."); showScreen("registration"); return; }
    showScreen("login");
  });
}

function setupLogin(){
  $("loginSubmitButton")?.addEventListener("click", async () => {
    const phone = normalizePhone($("loginPhone")?.value || "");
    const password = $("loginPassword")?.value || "";

    if(!validPhone(phone)){ toast("Enter a valid Kenyan phone number."); return; }
    if(password.length < MIN_PASSWORD_LENGTH){ toast(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`); return; }
    if(phone !== state.user.phone){ toast("Phone number not registered."); return; }

    const ok = await verifyPassword(password);
    if(!ok){ addSecurity("Failed password login."); save(); toast("Incorrect password."); return; }

    $("loginPassword").value = "";
    authorize("Login", () => {
      startSession();
      addSecurity("Logged in.");
      save();
      toast("Welcome back.");
      showScreen("money");
    });
  });

  $("backToWelcomeFromLogin")?.addEventListener("click", () => showScreen("welcome"));
}


/* ================= REGISTRATION ================= */

function setupRegistration(){
  $("backToWelcomeFromRegister")?.addEventListener("click", () => showScreen("welcome"));

  $("regNext1")?.addEventListener("click", () => {
    const name = $("regName").value.trim();
    const phone = normalizePhone($("regPhone").value);
    const nationalId = $("regNationalId").value.trim();

    if(name.length < 2){ toast("Enter your full name."); return; }
    if(!validPhone(phone)){ toast("Enter a valid Kenyan phone number."); return; }
    if(nationalId.length < 5){ toast("Enter your National ID."); return; }

    state.user.name = name;
    state.user.phone = phone;
    state.user.nationalId = nationalId;

    $("regStep1").classList.add("hidden");
    $("regStep2").classList.remove("hidden");
    document.querySelectorAll(".step")[1]?.classList.add("active");
  });

  $("regNext2")?.addEventListener("click", async () => {
    const password = $("regPassword").value;
    const password2 = $("regPassword2").value;
    const pin = $("regPin").value;
    const confirmPin = $("regPin2").value;

    if(password.length < MIN_PASSWORD_LENGTH){ toast(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`); return; }
    if(password !== password2){ toast("Passwords do not match."); return; }
    if(!/^\d{4}$/.test(pin)){ toast("PIN must contain 4 digits."); return; }
    if(pin !== confirmPin){ toast("PINs do not match."); return; }

    await setPassword(password);
    await setPin(pin);

    $("registrationSummary").innerHTML = `
      <b>${escapeHTML(state.user.name)}</b><br>
      Phone: ${escapeHTML(state.user.phone)}<br>
      International: ${escapeHTML(internationalPhone(state.user.phone))}<br>
      National ID: ${escapeHTML(state.user.nationalId)}<br><br>
      Your BEAST ID will be generated after confirmation.
    `;

    $("regStep2").classList.add("hidden");
    $("regStep3").classList.remove("hidden");
    document.querySelectorAll(".step")[2]?.classList.add("active");
  });

  $("finishRegistration")?.addEventListener("click", () => {
    state.user.beastId = generateBeastId();
    state.registered = true;
    addNotification("BEAST ID created", `Your BEAST ID is ${state.user.beastId}.`);
    addSecurity("New BEAST registration.");
    startSession();
    save();
    toast("BEAST account created.");
    showScreen("money");
  });
}


/* ================= BALANCE ================= */

function totalBalance(){
  return Object.values(state.sources).reduce((t,s) =>
    t + (s.enabled ? Number(s.balance) : 0), 0);
}


/* ================= SOURCE CARDS ================= */

function renderSources(containerId){
  const container = $(containerId);
  if(!container) return;

  container.innerHTML = Object.entries(state.sources).map(([key, source]) => {
    const icon = SOURCE_ICONS[key] || "❓";
    let details = source.account || "Not linked";
    if(key === "bank" && source.bankName) details = `${source.bankName} • ${source.account}`;
    if(key === "card") details = source.cardName ? `${source.cardName} •••• ${source.last4 || "----"}` : "Not linked";

    const isSample = SAMPLE_BALANCE_SOURCES.has(key);
    const isCurrent = state.currentSource === key && source.enabled;

    return `
      <div class="source-card ${isCurrent ? "current-source" : ""} ${source.enabled ? "" : "source-disabled"}"
           data-source="${key}" role="button" tabindex="0">
        <div class="source-top">
          <span class="source-icon">${icon}</span>
          <span class="pill ${source.enabled ? "green" : "red"}">${source.enabled ? "DEMO" : "OFF"}</span>
        </div>
        <div>
          <strong>${SOURCE_NAMES[key]}</strong>
          <small>${escapeHTML(details)}</small>
          ${isSample ? `<span class="pill blue" style="margin-top:4px;">SAMPLE</span>` : ""}
          ${isCurrent ? `<span class="pill green" style="margin-top:4px;">CURRENT</span>` : ""}
        </div>
        <strong>${money(source.balance)}</strong>
      </div>
    `;
  }).join("");

  container.querySelectorAll("[data-source]").forEach(card => {
    card.addEventListener("click", () => {
      const key = card.dataset.source;
      const source = state.sources[key];
      if(!source || !source.enabled){ toast(`${SOURCE_NAMES[key]} is not linked.`); return; }
      state.currentSource = key;
      save();
      renderSources("sourceList");
      fillSourceSelects();
      toast(`${SOURCE_NAMES[key]} is now your current source.`);
    });
  });
}

function fillSourceSelects(){
  ["sendSource","withdrawSource","lipaSource","bulkSource"].forEach(id => {
    const select = $(id);
    if(!select) return;
    const current = select.value || state.currentSource;
    select.innerHTML = Object.entries(state.sources)
      .filter(([,s]) => s.enabled)
      .map(([key]) => `<option value="${key}">${SOURCE_NAMES[key]}</option>`)
      .join("");
    if(current && state.sources[current]?.enabled) select.value = current;
  });
}


/* ================= SOURCE MANAGER ================= */

function setupSourceManager(){
  const type = $("sourceType");
  const bankFields = $("bankSourceFields");
  const cardFields = $("cardSourceFields");

  function updateFields(){
    if(!type) return;
    if(bankFields) bankFields.classList.toggle("hidden", type.value !== "bank");
    if(cardFields) cardFields.classList.toggle("hidden", type.value !== "card");
  }
  type?.addEventListener("change", updateFields);

  $("saveSourceButton")?.addEventListener("click", () => {
    const sourceType = type.value;
    const account = $("sourceAccount")?.value.trim();

    if(sourceType !== "wallet" && !account){ toast("Enter account or phone."); return; }
    if(sourceType === "bank" && !validAccount(account)){ toast("Enter a valid account."); return; }
    if((sourceType === "mpesa" || sourceType === "airtel" || sourceType === "tkash") && !validPhone(account)){
      toast("Enter a valid Kenyan phone."); return;
    }

    const source = state.sources[sourceType];
    if(!source){ toast("Invalid source."); return; }

    source.enabled = true;
    source.account = account;

    if(sourceType === "bank"){
      const bankName = $("bankName")?.value;
      if(!bankName){ toast("Select the bank."); source.enabled = false; return; }
      source.bankName = bankName;
    }
    if(sourceType === "card"){
      const cardName = $("cardName")?.value.trim();
      const last4 = $("cardLast4")?.value.trim();
      if(!cardName){ toast("Enter card name."); source.enabled = false; return; }
      if(!/^\d{4}$/.test(last4)){ toast("Enter last 4 digits."); source.enabled = false; return; }
      source.cardName = cardName;

w
      source.last4 = last4;
    }

    const balance = Number($("sourceBalance")?.value || 0);
    if(balance > 0) source.balance = balance;

    addSecurity(`${SOURCE_NAMES[sourceType]} linked.`);
    save();
    toast(`${SOURCE_NAMES[sourceType]} linked.`);
    renderEverything();
  });

  updateFields();
}


/* ================= RECEIVING METHODS ================= */

function setupReceivingMethods(){
  const type = $("receivingMethodType");
  const fields = $("receivingMethodFields");
  if(!type || !fields) return;

  function renderFields(){
    const t = type.value;
    if(t === "wallet"){ fields.innerHTML = `<small class="muted">BEAST Wallet is always enabled.</small>`; return; }
    if(t === "pochi"){ fields.innerHTML = `<label>Pochi phone<input id="recPochiPhone" placeholder="0712345678"></label>`; return; }
    if(t === "till"){ fields.innerHTML = `<label>Till number<input id="recTillNumber" placeholder="123456"></label>`; return; }
    if(t === "paybill"){ fields.innerHTML = `
      <div class="two-col">
        <label>PayBill number<input id="recPaybillNumber" placeholder="123456"></label>
        <label>Account<input id="recPaybillAccount" placeholder="ABC123"></label>
      </div>`; return; }
    if(t === "bank"){ fields.innerHTML = `
      <div class="two-col">
        <label>Bank
          <select id="recBankName">
            <option value="">Select bank</option>
            ${BANK_LIST.map(b => `<option value="${b}">${b}</option>`).join("")}
          </select>
        </label>
        <label>Account<input id="recBankAccount" placeholder="ABC123456"></label>
      </div>`; return; }
    if(t === "card"){ fields.innerHTML = `
      <div class="two-col">
        <label>Card type
          <select id="recCardName">
            <option value="">Select card</option>
            ${CARD_LIST.map(c => `<option value="${c}">${c}</option>`).join("")}
          </select>
        </label>
        <label>Last 4<input id="recCardLast4" maxlength="4" placeholder="1234"></label>
      </div>`; return; }
  }

  type.addEventListener("change", renderFields);
  renderFields();

  $("saveReceivingMethodButton")?.addEventListener("click", () => {
    const t = type.value;
    if(t === "wallet"){ state.receiving.wallet.enabled = true; save(); toast("Wallet always enabled."); renderReceivingMethodsList(); return; }
    if(t === "pochi"){ const phone = normalizePhone($("recPochiPhone")?.value || ""); if(!validPhone(phone)){ toast("Enter valid Pochi phone."); return; } state.receiving.pochi = { enabled: true, phone }; }
    if(t === "till"){ const number = ($("recTillNumber")?.value || "").trim(); if(number.length < 4){ toast("Enter valid Till."); return; } state.receiving.till = { enabled: true, number }; }
    if(t === "paybill"){ const number = ($("recPaybillNumber")?.value || "").trim(); const account = ($("recPaybillAccount")?.value || "").trim(); if(number.length < 4){ toast("Enter valid PayBill."); return; } state.receiving.paybill = { enabled: true, number, account }; }
    if(t === "bank"){ const bankName = $("recBankName")?.value; const account = ($("recBankAccount")?.value || "").trim(); if(!bankName){ toast("Select bank."); return; } if(!validAccount(account)){ toast("Enter valid account."); return; } state.receiving.bank = { enabled: true, bankName, account }; }
    if(t === "card"){ const cardName = $("recCardName")?.value; const last4 = ($("recCardLast4")?.value || "").trim(); if(!cardName){ toast("Select card type."); return; } if(!/^\d{4}$/.test(last4)){ toast("Enter last 4 digits."); return; } state.receiving.card = { enabled: true, cardName, last4 }; }

    save();
    toast("Saved.");
    renderReceivingMethodsList();
  });

  renderReceivingMethodsList();
}

function renderReceivingMethodsList(){
  const box = $("receivingMethodsList");
  if(!box) return;
  const labels = { wallet:"Wallet", pochi:"Pochi", till:"Till", paybill:"PayBill", bank:"Bank", card:"Card" };
  box.innerHTML = Object.entries(state.receiving).map(([key, r]) => {
    let detail = "Not enabled";
    if(key === "wallet") detail = state.user.beastId || "—";
    if(key === "pochi") detail = r.phone || "—";
    if(key === "till") detail = r.number || "—";
    if(key === "paybill") detail = r.number ? `${r.number} • ${r.account || "-"}` : "—";
    if(key === "bank") detail = r.bankName ? `${r.bankName} • ${r.account}` : "—";
    if(key === "card") detail = r.cardName ? `${r.cardName} •••• ${r.last4}` : "—";
    return `<div class="list-item">
      <strong>${labels[key]}</strong>
      <span class="pill ${r.enabled ? "green" : "red"}">${r.enabled ? "ON" : "OFF"}</span>
      <small>${escapeHTML(detail)}</small>
    </div>`;
  }).join("");
}


/* ================= SEND ================= */

function setupSend(){
  $("verifyRecipient")?.addEventListener("click", () => {
    const phone = normalizePhone($("sendPhone").value);
    if(!validPhone(phone)){ toast("Enter valid phone."); return; }
    if(phone === state.user.phone){ toast("Cannot send to yourself."); return; }
    $("recipientVerification").classList.remove("hidden");
    $("recipientVerification").innerHTML = `<strong>✓ Demo recipient</strong>${escapeHTML(phone)}`;
  });

  $("sendMoneyButton")?.addEventListener("click", () => {
    const phone = normalizePhone($("sendPhone").value);
    if(!validPhone(phone)){ toast("Enter valid phone."); return; }
    if(phone === state.user.phone){ toast("Cannot send to yourself."); return; }
    const amount = Number($("sendAmount").value);
    const source = $("sendSource").value;
    if(amount <= 0){ toast("Enter amount."); return; }

    let fee;
    if(source === "wallet"){
      fee = beastWalletFee(amount);
    } else {
      fee = externalSplit(source, amount).fee;
    }

    askConfirmation(
      buildConfirmHTML({ title:"Confirm send", recipientName:"Demo recipient", recipient: phone, amount, source, fee }),
      () => authorize("Send money", () => {
        completeTransaction({ type:"Send", amount, source, recipient: phone, recipientName:"Demo recipient", description:`Send to ${phone}` });
      })
    );
  });
}

/* ================= BULK ================= */

function parseBulkList(text){
  const rows = [], errors = [];
  String(text || "").split(/\r?\n/).map(l => l.trim()).filter(l => l.length).forEach((line, i) => {
    const parts = line.split(/[,\s;]+/).filter(p => p.length);
    if(parts.length < 2){ errors.push(`Line ${i+1}: needs phone and amount`); return; }
    const phone = normalizePhone(parts[0]);
    const amount = Number(parts[1]);
    if(!validPhone(phone)){ errors.push(`Line ${i+1}: invalid phone`); return; }
    if(phone === state.user.phone){ errors.push(`Line ${i+1}: cannot send to yourself`); return; }
    if(!isFinite(amount) || amount <= 0){ errors.push(`Line ${i+1}: invalid amount`); return; }
    rows.push({ phone, amount });
  });
  return { rows, errors };
}

function resetBulkFlow(){
  bulkRows = [];
  if($("bulkList")) $("bulkList").value = "";
  if($("bulkPreview")) $("bulkPreview").innerHTML = "";
  if($("bulkResult")){ $("bulkResult").innerHTML = ""; $("bulkResult").classList.add("hidden"); }
}

function setupBulk(){
  $("bulkParseButton")?.addEventListener("click", () => {
    const text = $("bulkList")?.value || "";
    if(!text.trim()){ toast("Paste a list."); return; }
    const { rows, errors } = parseBulkList(text);
    if(errors.length){ $("bulkPreview").innerHTML = `<div class="bulk-errors"><b>${errors.length} problem(s)</b>${errors.map(e => `<div>• ${escapeHTML(e)}</div>`).join("")}</div>`; bulkRows = []; return; }
    if(!rows.length){ toast("No valid rows."); return; }
    if(rows.length > MAX_BULK_ROWS){ toast(`Too many rows (max ${MAX_BULK_ROWS}).`); return; }
    bulkRows = rows;
    const source = $("bulkSource")?.value || state.currentSource;
    let totalAmount = 0, totalFee = 0, totalProvider = 0;
    rows.forEach(r => { totalAmount += r.amount; totalFee += beastFee(r.amount); totalProvider += providerCost(source, r.amount); });
    const grandTotal = totalAmount + totalFee + totalProvider;
    $("bulkPreview").innerHTML = `
      <div class="bulk-preview">
        <div class="bulk-summary">
          <div><small>Recipients</small><strong>${rows.length}</strong></div>
          <div><small>Total amount</small><strong>${money(totalAmount)}</strong></div>
          <div><small>BEAST fees</small><strong>${money(totalFee)}</strong></div>
          <div><small>Provider costs</small><strong>${money(totalProvider)}</strong></div>
        </div>
        <div class="bulk-grand"><span>Total deducted</span><strong>${money(grandTotal)}</strong></div>
      </div>`;
  });

  $("bulkClearButton")?.addEventListener("click", () => { resetBulkFlow(); toast("Cleared."); });

  $("bulkSendButton")?.addEventListener("click", () => {
    if(!bulkRows.length){ toast("Parse a list first."); return; }
    const source = $("bulkSource")?.value || state.currentSource;
    const src = state.sources[source];
    if(!src || !src.enabled){ toast("Source not enabled."); return; }
    askConfirmation(
      `<b>Confirm bulk send</b><br><br>Recipients: ${bulkRows.length}<br>Source: ${escapeHTML(SOURCE_NAMES[source])}<br><br><strong>One PIN for the whole batch.</strong>`,
      () => authorize("Bulk send", () => executeBulkSend(source))
    );
  });
}

function executeBulkSend(source){
  const src = state.sources[source];
  if(!src){ toast("Invalid source."); return; }

  const isWallet = source === "wallet";
  const results = [];
  let succeeded = 0, failed = 0, stoppedAt = null;

  for(const row of bulkRows){
    let fee, beastCut, providerKeeps;

    if(isWallet){
      fee = beastWalletFee(row.amount);
      beastCut = fee;
      providerKeeps = 0;
    } else {
      const split = externalSplit(source, row.amount);
      fee = split.fee;
      beastCut = split.beastCut;
      providerKeeps = split.providerKeeps;
    }

    const total = row.amount + fee;

    if(src.balance < total){
      failed++;
      stoppedAt = row;
      results.push({ phone: row.phone, amount: row.amount, status: "failed", reason: "Insufficient balance" });
      break;
    }

    src.balance -= total;
    succeeded++;

    state.transactions.unshift({
      reference: generateReference(),
      createdAt: new Date().toISOString(),
      status: "completed",
      type: "Bulk Send",
      amount: row.amount,
      fee,
      beastCut,
      providerCost: providerKeeps,
      totalDeducted: total,
      source,
      recipient: row.phone,
      recipientName: "Demo recipient",
      description: `Bulk send to ${row.phone}`
    });

    results.push({ phone: row.phone, amount: row.amount, status: "sent" });
  }

  addNotification("Bulk send", `${succeeded} sent, ${failed} failed.`);
  save();

  const resultBox = $("bulkResult");
  if(resultBox){
    resultBox.classList.remove("hidden");
    resultBox.innerHTML = `
      <div class="bulk-result-head">
        <div><small>Sent</small><strong style="color:var(--green)">${succeeded}</strong></div>
        <div><small>Failed</small><strong style="color:var(--red)">${failed}</strong></div>
      </div>
      <div class="bulk-results">
        ${results.map(r => `
          <div class="bulk-row ${r.status === "sent" ? "ok" : "bad"}">
            <span>${r.status === "sent" ? "✓" : "✕"}</span>
            <div><strong>${escapeHTML(r.phone)}</strong><small>${money(r.amount)}${r.reason ? " — " + escapeHTML(r.reason) : ""}</small></div>
          </div>`).join("")}
      </div>
      ${stoppedAt ? `<div class="bulk-warn">Stopped at ${escapeHTML(stoppedAt.phone)} — insufficient balance.</div>` : ""}`;
  }

  toast(`Bulk: ${succeeded} sent, ${failed} failed.`);
  renderEverything();
}


/* ================= WITHDRAW ================= */

function setupWithdraw(){
  $("verifyAgent")?.addEventListener("click", () => {
    const number = ($("agentNumber").value || "").trim();
    if(!validAgent(number)){ toast("Enter a valid agent."); return; }
    $("agentVerification").classList.remove("hidden");
    $("agentVerification").innerHTML = `<strong>✓ Demo agent</strong>Agent: ${escapeHTML(number)}`;
  });

  $("withdrawButton")?.addEventListener("click", () => {
    if($("agentVerification").classList.contains("hidden")){ toast("Verify agent first."); return; }
    const amount = Number($("withdrawAmount").value);
    const source = $("withdrawSource").value;
    const agent = ($("agentNumber").value || "").trim();
    if(amount <= 0){ toast("Enter amount."); return; }

    let fee;
    if(source === "wallet"){
      fee = beastWalletFee(amount);
    } else {
      fee = externalSplit(source, amount, "withdraw").fee;
    }

    askConfirmation(
      buildConfirmHTML({ title:"Confirm withdrawal", recipientName:"Demo agent", recipient: agent, amount, source, fee }),
      () => authorize("Withdrawal", () => {
        completeTransaction({ type:"Withdraw", amount, source, recipient: agent, recipientName:"Demo agent", description:"Agent cash withdrawal", providerType:"withdraw" });
      })
    );
  });
}

/* ================= LIPA NA ================= */

function lipaFields(){
  const type = $("lipaType")?.value;
  if(!$("lipaDestinationFields")) return;
  if(type === "paybill"){ $("lipaDestinationFields").innerHTML = `
    <div class="two-col">
      <label>PayBill<input id="lipaDestNumber" placeholder="123456"></label>
      <label>Account<input id="lipaAccount" placeholder="ABC123"></label>
    </div>`; }
  else if(type === "till"){ $("lipaDestinationFields").innerHTML = `<label>Till<input id="lipaDestNumber" placeholder="123456"></label>`; }
  else if(type === "pochi"){ $("lipaDestinationFields").innerHTML = `<label>Pochi phone<input id="lipaDestNumber" placeholder="0712345678"></label>`; }
  else { $("lipaDestinationFields").innerHTML = `<label>Reference<input id="lipaDestNumber" placeholder="Business reference"></label>`; }
}

function setupLipa(){
  $("lipaType")?.addEventListener("change", lipaFields);
  lipaFields();

  $("verifyLipa")?.addEventListener("click", () => {
    const value = ($("lipaDestNumber")?.value || "").trim();
    if(value.length < 4){ toast("Enter destination."); return; }
    $("lipaVerification").classList.remove("hidden");
    $("lipaVerification").innerHTML = `<strong>✓ Demo destination</strong>${escapeHTML(value)}`;
  });

  $("lipaPayButton")?.addEventListener("click", () => {
    if($("lipaVerification").classList.contains("hidden")){ toast("Verify destination first."); return; }
    const amount = Number($("lipaAmount").value);
    const source = $("lipaSource").value;
    const dest = $("lipaDestNumber").value;
    if(amount <= 0){ toast("Enter amount."); return; }

    let fee;
    if(source === "wallet"){
      fee = beastWalletFee(amount);
    } else {
      fee = externalSplit(source, amount).fee;
    }

    askConfirmation(
      buildConfirmHTML({ title:"Confirm business payment", recipientName:"Demo business", recipient: dest, amount, source, fee }),
      () => authorize("Lipa Na", () => {
        completeTransaction({ type:"Lipa Na", amount, source, recipient: dest, recipientName:"Demo business", description:`${$("lipaType").value} payment` });
      })
    );
  });
}

function updateDepositPreview(){
  const box = $("depositCostPreview");
  if(!box) return;
  const source = $("depositSource")?.value;
  const amount = Number($("depositAmount")?.value || 0);
  if(amount <= 0){
    box.innerHTML = `<b>Deposit preview</b><br>Enter an amount.`;
    return;
  }
  box.innerHTML = `<b>Deposit to BEAST</b><br>Amount: ${money(amount)}<br><br><strong>Deposits are free. No BEAST fee.</strong>`;
}

function setupDeposit(){
  $("performDepositButton")?.addEventListener("click", () => {
    const phone = normalizePhone($("depositPhone")?.value || "");
    const source = $("depositSource")?.value;
    const amount = Number($("depositAmount")?.value || 0);

    if(!validPhone(phone)){ toast("Enter customer's valid phone."); return; }
    if(phone !== state.user.phone){ toast("Demo deposit for registered customer only."); return; }
    if(!state.sources[source]){ toast("Select a valid deposit source."); return; }
    if(source === "wallet"){ toast("Wallet cannot deposit into itself."); return; }
    if(amount <= 0){ toast("Enter amount."); return; }

    askConfirmation(
      `<b>Confirm deposit</b><br><br>Source: ${escapeHTML(SOURCE_NAMES[source])}<br>Amount: ${money(amount)}<br><br><strong>BEAST Wallet receives: ${money(amount)}</strong><br><small>Deposits are free.</small>`,
      () => authorize("Deposit to BEAST", () => {
        const src = state.sources[source];
        if(src.balance < amount){ toast("Insufficient source balance."); return; }
        src.balance -= amount;
        state.sources.wallet.enabled = true;
        state.sources.wallet.balance += amount;

        const reference = generateReference();
        state.transactions.unshift({
          reference, createdAt: new Date().toISOString(), status: "completed",
          type: "Deposit to BEAST", amount, fee: 0, beastCut: 0, providerCost: 0,
          totalDeducted: amount, source, destination: "BEAST Wallet",
          recipient: state.user.phone, recipientName: state.user.name,
          received: amount,
          description: `Deposit from ${SOURCE_NAMES[source]} to BEAST Wallet`
        });

        addNotification("Deposit completed", `${money(amount)} added to BEAST Wallet. Ref ${reference}.`);
        addSecurity(`BEAST deposit from ${SOURCE_NAMES[source]}.`);
        save();
        toast("Deposit completed. No BEAST fee.");
        if($("depositAmount")) $("depositAmount").value = "";
        renderEverything();
      })
    );
  });

  $("depositSource")?.addEventListener("change", updateDepositPreview);
  $("depositAmount")?.addEventListener("input", updateDepositPreview);
  updateDepositPreview();
}

/* ================= CONFIRM + PIN MODAL ================= */

function askConfirmation(summaryHTML, onConfirm){
  if(!$("confirmModal")){ pendingAction = onConfirm; openPinModal("Confirm"); return; }
  $("confirmBody").innerHTML = summaryHTML;
  $("confirmModal").classList.remove("hidden");
  $("confirmYes").onclick = () => { $("confirmModal").classList.add("hidden"); onConfirm(); };
  $("confirmNo").onclick = () => { $("confirmModal").classList.add("hidden"); pendingAction = null; };
  $("confirmClose")?.addEventListener("click", () => { $("confirmModal").classList.add("hidden"); pendingAction = null; });
}

function buildConfirmHTML({title, recipientName, recipient, amount, source, fee}){
  const total = Number(amount) + Number(fee);
  return `<b>${escapeHTML(title)}</b><br><br>Recipient: ${escapeHTML(recipientName)}<br>Destination: ${escapeHTML(recipient)}<br>Source: ${escapeHTML(SOURCE_NAMES[source] || source)}<br><br>Amount: ${money(amount)}<br>Fee: ${money(fee)}<br><br><strong>Total: ${money(total)}</strong>`;
}

function openPinModal(purpose){
  $("pinPurpose").textContent = purpose;
  $("authorizationPin").value = "";
  if($("pinError")){ $("pinError").textContent = ""; $("pinError").classList.add("hidden"); }
  $("pinModal").classList.remove("hidden");
  setTimeout(() => $("authorizationPin").focus(), 100);
}

function authorize(purpose, callback){
  pendingAction = callback;
  openPinModal(purpose);
}

function closePin(){
  pendingAction = null;
  $("pinModal").classList.add("hidden");
}

function pinLocked(){ return state.security.lockoutUntil && Date.now() < state.security.lockoutUntil; }
function secondsLeft(){ return Math.ceil((state.security.lockoutUntil - Date.now()) / 1000); }

async function attemptPin(pin){
  if(pinLocked()){
    const s = secondsLeft();
    if($("pinError")){ $("pinError").textContent = `Locked. Try again in ${s}s.`; $("pinError").classList.remove("hidden"); }
    return;
  }

  const ok = await verifyPin(pin);

  if(!ok){
    state.security.failedPinAttempts += 1;
    addSecurity("Failed PIN.");
    if(state.security.failedPinAttempts >= MAX_PIN_ATTEMPTS){
      state.security.lockoutUntil = Date.now() + PIN_LOCKOUT_MS;
      state.security.failedPinAttempts = 0;
      save();
      if($("pinError")){ $("pinError").textContent = `Too many. Locked ${PIN_LOCKOUT_MS/1000}s.`; $("pinError").classList.remove("hidden"); }
      return;
    }
    save();
    if($("pinError")){ $("pinError").textContent = `Incorrect. ${MAX_PIN_ATTEMPTS - state.security.failedPinAttempts} left.`; $("pinError").classList.remove("hidden"); }
    return;
  }

  state.security.failedPinAttempts = 0;
  state.security.lockoutUntil = 0;
  save();

  const action = pendingAction;
  closePin();
  if(action) action();
}

function setupPin(){
  $("confirmPin")?.addEventListener("click", () => {
    if(buyerSession && $("confirmPin")._buyerHandler) return;
    attemptPin($("authorizationPin").value);
  });
  $("authorizationPin")?.addEventListener("keydown", e => {
    if(e.key === "Enter"){ if(buyerSession && $("confirmPin")._buyerHandler) return; attemptPin($("authorizationPin").value); }
  });
  $("cancelPin").onclick = closePin;
  $("closePinModal").onclick = closePin;
}


/* ================= COMPLETE TRANSACTION ================= */

function completeTransaction(data){
  const amount = Number(data.amount);

  let fee, beastCut, providerKeeps, total;

  if(data.source === "wallet"){
    fee = beastWalletFee(amount);
    beastCut = fee;
    providerKeeps = 0;
    total = amount + fee;
  } else {
    const split = externalSplit(data.source, amount, data.providerType || "send");
    fee = split.fee;
    beastCut = split.beastCut;
    providerKeeps = split.providerKeeps;
    total = amount + fee;
  }

  const source = state.sources[data.source];
  if(!source || !source.enabled){ toast("Source not enabled."); return; }
  if(source.balance < total){ toast(`Insufficient ${SOURCE_NAMES[data.source]} balance.`); return; }

  source.balance -= total;

  state.transactions.unshift({
    reference: generateReference(),
    createdAt: new Date().toISOString(),
    status:"completed",
    type: data.type,
    amount,
    fee,
    beastCut,
    providerCost: providerKeeps,
    totalDeducted: total,
    source: data.source,
    recipient: data.recipient,
    recipientName: data.recipientName,
    description: data.description
  });

  addNotification(`${data.type} completed`, `${money(amount)} sent to ${data.recipientName}.`);
  addSecurity(`${data.type} authorized.`);
  save();
  toast(`${data.type} completed. ${money(total)} deducted.`);

  if(data.type === "Send"){
    $("sendPhone").value = "";
    $("sendAmount").value = "";
    $("recipientVerification").classList.add("hidden");
  }
  renderEverything();
}

/* ================= RECEIVE (BUYER FLOW) ================= */

function setupReceiveTabs(){
  document.querySelectorAll("[data-rtab]").forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.rtab;
      document.querySelectorAll("[data-rtab]").forEach(t => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".receive-tab-panel").forEach(p => p.classList.remove("active"));
      const panel = target === "buyer" ? $("buyerTab") : target === "deposit" ? $("depositTab") : $("agentTab");
      panel?.classList.add("active");
      if(target === "buyer") resetBuyerFlow();
      updateReceiveBackButton();
    });
  });
}

function renderReceiveSellerLine(){
  const line = $("receiveSellerLine");
  if(!line) return;
  if(!isLoggedIn()){ line.textContent = "Paying: —"; return; }
  line.textContent = `Paying: ${state.user.name} • ${state.user.beastId}`;
}

function setBuyerStep(step){
  buyerStep = step;
  ["buyerStep1","buyerStep2","buyerStep3","buyerSuccessPanel"].forEach(id => $(id)?.classList.remove("active"));
  if(step === 1) $("buyerStep1")?.classList.add("active");
  if(step === 2) $("buyerStep2")?.classList.add("active");
  if(step === 3) $("buyerStep3")?.classList.add("active");
  if(step === "success") $("buyerSuccessPanel")?.classList.add("active");
  document.querySelectorAll(".buyer-step").forEach(el => {
    el.classList.toggle("active", Number(el.dataset.bstep) === step);
  });
  updateReceiveBackButton();
}

function updateReceiveBackButton(){
  const btn = $("receiveBackButton");
  if(!btn) return;
  const buyerTabActive = $("buyerTab")?.classList.contains("active");
  if(!buyerTabActive){ btn.classList.add("hidden"); return; }
  if(buyerStep === 1 || buyerStep === "success") btn.classList.add("hidden");
  else btn.classList.remove("hidden");
}

function handleReceiveBack(){
  if(buyerStep === 3){ setBuyerStep(2); return; }
  if(buyerStep === 2){
    buyerSession = null;
    setBuyerStep(1);
    ["buyerLoginPhone","buyerLoginNationalId","buyerLoginPin"].forEach(id => { if($(id)) $(id).value = ""; });
  }
}

function setupBuyerFlow(){
  $("receiveBackButton")?.addEventListener("click", handleReceiveBack);
  $("buyerLoginButton")?.addEventListener("click", doBuyerLogin);

  $("buyerChooseSourceButton")?.addEventListener("click", () => {
    if(!buyerSession) return;
    if(!buyerSession.chosenSource){ toast("Select an account."); return; }
    renderBuyerStep3();
    setBuyerStep(3);
  });

  $("buyerPayAmount")?.addEventListener("input", updateBuyerCostPreview);
  $("buyerDestinationChannel")?.addEventListener("change", renderBuyerDestinationFields);
  $("buyerConfirmPayButton")?.addEventListener("click", doBuyerPay);

  $("copyReceiptButton")?.addEventListener("click", () => {
    const text = $("receiptText")?.textContent || "";
    navigator.clipboard?.writeText(text).then(() => toast("Copied.")).catch(() => toast("Copy failed."));
  });

  $("shareReceiptButton")?.addEventListener("click", () => {
    const text = $("receiptText")?.textContent || "";
    if(navigator.share){ navigator.share({ title:"BEAST Receipt", text }).catch(() => {}); }
    else { navigator.clipboard?.writeText(text).then(() => toast("Copied.")); }
  });
}

async function doBuyerLogin(){
  const phone = normalizePhone($("buyerLoginPhone").value);
  const nationalId = $("buyerLoginNationalId").value.trim();
  const pin = $("buyerLoginPin").value;

  if(!validPhone(phone)){ toast("Enter valid phone."); return; }
  if(!/^\d{5,}$/.test(nationalId)){ toast("Enter National ID."); return; }
  if(!/^\d{4}$/.test(pin)){ toast("Enter 4-digit PIN."); return; }

  const bs = state.buyerSecurity;
  if(bs.lockoutUntil && Date.now() < bs.lockoutUntil){ toast(`Locked. ${Math.ceil((bs.lockoutUntil - Date.now())/1000)}s.`); return; }

  const buyer = DEMO_BUYERS.find(b => b.phone === phone);
  if(!buyer){ addSecurity(`Unknown buyer ${phone}.`); save(); toast("Buyer not found."); return; }
  if(buyer.nationalId !== nationalId){ addSecurity(`ID mismatch ${phone}.`); save(); toast("National ID mismatch."); return; }

  const ok = await verifyDemoBuyerPin(phone, pin);
  if(!ok){
    bs.failedPinAttempts = (bs.failedPinAttempts || 0) + 1;
    if(bs.failedPinAttempts >= MAX_PIN_ATTEMPTS){
      bs.lockoutUntil = Date.now() + PIN_LOCKOUT_MS;
      bs.failedPinAttempts = 0;
      save();
      toast(`Too many attempts. Locked ${PIN_LOCKOUT_MS/1000}s.`);
      return;
    }
    save();
    toast(`Incorrect PIN. ${MAX_PIN_ATTEMPTS - bs.failedPinAttempts} left.`);
    return;
  }

  bs.failedPinAttempts = 0;
  bs.lockoutUntil = 0;
  save();

  buyerSession = {
    phone: buyer.phone, name: buyer.name, nationalId: buyer.nationalId,
    sources: JSON.parse(JSON.stringify(buyer.sources)),
    chosenSource: null
  };

  $("buyerLoginPin").value = "";
  renderBuyerStep2();
  setBuyerStep(2);

  clearTimeout(buyerSessionTimer);
  buyerSessionTimer = setTimeout(() => { if(buyerSession){ toast("Buyer session expired."); resetBuyerFlow(); } }, BUYER_SESSION_MS);
}

function renderBuyerStep2(){
  if(!buyerSession) return;
  if($("buyerWelcomeLine")) $("buyerWelcomeLine").textContent = `Signed in as ${buyerSession.name}`;

  const list = $("buyerSourcesList");
  if(!list) return;

  list.innerHTML = ALL_SOURCES.map(key => {
    const src = buyerSession.sources[key] || { enabled: false };
    const linked = src.enabled === true;
    let details = "Not linked";
    if(linked){
      if(key === "bank") details = src.bankName ? `${src.bankName} ••••` : "Linked";
      else if(key === "card") details = src.cardName ? `${src.cardName} •••• ${src.last4 || "----"}` : "Linked";
      else if(key === "wallet") details = "BEAST Wallet";
      else details = "Balance hidden";
    }
    const selected = buyerSession.chosenSource === key ? " selected" : "";
    return `<button class="buyer-source-option${selected} ${linked ? "" : "disabled"}" data-bsource="${key}" ${linked ? "" : "disabled"}>
      <span class="buyer-source-icon">${SOURCE_ICONS[key]}</span>
      <span class="buyer-source-text"><strong>${SOURCE_NAMES[key]}</strong><small>${escapeHTML(details)}</small></span>
    </button>`;
  }).join("");

  list.querySelectorAll("[data-bsource]").forEach(btn => {
    btn.addEventListener("click", () => {
      buyerSession.chosenSource = btn.dataset.bsource;
      list.querySelectorAll(".buyer-source-option").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      $("buyerChooseSourceButton").disabled = false;
    });
  });

  $("buyerChooseSourceButton").disabled = !buyerSession.chosenSource;
}

function availableDestinations(){
  return Object.entries(state.receiving).filter(([,r]) => r.enabled).map(([k]) => k);
}

function renderBuyerStep3(){
  if(!buyerSession) return;
  if($("buyerDestinationName")) $("buyerDestinationName").textContent = state.user.name;
  if($("buyerDestinationId")) $("buyerDestinationId").textContent = `${state.user.beastId} • ${internationalPhone(state.user.phone)}`;
  if($("buyerChosenSourceName")) $("buyerChosenSourceName").textContent = SOURCE_NAMES[buyerSession.chosenSource] || "—";

  const select = $("buyerDestinationChannel");
  if(select){
    const enabled = availableDestinations();
    select.innerHTML = enabled.map(key => {
      const label = { wallet:"Wallet", pochi:"Pochi", till:"Till", paybill:"PayBill", bank:"Bank", card:"Card" }[key];
      return `<option value="${key}">${label}</option>`;
    }).join("");
    if(!select.value && enabled.length) select.value = enabled[0];
  }
  renderBuyerDestinationFields();
  if($("buyerPayAmount")) $("buyerPayAmount").value = "";
  updateBuyerCostPreview();
}

function renderBuyerDestinationFields(){
  const channel = $("buyerDestinationChannel")?.value;
  const fields = $("buyerDestinationFields");
  if(!fields) return;
  if(channel === "wallet"){ fields.innerHTML = `<small class="muted">Money lands in seller's Wallet.</small>`; return; }
  if(channel === "pochi"){ fields.innerHTML = `<div class="buyer-account-chip"><span>Pochi</span><strong>${escapeHTML(state.receiving.pochi.phone || "—")}</strong></div>`; return; }
  if(channel === "till"){ fields.innerHTML = `<div class="buyer-account-chip"><span>Till</span><strong>${escapeHTML(state.receiving.till.number || "—")}</strong></div>`; return; }
  if(channel === "paybill"){ fields.innerHTML = `<div class="buyer-account-chip"><span>PayBill</span><strong>${escapeHTML(state.receiving.paybill.number || "—")}</strong><small>Acct: ${escapeHTML(state.receiving.paybill.account || "—")}</small></div>`; return; }
  if(channel === "bank"){ fields.innerHTML = `<div class="buyer-account-chip"><span>Bank</span><strong>${escapeHTML(state.receiving.bank.bankName || "—")}</strong><small>Acct: ${escapeHTML(state.receiving.bank.account || "—")}</small></div>`; return; }
  if(channel === "card"){ fields.innerHTML = `<div class="buyer-account-chip"><span>Card</span><strong>${escapeHTML(state.receiving.card.cardName || "—")} •••• ${escapeHTML(state.receiving.card.last4 || "----")}</strong></div>`; return; }
}

function updateBuyerCostPreview(){
  const box = $("buyerCostPreview");
  if(!box || !buyerSession) return;
  const amount = Number($("buyerPayAmount")?.value || 0);
  const source = buyerSession.chosenSource;
  if(amount <= 0){ box.innerHTML = `<b>Cost preview</b><br>Enter amount.`; return; }

  if(source === "wallet"){
    const fee = beastWalletFee(amount);
    box.innerHTML = `<b>BEAST Wallet</b><br>Amount: ${money(amount)}<br>Fee: ${money(fee)}<br><br><strong>Total: ${money(amount + fee)}</strong>`;
  } else {
    const split = externalSplit(source, amount);
    box.innerHTML = `<b>Cost preview</b><br>Amount: ${money(amount)}<br>${SOURCE_NAMES[source]} fee: ${money(split.fee)}<br><br><strong>Total: ${money(amount + split.fee)}</strong>`;
  }
}
function doBuyerPay(){
  if(!buyerSession) return;
  const amount = Number($("buyerPayAmount").value);
  const channel = $("buyerDestinationChannel")?.value || "wallet";
  if(amount <= 0){ toast("Enter amount."); return; }

  const source = buyerSession.chosenSource;
  let fee, beastCut, providerKeeps;

  if(source === "wallet"){
    fee = beastWalletFee(amount);
    beastCut = fee;
    providerKeeps = 0;
  } else {
    const split = externalSplit(source, amount);
    fee = split.fee;
    beastCut = split.beastCut;
    providerKeeps = split.providerKeeps;
  }

  const total = amount + fee;
  const src = buyerSession.sources[source];
  if(!src || src.balance < total){ toast("Buyer insufficient balance."); return; }

  const channelLabel = { wallet:"Wallet", pochi:"Pochi", till:"Till", paybill:"PayBill", bank:"Bank", card:"Card" }[channel];

  askConfirmation(
    `<b>Confirm buyer payment</b><br><br>Buyer: ${escapeHTML(buyerSession.name)}<br>To: ${escapeHTML(state.user.name)}<br>Via: ${escapeHTML(channelLabel)}<br>Source: ${escapeHTML(SOURCE_NAMES[source])}<br><br>Amount: ${money(amount)}<br>Fee: ${money(fee)}<br><br><strong>Total: ${money(total)}</strong>`,
    () => authorizeBuyerPin(amount, source, fee, beastCut, providerKeeps, channel)
  );
}

function authorizeBuyerPin(amount, source, fee, beastCut, providerKeeps, channel){
  $("pinPurpose").textContent = `Buyer auth — ${buyerSession.name}`;
  $("authorizationPin").value = "";
  if($("pinError")){ $("pinError").textContent = ""; $("pinError").classList.add("hidden"); }
  $("pinModal").classList.remove("hidden");

  const confirmBtn = $("confirmPin");
  if(!confirmBtn) return;

  confirmBtn._buyerHandler = async () => {
    const pin = $("authorizationPin").value;
    if(!/^\d{4}$/.test(pin)){ if($("pinError")){ $("pinError").textContent = "Enter 4-digit PIN."; $("pinError").classList.remove("hidden"); } return; }

    const ok = await verifyDemoBuyerPin(buyerSession.phone, pin);
    if(!ok){ if($("pinError")){ $("pinError").textContent = "Incorrect PIN."; $("pinError").classList.remove("hidden"); } return; }

    confirmBtn.removeEventListener("click", confirmBtn._buyerHandler);
    confirmBtn._buyerHandler = null;
    $("pinModal").classList.add("hidden");
    finishBuyerPayment(amount, source, fee, beastCut, providerKeeps, channel);
  };

  confirmBtn.addEventListener("click", confirmBtn._buyerHandler);
}

function finishBuyerPayment(amount, source, fee, beastCut, providerKeeps, channel){
  const src = buyerSession.sources[source];
  const total = amount + fee;
  src.balance -= total;

  let sellerSourceKey = "wallet";
  if(channel === "pochi" || channel === "till" || channel === "paybill") sellerSourceKey = "mpesa";
  else if(channel === "bank") sellerSourceKey = "bank";
  else if(channel === "card") sellerSourceKey = "card";

  if(!state.sources[sellerSourceKey]?.enabled){ sellerSourceKey = "wallet"; state.sources.wallet.enabled = true; }
  state.sources[sellerSourceKey].balance += amount;

  const reference = generateReference();
  state.transactions.unshift({
    reference, createdAt: new Date().toISOString(), status:"completed",
    type:"Buyer Payment", amount, fee,
    beastCut, providerCost: providerKeeps, totalDeducted: total,
    source, destination: channel, sellerSource: sellerSourceKey,
    recipient: state.user.phone, recipientName: state.user.name,
    buyerName: buyerSession.name, buyerPhone: buyerSession.phone,
    description: `Buyer payment from ${buyerSession.name} via ${channel}`
  });

  addNotification("Buyer payment", `${money(amount)} from ${buyerSession.name}.`);
  save();
  showBuyerSuccess(amount, reference, channel, source, fee);
  renderEverything();
}

function showBuyerSuccess(amount, reference, channel, source, fee){
  const channelLabel = { wallet:"Wallet", pochi:"Pochi", till:"Till", paybill:"PayBill", bank:"Bank", card:"Card" }[channel];
  if($("buyerSuccessText")) $("buyerSuccessText").textContent = `${money(amount)} received. Ref ${reference}.`;

  const receiptText = `BEAST Payment Receipt
Ref: ${reference}
From: ${buyerSession.name} (${buyerSession.phone})
To: ${state.user.name} (${state.user.beastId})
Amount: ${money(amount)}
Fee: ${money(fee)}
Via: ${channelLabel}
Date: ${new Date().toLocaleString("en-KE")}`;

  if($("receiptText")) $("receiptText").textContent = receiptText;

  setBuyerStep("success");
  clearTimeout(buyerSuccessTimer);

  const fill = $("buyerCountdownFill");
  const text = $("buyerCountdownText");
  if(fill){ fill.style.transition = "none"; fill.style.width = "100%"; }
  requestAnimationFrame(() => { if(fill){ fill.style.transition = `width ${BUYER_SUCCESS_MS}ms linear`; fill.style.width = "0%"; } });

  let remaining = Math.ceil(BUYER_SUCCESS_MS / 1000);
  if(text) text.textContent = `Returning in ${remaining}s…`;

  const tick = setInterval(() => {
    remaining -= 1;
    if(remaining > 0 && text) text.textContent = `Returning in ${remaining}s…`;
    if(remaining <= 0){ clearInterval(tick); buyerSuccessTimer = setTimeout(() => resetBuyerFlow(), 200); }
  }, 1000);
}

function resetBuyerFlow(){
  clearTimeout(buyerSuccessTimer);
  clearTimeout(buyerSessionTimer);
  buyerSession = null;
  ["buyerLoginPhone","buyerLoginNationalId","buyerLoginPin","buyerPayAmount"].forEach(id => { if($(id)) $(id).value = ""; });
  if($("buyerSourcesList")) $("buyerSourcesList").innerHTML = "";
  if($("buyerChosenSourceName")) $("buyerChosenSourceName").textContent = "—";
  if($("buyerDestinationName")) $("buyerDestinationName").textContent = "—";
  if($("buyerDestinationId")) $("buyerDestinationId").textContent = "—";
  if($("buyerCostPreview")) $("buyerCostPreview").innerHTML = "";
  if($("buyerChooseSourceButton")) $("buyerChooseSourceButton").disabled = true;
  if($("receiptText")) $("receiptText").textContent = "";
  setBuyerStep(1);
  renderReceiveSellerLine();
}


/* ================= CHAT ================= */

function renderChat(){
  const box = $("chatMessages");
  if(!box) return;

  if(!state.chat.length){
    box.innerHTML = `<div class="chat-empty muted">No messages yet. Send one to try.</div>`;
    return;
  }

  box.innerHTML = state.chat.map(msg => `
    <div class="chat-bubble ${msg.dir}">
      <small>${escapeHTML(msg.sender)}</small>
      <p>${escapeHTML(msg.text)}</p>
      <small class="chat-time">${dateText(msg.at)}</small>
    </div>
  `).join("");

  box.scrollTop = box.scrollHeight;
}

function setupChat(){
  $("chatForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("chatInput");
    const text = input.value.trim();
    if(!text) return;

    state.chat.push({
      sender: state.user.name || "YOU",
      text,
      dir: "sent",
      at: new Date().toISOString()
    });
    input.value = "";
    save();
    renderChat();

    // Local demo auto-reply (not real)
    setTimeout(() => {
      state.chat.push({
        sender: "BEAST DEMO",
        text: "This is a local demo reply. Live chat between BEAST users needs a server.",
        dir: "received",
        at: new Date().toISOString()
      });
      save();
      renderChat();
    }, 600);
  });

  $("startChatBtn")?.addEventListener("click", () => {
    const id = ($("recipientId")?.value || "").trim().toUpperCase();
    if(!id){ toast("Enter a BEAST ID."); return; }
    if(!/^BEAST-\d{6}$/.test(id)){ toast("Format: BEAST-100002."); return; }
    if(id === state.user.beastId){ toast("That's your own ID."); return; }

    state.chat.push({
      sender: "SYSTEM",
      text: `Demo conversation opened with ${id}. Real chat is not connected yet.`,
      dir: "received",
      at: new Date().toISOString()
    });
    save();
    renderChat();
    toast("Demo conversation ready.");
  });

  $("clearChatBtn")?.addEventListener("click", () => {
    if(!state.chat.length){ toast("Chat is already empty."); return; }
    if(!confirm("Clear local chat history?")) return;
    state.chat = [];
    save();
    renderChat();
    toast("Chat cleared.");
  });
}


/* ================= CALLS ================= */

function setupCalls(){
  $("beastCallBtn")?.addEventListener("click", () => {
    const target = ($("callId")?.value || "").trim();
    if(!target){ toast("Enter BEAST ID or phone."); return; }
    const choice = confirm(`BEAST CALL DEMO\n\nDestination: ${target}\n\nOK = open phone dialer if it's a phone number.\nCancel = return.\n\nBEAST-to-BEAST calls not live yet.`);
    if(choice && /^\+?[\d\s()-]{7,20}$/.test(target)){
      window.location.href = "tel:" + target.replace(/[^\d+]/g, "");
    } else if(choice){
      toast("Live BEAST calling is not connected yet.");
    }
  });

  $("videoCallBtn")?.addEventListener("click", () => toast("Video calling needs a live service."));

  $("phoneCallBtn")?.addEventListener("click", () => {
    const num = prompt("Enter phone number to call:");
    if(num && /^\+?[\d\s()-]{7,20}$/.test(num)){
      window.location.href = "tel:" + num.replace(/[^\d+]/g, "");
    } else if(num){
      toast("Check the number.");
    }
  });
}


/* ================= CONNECT ================= */

function setupConnect(){
  $("searchForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = ($("searchInput")?.value || "").trim();
    if(!q) return;
    window.open("https://www.google.com/search?q=" + encodeURIComponent(q), "_blank", "noopener,noreferrer");
  });
}


/* ================= PREMIUM ================= */

function setupPremium(){
  $("premiumBtn")?.addEventListener("click", () => {
    if(!isLoggedIn()){ showScreen("welcome"); return; }
    const accepted = confirm("BEAST PREMIUM DEMO\n\nPlanned price: KES 250 per month.\n\nNo payment will be taken.");
    if(!accepted) return;
    addNotification("Premium demo", "No money charged.");
    toast("Premium demo enabled.");
  });
}


/* ================= HISTORY + STATEMENTS ================= */

function renderHistory(){
  const box = $("historyList");
  if(!box) return;
  if(!state.transactions.length){ box.innerHTML = `<div class="panel muted">No transactions yet.</div>`; return; }

  box.innerHTML = state.transactions.map(t => {
    const dir = t.type === "Deposit to BEAST" || t.type === "Agent Deposit" || t.type === "Buyer Payment" ? "+" : "-";
    return `<div class="list-item">
      <strong>${escapeHTML(t.type)}</strong>
      <span>${dir} ${money(t.amount)}</span>
      <small>${escapeHTML(t.description)}<br>Recipient: ${escapeHTML(t.recipientName || t.destination || "-")}<br>Ref: ${escapeHTML(t.reference)}<br>${dateText(t.createdAt)}</small>
    </div>`;
  }).join("");
}

function computeStatementSummary(days = 30){
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const recent = state.transactions.filter(t => new Date(t.createdAt).getTime() >= since);
  let sent = 0, received = 0, fees = 0, provider = 0;
  recent.forEach(t => {
    const amt = Number(t.amount || 0);
    fees += Number(t.fee || 0);
    provider += Number(t.providerCost || 0);
    if(t.type === "Buyer Payment" || t.type === "Deposit to BEAST" || t.type === "Agent Deposit") received += amt;
    else sent += amt;
  });
  return { count: recent.length, sent, received, fees, provider, net: received - sent };
}

function renderStatements(){
  const summaryBox = $("statementsSummary");
  const listBox = $("statementsList");
  if(!summaryBox || !listBox) return;

  const s = computeStatementSummary(30);
  summaryBox.innerHTML = `
    <div class="statements-grid">
      <div class="stat-card"><small>Transactions</small><strong>${s.count}</strong></div>
      <div class="stat-card"><small>Money in</small><strong style="color:var(--green)">${money(s.received)}</strong></div>
      <div class="stat-card"><small>Money out</small><strong style="color:var(--red)">${money(s.sent)}</strong></div>
      <div class="stat-card"><small>Net</small><strong>${money(s.net)}</strong></div>
      <div class="stat-card"><small>BEAST fees</small><strong>${money(s.fees)}</strong></div>
      <div class="stat-card"><small>Provider costs</small><strong>${money(s.provider)}</strong></div>
    </div>`;

  if(!state.transactions.length){ listBox.innerHTML = `<div class="panel muted">No activity yet.</div>`; return; }

  listBox.innerHTML = state.transactions.slice(0, 20).map(t => {
    const dir = t.type === "Buyer Payment" || t.type === "Deposit to BEAST" || t.type === "Agent Deposit" ? "+" : "-";
    return `<div class="list-item"><strong>${escapeHTML(t.type)}</strong><span>${dir} ${money(t.amount)}</span><small>${escapeHTML(t.description || "")}<br>Ref: ${escapeHTML(t.reference)}<br>${dateText(t.createdAt)}</small></div>`;
  }).join("");
}


/* ================= NOTIFICATIONS ================= */

function addNotification(title, message){
  state.notifications.unshift({ title, message, createdAt: new Date().toISOString(), read: false });
  state.notifications = state.notifications.slice(0, 100);
  save();
}

function renderNotifications(){
  const box = $("notificationList");
  if(!box) return;
  if(!state.notifications.length){ box.innerHTML = `<div class="panel muted">No notifications yet.</div>`; return; }
  box.innerHTML = state.notifications.map(n => `
    <div class="list-item ${n.read ? "" : "unread"}">
      <strong>${escapeHTML(n.title)}</strong>
      <small>${escapeHTML(n.message)}<br>${dateText(n.createdAt)}</small>
    </div>`).join("");
}

function markNotificationsReadIfOpen(){
  const s = $("notificationsScreen");
  if(!s || !s.classList.contains("active")) return;
  let changed = false;
  state.notifications.forEach(n => { if(!n.read){ n.read = true; changed = true; } });
  if(changed){ save(); updateNotificationBadge(); }
}

function updateNotificationBadge(){
  const unread = state.notifications.filter(n => !n.read).length;
  if($("notificationBadge")) $("notificationBadge").textContent = unread;
}


/* ================= SECURITY ================= */

function addSecurity(message){
  state.securityEvents.unshift({ message, createdAt: new Date().toISOString() });
  state.securityEvents = state.securityEvents.slice(0, 100);
}

function renderSecurity(){
  const box = $("securityList");
  if(!box) return;
  if(!state.securityEvents.length){ box.innerHTML = `<div class="muted">No security events.</div>`; return; }
  box.innerHTML = state.securityEvents.map(e => `<div class="list-item"><strong>Security event</strong><small>${escapeHTML(e.message)}<br>${dateText(e.createdAt)}</small></div>`).join("");
}


/* ================= PROFILE ================= */

function renderProfile(){
  const box = $("profileDetails");
  if(!box) return;
  box.innerHTML = `
    <div class="list-item">
      <strong>${escapeHTML(state.user.name || "Not registered")}</strong>
      <small>
        BEAST ID: ${escapeHTML(state.user.beastId || "-")}<br>
        Phone: ${escapeHTML(state.user.phone || "-")}<br>
        International: ${escapeHTML(internationalPhone(state.user.phone) || "-")}<br>
        National ID: ${escapeHTML(state.user.nationalId || "-")}<br>
        Total balance: ${money(totalBalance())}<br>
        PIN storage: <b>salted SHA-256 hash</b><br>
        Password storage: <b>salted SHA-256 hash</b>
      </small>
    </div>`;
}


/* ================= SETTINGS ================= */

function setupSettings(){
  $("themeToggle")?.addEventListener("change", e => setTheme(e.target.checked));
  $("notificationsToggle")?.addEventListener("change", e => {
    state.settings.notifications = e.target.checked; save();
  });

  $("changePinButton")?.addEventListener("click", async () => {
    const oldPin = $("oldPin").value;
    const newPin = $("newPin").value;
    const confirmPin = $("confirmNewPin").value;
    if(!(await verifyPin(oldPin))){ toast("Current PIN incorrect."); return; }
    if(!/^\d{4}$/.test(newPin) || newPin !== confirmPin){ toast("New PIN must match."); return; }
    await setPin(newPin);
    addSecurity("PIN changed.");
    save();
    toast("PIN changed.");
    $("oldPin").value = ""; $("newPin").value = ""; $("confirmNewPin").value = "";
  });

  $("changePasswordButton")?.addEventListener("click", async () => {
    const oldPw = $("oldPassword").value;
    const newPw = $("newPassword").value;
    const confirmPw = $("confirmNewPassword").value;
    if(!(await verifyPassword(oldPw))){ toast("Current password incorrect."); return; }
    if(newPw.length < MIN_PASSWORD_LENGTH){ toast(`Min ${MIN_PASSWORD_LENGTH} characters.`); return; }
    if(newPw !== confirmPw){ toast("Passwords don't match."); return; }
    await setPassword(newPw);
    addSecurity("Password changed.");
    save();
    toast("Password changed.");
    $("oldPassword").value = ""; $("newPassword").value = ""; $("confirmNewPassword").value = "";
  });

  $("resetDemo")?.addEventListener("click", () => {
    if(!confirm("Reset all BEAST demo data? You will be logged out.")) return;
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  });
}


/* ================= BOTTOM NAV + MENU ================= */

function setupNav(){
  document.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      const target = {
        money: "money",
        chat: "chat",
        calls: "calls",
        connect: "connect",
        profile: "profile"
      }[tab];
      if(!target) return;
      if(!isLoggedIn() && target !== "connect"){
        toast("Please log in first.");
        showScreen("welcome");
        return;
      }
      showScreen(target);
    });
  });

  document.querySelectorAll("[data-menu]").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.menu;
      if(target === "logout"){
        endSession();
        addSecurity("Logged out.");
        save();
        toast("Logged out.");
        closeMenu();
        showScreen("welcome");
        return;
      }
      if(!isLoggedIn() && target !== "welcome" && target !== "connect"){
        toast("Please log in first.");
        showScreen("welcome");
        return;
      }
      showScreen(target);
    });
  });

  $("menuButton")?.addEventListener("click", openMenu);
  $("closeMenu")?.addEventListener("click", closeMenu);
  $("drawerBackdrop")?.addEventListener("click", closeMenu);
  $("notificationButton")?.addEventListener("click", () => {
    if(!isLoggedIn()){ showScreen("welcome"); return; }
    showScreen("notifications");
  });
}


/* ================= OWNER ANNOUNCEMENTS (WebSocket) ================= */

function connectAnnouncements(){
  if(!SERVER_URL){ return; } // No server configured

  try{
    const wsUrl = SERVER_URL.replace(/^http/, "ws");
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log("Announcement channel connected");
    };

    socket.onmessage = (event) => {
      try{
        const data = JSON.parse(event.data);
        if(data.type === "announcement"){
          currentAnnouncement = data.message || null;
          renderAnnouncementBanner();
        }
      }catch(e){}
    };

    socket.onclose = () => {
      // Try to reconnect after 5 seconds
      setTimeout(connectAnnouncements, 5000);
    };

    socket.onerror = () => {};
  }catch(e){ console.error(e); }
}

function renderAnnouncementBanner(){
  const banner = $("announcementBanner");
  if(!banner) return;
  if(currentAnnouncement){
    banner.textContent = "📢 " + currentAnnouncement;
    banner.classList.remove("hidden");
  } else {
    banner.textContent = "";
    banner.classList.add("hidden");
  }
}


/* ================= RENDER ALL ================= */

function renderHome(){
  if(!isLoggedIn()) return;
  if($("welcomeText")) $("welcomeText").textContent = `Welcome, ${state.user.name}.`;
  if($("dashboardBeastId")) $("dashboardBeastId").textContent = state.user.beastId;
  if($("menuUser")) $("menuUser").textContent = state.user.name;
  if($("totalBalance")) $("totalBalance").textContent = money(totalBalance());
  if($("profileTopBeastId")) $("profileTopBeastId").textContent = state.user.beastId;
}

function renderSettingsUI(){
  if($("themeToggle")) $("themeToggle").checked = state.settings.dark;
  if($("notificationsToggle")) $("notificationsToggle").checked = state.settings.notifications;
}

function setupCostPreview(){
  [["sendCostPreview","sendSource","sendAmount"],
   ["withdrawCostPreview","withdrawSource","withdrawAmount"],
   ["lipaCostPreview","lipaSource","lipaAmount"]]
  .forEach(([preview, source, amount]) => {
    const update = () => {
      const box = $(preview);
      if(!box) return;
      const type = preview === "withdrawCostPreview" ? "withdraw" : "send";
      box.innerHTML = costPreview($(source)?.value, $(amount)?.value, type);
    };
    $(source)?.addEventListener("change", update);
    $(amount)?.addEventListener("input", update);
    update();
  });
}

function renderEverything(){
  if(!isLoggedIn()) return;
  renderHome();
  renderSources("sourceList");
  renderHistory();
  renderNotifications();
  renderSecurity();
  renderProfile();
  renderSettingsUI();
  fillSourceSelects();
  setupCostPreview();
  updateNotificationBadge();
  markNotificationsReadIfOpen();
  renderReceiveSellerLine();
  renderReceivingMethodsList();
  updateReceiveBackButton();
  renderAnnouncementBanner();
  if($("chatScreen")?.classList.contains("active")) renderChat();
  if($("statementsScreen")?.classList.contains("active")) renderStatements();
}


/* ================= START ================= */

async function initialize(){
  await buildDemoBuyerHashes();

  setupWelcome();
  setupLogin();
  setupRegistration();
  setupNav();
  setupSend();
  setupBulk();
  setupReceiveTabs();
  setupBuyerFlow();
  setupReceivingMethods();
  setupWithdraw();
  setupLipa();
  setupDeposit();
  setupPin();
  setupSettings();
  setupSourceManager();
  setupChat();
  setupCalls();
  setupConnect();
  setupPremium();

  loadTheme();

  if(!state.registered){ showScreen("welcome"); }
  else if(!isLoggedIn()){ showScreen("login"); }
  else { showScreen("money"); }

  resetBuyerFlow();
  resetBulkFlow();
  renderEverything();
  resetAutoLock();

  // Connect to owner announcement channel (if SERVER_URL is set)
  connectAnnouncements();
}

initialize();

});
