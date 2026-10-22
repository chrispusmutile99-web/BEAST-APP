"use strict";

/* ==========================================
BEAST SUPER-APP
Frontend prototype controller
========================================== */

(() => {
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) =>
Array.from(root.querySelectorAll(selector));

const STORAGE_KEY = "beast.prototype.v1";

const state = {
user: null,
balance: 0,
transactions: [],
banks: [],
notifications: [],
currentScreen: "welcome-screen",
previousScreen: "home-screen",
balanceHidden: false,
verifiedRecipient: null,
messageTimer: null
};

const money = (value) =>
new Intl.NumberFormat("en-KE", {
minimumFractionDigits: 2,
maximumFractionDigits: 2
}).format(Number(value) || 0);

const escapeHTML = (value) =>
String(value ?? "").replace(/[&<>"']/g, (char) => ({
"&": "&",
"<": "<",
">": ">",
'"': """,
"'": "'"
})[char]);

function readStorage() {
try {
const raw = localStorage.getItem(STORAGE_KEY);
if (!raw) return null;

  const parsed = JSON.parse(raw);

  return parsed && typeof parsed === "object"
    ? parsed
    : null;
} catch (error) {
  console.warn("BEAST local storage is unavailable.", error);
  return null;
}

}

function saveStorage() {
try {
localStorage.setItem(STORAGE_KEY, JSON.stringify({
user: state.user,
balance: state.balance,
transactions: state.transactions,
banks: state.banks,
notifications: state.notifications
}));
} catch (error) {
console.warn("BEAST could not save prototype data.", error);
showMessage(
"Your browser could not save this demo data. It may not persist.",
"error"
);
}
}

function loadStorage() {
const saved = readStorage();
if (!saved) return;

state.user = saved.user || null;
state.balance = Number.isFinite(Number(saved.balance))
  ? Math.max(0, Number(saved.balance))
  : 0;

state.transactions = Array.isArray(saved.transactions)
  ? saved.transactions.slice(0, 200)
  : [];

state.banks = Array.isArray(saved.banks)
  ? saved.banks.slice(0, 50)
  : [];

state.notifications = Array.isArray(saved.notifications)
  ? saved.notifications.slice(0, 100)
  : [];

}

function showMessage(message, type = "info") {
const box = $("#app-message");
if (!box) {
window.alert(message);
return;
}

clearTimeout(state.messageTimer);

box.textContent = message;
box.className = "app-message " + (
  type === "error" ? "error" :
  type === "success" ? "success" : ""
);
box.hidden = false;

state.messageTimer = setTimeout(() => {
  box.hidden = true;
}, 5000);

}

function showModal(title, message, confirmText = "") {
const backdrop = $("#modal-backdrop");
if (!backdrop) {
window.alert(message);
return;
}

$("#modal-title").textContent = title;
$("#modal-content").textContent = message;

const confirmButton = $("#modal-confirm");
confirmButton.hidden = !confirmText;

if (confirmText) {
  confirmButton.textContent = confirmText;
}

backdrop.hidden = false;

}

function closeModal() {
$("#modal-backdrop").hidden = true;
$("#modal-confirm").onclick = null;
}

function showScreen(screenId) {
const target = document.getElementById(screenId);
if (!target || !target.classList.contains("page") &&
!target.classList.contains("screen")) {
showMessage("That screen is not available.", "error");
return;
}

if (state.currentScreen !== screenId) {
  state.previousScreen = state.currentScreen;
}

state.currentScreen = screenId;

$$(".screen").forEach((screen) => {
  screen.hidden = screen.id !== screenId;
});

$$(".page").forEach((page) => {
  const active = page.id === screenId;
  page.hidden = !active;
  page.classList.toggle("active", active);
});

const inMainApp = screenId !== "welcome-screen" &&
                  screenId !== "auth-screen";

$("#app-screen").hidden = !inMainApp;

$("#welcome-screen").hidden = screenId !== "welcome-screen";
$("#auth-screen").hidden = screenId !== "auth-screen";

$$(".nav-item").forEach((button) => {
  button.classList.toggle(
    "active",
    button.dataset.screen === screenId ||
    (screenId === "home-screen" &&
     button.dataset.screen === "home-screen")
  );
});

$$(".menu-item[data-screen]").forEach((button) => {
  button.classList.toggle(
    "active",
    button.dataset.screen === screenId
  );
});

closeMenu();

if (inMainApp) {
  renderAccount();
  if (screenId === "history-screen") renderHistory();
  if (screenId === "banks-screen") renderBanks();
  if (screenId === "statements-screen") renderStatements();
  if (screenId === "notifications-screen") renderNotifications();
}

window.scrollTo({ top: 0, behavior: "auto" });

}

function openMenu() {
$("#side-menu").classList.add("open");
$("#side-menu").setAttribute("aria-hidden", "false");
$("#menu-backdrop").hidden = false;
}

function closeMenu() {
$("#side-menu").classList.remove("open");
$("#side-menu").setAttribute("aria-hidden", "true");
$("#menu-backdrop").hidden = true;
}

function renderAccount() {
const name = state.user?.name || "BEAST Member";

$$("[data-user-name]").forEach((element) => {
  element.textContent = name;
});

$("#account-balance").textContent = state.balanceHidden
  ? "••••••"
  : money(state.balance);

$("#profile-name").textContent = name;
$("#profile-phone").textContent = state.user?.phone || "Not set";
$("#profile-id").textContent = state.user?.id || "Demo account";

renderRecentTransactions();

}

function createNotification(message) {
state.notifications.unshift({
id: cryptoRandomId(),
message,
date: new Date().toISOString()
});

state.notifications = state.notifications.slice(0, 100);
saveStorage();

}

function cryptoRandomId() {
try {
if (window.crypto?.randomUUID) {
return window.crypto.randomUUID();
}
} catch (_) {
// Fall through to a non-security identifier.
}

return Date.now().toString(36) +
  Math.random().toString(36).slice(2, 9);

}

function recordTransaction({
type,
description,
amount,
status = "demo",
reference = ""
}) {
const transaction = {
id: cryptoRandomId(),
type,
description,
amount: Number(amount) || 0,
status,
reference,
date: new Date().toISOString()
};

state.transactions.unshift(transaction);
state.transactions = state.transactions.slice(0, 200);

createNotification(
  `${description}: KES ${money(amount)} (${status}).`
);

saveStorage();
renderAccount();

return transaction;

}

function renderRecentTransactions() {
const list = $("#recent-transactions");
if (!list) return;

const recent = state.transactions.slice(0, 4);

if (!recent.length) {
  list.innerHTML =
    '<div class="empty-state">Your recent activity will appear here.</div>';
  return;
}

list.innerHTML = recent.map(transactionHTML).join("");

}

function transactionHTML(transaction) {
const incoming = transaction.type === "received";
const sign = incoming ? "+" :
["sent", "withdraw", "payment"].includes(transaction.type) ? "−" : "";

const icon = incoming ? "↓" :
  transaction.type === "withdraw" ? "♙" :
  transaction.type === "payment" ? "▣" : "↗";

return `
  <div class="transaction-item">
    <span class="transaction-icon">${icon}</span>
    <div class="transaction-details">
      <strong>${escapeHTML(transaction.description)}</strong>
      <small>${escapeHTML(new Date(transaction.date).toLocaleString())}
        · ${escapeHTML(transaction.status)}</small>
    </div>
    <div class="transaction-amount ${incoming ? "received" : "sent"}">
      ${sign} KES ${money(transaction.amount)}
    </div>
  </div>
`;

}

function renderHistory() {
const list = $("#transaction-history");
const filter = $("#history-filter")?.value || "all";

const filtered = state.transactions.filter((transaction) => {
  if (filter === "all") return true;
  return transaction.type === filter;
});

if (!filtered.length) {
  list.innerHTML =
    '<div class="empty-state">No matching transactions.</div>';
  return;
}

list.innerHTML = filtered.map(transactionHTML).join("");

}

function renderBanks() {
const list = $("#bank-list");
if (!list) return;

if (!state.banks.length) {
  list.innerHTML =
    '<div class="empty-state">No demo bank references saved.</div>';
  return;
}

list.innerHTML = state.banks.map((bank) => `
  <div class="transaction-item">
    <span class="transaction-icon">▥</span>
    <div class="transaction-details">
      <strong>${escapeHTML(bank.name)}</strong>
      <small>${escapeHTML(bank.nickname)} · •••• ${escapeHTML(bank.last4)}</small>
    </div>
    <span class="field-note">DEMO</span>
  </div>
`).join("");

}

function renderStatements() {
const total = (types) =>
state.transactions
.filter((transaction) => types.includes(transaction.type))
.reduce((sum, transaction) => sum + transaction.amount, 0);

$("#total-received").textContent =
  "KES " + money(total(["received"]));

$("#total-sent").textContent =
  "KES " + money(total(["sent"]));

$("#total-withdrawn").textContent =
  "KES " + money(total(["withdraw"]));

}

function renderNotifications() {
const list = $("#notification-list");
if (!list) return;

if (!state.notifications.length) {
  list.innerHTML =
    '<div class="empty-state">You are all caught up.</div>';
  return;
}

list.innerHTML = state.notifications.map((item) => `
  <div class="transaction-item">
    <span class="transaction-icon">♧</span>
    <div class="transaction-details">
      <strong>${escapeHTML(item.message)}</strong>
      <small>${escapeHTML(new Date(item.date).toLocaleString())}</small>
    </div>
  </div>
`).join("");

}

function openAuth(tab = "login") {
setAuthTab(tab);
showScreen("auth-screen");
}

function setAuthTab(tab) {
const register = tab === "register";

$("#login-form").hidden = register;
$("#register-form").hidden = !register;

$$("[data-auth-tab]").forEach((button) => {
  button.classList.toggle(
    "active",
    button.dataset.authTab === tab
  );
});

}

function startDemo() {
if (!state.user) {
state.user = {
id: "DEMO-" + cryptoRandomId().slice(0, 8).toUpperCase(),
name: "BEAST Member",
phone: "",
mode: "demo"
};

  saveStorage();
}

showScreen("home-screen");

showMessage(
  "Demo mode active. No real funds or live payment credentials are available.",
  "info"
);

}

function logout() {
const confirmed = window.confirm(
"Log out of BEAST on this device?"
);

if (!confirmed) return;

state.user = null;
saveStorage();
showScreen("welcome-screen");

}

function parseAmount(value) {
const amount = Number(value);

if (!Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 100000000) {
  return null;
}

return amount;

}

function validateKenyanPhone(value) {
const digits = String(value).replace(/\D/g, "");

return /^(?:254[17]\d{8}|0[17]\d{8})$/.test(digits);

}

function verifyRecipient() {
const value = $("#send-recipient").value.trim();
const status = $("#recipient-status");

state.verifiedRecipient = null;

if (!value) {
  status.textContent = "Enter the recipient's phone or BEAST ID.";
  return;
}

if (validateKenyanPhone(value)) {
  status.textContent =
    "Format looks valid. The actual recipient has NOT been verified.";
  showMessage(
    "Phone format checked only. A real recipient must be verified by the backend.",
    "info"
  );
  return;
}

if (/^[A-Za-z0-9_-]{4,40}$/.test(value)) {
  status.textContent =
    "ID format looks valid. The actual BEAST account has NOT been verified.";
  showMessage(
    "Account ID format checked only. No live account lookup was performed.",
    "info"
  );
  return;
}

status.textContent = "Enter a valid phone number or account ID.";
showMessage("Please check the recipient details.", "error");

}

function explainPayment(service, amount) {
showModal(
service + " — Demo",
"Amount: KES ${money(amount)}.\n\n" +
"This frontend has not initiated or verified a real payment. " +
"No real funds have been sent or deducted. A secure backend and " +
"verified payment-provider response are required to complete this service."
);
}

function handleSend(event) {
event.preventDefault();

const recipient = $("#send-recipient").value.trim();
const amount = parseAmount($("#send-amount").value);
const source = $("#send-source").value;

if (!recipient || amount === null) {
  showMessage("Enter a valid recipient and amount.", "error");
  return;
}

if (source === "mpesa") {
  explainPayment("M-PESA Send Money", amount);
  return;
}

if (amount > state.balance) {
  showMessage(
    "Insufficient demo balance. No money has been moved.",
    "error"
  );
  return;
}

showModal(
  "Review demo transfer",
  `Recipient: ${recipient}\n` +
  `Amount: KES ${money(amount)}\n\n` +
  "This is a simulated transfer and does not deliver money. " +
  "Do you want to record it in this device's demo history?",
  "RECORD DEMO"
);

$("#modal-confirm").onclick = () => {
  closeModal();

  state.balance -= amount;

  recordTransaction({
    type: "sent",
    description: "Demo transfer to " + recipient,
    amount,
    status: "simulated"
  });

  $("#send-form").reset();
  $("#recipient-status").textContent =
    "Verify the recipient before continuing.";

  showScreen("history-screen");
  showMessage(
    "Demo transaction recorded locally. No real payment occurred.",
    "success"
  );
};

}

function handleWithdraw(event) {
event.preventDefault();

const phone = $("#withdraw-phone").value.trim();
const amount = parseAmount($("#withdraw-amount").value);

if (!phone || amount === null) {
  showMessage("Enter a valid phone number and amount.", "error");
  return;
}

explainPayment("Withdrawal", amount);

}

function handleLipa(event) {
event.preventDefault();

const business = $("#lipa-business").value.trim();
const amount = parseAmount($("#lipa-amount").value);

if (!business || amount === null) {
  showMessage("Enter the business number and a valid amount.", "error");
  return;
}

explainPayment("Lipa Na BEAST", amount);

}

function handleBankSave(event) {
event.preventDefault();

const name = $("#bank-name").value;
const nickname = $("#bank-nickname").value.trim();
const last4 = $("#bank-last4").value.trim();

if (!name || !nickname || !/^\d{4}$/.test(last4)) {
  showMessage("Complete the bank demo-reference fields.", "error");
  return;
}

if (state.banks.length >= 50) {
  showMessage("Demo bank-reference limit reached.", "error");
  return;
}

state.banks.push({
  name,
  nickname,
  last4
});

saveStorage();
renderBanks();
$("#bank-form").reset();

showMessage(
  "Demo bank reference saved locally. No bank account was connected.",
  "success"
);

}

function handleReceiveRequest() {
const amount = parseAmount($("#receive-amount").value);

if (amount === null) {
  showMessage("Enter a valid expected amount.", "error");
  return;
}

showModal(
  "Receive Money — Demo",
  `Expected amount: KES ${money(amount)}.\n\n` +
  "This screen does not create a real payment request or confirm incoming funds."
);

}

function exportStatement() {
const rows = [
["Date", "Type", "Description", "Amount KES", "Status"],
...state.transactions.map((transaction) => [
transaction.date,
transaction.type,
transaction.description,
transaction.amount.toFixed(2),
transaction.status
])
];

const csv = rows.map((row) =>
  row.map((value) => {
    let text = String(value ?? "");

    // Avoid spreadsheet formula injection in exported text.
    if (/^[\s]*[=+\-@]/.test(text)) {
      text = "'" + text;
    }

    return '"' + text.replace(/"/g, '""') + '"';
  }).join(",")
).join("\r\n");

const blob = new Blob([csv], {
  type: "text/csv;charset=utf-8;"
});

const url = URL.createObjectURL(blob);
const link = document.createElement("a");

link.href = url;
link.download = "beast-demo-statement.csv";

document.body.appendChild(link);
link.click();
link.remove();

setTimeout(() => URL.revokeObjectURL(url), 1000);

showMessage(
  "Demo statement exported. It is not an official bank statement.",
  "success"
);

}

function saveSettings() {
const theme = $("#theme-select").value;

document.body.classList.toggle(
  "light-theme",
  theme === "light"
);

try {
  localStorage.setItem("beast.theme", theme);
} catch (_) {
  // Theme remains active for this page session.
}

showMessage("Display settings updated.", "success");

}

function loadSettings() {
try {
const theme = localStorage.getItem("beast.theme");

  if (theme === "light" || theme === "dark") {
    document.body.classList.toggle(
      "light-theme",
      theme === "light"
    );

    $("#theme-select").value = theme;
  }
} catch (_) {
  // Continue with default theme.
}

}

function runSecurityChecks() {
const results = [];

results.push(
  "HTTPS: " +
  (location.protocol === "https:" ||
   location.hostname === "localhost" ||
   location.hostname === "127.0.0.1"
    ? "Secure context or local development"
    : "Not HTTPS — do not enter sensitive information")
);

results.push(
  "Prototype mode: active. No real-money transfer is verified by this frontend."
);

results.push(
  "Storage: browser-local demo data may be edited or cleared by the device owner."
);

results.push(
  "Backend security: cannot be verified by this browser-only check."
);

$("#security-results").replaceChildren();

const paragraph = document.createElement("p");
paragraph.textContent = results.join("\n\n");
paragraph.style.whiteSpace = "pre-line";

$("#security-results").appendChild(paragraph);

}

function handleForgotPassword() {
showModal(
"Account recovery",
"Account recovery is not connected yet. Configure a secure backend recovery flow before using real accounts."
);
}

function handleCardOptions() {
showModal(
"BEAST Card",
"This is a visual card prototype. Issuing a real card requires a supported regulated issuer and secure integration."
);
}

function handleReceiveMethod(method) {
const name = method === "agent" ? "Agent" : "Merchant Deposit";

showModal(
  name + " — Demo",
  "This is a prototype workflow. It does not accept deposits or verify that money has been received."
);

}

function installEvents() {
document.addEventListener("click", (event) => {
const screenButton = event.target.closest("[data-screen]");

  if (screenButton) {
    event.preventDefault();
    showScreen(screenButton.dataset.screen);
    return;
  }

  const authButton = event.target.closest("[data-auth-tab]");

  if (authButton) {
    setAuthTab(authButton.dataset.authTab);
    return;
  }

  const actionButton = event.target.closest("[data-action]");

  if (!actionButton) return;

  const action = actionButton.dataset.action;

  switch (action) {
    case "open-menu":
      openMenu();
      break;

    case "close-menu":
      closeMenu();
      break;

    case "back":
      showScreen(
        state.currentScreen === "home-screen"
          ? "home-screen"
          : state.previousScreen
      );
      break;

    case "toggle-balance":
      state.balanceHidden = !state.balanceHidden;
      renderAccount();
      break;

    case "demo-login":
      startDemo();
      break;

    case "logout":
      logout();
      break;

    case "verify-recipient":
      verifyRecipient();
      break;

    case "receive-request":
      handleReceiveRequest();
      break;

    case "export-statement":
      exportStatement();
      break;

    case "save-settings":
      saveSettings();
      break;

    case "run-security-checks":
      runSecurityChecks();
      break;

    case "forgot-password":
      handleForgotPassword();
      break;

    case "card-options":
      handleCardOptions();
      break;

    case "close-modal":
      closeModal();
      break;

    case "receive-method":
      handleReceiveMethod(actionButton.dataset.method);
      break;
  }
});

$("#menu-backdrop").addEventListener("click", closeMenu);

$("#modal-backdrop").addEventListener("click", (event) => {
  if (event.target.id === "modal-backdrop") {
    closeModal();
  }
});

$("#login-form").addEventListener("submit", (event) => {
  event.preventDefault();

  showMessage(
    "Live sign-in is not connected. Use Explore Demo or connect a secure authentication backend.",
    "error"
  );
});

$("#register-form").addEventListener("submit", (event) => {
  event.preventDefault();

  const name = $("#register-name").value.trim();
  const phone = $("#register-phone").value.trim();
  const password = $("#register-password").value;
  const confirm = $("#register-confirm").value;

  if (password.length < 8) {
    showMessage("Use a password with at least 8 characters.", "error");
    return;
  }

  if (password !== confirm) {
    showMessage("The passwords do not match.", "error");
    return;
  }

  if (!validateKenyanPhone(phone)) {
    showMessage("Enter a valid Kenyan mobile number.", "error");
    return;
  }

  showModal(
    "Registration not connected",
    "The form is valid, but account creation requires a secure backend. No password has been saved."
  );
});

$("#send-form").addEventListener("submit", handleSend);
$("#withdraw-form").addEventListener("submit", handleWithdraw);
$("#lipa-form").addEventListener("submit", handleLipa);
$("#bank-form").addEventListener("submit", handleBankSave);

$("#history-filter").addEventListener("change", renderHistory);
$("#theme-select").addEventListener("change", saveSettings);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenu();
    closeModal();
  }
});

window.addEventListener("online", () => {
  showMessage(
    "Network connection restored. Live payment verification is still not configured by this frontend.",
    "info"
  );
});

window.addEventListener("offline", () => {
  showMessage(
    "You are offline. Only local prototype features are available.",
    "error"
  );
});

}

function initialize() {
loadStorage();
loadSettings();
installEvents();
renderAccount();
renderHistory();
renderBanks();
renderStatements();
renderNotifications();

// Start at welcome. Existing demo data remains saved locally.
showScreen("welcome-screen");

console.info(
  "BEAST frontend initialized. Prototype mode; no live payments are verified."
);

}

if (document.readyState === "loading") {
document.addEventListener("DOMContentLoaded", initialize);
} else {
initialize();
}
})();
