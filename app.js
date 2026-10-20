document.addEventListener("DOMContentLoaded", () => {
"use strict";

const STORAGE_KEY = "beast_v4";
const SESSION_KEY = "beast_session_v4";
const SERVER_URL = "https://beast-server-8u92.onrender.com";

let socket = null;
let currentAnnouncement = null;
let buyerSession = null;
let buyerStep = 1;

const SOURCE_NAMES = { mpesa: "M-PESA", tkash: "T-Kash", airtel: "Airtel", bank: "Bank", card: "Card", wallet: "BEAST Wallet" };
const SOURCE_ICONS = { mpesa: "📱", tkash: "📲", airtel: "📲", bank: "🏦", card: "💳", wallet: "🐾" };

const DEMO_BUYERS = [
  { phone: "0722000001", nationalId: "11111111", pin: "1111", name: "Alice Njeri", sources: { mpesa: { enabled: true, balance: 12500 }, wallet: { enabled: true, balance: 0 } } },
  { phone: "0722000002", nationalId: "22222222", pin: "2222", name: "Brian Otieno", sources: { mpesa: { enabled: true, balance: 3200 }, wallet: { enabled: true, balance: 500 } } }
];

function $(id) { return document.getElementById(id); }
function money(v) { return `KES ${Number(v || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`; }

function defaultState() {
  return {
    registered: false, user: { name: "", phone: "", nationalId: "", beastId: "", pinHash: "", pinSalt: "", passwordHash: "", passwordSalt: "" },
    sources: { mpesa: { balance: 5000, enabled: true, account: "0712345678" }, tkash: { balance: 1000, enabled: true, account: "0712345678" }, airtel: { balance: 1000, enabled: true, account: "0712345678" }, bank: { balance: 0, enabled: false, account: "", bankName: "" }, card: { balance: 0, enabled: false, account: "", cardName: "", last4: "" }, wallet: { balance: 0, enabled: true, account: "BEAST-WALLET" } },
    receiving: { wallet: { enabled: true }, pochi: { enabled: false }, till: { enabled: false }, paybill: { enabled: false }, bank: { enabled: false }, card: { enabled: false } },
    transactions: [], notifications: [], securityEvents: [], settings: { dark: true }, currentSource: "mpesa"
  };
}

function loadState() {
  try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (s) return { ...defaultState(), ...s }; } catch (e) {}
  return defaultState();
}
const state = loadState();
let sessionToken = sessionStorage.getItem(SESSION_KEY) || null;

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function isLoggedIn() { return state.registered && sessionToken === "active"; }
function startSession() { sessionToken = "active"; sessionStorage.setItem(SESSION_KEY, sessionToken); }
function endSession() { sessionToken = null; sessionStorage.removeItem(SESSION_KEY); }

async function hashValue(value, salt) { const data = new TextEncoder().encode(salt + ":" + value); const digest = await crypto.subtle.digest("SHA-256", data); return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join(""); }
async function setPin(pin) { state.user.pinSalt = crypto.randomUUID(); state.user.pinHash = await hashValue(pin, state.user.pinSalt); }
async function verifyPin(pin) { if (!state.user.pinHash) return false; return (await hashValue(pin, state.user.pinSalt)) === state.user.pinHash; }
async function setPassword(pw) { state.user.passwordSalt = crypto.randomUUID(); state.user.passwordHash = await hashValue(pw, state.user.passwordSalt); }
async function verifyPassword(pw) { if (!state.user.passwordHash) return false; return (await hashValue(pw, state.user.passwordSalt)) === state.user.passwordHash; }

function toast(msg) { const el = $("toast"); if (!el) return; el.textContent = msg; el.classList.add("show"); clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove("show"), 2600); }

// --- Navigation Logic (Gear vs Back Arrow) ---
const screenMap = { welcome: "welcomeScreen", login: "loginScreen", registration: "registrationScreen", money: "moneyScreen", send: "sendScreen", bulk: "bulkScreen", receive: "receiveScreen", withdraw: "withdrawScreen", lipa: "lipaScreen", history: "historyScreen", statements: "statementsScreen", connect: "connectScreen", profile: "profileScreen", settings: "settingsScreen", security: "securityScreen", notifications: "notificationsScreen" };
const mainScreens = ["money", "connect", "profile"];

