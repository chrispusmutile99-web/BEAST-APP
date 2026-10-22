(() => {
  "use strict";

  const STORAGE_KEY = "beastAppDemoV1";
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const money = (value) => Number(value || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);

  const freshState = () => ({
    profile: null,
    balance: 0,
    transactions: [],
    totals: { added: 0, sent: 0 },
    hiddenBalance: false
  });

  let state = loadState();
  let toastTimer;

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return freshState();
      const parsed = JSON.parse(saved);
      return {
        ...freshState(),
        ...parsed,
        profile: parsed.profile || null,
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        totals: { added: Number(parsed.totals?.added || 0), sent: Number(parsed.totals?.sent || 0) },
        balance: Number(parsed.balance || 0)
      };
    } catch (error) {
      console.warn("Could not load BEAST demo data:", error);
      return freshState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      showToast("Could not save data on this device.");
    }
  }

  function showToast(message) {
    const toast = $("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 2600);
  }

  function showScreen(screen) {
    ["#welcome-screen", "#auth-screen", "#app-screen"].forEach((selector) => {
      const element = $(selector);
      if (element) element.classList.toggle("hidden", selector !== screen);
    });
    const nav = $("#bottom-nav");
    if (nav) nav.classList.toggle("hidden", screen !== "#app-screen");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openApp() {
    if (!state.profile) {
      showScreen("#welcome-screen");
      return;
    }
    showScreen("#app-screen");
    renderDashboard();
  }

  function renderDashboard() {
    if (!state.profile) return;
    const firstName = state.profile.name.trim().split(/\s+/)[0] || "Beast";
    $("#user-name").textContent = firstName;
    $("#user-avatar").textContent = firstName.charAt(0).toUpperCase();
    $("#profile-name").textContent = state.profile.name;
    $("#profile-phone").textContent = state.profile.phone;
    $("#welcome-balance").textContent = money(state.balance);
    $("#balance-amount").textContent = state.hiddenBalance ? "••••••" : money(state.balance);
    $("#toggle-balance").textContent = state.hiddenBalance ? "◎" : "◉";
    $("#toggle-balance").setAttribute("aria-label", state.hiddenBalance ? "Show balance" : "Hide balance");
    $("#total-added").textContent = `KES ${money(state.totals.added)}`;
    $("#total-sent").textContent = `KES ${money(state.totals.sent)}`;
    renderHistory();
  }

  function renderHistory() {
    const list = $("#transaction-history");
    const empty = $("#empty-history");
    if (!list || !empty) return;
    list.innerHTML = "";
    empty.classList.toggle("hidden", state.transactions.length > 0);
    state.transactions.slice(0, 30).forEach((tx) => {
      const row = document.createElement("article");
      row.className = "history-item";
      const incoming = tx.type === "add";
      const symbol = incoming ? "＋" : tx.type === "receive" ? "⌑" : "↗";
      const label = {
        add: "Funds added", send: "Money sent", withdraw: "Withdrawal",
        receive: "Receive request"
      }[tx.type] || "Transaction";
      row.innerHTML = `
        <div class="history-symbol">${symbol}</div>
        <div class="history-info">
          <strong>${escapeHTML(tx.note || label)}</strong>
          <small>${escapeHTML(new Date(tx.date).toLocaleString())}</small>
        </div>
        <div class="history-amount ${incoming ? "in" : "out"}">${incoming ? "+" : "−"}KES ${money(tx.amount)}</div>`;
      list.appendChild(row);
    });
  }

  function showModal(title, content) {
    $("#modal-title").textContent = title;
    $("#modal-content").innerHTML = content;
    $("#modal-backdrop").classList.remove("hidden");
    const firstInput = $("#modal-content input");
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
  }

  function closeModal() {
    $("#modal-backdrop").classList.add("hidden");
  }

  function transactionForm(title, description, buttonLabel, noteLabel = "Description") {
    return `
      <p class="modal-copy">${description}</p>
      <form id="transaction-form" class="transaction-form">
        <label for="tx-amount">Amount (KES)</label>
        <input id="tx-amount" name="amount" type="number" min="1" step="0.01" placeholder="0.00" required>
        <label for="tx-note">${noteLabel}</label>
        <input id="tx-note" name="note" type="text" maxlength="70" placeholder="What is this for?" required>
        <button class="button button-primary full" type="submit">${buttonLabel} →</button>
      </form>`;
  }

  function beginAction(action) {
    const actions = {
      add: {
        title: "Add demo funds",
        description: "This only increases the demo balance on this device. No real deposit is made.",
        button: "Add funds", type: "add"
      },
      send: {
        title: "Send demo money",
        description: "Simulate a transfer from your BEAST demo wallet. This does not send real money.",
        button: "Confirm demo send", type: "send"
      },
      withdraw: {
        title: "Demo withdrawal",
        description: "Simulate a withdrawal. No bank or M-PESA service is connected.",
        button: "Confirm demo withdrawal", type: "withdraw"
      }
    };
    if (action === "receive") {
      showModal("Receive money", `<p class="modal-copy">Your demo account has no real payment address. Share your account details only for testing.</p>
        <div class="receive-box"><strong>${escapeHTML(state.profile.name)}</strong><br>${escapeHTML(state.profile.phone)}<br><br><span>BEAST DEMO ACCOUNT</span></div>
        <button class="button button-outline full" id="receive-close">Close</button>`);
      $("#receive-close").addEventListener("click", closeModal);
      return;
    }
    const config = actions[action];
    if (!config) return;
    showModal(config.title, transactionForm(config.title, config.description, config.button));
    $("#transaction-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const amount = Number(form.get("amount"));
      const note = String(form.get("note") || "").trim();
      if (!Number.isFinite(amount) || amount <= 0) {
        showToast("Enter an amount greater than zero.");
        return;
      }
      if ((action === "send" || action === "withdraw") && amount > state.balance) {
        showToast("Not enough demo funds for that transaction.");
        return;
      }
      if (action === "add") {
        state.balance += amount;
        state.totals.added += amount;
      } else {
        state.balance -= amount;
        state.totals.sent += amount;
      }
      state.transactions.unshift({
        id: Date.now(),
        type: config.type,
        amount,
        note,
        date: new Date().toISOString()
      });
      saveState();
      closeModal();
      renderDashboard();
      showToast("Demo transaction saved.");
    });
  }

  function setActiveNav(target) {
    $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.nav === target));
  }

  function jumpTo(target) {
    closeMenu();
    if (target === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (target === "activity") {
      $("#transaction-history").scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (target === "account") {
      $("#profile-name").scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setActiveNav(target);
  }

  function openMenu() {
    $("#side-menu").classList.add("open");
    $("#side-menu").setAttribute("aria-hidden", "false");
    $("#menu-backdrop").classList.remove("hidden");
    $("#menu-toggle").setAttribute("aria-expanded", "true");
  }

  function closeMenu() {
    $("#side-menu").classList.remove("open");
    $("#side-menu").setAttribute("aria-hidden", "true");
    $("#menu-backdrop").classList.add("hidden");
    $("#menu-toggle").setAttribute("aria-expanded", "false");
  }

  $("#get-started").addEventListener("click", () => showScreen("#auth-screen"));
  $("#back-welcome").addEventListener("click", () => showScreen("#welcome-screen"));

  $("#auth-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("fullName") || "").trim();
    const phone = String(form.get("phone") || "").trim();
    const balance = Number(form.get("balance"));
    if (!name || !phone) {
      showToast("Enter your name and phone number.");
      return;
    }
    if (!Number.isFinite(balance) || balance < 0) {
      showToast("Enter a valid starting balance.");
      return;
    }
    state = freshState();
    state.profile = { name, phone };
    state.balance = balance;
    saveState();
    openApp();
    showToast("Welcome to BEAST demo.");
  });

  $("#toggle-balance").addEventListener("click", () => {
    state.hiddenBalance = !state.hiddenBalance;
    saveState();
    renderDashboard();
  });

  $$("[data-action]").forEach((button) => {
    button.addEventListener("click", () => beginAction(button.dataset.action));
  });

  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => jumpTo(button.dataset.nav));
  });
  $$(".menu-link").forEach((button) => {
    button.addEventListener("click", () => jumpTo(button.dataset.menu));
  });

  $("#menu-toggle").addEventListener("click", openMenu);
  $("#menu-close").addEventListener("click", closeMenu);
  $("#menu-backdrop").addEventListener("click", closeMenu);
  $("#modal-close").addEventListener("click", closeModal);
  $("#modal-backdrop").addEventListener("click", (event) => {
    if (event.target === $("#modal-backdrop")) closeModal();
  });

  $("#clear-history").addEventListener("click", () => {
    if (!state.transactions.length) {
      showToast("There is no activity to clear.");
      return;
    }
    if (!window.confirm("Clear all demo transaction history? Your balance will not change.")) return;
    state.transactions = [];
    saveState();
    renderDashboard();
    showToast("Demo history cleared.");
  });

  $("#reset-demo").addEventListener("click", () => {
    if (!window.confirm("Reset your entire BEAST demo account on this device?")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = freshState();
    $("#auth-form").reset();
    closeModal();
    showScreen("#welcome-screen");
    showToast("Demo account reset.");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
      closeMenu();
    }
  });

  if (state.profile) {
    showScreen("#app-screen");
    renderDashboard();
  } else {
    showScreen("#welcome-screen");
    $("#welcome-balance").textContent = "0.00";
  }
})();
