document.addEventListener("DOMContentLoaded", () => {
"use strict";

const STORAGE_KEY = "beast_v2";
const SESSION_KEY = "beast_session_v2";
const SERVER_URL = "https://beast-server-8u92.onrender.com";

let socket = null;
let pendingAction = null;
let currentAnnouncement = null;
let buyerSession = null;
let buyerStep = 1;

const SOURCE_NAMES = { mpesa: "M-PESA", tkash: "T-Kash", airtel: "Airtel", bank: "Bank", card: "Card", wallet: "BEAST Wallet" };
const SOURCE_ICONS = { mpesa: "📱", tkash: "📲", airtel: "📲", bank: "🏦", card: "💳", wallet: "🐾" };

function $(id) { return document.getElementById(id); }
function money(v) { return `KES ${Number(v || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`; }

function defaultState() {
  return {
    registered: false, user: { name: "", phone: "", nationalId: "", beastId: "", pinHash: "", pinSalt: "", passwordHash: "", passwordSalt: "" },
    sources: { mpesa: { balance: 5000, enabled: true }, tkash: { balance: 1000, enabled: true }, airtel: { balance: 1000, enabled: true }, bank: { balance: 0, enabled: false }, card: { balance: 0, enabled: false }, wallet: { balance: 0, enabled: true } },
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

  // Top bar logic
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

  $("historyList").innerHTML = state.transactions.map(t => `<div class="list-item"><strong>${t.type}</strong><span>${t.amount}</span><small>${t.description}</small></div>`).join("");
  $("notificationList").innerHTML = state.notifications.map(n => `<div class="list-item"><strong>${n.title}</strong><small>${n.message}</small></div>`).join("");
  $("securityList").innerHTML = state.securityEvents.map(e => `<div class="list-item"><strong>Event</strong><small>${e.message}</small></div>`).join("");
  $("profileDetails").innerHTML = `<div class="list-item"><strong>${state.user.name}</strong><small>ID: ${state.user.beastId}<br>Phone: ${state.user.phone}</small></div>`;
  
  ["sendSource", "withdrawSource", "lipaSource", "bulkSource"].forEach(id => {
    if ($(id)) $(id).innerHTML = Object.entries(state.sources).filter(([, s]) => s.enabled).map(([k]) => `<option value="${k}">${SOURCE_NAMES[k]}</option>`).join("");
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
    if (data.ok) {
      toast("📱 STK Push sent to your phone!");
    } else {
      toast("STK Push failed: " + data.error);
    }
  } catch(e) { toast("Network error connecting to Daraja"); }
}

function completeTransaction(data) {
  const amount = Number(data.amount);
  const source = state.sources[data.source];
  const fee = source === "wallet" ? Math.max(0, 7 - 3) : 7; // simplified for demo
  const total = amount + fee;
  
  if (source.balance < total) { toast("Insufficient balance."); return; }
  source.balance -= total;

  state.transactions.unshift({ type: data.type, amount, description: `Sent to ${data.recipient}` });
  state.notifications.unshift({ title: `${data.type} completed`, message: `${money(amount)} sent.` });
  save();

  // IF M-PESA selected, trigger the real Daraja API
  if (data.source === "mpesa") {
    triggerMpesaSTK(state.user.phone, amount);
  } else {
    toast(`${data.type} completed!`);
  }
  
  showScreen("money");
  renderEverything();
}

// --- Interactions ---
function setupNav() {
  document.querySelectorAll("[data-tab]").forEach(btn => btn.addEventListener("click", () => showScreen(btn.dataset.tab)));
  document.querySelectorAll("[data-menu]").forEach(btn => btn.addEventListener("click", () => showScreen(btn.dataset.menu)));
  
  $("settingsBtn")?.addEventListener("click", () => showScreen("settings"));
  $("backBtn")?.addEventListener("click", () => showScreen("money")); // Universal back to money for now
  
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

function setupSend() {
  $("sendMoneyButton")?.addEventListener("click", () => {
    const phone = $("sendPhone").value;
    const amount = Number($("sendAmount").value);
    const source = $("sendSource").value;
    $("confirmBody").innerHTML = `Send ${money(amount)} to ${phone}?`;
    $("confirmModal").classList.remove("hidden");
    $("confirmYes").onclick = () => {
      $("confirmModal").classList.add("hidden");
      completeTransaction({ type: "Send", amount, source, recipient: phone });
    };
  });
  $("confirmNo").onclick = () => $("confirmModal").classList.add("hidden");
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
      // Received callback from Safaricom!
      state.sources.wallet.balance += Number(data.amount);
      state.transactions.unshift({ type: "M-PESA Deposit", amount: data.amount, description: `Receipt: ${data.reference}` });
      save(); renderEverything(); toast(`✅ M-PESA Payment confirmed!`);
    }
  };
  socket.onclose = () => setTimeout(connectAnnouncements, 5000);
}

function init() {
  setupNav(); setupAuth(); setupSend();
  if (state.registered) showScreen("money"); else showScreen("welcome");
  renderEverything();
  connectAnnouncements();
}
init();
});