function showScreen(name) {
  const screen = screenMap[name] || name;
  document.querySelectorAll(".app-screen").forEach(el => el.classList.remove("active"));
  if ($(screen)) $(screen).classList.add("active");

  document.querySelectorAll("[data-tab]").forEach(t => t.classList.toggle("active", t.dataset.tab === name));

  if (mainScreens.includes(name) || name === "welcome" || name === "login" || name === "registration") {
    $("settingsBtn").classList.toggle("hidden", name !== "money" && name !== "connect" && name !== "profile");
    $("backBtn").classList.add("hidden");
  } else {
    $("settingsBtn").classList.add("hidden");
    $("backBtn").classList.remove("hidden");
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
  renderEverything();
}

// --- Render ---
function renderEverything() {
  if (!isLoggedIn()) return;
  $("welcomeText").textContent = `Welcome, ${state.user.name}.`;
  $("dashboardBeastId").textContent = state.user.beastId;
  $("totalBalance").textContent = money(Object.values(state.sources).reduce((t, s) => t + (s.enabled ? s.balance : 0), 0));
  
  $("sourceList").innerHTML = Object.entries(state.sources).map(([k, s]) => `
    <div class="source-card ${s.enabled ? "" : "source-disabled"}">
      <div class="source-top"><span class="source-icon">${SOURCE_ICONS[k]}</span><span class="pill ${s.enabled ? "green" : "red"}">${s.enabled ? "ACTIVE" : "OFF"}</span></div>
      <div><strong>${SOURCE_NAMES[k]}</strong><small>${s.account || "Demo"}</small></div>
      <strong>${money(s.balance)}</strong>
    </div>
  `).join("");

  $("historyList").innerHTML = state.transactions.map(t => `<div class="list-item"><strong>${t.type}</strong><span>${money(t.amount)}</span><small>${t.description}</small></div>`).join("");
  $("notificationList").innerHTML = state.notifications.map(n => `<div class="list-item"><strong>${n.title}</strong><small>${n.message}</small></div>`).join("");
  $("securityList").innerHTML = state.securityEvents.map(e => `<div class="list-item"><strong>Event</strong><small>${e.message}</small></div>`).join("");
  $("profileDetails").innerHTML = `<div class="list-item"><strong>${state.user.name}</strong><small>ID: ${state.user.beastId}<br>Phone: ${state.user.phone}</small></div>`;
  
  ["sendSource", "withdrawSource", "lipaSource", "bulkSource", "depositSource"].forEach(id => {
    if ($(id)) {
      const isDeposit = id === "depositSource";
      const sources = isDeposit ? ["mpesa", "tkash", "airtel", "bank", "card"] : Object.entries(state.sources).filter(([, s]) => s.enabled).map(([k]) => k);
      $(id).innerHTML = sources.map(k => `<option value="${k}">${SOURCE_NAMES[k]}</option>`).join("");
    }
  });
}

// --- Real STK Push Logic ---
async function triggerMpesaSTK(phone, amount) {
  try {
    const res = await fetch(`${SERVER_URL}/api/mpesa/stkpush`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, amount })
    });
    const data = await res.json();
    if (data.ok) toast("📱 STK Push sent to your phone!");
    else toast("STK Push failed: " + data.error);
  } catch(e) { toast("Network error connecting to Daraja"); }
}

function completeTransaction(data) {
  const amount = Number(data.amount);
  const source = state.sources[data.source];
  const fee = source === "wallet" ? 4 : 7; 
  const total = amount + fee;
  
  if (source.balance < total) { toast("Insufficient balance."); return; }
  source.balance -= total;

  state.transactions.unshift({ type: data.type, amount, description: data.description || `Sent to ${data.recipient}` });
  state.notifications.unshift({ title: `${data.type} completed`, message: `${money(amount)} processed.` });
  save();

  if (data.source === "mpesa") {
    triggerMpesaSTK(state.user.phone, amount);
  } else {
    toast(`${data.type} completed!`);
  }
  
  showScreen("money");
  renderEverything();
}

// --- Setup Forms & Interactions ---
function setupNav() {
  document.querySelectorAll("[data-tab]").forEach(btn => btn.addEventListener("click", () => showScreen(btn.dataset.tab)));
  document.querySelectorAll("[data-menu]").forEach(btn => btn.addEventListener("click", () => showScreen(btn.dataset.menu)));
  
  $("settingsBtn")?.addEventListener("click", () => showScreen("settings"));
  $("backBtn")?.addEventListener("click", () => showScreen("money")); 
  $("notificationButton")?.addEventListener("click", () => showScreen("notifications"));
  $("themeToggle")?.addEventListener("change", e => { document.body.classList.toggle("light", !e.target.checked); save(); });
  $("resetDemo")?.addEventListener("click", () => { localStorage.clear(); sessionStorage.clear(); location.reload(); });
}

