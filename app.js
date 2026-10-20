/* =========================================================
   BEAST APP — MONEY · CONNECT
   Frontend controller
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const API = "https://beast-server-8u92.onrender.com";
  const STORAGE_KEY = "beast_superapp_v1";
  const SESSION_KEY = "beast_superapp_session_v1";
  const BULK_KEY = "beast_bulk_saved_lists_v1";
  const THEME_KEY = "beast_superapp_theme";

  const $ = id => document.getElementById(id);

  const money = value =>
    "KES " + Number(value || 0).toLocaleString("en-KE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

  const uid = prefix =>
    prefix + "-" + Date.now().toString(36).toUpperCase() +
    "-" + Math.random().toString(36).slice(2, 7).toUpperCase();

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  function toast(message) {
    const el = $("toast");
    if (!el) {
      alert(message);
      return;
    }

    el.textContent = message;
    el.classList.add("show");

    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      el.classList.remove("show");
    }, 3500);
  }

  function showError(message) {
    toast(message);
  }

  function normalizePhone(value) {
    let phone = String(value || "").replace(/[\s()-]/g, "");

    if (phone.startsWith("+254")) phone = "0" + phone.slice(4);
    else if (phone.startsWith("254")) phone = "0" + phone.slice(3);

    return phone;
  }

  function validPhone(value) {
    return /^(07|01)\d{8}$/.test(normalizePhone(value));
  }

  function normalizeBeastId(value) {
    let id = String(value || "").trim().toUpperCase();

    if (/^\d{6}$/.test(id)) id = "BEAST-" + id;
    if (/^BEAST\d{6}$/.test(id)) {
      id = "BEAST-" + id.slice(5);
    }

    return /^BEAST-\d{6}$/.test(id) ? id : null;
  }

  function validAccount(value) {
    const account = String(value || "").trim();
    return /^[A-Za-z0-9][A-Za-z0-9_-]{3,29}$/.test(account);
  }

  function validAmount(value) {
    const amount = Number(value);
    return Number.isSafeInteger(amount) && amount > 0;
  }

  const SOURCE_NAMES = {
    mpesa: "M-PESA",
    tkash: "T-Kash",
    airtel: "Airtel Money",
    bank: "Bank Account",
    card: "Card",
    wallet: "BEAST Wallet"
  };

  function defaultState() {
    return {
      version: 10,
      user: null,
      sources: {
        mpesa: { balance: 5000, enabled: true, account: "" },
        tkash: { balance: 1000, enabled: true, account: "" },
        airtel: { balance: 1000, enabled: true, account: "" },
        bank: { balance: 1000, enabled: true, account: "" },
        card: { balance: 1000, enabled: true, account: "" },
        wallet: { balance: 0, enabled: true, account: "" }
      },
      transactions: [],
      notifications: [],
      securityEvents: [],
      receivingMethods: [],
      settings: { notifications: true, darkMode: true },
      revenue: { fees: 0 },
      claimedWithdrawals: [],
      currentScreen: "welcome"
    };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));

      if (!saved || typeof saved !== "object") return defaultState();

      const base = defaultState();

      return {
        ...base,
        ...saved,
        sources: { ...base.sources, ...(saved.sources || {}) },
        settings: { ...base.settings, ...(saved.settings || {}) },
        transactions: Array.isArray(saved.transactions)
          ? saved.transactions : [],
        notifications: Array.isArray(saved.notifications)
          ? saved.notifications : [],
        securityEvents: Array.isArray(saved.securityEvents)
          ? saved.securityEvents : [],
        receivingMethods: Array.isArray(saved.receivingMethods)
          ? saved.receivingMethods : [],
        claimedWithdrawals: Array.isArray(saved.claimedWithdrawals)
          ? saved.claimedWithdrawals : []
      };
    } catch {
      return defaultState();
    }
  }

  let state = loadState();
  let currentRecipient = null;
  let currentLipaRecipient = null;
  let verifiedAgent = null;
  let verifiedMobileDestination = null;
  let pendingAction = null;
  let currentRegistration = {};
  let currentLogin = false;
  let selectedBuyer = null;
  let selectedBuyerSource = null;
  let verifiedAgentDeposit = false;
  let parsedBulk = [];

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function isLoggedIn() {
    return Boolean(state.user);
  }

  function requireLogin() {
    if (!isLoggedIn()) {
      showScreen("welcome");
      toast("Please log in or register first.");
      return false;
    }
    return true;
  }

  function addNotification(title, message) {
    state.notifications.unshift({
      id: uid("NTF"),
      title,
      message,
      createdAt: new Date().toISOString(),
      read: false
    });

    state.notifications = state.notifications.slice(0, 100);
    saveState();
    renderNotifications();
  }

  function addSecurityEvent(message) {
    state.securityEvents.unshift({
      id: uid("SEC"),
      message,
      createdAt: new Date().toISOString()
    });

    state.securityEvents = state.securityEvents.slice(0, 100);
    saveState();
    renderSecurity();
  }

  function addTransaction(data) {
    const tx = {
      id: uid("TX"),
      reference: uid("BEAST"),
      createdAt: new Date().toISOString(),
      status: "demo",
      ...data
    };

    state.transactions.unshift(tx);
    state.transactions = state.transactions.slice(0, 500);
    saveState();
    renderHistory();
    renderStatements();

    return tx;
  }

  function totalBalance() {
    return Object.values(state.sources).reduce((total, source) => {
      return total + (source.enabled ? Number(source.balance || 0) : 0);
    }, 0);
  }

  function showScreen(name) {
    const target = $(name + "Screen");

    if (!target) {
      console.warn("Unknown screen:", name);
      return;
    }

    document.querySelectorAll(".app-screen").forEach(screen => {
      screen.classList.remove("active");
      screen.classList.add("hidden");
    });

    target.classList.remove("hidden");
    target.classList.add("active");

    state.currentScreen = name;
    saveState();

    closeDrawer();
    renderEverything();

    if (name === "withdraw") syncWithdrawals();
  }

  function openDrawer() {
    $("menuDrawer")?.classList.add("open");
    $("drawerBackdrop")?.classList.add("show");
  }

  function closeDrawer() {
    $("menuDrawer")?.classList.remove("open");
    $("drawerBackdrop")?.classList.remove("show");
  }

  function menuNavigate(name) {
    if (name === "logout") {
      logout();
      return;
    }

    if (!isLoggedIn() &&
        !["welcome", "login", "registration"].includes(name)) {
      toast("Log in first to access this feature.");
      showScreen("welcome");
      return;
    }

    showScreen(name);
  }

  function logout() {
    state.user = null;
    localStorage.removeItem(SESSION_KEY);
    saveState();
    currentRecipient = null;
    closeDrawer();
    showScreen("welcome");
    toast("You have logged out.");
  }

  /* =======================================================
     DEMO TRANSACTIONS
     These affect this browser's localStorage only.
     They do not move real money or synchronize accounts.
     ======================================================= */

  function previewFee(source, amount, type = "send") {
    amount = Number(amount || 0);

    if (!amount || amount < 0) return 0;

    if (source === "wallet") return 0;

    if (type === "withdraw") {
      if (amount <= 100) return 10;
      if (amount <= 500) return 15;
      if (amount <= 1000) return 25;
      if (amount <= 2500) return 40;
      if (amount <= 5000) return 55;
      return 75;
    }

    if (amount <= 100) return 0;
    if (amount <= 500) return 7;
    if (amount <= 1000) return 13;
    if (amount <= 2500) return 23;
    if (amount <= 5000) return 33;
    if (amount <= 10000) return 45;
    return 60;
  }

  function updateCostPreview(containerId, sourceId, amountId, type = "send") {
    const container = $(containerId);
    const source = $(sourceId)?.value || "wallet";
    const amount = Number($(amountId)?.value || 0);

    if (!container) return;

    if (!validAmount(amount)) {
      container.textContent = "Enter a valid amount to preview the cost.";
      return;
    }

    const fee = previewFee(source, amount, type);

    container.innerHTML = `
      <div>Amount: <strong>${money(amount)}</strong></div>
      <div>Estimated demo fee: <strong>${money(fee)}</strong></div>
      <div>Total: <strong>${money(amount + fee)}</strong></div>
      <small>Indicative demo figures, not live provider pricing.</small>
    `;
  }

  function completeLocalTransaction({
    type,
    source,
    amount,
    recipient = "",
    recipientName = "",
    description = "",
    fee = 0,
    destination = "wallet"
  }) {
    if (!requireLogin()) return false;

    amount = Number(amount);
    fee = Number(fee);

    if (!validAmount(amount)) {
      showError("Enter a valid positive whole-number amount.");
      return false;
    }

    if (!state.sources[source]?.enabled) {
      showError("This payment source is not enabled.");
      return false;
    }

    const total = amount + fee;

    if (Number(state.sources[source].balance || 0) < total) {
      showError("Insufficient demo balance.");
      return false;
    }

    if (source === "wallet" && destination === "wallet" &&
        recipient && state.user.beastId === recipient) {
      showError("You cannot send money to your own BEAST account.");
      return false;
    }

    state.sources[source].balance -= total;

    if (type === "Receive" || type === "Deposit") {
      state.sources.wallet.balance += amount;
    }

    state.revenue.fees = Number(state.revenue.fees || 0) + fee;

    const tx = addTransaction({
      type,
      source,
      amount,
      fee,
      totalDeducted: total,
      recipient,
      recipientName,
      description,
      destination,
      status: "demo"
    });

    addNotification(
      type + " recorded",
      `${money(amount)} — reference ${tx.reference}`
    );

    renderEverything();
    toast(`${type} recorded in DEMO mode.`);

    return true;
  }

  function sourceOptions(select, preferred = "wallet") {
    if (!select) return;

    const oldValue = select.value || preferred;

    select.innerHTML = Object.entries(SOURCE_NAMES).map(([key, name]) => {
      const source = state.sources[key];
      const disabled = !source?.enabled ? "disabled" : "";
      return `<option value="${key}" ${disabled}>
        ${escapeHTML(name)} — ${money(source?.balance || 0)}
      </option>`;
    }).join("");

    if (state.sources[oldValue]?.enabled) {
      select.value = oldValue;
    } else {
      select.value = state.sources.wallet.enabled ? "wallet" : "mpesa";
    }
  }

  /* =======================================================
     REGISTRATION / LOGIN
     This local prototype is not secure production auth.
     ======================================================= */

  function setupRegistration() {
    $("goRegisterButton")?.addEventListener("click", () => {
      currentRegistration = {};
      showScreen("registration");
      $("regStep1")?.classList.remove("hidden");
      $("regStep2")?.classList.add("hidden");
      $("regStep3")?.classList.add("hidden");
    });

    $("backToWelcomeFromRegister")?.addEventListener("click", () => {
      showScreen("welcome");
    });

    $("regNext1")?.addEventListener("click", () => {
      const name = $("regName")?.value.trim();
      const phone = normalizePhone($("regPhone")?.value);
      const nationalId = $("regNationalId")?.value.trim();

      if (!name || name.length < 3) {
        showError("Enter your full name.");
        return;
      }

      if (!validPhone(phone)) {
        showError("Enter a valid Kenyan phone number.");
        return;
      }

      if (!/^\d{5,12}$/.test(nationalId)) {
        showError("Check your National ID number.");
        return;
      }

      currentRegistration = { name, phone, nationalId };

      $("regStep1")?.classList.add("hidden");
      $("regStep2")?.classList.remove("hidden");
      document.querySelectorAll(".step")[1]?.classList.add("active");
    });

    $("regNext2")?.addEventListener("click", () => {
      const password = $("regPassword")?.value || "";
      const password2 = $("regPassword2")?.value || "";
      const pin = $("regPin")?.value || "";
      const pin2 = $("regPin2")?.value || "";

      if (password.length < 6) {
        showError("Password must have at least 6 characters.");
        return;
      }

      if (password !== password2) {
        showError("Passwords do not match.");
        return;
      }

      if (!/^\d{4}$/.test(pin) || pin !== pin2) {
        showError("Enter matching four-digit PINs.");
        return;
      }

      currentRegistration.password = password;
      currentRegistration.pin = pin;

      $("registrationSummary").innerHTML = `
        <p><strong>Name:</strong> ${escapeHTML(currentRegistration.name)}</p>
        <p><strong>Phone:</strong> ${escapeHTML(currentRegistration.phone)}</p>
        <p><strong>National ID:</strong> Provided</p>
        <p>Your BEAST ID will be assigned when registration is completed.</p>
      `;

      $("regStep2")?.classList.add("hidden");
      $("regStep3")?.classList.remove("hidden");
      document.querySelectorAll(".step")[2]?.classList.add("active");
    });

    $("finishRegistration")?.addEventListener("click", () => {
      const data = currentRegistration;

      if (!data.name || !data.phone || !data.password || !data.pin) {
        showError("Complete all registration steps first.");
        return;
      }

      if (state.user && state.user.phone === data.phone) {
        showError("This phone is already registered on this browser.");
        return;
      }

      const user = {
        name: data.name,
        phone: data.phone,
        nationalId: data.nationalId,
        beastId: "BEAST-" +
          Math.floor(100000 + Math.random() * 900000),
        pin: data.pin,
        password: data.password,
        createdAt: new Date().toISOString()
      };

      state.user = user;
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        phone: user.phone
      }));

      saveState();
      addSecurityEvent("New local demo profile created.");
      showScreen("money");
      toast("Demo profile created: " + user.beastId);
    });

    $("goLoginButton")?.addEventListener("click", () => {
      showScreen("login");
    });

    $("backToWelcomeFromLogin")?.addEventListener("click", () => {
      showScreen("welcome");
    });

    $("loginSubmitButton")?.addEventListener("click", () => {
      const phone = normalizePhone($("loginPhone")?.value);
      const password = $("loginPassword")?.value || "";

      if (!validPhone(phone) || !password) {
        showError("Enter your registered phone and password.");
        return;
      }

      const savedUser = state.user;

      if (!savedUser ||
          savedUser.phone !== phone ||
          savedUser.password !== password) {
        showError(
          "This local demo has no matching account. " +
          "Register here or use the connected server login after backend integration."
        );
        return;
      }

      localStorage.setItem(SESSION_KEY, JSON.stringify({ phone }));
      showScreen("money");
      toast("Welcome back.");
    });
  }

  /* =======================================================
     SEND / RECIPIENT VERIFICATION
     ======================================================= */

  function getSendRecipient() {
    const type = $("sendRecipientType")?.value || "phone";
    const raw = $("sendPhone")?.value.trim() || "";

    if (type === "beast") {
      const beastId = normalizeBeastId(raw);
      if (!beastId) {
        showError("Enter a valid BEAST number, such as 835678.");
        return null;
      }

      return { type, id: beastId };
    }

    if (type === "phone") {
      const phone = normalizePhone(raw);
      if (!validPhone(phone)) {
        showError("Enter a valid Kenyan phone number.");
        return null;
      }

      return { type, id: phone };
    }

    if (!validAccount(raw)) {
      showError("Enter a valid account number.");
      return null;
    }

    return { type, id: raw };
  }

  function setupSend() {
    sourceOptions($("sendSource"));

    $("sendRecipientType")?.addEventListener("change", () => {
      currentRecipient = null;

      const type = $("sendRecipientType").value;
      const input = $("sendPhone");

      if (input) {
        input.value = "";
        input.placeholder = type === "beast"
          ? "835678 or BEAST-835678"
          : type === "account"
            ? "Account number"
            : "0712345678";
      }

      $("recipientVerification")?.classList.add("hidden");
    });

    $("verifyRecipient")?.addEventListener("click", async () => {
      if (!requireLogin()) return;

      const recipient = getSendRecipient();
      if (!recipient) return;

      if (recipient.type === "beast" &&
          recipient.id === state.user.beastId) {
        showError("You cannot send money to yourself.");
        return;
      }

      /*
       * Server-side recipient lookup must be added before this
       * prototype can claim that a remote account is verified.
       */
      currentRecipient = recipient;

      const box = $("recipientVerification");
      box.classList.remove("hidden");

      box.innerHTML = `
        <strong>Format valid — account not server-verified</strong>
        <div>${escapeHTML(recipient.id)}</div>
        <small>Recipient name verification requires the server lookup API.</small>
      `;

      toast("Format checked. Remote identity is not yet verified.");
    });

    $("sendAmount")?.addEventListener("input", () =>
      updateCostPreview("sendCostPreview", "sendSource", "sendAmount")
    );

    $("sendSource")?.addEventListener("change", () =>
      updateCostPreview("sendCostPreview", "sendSource", "sendAmount")
    );

    $("sendMoneyButton")?.addEventListener("click", () => {
      if (!requireLogin()) return;

      if (!currentRecipient) {
        showError("Check the recipient details first.");
        return;
      }

      const amount = Number($("sendAmount")?.value);
      const source = $("sendSource")?.value;

      if (!validAmount(amount)) {
        showError("Enter a valid amount.");
        return;
      }

      if (currentRecipient.type === "beast") {
        if (source !== "wallet") {
          showError("Direct BEAST-to-BEAST payments must use BEAST Wallet.");
          return;
        }

        showError(
          "Remote BEAST transfers are not enabled until the server " +
          "provides secure recipient verification and atomic transfers."
        );
        return;
      }

      if (currentRecipient.type === "account") {
        showError("External account transfers require a supported provider.");
        return;
      }

      openAuthorization({
        type: "Send",
        source,
        amount,
        recipient: currentRecipient.id,
        recipientName: "Unverified recipient",
        description: "Demo phone transfer"
      });
    });
  }

  /* =======================================================
     BULK SEND AND SAVED LISTS
     ======================================================= */

  function parseBulkList(text) {
    const rows = [];
    const errors = [];
    const lines = String(text || "").split(/\r?\n/);

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const parts = trimmed.split(/[,\t;|]/).map(part => part.trim());

      if (parts.length < 2) {
        errors.push(`Line ${index + 1}: use recipient,amount.`);
        return;
      }

      const rawRecipient = parts[0];
      const amount = Number(parts[1]);

      if (!validAmount(amount)) {
        errors.push(`Line ${index + 1}: invalid amount.`);
        return;
      }

      let recipientType;
      let recipient = rawRecipient;

      if (/^(BEAST-)?\d{6}$/i.test(rawRecipient)) {
        recipientType = "beast";
        recipient = normalizeBeastId(rawRecipient);
      } else if (validPhone(rawRecipient)) {
        recipientType = "phone";
        recipient = normalizePhone(rawRecipient);
      } else if (validAccount(rawRecipient)) {
        recipientType = "account";
      } else {
        errors.push(`Line ${index + 1}: invalid recipient.`);
        return;
      }

      if (recipientType === "beast" &&
          state.user &&
          recipient === state.user.beastId) {
        errors.push(`Line ${index + 1}: cannot pay your own BEAST ID.`);
        return;
      }

      rows.push({
        line: index + 1,
        recipient,
        recipientType,
        amount
      });
    });

    if (rows.length > 200) {
      return {
        rows: [],
        errors: ["Maximum 200 recipients per batch."]
      };
    }

    const seen = new Set();

    rows.forEach(row => {
      const key = row.recipient.toUpperCase();

      if (seen.has(key)) {
        errors.push(`Duplicate recipient: ${row.recipient}`);
      }

      seen.add(key);
    });

    return { rows, errors };
  }

  function renderBulkPreview() {
    const box = $("bulkPreview");
    if (!box) return;

    if (!parsedBulk.length) {
      box.innerHTML = "<p>No validated recipients yet.</p>";
      return;
    }

    const total = parsedBulk.reduce((sum, row) => sum + row.amount, 0);

    box.innerHTML = `
      <h3>Batch preview</h3>
      <p>Recipients: <strong>${parsedBulk.length}</strong></p>
      <p>Total amount: <strong>${money(total)}</strong></p>
      <div class="list">
        ${parsedBulk.map(row => `
          <div class="list-item">
            <strong>${escapeHTML(row.recipient)}</strong>
            <span>${money(row.amount)}</span>
            <small>${escapeHTML(row.recipientType)}</small>
          </div>
        `).join("")}
      </div>
      <p class="muted">Recipient identity and balances have not been verified.</p>
    `;
  }

  function getSavedBulkLists() {
    try {
      const value = JSON.parse(localStorage.getItem(BULK_KEY) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }

  function renderSavedBulkLists() {
    const select = $("bulkSavedList");
    if (!select) return;

    const lists = getSavedBulkLists();
    const previous = select.value;

    select.innerHTML = '<option value="">Select a saved list</option>' +
      Object.keys(lists).sort().map(name =>
        `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`
      ).join("");

    if (lists[previous]) select.value = previous;
  }

  function setupBulk() {
    sourceOptions($("bulkSource"));
    renderSavedBulkLists();

    $("bulkParseButton")?.addEventListener("click", () => {
      if (!requireLogin()) return;

      const result = parseBulkList($("bulkList")?.value || "");
      parsedBulk = result.rows;

      renderBulkPreview();

      const resultBox = $("bulkResult");
      if (resultBox) {
        resultBox.classList.remove("hidden");
        resultBox.innerHTML = result.errors.length
          ? `<strong>Fix these issues:</strong><ul>${
              result.errors.map(error =>
                `<li>${escapeHTML(error)}</li>`
              ).join("")
            }</ul>`
          : "<strong>Syntax validation complete.</strong> " +
            "Remote recipients are not yet verified.";
      }

      if (result.errors.length) {
        toast(`${result.errors.length} validation issue(s).`);
      } else {
        toast(`${result.rows.length} recipient(s) parsed.`);
      }
    });

    $("bulkClearButton")?.addEventListener("click", () => {
      $("bulkList").value = "";
      $("bulkPreview").innerHTML = "";
      $("bulkResult")?.classList.add("hidden");
      parsedBulk = [];
    });

    $("bulkSaveListButton")?.addEventListener("click", () => {
      if (!requireLogin()) return;

      const name = $("bulkListName")?.value.trim();
      const text = $("bulkList")?.value || "";

      if (!name || !text.trim()) {
        showError("Enter a list name and recipient list.");
        return;
      }

      const lists = getSavedBulkLists();
      lists[name] = { text, updatedAt: new Date().toISOString() };

      localStorage.setItem(BULK_KEY, JSON.stringify(lists));
      renderSavedBulkLists();
      $("bulkSavedList").value = name;

      toast("Recipient list saved on this device.");
    });

    $("bulkLoadListButton")?.addEventListener("click", () => {
      const name = $("bulkSavedList")?.value;
      const lists = getSavedBulkLists();

      if (!name || !lists[name]) {
        showError("Select a saved list.");
        return;
      }

      $("bulkListName").value = name;
      $("bulkList").value = lists[name].text;
      parsedBulk = [];
      $("bulkPreview").innerHTML = "";
      toast("List loaded. Validate it before proceeding.");
    });

    $("bulkDeleteListButton")?.addEventListener("click", () => {
      const name = $("bulkSavedList")?.value;

      if (!name) {
        showError("Select a saved list first.");
        return;
      }

      const lists = getSavedBulkLists();
      delete lists[name];

      localStorage.setItem(BULK_KEY, JSON.stringify(lists));
      renderSavedBulkLists();
      toast("Saved list deleted from this device.");
    });

    $("bulkSendButton")?.addEventListener("click", () => {
      if (!requireLogin()) return;

      if (!parsedBulk.length) {
        showError("Validate the list before proceeding.");
        return;
      }

      if (parsedBulk.some(row => row.recipientType !== "phone")) {
        showError(
          "Bulk BEAST and account transfers require the secure server " +
          "batch-transfer API, which is not yet implemented."
        );
        return;
      }

      showError(
        "Bulk transfers are not enabled yet. The server must verify " +
        "each recipient and process the batch safely before funds are moved."
      );
    });
  }

  /* =======================================================
     WITHDRAW
     ======================================================= */

  function setupWithdraw() {
    sourceOptions($("withdrawSource"), "wallet");

    const mode = $("withdrawMode");
    const agentFields = $("agentWithdrawalFields");
    const mobileFields = $("mobileWithdrawalFields");

    function updateMode() {
      const isAgent = mode?.value !== "mobile";

      agentFields?.classList.toggle("hidden", !isAgent);
      mobileFields?.classList.toggle("hidden", isAgent);

      verifiedAgent = null;
      verifiedMobileDestination = null;

      $("agentVerification")?.classList.add("hidden");
      $("mobileWithdrawalVerification")?.classList.add("hidden");
    }

    mode?.addEventListener("change", updateMode);
    updateMode();

    $("verifyAgent")?.addEventListener("click", () => {
      const agent = $("agentNumber")?.value.trim();
      const store = $("agentStoreNumber")?.value.trim();

      if (!agent || agent.length < 4 || !store || store.length < 3) {
        showError("Enter both the agent ID and store number.");
        return;
      }

      /*
       * This checks field completeness only. A real agent registry
       * endpoint is needed to verify the agent and store remotely.
       */
      verifiedAgent = { agent, store };

      const box = $("agentVerification");
      box.classList.remove("hidden");
      box.innerHTML = `
        <strong>Fields complete — agent not server-verified</strong>
        <div>Agent: ${escapeHTML(agent)}</div>
        <div>Store: ${escapeHTML(store)}</div>
      `;

      toast("Agent details entered. Server verification is still required.");
    });

    $("verifyMobileWithdrawal")?.addEventListener("click", () => {
      const method = $("withdrawDestinationMethod")?.value;
      const phone = normalizePhone($("withdrawDestinationPhone")?.value);

      if (!validPhone(phone)) {
        showError("Enter a valid Kenyan destination phone.");
        return;
      }

      verifiedMobileDestination = { method, phone };

      const box = $("mobileWithdrawalVerification");
      box.classList.remove("hidden");
      box.innerHTML = `
        <strong>Phone format valid — destination not provider-verified</strong>
        <div>${escapeHTML(SOURCE_NAMES[method])}: ${escapeHTML(phone)}</div>
      `;

      toast("Phone format checked. Provider verification is not connected.");
    });

    $("withdrawAmount")?.addEventListener("input", () =>
      updateCostPreview(
        "withdrawCostPreview",
        "withdrawSource",
        "withdrawAmount",
        "withdraw"
      )
    );

    $("withdrawSource")?.addEventListener("change", () =>
      updateCostPreview(
        "withdrawCostPreview",
        "withdrawSource",
        "withdrawAmount",
        "withdraw"
      )
    );

    $("withdrawButton")?.addEventListener("click", () => {
      if (!requireLogin()) return;

      const amount = Number($("withdrawAmount")?.value);
      const source = $("withdrawSource")?.value;
      const isAgent = mode?.value !== "mobile";

      if (!validAmount(amount)) {
        showError("Enter a valid withdrawal amount.");
        return;
      }

      if (isAgent && !verifiedAgent) {
        showError("Enter and verify both agent ID and store number.");
        return;
      }

      if (!isAgent && !verifiedMobileDestination) {
        showError("Enter and check the mobile-money destination.");
        return;
      }

      if (isAgent) {
        showError(
          "Real agent withdrawal requires server-side agent/store " +
          "verification and a secure ledger operation."
        );
        return;
      }

      showError(
        "Real M-PESA/Airtel withdrawals require a provider integration. " +
        "No external funds have been sent."
      );
    });
  }

  /* =======================================================
     LIPA NA
     ======================================================= */

  function setupLipa() {
    sourceOptions($("lipaSource"), "wallet");

    const type = $("lipaType");
    const method = $("lipaMethod");
    const fields = $("lipaDestinationFields");

    function renderDestinationFields() {
      if (!fields) return;

      const selected = type?.value || "beast";

      if (selected === "beast") {
        fields.innerHTML = `
          <label>
            Business BEAST Number
            <input id="lipaBeastDestination"
                   placeholder="835678 or BEAST-835678">
          </label>
        `;
      } else if (selected === "paybill") {
        fields.innerHTML = `
          <label>Business number<input id="lipaBusinessNumber"></label>
          <label>Account number<input id="lipaAccountNumber"></label>
        `;
      } else if (selected === "till") {
        fields.innerHTML = `
          <label>Till number<input id="lipaTillNumber"></label>
        `;
      } else if (selected === "pochi") {
        fields.innerHTML = `
          <label>Business phone<input id="lipaPochiPhone" inputmode="tel"></label>
        `;
      } else {
        fields.innerHTML = `
          <label>Account number<input id="lipaAccountNumber"></label>
        `;
      }

      currentLipaRecipient = null;
      $("lipaVerification")?.classList.add("hidden");
    }

    type?.addEventListener("change", renderDestinationFields);

    method?.addEventListener("change", () => {
      if (method.value === "wallet" && type) type.value = "beast";
      renderDestinationFields();
    });

    renderDestinationFields();

    $("verifyLipa")?.addEventListener("click", () => {
      if (!requireLogin()) return;

      const selectedType = type?.value || "beast";
      const selectedMethod = method?.value || "wallet";
      let destination = "";

      if (selectedType === "beast") {
        destination = normalizeBeastId(
          $("lipaBeastDestination")?.value
        );

        if (!destination) {
          showError("Enter a valid business BEAST number.");
          return;
        }

        if (destination === state.user.beastId) {
          showError("You cannot pay yourself.");
          return;
        }
      } else if (selectedType === "paybill") {
        const business = $("lipaBusinessNumber")?.value.trim();
        const account = $("lipaAccountNumber")?.value.trim();

        if (!business || !validAccount(account)) {
          showError("Enter the PayBill business and account numbers.");
          return;
        }

        destination = `${business}/${account}`;
      } else if (selectedType === "till") {
        destination = $("lipaTillNumber")?.value.trim();

        if (!destination) {
          showError("Enter the Till number.");
          return;
        }
      } else if (selectedType === "pochi") {
        destination = normalizePhone($("lipaPochiPhone")?.value);

        if (!validPhone(destination)) {
          showError("Enter a valid Pochi phone number.");
          return;
        }
      } else {
        destination = $("lipaAccountNumber")?.value.trim();

        if (!validAccount(destination)) {
          showError("Enter a valid account number.");
          return;
        }
      }

      currentLipaRecipient = {
        type: selectedType,
        method: selectedMethod,
        destination
      };

      const box = $("lipaVerification");
      box.classList.remove("hidden");
      box.innerHTML = `
        <strong>Destination format checked</strong>
        <div>${escapeHTML(destination)}</div>
        <small>Business identity is not yet verified by the server.</small>
      `;

      toast("Destination format checked.");
    });

    $("lipaAmount")?.addEventListener("input", () =>
      updateCostPreview("lipaCostPreview", "lipaSource", "lipaAmount")
    );

    $("lipaSource")?.addEventListener("change", () =>
      updateCostPreview("lipaCostPreview", "lipaSource", "lipaAmount")
    );

    $("lipaPayButton")?.addEventListener("click", () => {
      if (!requireLogin()) return;

      if (!currentLipaRecipient) {
        showError("Verify the payment destination first.");
        return;
      }

      const amount = Number($("lipaAmount")?.value);
      const source = $("lipaSource")?.value;

      if (!validAmount(amount)) {
        showError("Enter a valid amount.");
        return;
      }

      if (currentLipaRecipient.type === "beast") {
        showError(
          "BEAST business payments need the secure server transfer " +
          "endpoint before they can be completed."
        );
        return;
      }

      showError(
        "External Lipa Na payments need a connected payment provider. " +
        "No payment has been sent."
      );
    });
  }

  /* =======================================================
     PIN AUTHORIZATION MODAL
     ======================================================= */

  function openAuthorization(action) {
    if (!requireLogin()) return;

    pendingAction = action;

    if ($("pinPurpose")) {
      $("pinPurpose").textContent =
        `${action.type}: ${money(action.amount)}. Confirm with your PIN.`;
    }

    if ($("authorizationPin")) $("authorizationPin").value = "";
    $("pinError")?.classList.add("hidden");
    $("pinModal")?.classList.remove("hidden");
  }

  function closeAuthorization() {
    $("pinModal")?.classList.add("hidden");
    pendingAction = null;
  }

  function setupAuthorization() {
    $("closePinModal")?.addEventListener("click", closeAuthorization);
    $("cancelPin")?.addEventListener("click", closeAuthorization);

    $("confirmPin")?.addEventListener("click", () => {
      if (!pendingAction || !state.user) {
        closeAuthorization();
        return;
      }

      const pin = $("authorizationPin")?.value || "";

      if (pin !== state.user.pin) {
        $("pinError").textContent = "Incorrect PIN.";
        $("pinError")?.classList.remove("hidden");
        addSecurityEvent("Failed local PIN authorization.");
        return;
      }

      const action = pendingAction;
      closeAuthorization();

      const fee = previewFee(action.source, action.amount);

      const success = completeLocalTransaction({
        ...action,
        fee
      });

      if (success) {
        addSecurityEvent(`Authorized demo transaction: ${action.type}.`);
      }
    });
  }

  /* =======================================================
     RECEIVE / BUYER / DEPOSIT
     ======================================================= */

  function setupReceive() {
    document.querySelectorAll("[data-rtab]").forEach(button => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-rtab]").forEach(item =>
          item.classList.toggle("active", item === button)
        );

        document.querySelectorAll(".receive-tab-panel").forEach(panel =>
          panel.classList.remove("active")
        );

        const panel = $(button.dataset.rtab + "Tab");
        panel?.classList.add("active");
      });
    });

    $("performDepositButton")?.addEventListener("click", () => {
      if (!requireLogin()) return;

      const phone = normalizePhone($("depositPhone")?.value);
      const amount = Number($("depositAmount")?.value);

      if (!validPhone(phone) || !validAmount(amount)) {
        showError("Check the phone number and amount.");
        return;
      }

      showError(
        "External deposits require provider confirmation. " +
        "The demo has not received real funds."
      );
    });

    $("verifyAgentDeposit")?.addEventListener("click", () => {
      const agent = $("agentDepositAgent")?.value.trim();
      const phone = normalizePhone($("agentDepositPhone")?.value);
      const nationalId = $("agentDepositNationalId")?.value.trim();

      verifiedAgentDeposit =
        Boolean(agent && validPhone(phone) && /^\d{5,12}$/.test(nationalId));

      const box = $("agentDepositVerification");
      box?.classList.remove("hidden");

      if (verifiedAgentDeposit) {
        box.innerHTML =
          "<strong>Fields complete — server verification required.</strong>";
      } else {
        box.innerHTML =
          "<strong>Check agent, phone, and National ID fields.</strong>";
      }
    });

    $("agentDepositButton")?.addEventListener("click", () => {
      if (!requireLogin()) return;

      const amount = Number($("agentDepositAmount")?.value);

      if (!verifiedAgentDeposit || !validAmount(amount)) {
        showError("Complete agent verification and enter a valid amount.");
        return;
      }

      showError(
        "Agent deposits require server-side customer and agent verification."
      );
    });

    $("buyerLoginButton")?.addEventListener("click", () => {
      const phone = normalizePhone($("buyerLoginPhone")?.value);
      const nationalId = $("buyerLoginNationalId")?.value.trim();
      const pin = $("buyerLoginPin")?.value || "";

      if (!validPhone(phone) ||
          !/^\d{5,12}$/.test(nationalId) ||
          !/^\d{4}$/.test(pin)) {
        showError("Check buyer phone, National ID, and PIN.");
        return;
      }

      showError(
        "Buyer authentication requires a server account. " +
        "Do not collect another person's credentials on an untrusted device."
      );
    });

    $("buyerChooseSourceButton")?.addEventListener("click", () => {
      if (!selectedBuyerSource) {
        showError("Choose an account first.");
        return;
      }

      showError("Buyer account selection is awaiting server integration.");
    });

    $("buyerConfirmPayButton")?.addEventListener("click", () => {
      showError("Buyer payment requires a verified server-side account.");
    });

    $("copyReceiptButton")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText($("receiptText")?.textContent || "");
        toast("Receipt copied.");
      } catch {
        showError("Unable to copy receipt.");
      }
    });

    $("shareReceiptButton")?.addEventListener("click", async () => {
      const text = $("receiptText")?.textContent || "";

      if (navigator.share) {
        try {
          await navigator.share({ title: "BEAST receipt", text });
        } catch {}
      } else {
        try {
          await navigator.clipboard.writeText(text);
          toast("Receipt copied for sharing.");
        } catch {
          showError("Sharing is not supported here.");
        }
      }
    });
  }

  /* =======================================================
     SOURCE MANAGER / SETTINGS
     ======================================================= */

  function setupSettings() {
    $("themeToggle")?.addEventListener("change", event => {
      state.settings.darkMode = event.target.checked;
      document.body.classList.toggle("light-mode", !event.target.checked);
      localStorage.setItem(THEME_KEY, event.target.checked ? "dark" : "light");
      saveState();
    });

    $("notificationsToggle")?.addEventListener("change", event => {
      state.settings.notifications = event.target.checked;
      saveState();
      toast("Notification preference saved.");
    });

    $("sourceType")?.addEventListener("change", () => {
      const type = $("sourceType").value;
      $("bankSourceFields")?.classList.toggle("hidden", type !== "bank");
      $("cardSourceFields")?.classList.toggle("hidden", type !== "card");
    });

    $("saveSourceButton")?.addEventListener("click", () => {
      if (!requireLogin()) return;

      const type = $("sourceType")?.value;
      const account = $("sourceAccount")?.value.trim();
      const balance = Number($("sourceBalance")?.value || 0);

      if (!SOURCE_NAMES[type] || !Number.isFinite(balance) || balance < 0) {
        showError("Check the source and balance.");
        return;
      }

      if (type !== "wallet" && !account) {
        showError("Enter the account or phone number.");
        return;
      }

      if (type === "wallet") {
        showError("The BEAST Wallet is managed by the account ledger.");
        return;
      }

      state.sources[type] = {
        ...(state.sources[type] || {}),
        account,
        balance,
        enabled: true
      };

      saveState();
      renderEverything();
      toast(`${SOURCE_NAMES[type]} saved in local demo mode.`);
    });

    $("changePinButton")?.addEventListener("click", () => {
      if (!requireLogin()) return;

      const oldPin = $("oldPin")?.value || "";
      const newPin = $("newPin")?.value || "";
      const confirmPin = $("confirmNewPin")?.value || "";

      if (oldPin !== state.user.pin) {
        showError("Current PIN is incorrect.");
        return;
      }

      if (!/^\d{4}$/.test(newPin) || newPin !== confirmPin) {
        showError("Enter matching four-digit new PINs.");
        return;
      }

      state.user.pin = newPin;
      saveState();

      ["oldPin", "newPin", "confirmNewPin"].forEach(id => {
        if ($(id)) $(id).value = "";
      });

      toast("Local demo PIN changed.");
    });

    $("changePasswordButton")?.addEventListener("click", () => {
      if (!requireLogin()) return;

      const oldPassword = $("oldPassword")?.value || "";
      const newPassword = $("newPassword")?.value || "";
      const confirmPassword = $("confirmNewPassword")?.value || "";

      if (oldPassword !== state.user.password) {
        showError("Current password is incorrect.");
        return;
      }

      if (newPassword.length < 6 || newPassword !== confirmPassword) {
        showError("Check the new password and confirmation.");
        return;
      }

      state.user.password = newPassword;
      saveState();

      ["oldPassword", "newPassword", "confirmNewPassword"].forEach(id => {
        if ($(id)) $(id).value = "";
      });

      toast("Local demo password changed.");
    });

    $("resetDemo")?.addEventListener("click", () => {
      if (!confirm("Reset all local BEAST demo data on this device?")) return;

      state = defaultState();
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(BULK_KEY);
      saveState();
      showScreen("welcome");
      toast("Local demo data reset.");
    });

    $("saveReceivingMethodButton")?.addEventListener("click", () => {
      if (!requireLogin()) return;

      const type = $("receivingMethodType")?.value;

      if (!type) {
        showError("Select a receiving method.");
        return;
      }

      state.receivingMethods = state.receivingMethods.filter(
        item => item.type !== type
      );

      state.receivingMethods.push({
        type,
        createdAt: new Date().toISOString()
      });

      saveState();
      renderReceivingMethods();
      toast("Receiving preference saved locally.");
    });
  }

  /* =======================================================
     OWNER WITHDRAWAL SYNCHRONIZATION
     ======================================================= */

  async function syncWithdrawals() {
    if (!isLoggedIn()) return;

    try {
      const response = await fetch(`${API}/api/withdrawals`, {
        method: "GET",
        headers: { Accept: "application/json" }
      });

      if (!response.ok) return;

      const data = await response.json();
      const withdrawals = Array.isArray(data)
        ? data
        : Array.isArray(data.withdrawals)
          ? data.withdrawals : [];

      let changed = false;

      for (const item of withdrawals) {
        const id = String(item.id || item.reference || "");

        if (!id || state.claimedWithdrawals.includes(id)) continue;

        /*
         * This compatibility path only updates the local demo wallet.
         * A production wallet must reconcile a unique, authenticated,
         * server-side ledger entry instead of trusting browser storage.
         */
        const amount = Number(item.amount);

        if (!validAmount(amount)) continue;

        state.sources.wallet.balance =
          Number(state.sources.wallet.balance || 0) + amount;

        state.claimedWithdrawals.push(id);

        addTransaction({
          type: "Owner Withdrawal",
          source: "wallet",
          amount,
          fee: 0,
          totalDeducted: 0,
          description: "Owner-panel wallet credit (demo synchronization)",
          reference: id,
          status: "demo"
        });

        changed = true;
      }

      if (changed) {
        saveState();
        renderEverything();
      }
    } catch (error) {
      console.warn("Withdrawal synchronization unavailable:", error.message);
    }
  }

  /* =======================================================
     HISTORY / STATEMENTS / PROFILE / NOTIFICATIONS
     ======================================================= */

  function renderHistory() {
    const box = $("historyList");
    if (!box) return;

    if (!state.transactions.length) {
      box.innerHTML = '<div class="panel">No transactions yet.</div>';
      return;
    }

    box.innerHTML = state.transactions.map(tx => `
      <div class="list-item">
        <strong>${escapeHTML(tx.type || "Transaction")}</strong>
        <span>${money(tx.amount)}</span>
        <small>${escapeHTML(tx.description || "")}</small>
        <small>${escapeHTML(tx.recipientName || tx.recipient || "")}</small>
        <small>${escapeHTML(new Date(tx.createdAt).toLocaleString())}</small>
        <small>Ref: ${escapeHTML(tx.reference || tx.id || "—")}</small>
        <small>Status: ${escapeHTML(tx.status || "demo")}</small>
      </div>
    `).join("");
  }

  function renderStatements() {
    const summary = $("statementsSummary");
    const list = $("statementsList");

    const count = state.transactions.length;
    const sent = state.transactions
      .filter(tx => ["Send", "Withdraw", "Lipa Na"].includes(tx.type))
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    const fees = state.transactions
      .reduce((sum, tx) => sum + Number(tx.fee || 0), 0);

    if (summary) {
      summary.innerHTML = `
        <div class="list-item"><strong>Total transactions</strong><span>${count}</span></div>
        <div class="list-item"><strong>Outgoing demo amount</strong><span>${money(sent)}</span></div>
        <div class="list-item"><strong>Recorded demo fees</strong><span>${money(fees)}</span></div>
        <div class="list-item"><strong>Displayed balances</strong><span>${money(totalBalance())}</span></div>
      `;
    }

    if (list) {
      list.innerHTML = state.transactions.slice(0, 10).map(tx => `
        <div class="list-item">
          <strong>${escapeHTML(tx.type)}</strong>
          <span>${money(tx.amount)}</span>
          <small>${escapeHTML(new Date(tx.createdAt).toLocaleString())}</small>
        </div>
      `).join("") || "<p>No statement records yet.</p>";
    }
  }

  function renderNotifications() {
    const box = $("notificationList");
    const badge = $("notificationBadge");

    const unread = state.notifications.filter(item => !item.read).length;

    if (badge) badge.textContent = String(unread);

    if (box) {
      box.innerHTML = state.notifications.map(item => `
        <div class="list-item">
          <strong>${escapeHTML(item.title)}</strong>
          <small>${escapeHTML(item.message)}</small>
          <small>${escapeHTML(new Date(item.createdAt).toLocaleString())}</small>
        </div>
      `).join("") || "<p>No notifications.</p>";
    }
  }

  function renderSecurity() {
    const box = $("securityList");
    if (!box) return;

    box.innerHTML = state.securityEvents.map(item => `
      <div class="list-item">
        <strong>${escapeHTML(item.message)}</strong>
        <small>${escapeHTML(new Date(item.createdAt).toLocaleString())}</small>
      </div>
    `).join("") || "<p>No security events.</p>";
  }

  function renderReceivingMethods() {
    const box = $("receivingMethodsList");
    if (!box) return;

    box.innerHTML = state.receivingMethods.map(item => `
      <div class="list-item">
        <strong>${escapeHTML(item.type)}</strong>
        <small>${escapeHTML(new Date(item.createdAt).toLocaleString())}</small>
      </div>
    `).join("") || "<p>No saved receiving methods.</p>";
  }

  function renderProfile() {
    const box = $("profileDetails");
    const user = state.user;

    if (!box) return;

    if (!user) {
      box.innerHTML = "<p>Log in to see your BEAST profile.</p>";
      return;
    }

    box.innerHTML = `
      <div class="list-item"><strong>Name</strong><span>${escapeHTML(user.name)}</span></div>
      <div class="list-item"><strong>Phone</strong><span>${escapeHTML(user.phone)}</span></div>
      <div class="list-item"><strong>BEAST ID</strong><span>${escapeHTML(user.beastId)}</span></div>
      <div class="list-item"><strong>National ID</strong><span>Registered locally</span></div>
      <p class="muted">This profile is currently stored in this browser.</p>
    `;

    if ($("profileTopBeastId")) {
      $("profileTopBeastId").textContent = user.beastId;
    }

    if ($("dashboardBeastId")) {
      $("dashboardBeastId").textContent = user.beastId;
    }

    if ($("welcomeText")) {
      $("welcomeText").textContent = "Welcome, " + user.name;
    }

    if ($("menuUser")) {
      $("menuUser").textContent = user.name;
    }
  }

  function renderSources() {
    const box = $("sourceList");
    if (!box) return;

    box.innerHTML = Object.entries(SOURCE_NAMES).map(([key, name]) => {
      const source = state.sources[key] || {};
      return `
        <div class="list-item">
          <strong>${escapeHTML(name)}</strong>
          <span>${money(source.balance || 0)}</span>
          <small>${source.enabled ? "Enabled" : "Disabled"}</small>
        </div>
      `;
    }).join("");
  }

  function renderEverything() {
    const total = $("totalBalance");
    if (total) total.textContent = money(totalBalance());

    renderProfile();
    renderSources();
    renderHistory();
    renderStatements();
    renderNotifications();
    renderSecurity();
    renderReceivingMethods();
    renderSavedBulkLists();

    if ($("themeToggle")) {
      $("themeToggle").checked = Boolean(state.settings.darkMode);
    }

    if ($("notificationsToggle")) {
      $("notificationsToggle").checked =
        Boolean(state.settings.notifications);
    }

    ["sendSource", "bulkSource", "withdrawSource", "lipaSource"].forEach(id => {
      if ($(id)) sourceOptions($(id), $(id).value || "wallet");
    });

    if ($("sendCostPreview")) {
      updateCostPreview("sendCostPreview", "sendSource", "sendAmount");
    }

    if ($("withdrawCostPreview")) {
      updateCostPreview(
        "withdrawCostPreview",
        "withdrawSource",
        "withdrawAmount",
        "withdraw"
      );
    }
  }

  /* =======================================================
     NAVIGATION
     ======================================================= */

  function setupNavigation() {
    $("menuButton")?.addEventListener("click", openDrawer);
    $("closeMenu")?.addEventListener("click", closeDrawer);
    $("drawerBackdrop")?.addEventListener("click", closeDrawer);

    document.querySelectorAll("[data-menu]").forEach(button => {
      button.addEventListener("click", () => {
        menuNavigate(button.dataset.menu);
      });
    });

    document.querySelectorAll("[data-tab]").forEach(button => {
      button.addEventListener("click", () => {
        menuNavigate(button.dataset.tab);
      });
    });

    $("notificationButton")?.addEventListener("click", () => {
      menuNavigate("notifications");

      state.notifications.forEach(item => {
        item.read = true;
      });

      saveState();
      renderNotifications();
    });

    $("searchForm")?.addEventListener("submit", event => {
      event.preventDefault();

      const query = $("searchInput")?.value.trim();
      if (!query) {
        showError("Enter a search term.");
        return;
      }

      window.open(
        "https://www.google.com/search?q=" + encodeURIComponent(query),
        "_blank",
        "noopener,noreferrer"
      );
    });

    $("premiumBtn")?.addEventListener("click", () => {
      toast("Premium subscription payments are not connected.");
    });

    $("confirmClose")?.addEventListener("click", () => {
      $("confirmModal")?.classList.add("hidden");
    });

    $("confirmNo")?.addEventListener("click", () => {
      $("confirmModal")?.classList.add("hidden");
    });
  }

  /* =======================================================
     SERVER STATUS / ANNOUNCEMENTS
     ======================================================= */

  async function checkServerStatus() {
    try {
      const response = await fetch(`${API}/api/status`, {
        method: "GET",
        headers: { Accept: "application/json" }
      });

      if (!response.ok) return;

      const data = await response.json();

      if (data.announcement) {
        const banner = $("announcementBanner");
        if (banner) {
          banner.textContent = String(data.announcement);
          banner.classList.remove("hidden");
        }
      }
    } catch (error) {
      console.warn("BEAST server status unavailable:", error.message);
    }
  }

  /* =======================================================
     INITIALIZATION
     ======================================================= */

  function initialize() {
    document.querySelectorAll(".app-screen").forEach(screen => {
      screen.classList.add("hidden");
      screen.classList.remove("active");
    });

    setupNavigation();
    setupRegistration();
    setupSend();
    setupBulk();
    setupWithdraw();
    setupLipa();
    setupAuthorization();
    setupReceive();
    setupSettings();

    const theme = localStorage.getItem(THEME_KEY);

    if (theme) {
      state.settings.darkMode = theme === "dark";
    }

    document.body.classList.toggle(
      "light-mode",
      !state.settings.darkMode
    );

    saveState();
    renderEverything();

    if (isLoggedIn()) {
      showScreen("money");
      syncWithdrawals();
    } else {
      showScreen("welcome");
    }

    checkServerStatus();

    console.log("BEAST frontend initialized.");
    console.log("Demo mode: external and remote transfers are not enabled.");
  }

  initialize();
});
