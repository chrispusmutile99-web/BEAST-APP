document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  // =====================================================
  // BEAST MONEY TRANSFER
  // Frontend matched to the supplied index.html/style.css
  // =====================================================

  const SERVER_URL = "https://beast-server-8u92.onrender.com";
  const STORAGE_KEY = "beast_v4";
  const SESSION_KEY = "beast_session_v4";

  let socket = null;
  let socketRetry = null;
  let toastTimer = null;
  let pendingAction = null;
  let pendingTransaction = null;
  let buyerSession = null;
  let buyerSelectedSource = null;
  let registrationStep = 1;
  let currentScreen = "welcome";
  let announcementText = "";

  const SOURCE_NAMES = {
    mpesa: "M-PESA",
    tkash: "T-Kash",
    airtel: "Airtel Money",
    bank: "Bank",
    card: "Card",
    wallet: "BEAST Wallet"
  };

  const SOURCE_ICONS = {
    mpesa: "📱",
    tkash: "📲",
    airtel: "📲",
    bank: "🏦",
    card: "💳",
    wallet: "🐾"
  };

  const SCREEN_NAMES = {
    home: "moneyScreen",
    money: "moneyScreen",
    send: "sendScreen",
    bulk: "bulkScreen",
    receive: "receiveScreen",
    withdraw: "withdrawScreen",
    lipa: "lipaScreen",
    beastCard: "beastCardScreen",
    banks: "banksScreen",
    history: "historyScreen",
    statements: "statementsScreen",
    connect: "connectScreen",
    security: "securityScreen",
    notifications: "notificationsScreen",
    profile: "profileScreen",
    settings: "settingsScreen",
    admin: "adminScreen",
    welcome: "welcomeScreen",
    login: "loginScreen",
    registration: "registrationScreen"
  };

  const MAIN_SCREENS = ["money", "connect", "profile"];

  const $ = id => document.getElementById(id);

  function money(value) {
    return "KES " + Number(value || 0).toLocaleString("en-KE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function defaultState() {
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
        mpesa: {
          balance: 0,
          enabled: true,
          account: ""
        },

        tkash: {
          balance: 0,
          enabled: false,
          account: ""
        },

        airtel: {
          balance: 0,
          enabled: false,
          account: ""
        },

        bank: {
          balance: 0,
          enabled: false,
          account: "",
          bankName: ""
        },

        card: {
          balance: 0,
          enabled: false,
          account: "",
          cardName: "",
          last4: ""
        },

        wallet: {
          balance: 0,
          enabled: true,
          account: "BEAST-WALLET"
        }
      },

      receiving: {
        wallet: true,
        pochi: false,
        till: false,
        paybill: false,
        bank: false,
        card: false
      },

      transactions: [],
      notifications: [],
      securityEvents: [],

      settings: {
        theme: "dark"
      }
    };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));

      if (!saved || typeof saved !== "object") {
        return defaultState();
      }

      const base = defaultState();

      return {
        ...base,
        ...saved,

        user: {
          ...base.user,
          ...(saved.user || {})
        },

        sources: {
          ...base.sources,
          ...(saved.sources || {})
        },

        receiving: {
          ...base.receiving,
          ...(saved.receiving || {})
        },

        settings: {
          ...base.settings,
          ...(saved.settings || {})
        },

        transactions: Array.isArray(saved.transactions)
          ? saved.transactions
          : [],

        notifications: Array.isArray(saved.notifications)
          ? saved.notifications
          : [],

        securityEvents: Array.isArray(saved.securityEvents)
          ? saved.securityEvents
          : []
      };
    } catch {
      return defaultState();
    }
  }

  const state = loadState();

  let sessionToken = sessionStorage.getItem(SESSION_KEY);

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch {
      toast("Unable to save app data on this device.");
      return false;
    }
  }

  function isLoggedIn() {
    return state.registered && sessionToken === "active";
  }

  function startSession() {
    sessionToken = "active";
    sessionStorage.setItem(SESSION_KEY, sessionToken);
  }

  function endSession() {
    sessionToken = null;
    sessionStorage.removeItem(SESSION_KEY);
  }

  // -----------------------------------------------------
  // UTILITIES
  // -----------------------------------------------------

  function toast(message) {
    const el = $("toast");

    if (!el) {
      alert(message);
      return;
    }

    el.textContent = message;
    el.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      el.classList.remove("show");
    }, 3000);
  }

  function addNotification(title, message) {
    state.notifications.unshift({
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now()),

      title,
      message,
      createdAt: new Date().toISOString(),
      read: false
    });

    state.notifications = state.notifications.slice(0, 200);
  }

  function addSecurityEvent(message) {
    state.securityEvents.unshift({
      message,
      createdAt: new Date().toISOString()
    });

    state.securityEvents = state.securityEvents.slice(0, 100);
  }

  function addTransaction(type, amount, description, reference = "") {
    state.transactions.unshift({
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now()),

      type,
      amount: Number(amount),
      description,
      reference,
      createdAt: new Date().toISOString()
    });

    state.transactions = state.transactions.slice(0, 500);
  }

  async function api(path, options = {}) {
    const response = await fetch(`${SERVER_URL}${path}`, {
      ...options,

      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    let data;

    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok || data.ok === false) {
      throw new Error(data.error || `Server error (${response.status})`);
    }

    return data;
  }

  function normalizePhone(phone) {
    let value = String(phone || "").replace(/\s+/g, "");

    if (value.startsWith("+254")) {
      value = "0" + value.slice(4);
    } else if (value.startsWith("254")) {
      value = "0" + value.slice(3);
    }

    return value;
  }

  function validPhone(phone) {
    return /^07\d{8}$|^01\d{8}$/.test(normalizePhone(phone));
  }

  function validAmount(value) {
    const amount = Number(value);

    return Number.isFinite(amount) &&
      amount > 0 &&
      amount <= 100000000;
  }

  function requireLogin() {
    if (isLoggedIn()) return true;

    showScreen("welcome");
    toast("Please log in first.");

    return false;
  }

  function setText(id, value) {
    const el = $(id);

    if (el) {
      el.textContent = value ?? "";
    }
  }

  function setHTML(id, value) {
    const el = $(id);

    if (el) {
      el.innerHTML = value;
    }
  }

  function setValue(id, value) {
    const el = $(id);

    if (el) {
      el.value = value ?? "";
    }
  }

  function showElement(id, visible) {
    const el = $(id);

    if (el) {
      el.hidden = !visible;
      el.classList.toggle("hidden", !visible);
    }
  }

  function setButtonBusy(button, busy, busyText = "Please wait...") {
    if (!button) return () => {};

    const original = button.textContent;

    button.disabled = busy;

    if (busy) {
      button.dataset.originalText = original;
      button.textContent = busyText;
    } else {
      button.textContent = button.dataset.originalText || original;
    }

    return () => {
      button.disabled = false;
      button.textContent = button.dataset.originalText || original;
    };
  }

  // -----------------------------------------------------
  // THEME
  // -----------------------------------------------------

  function applyTheme(theme) {
    if (!["dark", "light", "gold"].includes(theme)) {
      theme = "dark";
    }

    state.settings.theme = theme;

    document.documentElement.dataset.theme = theme;

    const selector = $("themeSelect");

    if (selector) {
      selector.value = theme;
    }
  }

  // -----------------------------------------------------
  // NAVIGATION
  // -----------------------------------------------------

  function closeDrawer() {
    $("menuDrawer")?.classList.remove("open");
    $("drawerBackdrop")?.classList.remove("open");
    document.body.classList.remove("drawer-open");
  }

  function openDrawer() {
    if (!requireLogin()) return;

    $("menuDrawer")?.classList.add("open");
    $("drawerBackdrop")?.classList.add("open");
    document.body.classList.add("drawer-open");
  }

  function showScreen(name) {
    const screenId = SCREEN_NAMES[name] || name;

    if (!$(screenId)) {
      toast("This screen is not available in index.html.");
      return;
    }

    if (
      !["welcome", "login", "registration"].includes(name) &&
      !isLoggedIn()
    ) {
      screenId !== "welcomeScreen" && showScreen("welcome");
      return;
    }

    currentScreen = name;

    document.querySelectorAll(".app-screen").forEach(screen => {
      screen.classList.toggle("active", screen.id === screenId);
    });

    document.querySelectorAll("[data-tab]").forEach(button => {
      const tab = button.dataset.tab;

      button.classList.toggle(
        "active",
        tab === name || (name === "home" && tab === "home")
      );
    });

    closeDrawer();

    if (MAIN_SCREENS.includes(name)) {
      $("settingsButton")?.classList.remove("hidden");
    } else {
      $("settingsButton")?.classList.add("hidden");
    }

    if (!isLoggedIn()) {
      $("settingsButton")?.classList.add("hidden");
    }

    renderEverything();

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  function setupNavigation() {
    $("menuButton")?.addEventListener("click", openDrawer);

    $("closeDrawer")?.addEventListener("click", closeDrawer);

    $("drawerBackdrop")?.addEventListener("click", closeDrawer);

    $("settingsButton")?.addEventListener("click", () => {
      showScreen("settings");
    });

    $("notificationButton")?.addEventListener("click", () => {
      showScreen("notifications");
    });

    document.querySelectorAll("[data-tab]").forEach(button => {
      button.addEventListener("click", () => {
        showScreen(button.dataset.tab);
      });
    });

    document.querySelectorAll("[data-menu]").forEach(button => {
      button.addEventListener("click", () => {
        showScreen(button.dataset.menu);
      });
    });

    document.querySelectorAll("[data-back]").forEach(button => {
      button.addEventListener("click", () => {
        showScreen(button.dataset.back);
      });
    });

    $("logoutButton")?.addEventListener("click", () => {
      endSession();
      closeDrawer();
      showScreen("welcome");
      toast("You have been logged out.");
    });

    document.querySelectorAll("[data-menu]").forEach(button => {
      button.addEventListener("click", closeDrawer);
    });
  }

  // -----------------------------------------------------
  // RENDERING
  // -----------------------------------------------------

  function renderSources() {
    const list = $("sourceList");

    if (!list) return;

    list.innerHTML = Object.entries(state.sources).map(([key, source]) => `
      <div class="source-card">
        <div class="flex-between">
          <span>${SOURCE_ICONS[key] || "💳"}</span>
          <span class="status-pill ${source.enabled ? "success" : "warning"}">
            ${source.enabled ? "ENABLED" : "DISABLED"}
          </span>
        </div>

        <div class="source-name">${escapeHTML(SOURCE_NAMES[key] || key)}</div>

        <small>${escapeHTML(source.account || "Not connected")}</small>

        <div class="source-balance">
          ${money(source.balance)}
        </div>
      </div>
    `).join("");
  }

  function renderTransactions() {
    const recent = $("recentTransactions");
    const history = $("historyList");

    const transactions = state.transactions;

    const markup = items => {
      if (!items.length) {
        return `<div class="empty-state">
          <span class="empty-icon">📄</span>
          No transactions yet.
        </div>`;
      }

      return items.map(transaction => `
        <div class="transaction-item">
          <div class="transaction-icon">💸</div>

          <div class="transaction-details">
            <strong>${escapeHTML(transaction.type)}</strong>
            <small>${escapeHTML(transaction.description || "")}</small>
            <small>${escapeHTML(
              transaction.createdAt
                ? new Date(transaction.createdAt).toLocaleString()
                : ""
            )}</small>
          </div>

          <div class="transaction-amount">
            ${money(transaction.amount)}
          </div>
        </div>
      `).join("");
    };

    if (recent) {
      recent.innerHTML = markup(transactions.slice(0, 5));
    }

    if (history) {
      const filter = $("historyFilter")?.value || "all";

      const filtered = filter === "all"
        ? transactions
        : transactions.filter(transaction =>
            String(transaction.type).toLowerCase().includes(
              filter.toLowerCase()
            )
          );

      history.innerHTML = markup(filtered);
    }
  }

  function renderNotifications() {
    const list = $("notificationsList");

    if (!list) return;

    list.innerHTML = state.notifications.length
      ? state.notifications.map(notification => `
        <div class="notification-item">
          <div class="transaction-icon">🔔</div>

          <div class="transaction-details">
            <strong>${escapeHTML(notification.title)}</strong>
            <small>${escapeHTML(notification.message)}</small>
            <small>${escapeHTML(notification.createdAt || "")}</small>
          </div>

          ${notification.read ? "" : '<span class="status-pill warning">NEW</span>'}
        </div>
      `).join("")
      : `<div class="empty-state">No notifications yet.</div>`;

    const unread = state.notifications.filter(item => !item.read).length;

    const badge = $("notificationBadge");

    if (badge) {
      badge.textContent = unread ? String(unread) : "";
      badge.hidden = unread === 0;
    }
  }

  function renderSecurityEvents() {
    const list = $("securityEvents");

    if (!list) return;

    list.innerHTML = state.securityEvents.length
      ? state.securityEvents.map(event => `
        <div class="security-event">
          <div class="transaction-icon">🔐</div>
          <div class="transaction-details">
            <strong>Security event</strong>
            <small>${escapeHTML(event.message)}</small>
            <small>${escapeHTML(event.createdAt || "")}</small>
          </div>
        </div>
      `).join("")
      : `<div class="empty-state">No recorded security events.</div>`;
  }

  function renderProfile() {
    setText("dashboardName", state.user.name || "BEAST Member");
    setText("dashboardBeastId", state.user.beastId || "Not assigned");
    setText("profileName", state.user.name || "");
    setText("profilePhone", state.user.phone || "");
    setText("profileBeastId", state.user.beastId || "");

    setText("beastCardHolder", state.user.name || "BEAST MEMBER");
    setText("beastCardLast4", "••••");

    const total = Object.values(state.sources).reduce((sum, source) => {
      return sum + (source.enabled ? Number(source.balance || 0) : 0);
    }, 0);

    setText("totalBalance", money(total));

    const card = $("beastCardLast4");

    if (card && card.tagName === "INPUT") {
      card.value = "••••";
    }
  }

  function renderSourceSelects() {
    const ids = [
      "sendSource",
      "withdrawSource",
      "bulkSource",
      "depositSource",
      "buyerSource"
    ];

    ids.forEach(id => {
      const select = $(id);

      if (!select) return;

      const previous = select.value;

      const allowed = Object.entries(state.sources).filter(([key, source]) => {
        if (id === "depositSource") {
          return source.enabled && key !== "wallet";
        }

        return source.enabled;
      });

      select.innerHTML = allowed.map(([key]) => `
        <option value="${escapeHTML(key)}">
          ${escapeHTML(SOURCE_NAMES[key])}
        </option>
      `).join("");

      if (allowed.some(([key]) => key === previous)) {
        select.value = previous;
      }
    });
  }

  function renderBankAccounts() {
    const list = $("bankAccountList");

    if (!list) return;

    const sources = Object.entries(state.sources)
      .filter(([key, source]) =>
        ["bank", "card"].includes(key) && source.enabled
      );

    list.innerHTML = sources.length
      ? sources.map(([key, source]) => `
        <div class="bank-account-card">
          <div class="bank-logo">${SOURCE_ICONS[key]}</div>

          <div class="bank-account-info">
            <strong>${escapeHTML(SOURCE_NAMES[key])}</strong>
            <span>${escapeHTML(source.account || "Account connected")}</span>
          </div>

          <span class="status-pill success">Enabled</span>
        </div>
      `).join("")
      : `<div class="empty-state">No bank or card sources configured.</div>`;
  }

  function renderEverything() {
    if (!isLoggedIn()) return;

    renderProfile();
    renderSources();
    renderTransactions();
    renderNotifications();
    renderSecurityEvents();
    renderSourceSelects();
    renderBankAccounts();

    const banner = $("announcementBanner");

    if (banner) {
      banner.textContent = announcementText;
      banner.classList.toggle("hidden", !announcementText);
    }

    const summary = $("statementsSummary");

    if (summary) {
      summary.textContent =
        `Transactions: ${state.transactions.length}. ` +
        `Recorded activity is stored on this device unless the server ` +
        `provides synchronized transaction history.`;
    }
  }

  // -----------------------------------------------------
  // PASSWORD AND PIN HASHING
  // Local-only demo protection, not server authentication.
  // -----------------------------------------------------

  async function hashValue(value, salt) {
    if (!crypto.subtle) {
      throw new Error("Secure browser context required for password hashing.");
    }

    const data = new TextEncoder().encode(`${salt}:${value}`);
    const digest = await crypto.subtle.digest("SHA-256", data);

    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  async function setPin(pin) {
    state.user.pinSalt = crypto.randomUUID();
    state.user.pinHash = await hashValue(pin, state.user.pinSalt);
  }

  async function verifyPin(pin) {
    if (!state.user.pinHash || !state.user.pinSalt) return false;

    return (
      await hashValue(pin, state.user.pinSalt)
    ) === state.user.pinHash;
  }

  async function setPassword(password) {
    state.user.passwordSalt = crypto.randomUUID();
    state.user.passwordHash =
      await hashValue(password, state.user.passwordSalt);
  }

  async function verifyPassword(password) {
    if (!state.user.passwordHash || !state.user.passwordSalt) {
      return false;
    }

    return (
      await hashValue(password, state.user.passwordSalt)
    ) === state.user.passwordHash;
  }

  // -----------------------------------------------------
  // REGISTRATION
  // -----------------------------------------------------

  function showRegistrationStep(step) {
    registrationStep = step;

    ["regStep1", "regStep2", "regStep3"].forEach((id, index) => {
      const element = $(id);

      if (element) {
        element.classList.toggle("active", index + 1 === step);
        element.hidden = index + 1 !== step;
      }
    });

    document.querySelectorAll(".registration-steps span").forEach((item, i) => {
      item.classList.toggle("active", i + 1 === step);
    });
  }

  function setupRegistration() {
    $("showRegisterButton")?.addEventListener("click", () => {
      showRegistrationStep(1);
      showScreen("registration");
    });

    $("showLoginButton")?.addEventListener("click", () => {
      showScreen("login");
    });

    $("loginToRegister")?.addEventListener("click", () => {
      showRegistrationStep(1);
      showScreen("registration");
    });

    $("registrationNext")?.addEventListener("click", () => {
      const name = $("regName")?.value.trim();
      const phone = normalizePhone($("regPhone")?.value);
      const nationalId = $("regNationalId")?.value.trim();

      if (!name) return toast("Enter your full name.");
      if (!validPhone(phone)) return toast("Enter a valid Kenyan phone number.");
      if (!nationalId) return toast("Enter your national ID.");

      state.user.name = name;
      state.user.phone = phone;
      state.user.nationalId = nationalId;

      showRegistrationStep(2);
    });

    $("registrationSecurityNext")?.addEventListener("click", async () => {
      const password = $("regPassword")?.value || "";
      const confirmPassword = $("regPasswordConfirm")?.value || "";
      const pin = $("regPin")?.value || "";
      const confirmPin = $("regPinConfirm")?.value || "";

      if (password.length < 8) {
        return toast("Password must have at least 8 characters.");
      }

      if (password !== confirmPassword) {
        return toast("Passwords do not match.");
      }

      if (!/^\d{4,6}$/.test(pin)) {
        return toast("PIN must contain 4 to 6 digits.");
      }

      if (pin !== confirmPin) {
        return toast("PINs do not match.");
      }

      try {
        await setPassword(password);
        await setPin(pin);

        showRegistrationStep(3);

        setText("registrationSummary",
          `${state.user.name} — ${state.user.phone}`
        );
      } catch (error) {
        toast(error.message);
      }
    });

    $("registrationPrevious")?.addEventListener("click", () => {
      showRegistrationStep(1);
    });

    $("registrationConfirmBack")?.addEventListener("click", () => {
      showRegistrationStep(2);
    });

    $("finishRegistration")?.addEventListener("click", () => {
      if ($("regTerms") && !$("regTerms").checked) {
        return toast("Please accept the terms before continuing.");
      }

      state.user.beastId = "BEAST-" +
        Math.floor(100000 + Math.random() * 900000);

      state.registered = true;

      save();
      startSession();

      addSecurityEvent("Local demo registration completed.");
      save();

      showScreen("money");

      toast("Demo profile created. Server registration is not yet confirmed.");
    });
  }

  // -----------------------------------------------------
  // LOGIN
  // -----------------------------------------------------

  function setupLogin() {
    $("loginSubmitButton")?.addEventListener("click", async event => {
      const button = event.currentTarget;

      if (!state.registered) {
        return toast("Create a profile on this device first.");
      }

      const phone = normalizePhone($("loginPhone")?.value);
      const password = $("loginPassword")?.value || "";

      if (phone !== normalizePhone(state.user.phone)) {
        return toast("Phone number does not match this profile.");
      }

      const restore = setButtonBusy(button, true, "Checking...");

      try {
        if (!(await verifyPassword(password))) {
          addSecurityEvent("Failed local login attempt.");
          save();

          return toast("Incorrect phone number or password.");
        }

        startSession();
        showScreen("money");
      } catch (error) {
        toast(error.message);
      } finally {
        restore();
      }
    });

    $("demoModeButton")?.addEventListener("click", () => {
      toast("Demo mode does not authorize real-money transactions.");
    });
  }

  // -----------------------------------------------------
  // TRANSACTION CONFIRMATION
  // -----------------------------------------------------

  function closeConfirmModal() {
    $("confirmModal")?.classList.remove("open", "active");
  }

  function askConfirmation(title, message, action) {
    pendingAction = action;

    setText("confirmModalTitle", title);
    setText("confirmModalMessage", message);

    $("confirmModal")?.classList.add("open");
  }

  function setupConfirmation() {
    $("closeConfirmModal")?.addEventListener("click", closeConfirmModal);
    $("cancelActionButton")?.addEventListener("click", closeConfirmModal);

    $("confirmActionButton")?.addEventListener("click", async () => {
      const action = pendingAction;

      pendingAction = null;
      closeConfirmModal();

      if (typeof action === "function") {
        await action();
      }
    });
  }

  // -----------------------------------------------------
  // M-PESA STK PUSH
  // A request is not proof of a completed payment.
  // -----------------------------------------------------

  async function triggerMpesaSTK(phone, amount) {
    const normalized = normalizePhone(phone);

    if (!validPhone(normalized)) {
      throw new Error("Enter a valid Kenyan M-PESA phone number.");
    }

    if (!validAmount(amount)) {
      throw new Error("Enter a valid amount.");
    }

    const data = await api("/api/mpesa/stkpush", {
      method: "POST",

      body: JSON.stringify({
        phone: normalized,
        amount: Number(amount)
      })
    });

    if (!data.ok) {
      throw new Error(data.error || "STK Push request failed.");
    }

    return data;
  }

  // -----------------------------------------------------
  // SEND MONEY
  // Does not debit a real wallet without a server endpoint.
  // -----------------------------------------------------

  function setupSend() {
    $("verifyRecipient")?.addEventListener("click", () => {
      const phone = normalizePhone($("sendPhone")?.value);

      if (!validPhone(phone)) {
        return toast("Enter a valid recipient phone number.");
      }

      const box = $("recipientVerification");

      if (box) {
        box.textContent =
          `Number format accepted: ${phone}. ` +
          "The recipient's identity has not been verified by the server.";
      }
    });

    $("sendMoneyButton")?.addEventListener("click", () => {
      if (!requireLogin()) return;

      const phone = normalizePhone($("sendPhone")?.value);
      const amount = Number($("sendAmount")?.value);

      if (!validPhone(phone)) {
        return toast("Enter a valid recipient phone number.");
      }

      if (phone === normalizePhone(state.user.phone)) {
        return toast("You cannot send money to your own number.");
      }

      if (!validAmount(amount)) {
        return toast("Enter a valid transfer amount.");
      }

      const source = $("sendSource")?.value;

      if (!state.sources[source]?.enabled) {
        return toast("Select an enabled source.");
      }

      pendingTransaction = {
        type: "Send",
        amount,
        source,
        recipient: phone
      };

      askConfirmation(
        "Confirm transfer",
        `You are preparing to send ${money(amount)} to ${phone}. ` +
        "No money will be moved until the server confirms the transaction.",
        async () => {
          if (source === "mpesa") {
            try {
              await triggerMpesaSTK(phone, amount);

              toast("STK Push requested. Complete payment on your phone.");
            } catch (error) {
              toast(error.message);
            }
          } else {
            toast(
              "Transfer not submitted: a verified server transfer endpoint " +
              "is required for this source."
            );
          }
        }
      );
    });
  }

  // -----------------------------------------------------
  // BULK TRANSFER
  // -----------------------------------------------------

  function setupBulk() {
    $("previewBulkButton")?.addEventListener("click", () => {
      const input = $("bulkRecipients")?.value || "";

      const recipients = input
        .split(/\n|,|;/)
        .map(normalizePhone)
        .filter(Boolean);

      const valid = recipients.filter(validPhone);
      const invalid = recipients.filter(phone => !validPhone(phone));
      const amount = Number($("bulkAmount")?.value);

      const preview = $("bulkPreview");

      if (!preview) return;

      preview.textContent =
        `Recipients: ${valid.length}. ` +
        `Invalid numbers: ${invalid.length}. ` +
        `Amount per recipient: ${money(amount)}. ` +
        `Total before fees: ${money(valid.length * (amount || 0))}.`;

      preview.dataset.recipients = JSON.stringify(valid);
    });

    $("executeBulkButton")?.addEventListener("click", () => {
      toast(
        "Bulk transfers require a server-side batch-transfer endpoint. " +
        "No transfers were executed."
      );
    });
  }

  // -----------------------------------------------------
  // RECEIVE AND DEPOSIT
  // -----------------------------------------------------

  function setupReceive() {
    document.querySelectorAll("[data-receive-tab]").forEach(button => {
      button.addEventListener("click", () => {
        const tab = button.dataset.receiveTab;

        document.querySelectorAll("[data-receive-tab]").forEach(item => {
          item.classList.toggle("active", item === button);
        });

        const panels = {
          buyer: "receiveBuyerPanel",
          deposit: "receiveDepositPanel",
          agent: "receiveAgentPanel"
        };

        Object.entries(panels).forEach(([key, id]) => {
          $(id)?.classList.toggle("active", key === tab);
        });
      });
    });

    $("depositButton")?.addEventListener("click", async () => {
      const amount = Number($("depositAmount")?.value);
      const source = $("depositSource")?.value;

      if (!validAmount(amount)) {
        return toast("Enter a valid deposit amount.");
      }

      if (source === "mpesa") {
        try {
          await triggerMpesaSTK(state.user.phone, amount);
          toast("Deposit request sent. Await payment confirmation.");
        } catch (error) {
          toast(error.message);
        }

        return;
      }

      toast(
        "Deposit not credited. The selected provider must confirm " +
        "the deposit through the BEAST server."
      );
    });

    $("agentDepositButton")?.addEventListener("click", () => {
      const amount = Number($("agentAmount")?.value);

      if (!validAmount(amount)) {
        return toast("Enter a valid deposit amount.");
      }

      toast(
        "Agent deposits require server-side agent verification. " +
        "No wallet credit was created."
      );
    });

    $("buyerLoginButton")?.addEventListener(() => {});

    $("buyerPayButton")?.addEventListener("click", () => {
      toast(
        "Buyer payments require verified buyer authentication " +
        "and a server-side payment endpoint."
      );
    });
  }

  // -----------------------------------------------------
  // WITHDRAWALS
  // -----------------------------------------------------

  function setupWithdraw() {
    $("withdrawButton")?.addEventListener("click", () => {
      const amount = Number($("withdrawAmount")?.value);
      const phone = normalizePhone($("withdrawAgentPhone")?.value);

      if (!validAmount(amount)) {
        return toast("Enter a valid withdrawal amount.");
      }

      if (!validPhone(phone)) {
        return toast("Enter a valid recipient or agent phone number.");
      }

      askConfirmation(
        "Confirm withdrawal request",
        `Request a withdrawal of ${money(amount)} to ${phone}?`,
        async () => {
          toast(
            "Withdrawal not executed. Connect a verified server withdrawal " +
            "endpoint before handling real funds."
          );
        }
      );
    });
  }

  // -----------------------------------------------------
  // LIPA NA
  // -----------------------------------------------------

  function setupLipa() {
    $("lipaButton")?.addEventListener("click", async () => {
      const amount = Number($("lipaAmount")?.value);

      if (!validAmount(amount)) {
        return toast("Enter a valid payment amount.");
      }

      const phone = normalizePhone(state.user.phone);

      try {
        await triggerMpesaSTK(phone, amount);
        toast("Payment request submitted. Await M-PESA confirmation.");
      } catch (error) {
        toast(error.message);
      }
    });
  }

  // -----------------------------------------------------
  // BANK AND CARD SOURCES
  // -----------------------------------------------------

  function setupSources() {
    $("sourceType")?.addEventListener("change", event => {
      const type = event.target.value;

      showElement("bankSourceFields", type === "bank");
      showElement("cardSourceFields", type === "card");
    });

    $("addSourceButton")?.addEventListener("click", () => {
      const type = $("sourceType")?.value;
      const account = $("sourceAccount")?.value.trim();

      if (!["mpesa", "tkash", "airtel", "bank", "card", "wallet"].includes(type)) {
        return toast("Choose a valid source type.");
      }

      if (!account && type !== "wallet") {
        return toast("Enter the account reference.");
      }

      state.sources[type] = {
        ...state.sources[type],
        enabled: true,
        account,
        bankName: $("bankName")?.value.trim() || "",
        cardName: $("cardName")?.value.trim() || "",
        last4: String($("cardLast4")?.value || "").slice(-4)
      };

      save();
      renderEverything();

      toast(
        "Source details saved locally. This does not connect or verify a bank account."
      );
    });
  }

  // -----------------------------------------------------
  // PROFILE, SETTINGS AND SECURITY
  // -----------------------------------------------------

  function setupSettings() {
    $("themeSelect")?.addEventListener("change", event => {
      applyTheme(event.target.value);
      save();
    });

    $("saveReceivingMethod")?.addEventListener("click", () => {
      const selected = $("receivingMethod")?.value;

      if (!selected || !(selected in state.receiving)) {
        return toast("Select a valid receiving method.");
      }

      Object.keys(state.receiving).forEach(key => {
        state.receiving[key] = key === selected;
      });

      save();
      toast("Receiving preference saved locally.");
    });

    $("changePinButton")?.addEventListener("click", async () => {
      const current = prompt("Enter your current PIN:");

      if (current === null) return;

      if (!(await verifyPin(current))) {
        return toast("Current PIN is incorrect.");
      }

      const next = prompt("Enter a new 4–6 digit PIN:");

      if (!next || !/^\d{4,6}$/.test(next)) {
        return toast("Enter a valid 4–6 digit PIN.");
      }

      await setPin(next);
      save();

      addSecurityEvent("Local PIN changed.");
      save();

      toast("Local PIN updated.");
    });

    $("changePasswordButton")?.addEventListener("click", async () => {
      const current = prompt("Enter your current password:");

      if (current === null) return;

      if (!(await verifyPassword(current))) {
        return toast("Current password is incorrect.");
      }

      const next = prompt("Enter a new password of at least 8 characters:");

      if (!next || next.length < 8) {
        return toast("Password must have at least 8 characters.");
      }

      await setPassword(next);
      save();

      addSecurityEvent("Local password changed.");
      save();

      toast("Local password updated.");
    });

    $("resetDemoButton")?.addEventListener("click", () => {
      askConfirmation(
        "Reset local demo",
        "This clears the BEAST data saved in this browser on this device.",
        () => {
          localStorage.removeItem(STORAGE_KEY);
          sessionStorage.removeItem(SESSION_KEY);
          location.reload();
        }
      );
    });

    $("runSecurityCheckButton")?.addEventListener("click", () => {
      const secure = window.isSecureContext;

      const result = secure
        ? "Secure browser context detected. This does not guarantee account or transaction security."
        : "Warning: this page is not running in a secure browser context.";

      setText("securityCheckResult", result);

      addSecurityEvent("Local security check performed.");
      save();

      renderSecurityEvents();
    });

    $("markAllReadButton")?.addEventListener("click", () => {
      state.notifications.forEach(item => {
        item.read = true;
      });

      save();
      renderNotifications();

      toast("Notifications marked as read.");
    });

    $("historyFilter")?.addEventListener("change", renderTransactions);

    $("downloadStatementButton")?.addEventListener("click", () => {
      const lines = [
        ["Date", "Type", "Amount", "Description"],
        ...state.transactions.map(item => [
          item.createdAt || "",
          item.type || "",
          item.amount || 0,
          item.description || ""
        ])
      ];

      const csv = lines.map(row =>
        row.map(value =>
          `"${String(value).replace(/"/g, '""')}"`
        ).join(",")
      ).join("\n");

      const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8;"
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "beast-statement.csv";
      link.click();

      URL.revokeObjectURL(url);

      toast("Local transaction statement exported.");
    });

    $("requestBeastCardButton")?.addEventListener("click", () => {
      toast("Card issuance requires a configured card-issuing provider.");
    });

    $("openOwnerPanelButton")?.addEventListener(() => {});
  }

  // -----------------------------------------------------
  // WEBSOCKET ANNOUNCEMENTS
  // Wallet credits are not applied from unverified messages.
  // -----------------------------------------------------

  function connectAnnouncements() {
    if (socketRetry) {
      clearTimeout(socketRetry);
      socketRetry = null;
    }

    if (socket && (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    )) {
      return;
    }

    try {
      const wsURL = SERVER_URL.replace(/^http/, "ws");

      socket = new WebSocket(wsURL);

      socket.onmessage = event => {
        let data;

        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        if (data.type === "announcement" && typeof data.message === "string") {
          announcementText = data.message;

          const banner = $("announcementBanner");

          if (banner) {
            banner.textContent = `📢 ${announcementText}`;
            banner.classList.remove("hidden");
          }
        }

        if (data.type === "wallet_credit" || data.type === "mpesa_success") {
          /*
           * Do not credit a wallet solely because the browser received
           * a WebSocket message. Real wallet credits must be fetched from
           * or verified by an authenticated server endpoint.
           */
          addNotification(
            "Payment update",
            "A payment event was received. Refresh verified account data " +
            "from the server before changing your displayed balance."
          );

          save();
          renderNotifications();
        }
      };

      socket.onclose = () => {
        socketRetry = setTimeout(connectAnnouncements, 5000);
      };

      socket.onerror = () => {
        try {
          socket.close();
        } catch {}
      };
    } catch {
      socketRetry = setTimeout(connectAnnouncements, 10000);
    }
  }

  // -----------------------------------------------------
  // INITIALIZATION
  // -----------------------------------------------------

  function init() {
    applyTheme(state.settings.theme);

    setupNavigation();
    setupRegistration();
    setupLogin();
    setupConfirmation();
    setupSend();
    setupBulk();
    setupReceive();
    setupWithdraw();
    setupLipa();
    setupSources();
    setupSettings();

    showRegistrationStep(1);

    if (isLoggedIn()) {
      showScreen("money");
    } else {
      showScreen("welcome");
    }

    connectAnnouncements();
  }

  init();
});