function setupAuth() {
  $("goRegisterButton")?.addEventListener("click", () => showScreen("registration"));
  $("goLoginButton")?.addEventListener("click", () => showScreen("login"));
  
  $("regNext1")?.addEventListener("click", () => {
    if (!$("regName").value) return toast("Enter name");
    state.user.name = $("regName").value;
    state.user.phone = $("regPhone").value;
    state.user.nationalId = $("regNationalId").value;
    $("regStep1").classList.add("hidden"); $("regStep2").classList.remove("hidden");
  });
  
  $("regNext2")?.addEventListener("click", async () => {
    if ($("regPassword").value !== $("regPassword2").value) return toast("Passwords don't match");
    if ($("regPin").value !== $("regPin2").value) return toast("PINs don't match");
    await setPassword($("regPassword").value); await setPin($("regPin").value);
    $("regStep2").classList.add("hidden"); $("regStep3").classList.remove("hidden");
  });
  
  $("finishRegistration")?.addEventListener("click", () => {
    state.user.beastId = `BEAST-${Math.floor(100000 + Math.random() * 900000)}`;
    state.registered = true; startSession(); save(); showScreen("money");
  });

  $("loginSubmitButton")?.addEventListener("click", async () => {
    if (await verifyPassword($("loginPassword").value)) { startSession(); showScreen("money"); } else toast("Wrong password");
  });
}

function setupSendAndBulk() {
  $("sendMoneyButton")?.addEventListener("click", () => {
    const amount = Number($("sendAmount").value);
    const source = $("sendSource").value;
    $("confirmBody").innerHTML = `Send ${money(amount)} to ${$("sendPhone").value}?`;
    $("confirmModal").classList.remove("hidden");
    $("confirmYes").onclick = () => {
      $("confirmModal").classList.add("hidden");
      completeTransaction({ type: "Send", amount, source, recipient: $("sendPhone").value });
    };
  });
  
  // Bulk Send
  $("bulkSendButton")?.addEventListener("click", () => {
    const source = $("bulkSource").value;
    toast("Bulk Send processing...");
    setTimeout(() => completeTransaction({ type: "Bulk Send", amount: 500, source, description: "Bulk batch" }), 1000);
  });
}

function setupReceive() {
  // Tabs
  document.querySelectorAll("[data-rtab]").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-rtab]").forEach(t => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".receive-tab-panel").forEach(p => p.classList.remove("active"));
      const panel = tab.dataset.rtab === "buyer" ? $("buyerTab") : tab.dataset.rtab === "deposit" ? $("depositTab") : $("agentTab");
      panel?.classList.add("active");
    });
  });

  // Buyer Login
  $("buyerLoginButton")?.addEventListener("click", () => {
    const phone = $("buyerLoginPhone").value;
    const buyer = DEMO_BUYERS.find(b => b.phone === phone);
    if(!buyer || buyer.pin !== $("buyerLoginPin").value || buyer.nationalId !== $("buyerLoginNationalId").value) return toast("Invalid buyer credentials");
    
    buyerSession = JSON.parse(JSON.stringify(buyer));
    setBuyerStep(2);
  });

  // Choose Source
  $("buyerChooseSourceButton")?.addEventListener("click", () => {
    setBuyerStep(3);
    renderBuyerStep3();
  });

  // Buyer Pay
  $("buyerConfirmPayButton")?.addEventListener("click", () => {
    const amount = Number($("buyerPayAmount").value);
    const srcKey = buyerSession.chosenSource;
    if(buyerSession.sources[srcKey].balance < amount) return toast("Buyer insufficient balance");
    
    buyerSession.sources[srcKey].balance -= amount;
    state.sources.wallet.balance += amount; // Seller receives in wallet
    state.transactions.unshift({ type: "Buyer Payment", amount, description: `From ${buyerSession.name}` });
    save();
    
    $("buyerSuccessPanel").classList.add("active");
    setTimeout(() => { setBuyerStep(1); $("buyerSuccessPanel").classList.remove("active"); }, 3000);
    toast("Payment received!");
  });

  // Deposit
  $("performDepositButton")?.addEventListener("click", () => {
    const amount = Number($("depositAmount").value);
    state.sources.wallet.balance += amount;
    save(); renderEverything();
    toast("Deposit successful!");
  });

  // Agent Deposit
  $("agentDepositButton")?.addEventListener("click", () => {
    const amount = Number($("agentDepositAmount").value);
    state.sources.wallet.balance += amount;
    save(); renderEverything();
    toast("Agent deposit successful!");
  });
}

function setBuyerStep(step) {
  buyerStep = step;
  ["buyerStep1","buyerStep2","buyerStep3"].forEach((id, i) => $(id)?.classList.toggle("active", i+1 === step));
  document.querySelectorAll(".buyer-step").forEach(el => el.classList.toggle("active", Number(el.dataset.bstep) === step));
}

function renderBuyerStep3() {
  const list = $("buyerSourcesList");
  list.innerHTML = Object.entries(buyerSession.sources).map(([k, s]) => {
    if(!s.enabled) return "";
    return `<button class="buyer-source-option" onclick="window.selectBuyerSrc('${k}', this)"><span>${SOURCE_ICONS[k]}</span><strong>${SOURCE_NAMES[k]}</strong></button>`;
  }).join("");
}

window.selectBuyerSrc = (key, btn) => {
  buyerSession.chosenSource = key;
  document.querySelectorAll(".buyer-source-option").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
  $("buyerChooseSourceButton").disabled = false;
  $("buyerChosenSourceName").textContent = SOURCE_NAMES[key];
};

function setupWithdraw() {
  $("withdrawButton")?.addEventListener("click", () => {
    const amount = Number($("withdrawAmount").value);
    const source = $("withdrawSource").value;
    if(state.sources[source].balance < amount) return toast("Insufficient balance");
    
    state.sources[source].balance -= amount;
    state.transactions.unshift({ type: "Withdrawal", amount, description: `Agent ${$("agentNumber").value}` });
    save(); showScreen("money"); renderEverything();
    toast("Withdrawal successful!");
  });
}

function setupLipaNa() {
  $("lipaPayButton")?.addEventListener("click", () => {
    const amount = Number($("lipaAmount").value);
    const source = $("lipaSource").value;
    completeTransaction({ type: "Lipa Na", amount, source, description: "Business Payment" });
  });
}

function setupSettingsForms() {
  const type = $("sourceType");
  type?.addEventListener("change", () => {
    $("bankSourceFields").classList.toggle("hidden", type.value !== "bank");
    $("cardSourceFields").classList.toggle("hidden", type.value !== "card");
  });

  $("saveSourceButton")?.addEventListener("click", () => {
    const t = type.value;
    const acc = $("sourceAccount").value;
    state.sources[t] = { enabled: true, account: acc, balance: Number($("sourceBalance").value || 0) };
    save(); renderEverything(); toast("Source saved!");
  });

  $("changePinButton")?.addEventListener("click", async () => {
    if(await verifyPin($("oldPin").value)) {
      await setPin($("newPin").value); save(); toast("PIN changed");
    } else toast("Wrong old PIN");
  });
}

function connectAnnouncements() {
  if (!SERVER_URL) return;
  socket = new WebSocket(SERVER_URL.replace(/^http/, "ws"));
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "announcement") {
      if (data.message) { $("announcementBanner").textContent = "📢 " + data.message; $("announcementBanner").classList.remove("hidden"); }
      else $("announcementBanner").classList.add("hidden");
    }
    if (data.type === "wallet_credit") {
      state.sources.wallet.balance += Number(data.amount);
      state.transactions.unshift({ type: "Owner Withdrawal", amount: data.amount, description: "From Company" });
      save(); renderEverything(); toast(`💰 Received ${data.amount} from Company!`);
    }
    if (data.type === "mpesa_success") {
      state.sources.wallet.balance += Number(data.amount);
      state.transactions.unshift({ type: "M-PESA Deposit", amount: data.amount, description: `Receipt: ${data.reference}` });
      save(); renderEverything(); toast(`✅ M-PESA Payment confirmed!`);
    }
  };
  socket.onclose = () => setTimeout(connectAnnouncements, 5000);
}

function init() {
  setupNav(); setupAuth(); setupSendAndBulk(); setupReceive(); setupWithdraw(); setupLipaNa(); setupSettingsForms();
  if (state.registered) showScreen("money"); else showScreen("welcome");
  renderEverything();
  connectAnnouncements();
}
init();
});
