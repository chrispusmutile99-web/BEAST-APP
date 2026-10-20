/* =========================================================
   BEAST SERVER (DATABASE + DARAJA + INTERNAL TRANSFERS)
========================================================= */

const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");
const https = require("https");

const PORT = process.env.PORT || 3000;

// ==========================================
// ⚠️ DARAJA API CREDENTIALS (REPLACE THESE)
// Get these from https://developer.safaricom.co.ke
// ==========================================
const DARAJA_CONSUMER_KEY = "YOUR_CONSUMER_KEY";
const DARAJA_CONSUMER_SECRET = "YOUR_CONSUMER_SECRET";
const DARAJA_PASSKEY = "YOUR_PASSKEY";
const DARAJA_SHORTCODE = "174379"; // Sandbox Shortcode
const DARAJA_CALLBACK_URL = "https://beast-server-8u92.onrender.com/api/daraja/callback";

// ---------- 1. DATABASE SETUP ----------
const db = new DatabaseSync('./beast.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    beastId TEXT UNIQUE,
    name TEXT,
    phone TEXT UNIQUE,
    nationalId TEXT,
    pinHash TEXT,
    pinSalt TEXT,
    passwordHash TEXT,
    passwordSalt TEXT,
    balance REAL DEFAULT 0,
    createdAt TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT UNIQUE,
    beastId TEXT,
    type TEXT,
    amount REAL,
    fee REAL,
    beastCut REAL,
    providerCost REAL,
    totalDeducted REAL,
    source TEXT,
    recipient TEXT,
    recipientName TEXT,
    description TEXT,
    status TEXT,
    createdAt TEXT
  )
`);
console.log("Connected to SQLite database.");

// ---------- 2. OWNER KEY SETUP ----------
let OWNER_KEY = process.env.OWNER_KEY || "";
if (!OWNER_KEY) {
  try { OWNER_KEY = fs.readFileSync(__dirname + "/.ownerkey", "utf8").trim(); } catch (e) {}
}

let announcement = null;
let connectedCount = 0;
let stkRequests = {}; // Track pending Daraja requests

function getBody(req, callback) {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    try { callback(null, JSON.parse(body)); } 
    catch (e) { callback(e, null); }
  });
}

function generateBeastId() {
  return `BEAST-${Math.floor(100000 + Math.random() * 900000)}`;
}

// ---------- 3. API ROUTES ----------
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.url === "/api/status" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", connected: connectedCount, announcement }));
    return;
  }

  if (req.url === "/api/register" && req.method === "POST") {
    getBody(req, (err, data) => {
      if (err) { res.writeHead(400); res.end(JSON.stringify({ error: "Bad JSON" })); return; }
      const { name, phone, nationalId, pinHash, pinSalt, passwordHash, passwordSalt } = data;
      const createdAt = new Date().toISOString();
      const beastId = generateBeastId();

      try {
        const stmt = db.prepare(`INSERT INTO users (beastId, name, phone, nationalId, pinHash, pinSalt, passwordHash, passwordSalt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        stmt.run(beastId, name, phone, nationalId, pinHash, pinSalt, passwordHash, passwordSalt, createdAt);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, beastId: beastId }));
      } catch (e) {
        res.writeHead(400); res.end(JSON.stringify({ error: "Phone number already registered." }));
      }
    });
    return;
  }

  if (req.url === "/api/login" && req.method === "POST") {
    getBody(req, (err, data) => {
      if (err) { res.writeHead(400); res.end(JSON.stringify({ error: "Bad JSON" })); return; }
      const { phone, passwordHash } = data;
      try {
        const stmt = db.prepare(`SELECT * FROM users WHERE phone = ?`);
        const user = stmt.get(phone);
        if (!user) { res.writeHead(400); res.end(JSON.stringify({ error: "Phone number not found." })); return; }
        if (user.passwordHash !== passwordHash) { res.writeHead(401); res.end(JSON.stringify({ error: "Incorrect password." })); return; }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, user: { beastId: user.beastId, name: user.name, phone: user.phone, nationalId: user.nationalId, pinHash: user.pinHash, pinSalt: user.pinSalt } }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: "Server error." })); }
    });
    return;
  }

  // ----- INTERNAL BEAST TRANSFER -----
  if (req.url === "/api/send-internal" && req.method === "POST") {
    getBody(req, (err, data) => {
      if (err) { res.writeHead(400); res.end(JSON.stringify({ error: "Bad JSON" })); return; }
      const { fromBeastId, toBeastId, amount, reference } = data;
      const createdAt = new Date().toISOString();

      const recipient = db.prepare(`SELECT * FROM users WHERE beastId = ?`).get(toBeastId);
      if (!recipient) { res.writeHead(400); res.end(JSON.stringify({ error: "Recipient BEAST ID not found." })); return; }
      const sender = db.prepare(`SELECT * FROM users WHERE beastId = ?`).get(fromBeastId);
      if (sender.balance < amount) { res.writeHead(400); res.end(JSON.stringify({ error: "Insufficient BEAST Wallet balance." })); return; }

      try {
        db.prepare(`UPDATE users SET balance = balance - ? WHERE beastId = ?`).run(amount, fromBeastId);
        db.prepare(`UPDATE users SET balance = balance + ? WHERE beastId = ?`).run(amount, toBeastId);
        const stmt = db.prepare(`INSERT INTO transactions (reference, beastId, type, amount, fee, beastCut, providerCost, totalDeducted, source, recipient, recipientName, description, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        stmt.run(reference, fromBeastId, "Send", amount, 0, 0, 0, amount, "wallet", toBeastId, recipient.name, `BEAST transfer to ${recipient.name}`, "completed", createdAt);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, recipientName: recipient.name }));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: "Database error." })); }
    });
    return;
  }

  // ----- RECORD TRANSACTION -----
  if (req.url === "/api/transaction" && req.method === "POST") {
    getBody(req, (err, data) => {
      if (err) { res.writeHead(400); res.end(JSON.stringify({ error: "Bad JSON" })); return; }
      const { reference, beastId, type, amount, fee, beastCut, providerCost, totalDeducted, source, recipient, recipientName, description } = data;
      const createdAt = new Date().toISOString();
      try {
        const stmt = db.prepare(`INSERT INTO transactions (reference, beastId, type, amount, fee, beastCut, providerCost, totalDeducted, source, recipient, recipientName, description, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        stmt.run(reference, beastId, type, amount, fee, beastCut, providerCost, totalDeducted, source, recipient, recipientName, description, "completed", createdAt);
        res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: "Duplicate ref." })); }
    });
    return;
  }

  if (req.url.startsWith("/api/transactions/") && req.method === "GET") {
    const beastId = req.url.split("/")[3];
    try {
      const stmt = db.prepare(`SELECT * FROM transactions WHERE beastId = ? ORDER BY id DESC`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, transactions: stmt.all(beastId) }));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: "DB Error" })); }
    return;
  }

  // ----- DARAJA STK PUSH -----
  if (req.url === "/api/daraja/stkpush" && req.method === "POST") {
    getBody(req, (err, data) => {
      if (err) { res.writeHead(400); res.end(JSON.stringify({ error: "Bad JSON" })); return; }
      const { phone, amount, accountRef } = data;

      // Format phone to 2547XXXXXXXX
      let formattedPhone = phone.replace(/^0/, '254').replace(/^\+/, '');

      // If using dummy credentials, simulate success for demo
      if (DARAJA_CONSUMER_KEY === "YOUR_CONSUMER_KEY") {
        const mockRef = `SIM-${Date.now()}`;
        stkRequests[mockRef] = { phone, amount, accountRef, status: "success" };
        
        // Simulate the callback arriving after 4 seconds
        setTimeout(() => {
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: "payment_success", reference: mockRef, amount }));
            }
          });
        }, 4000);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, CheckoutRequestID: mockRef, message: "Simulated STK Push sent." }));
        return;
      }

      // REAL DARAJA LOGIC (Requires credentials)
      const auth = Buffer.from(`${DARAJA_CONSUMER_KEY}:${DARAJA_CONSUMER_SECRET}`).toString('base64');
      const options = {
        hostname: 'sandbox.safaricom.co.ke',
        path: '/oauth/v1/generate?grant_type=client_credentials',
        method: 'GET',
        headers: { Authorization: `Basic ${auth}` }
      };

      const authReq = https.request(options, (authRes) => {
        let body = '';
        authRes.on('data', d => body += d);
        authRes.on('end', () => {
          const token = JSON.parse(body).access_token;
          const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
          const password = Buffer.from(`${DARAJA_SHORTCODE}${DARAJA_PASSKEY}${timestamp}`).toString('base64');

          const stkBody = JSON.stringify({
            BusinessShortCode: DARAJA_SHORTCODE,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: amount,
            PartyA: formattedPhone,
            PartyB: DARAJA_SHORTCODE,
            PhoneNumber: formattedPhone,
            CallBackURL: DARAJA_CALLBACK_URL,
            AccountReference: accountRef,
            TransactionDesc: "BEAST Payment"
          });

          const stkOptions = {
            hostname: 'sandbox.safaricom.co.ke',
            path: '/mpesa/stkpush/v1/processrequest',
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': stkBody.length }
          };

          const stkReq = https.request(stkOptions, (stkRes) => {
            let stkBodyRes = '';
            stkRes.on('data', d => stkBodyRes += d);
            stkRes.on('end', () => {
              const parsed = JSON.parse(stkBodyRes);
              stkRequests[parsed.CheckoutRequestID] = { phone, amount, accountRef, status: "pending" };
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: true, CheckoutRequestID: parsed.CheckoutRequestID, message: parsed.CustomerMessage }));
            });
          });
          stkReq.write(stkBody);
          stkReq.end();
        });
      });
      authReq.end();
    });
    return;
  }

  // ----- DARAJA CALLBACK -----
  if (req.url === "/api/daraja/callback" && req.method === "POST") {
    getBody(req, (err, data) => {
      if (!err && data.Body && data.Body.stkCallback) {
        const callback = data.Body.stkCallback;
        const reqId = callback.CheckoutRequestID;
        if (callback.ResultCode === 0) {
          if (stkRequests[reqId]) {
            stkRequests[reqId].status = "success";
            wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: "payment_success", reference: reqId, amount: stkRequests[reqId].amount }));
              }
            });
          }
        }
      }
      res.writeHead(200); res.end("OK");
    });
    return;
  }

  // ----- OWNER ROUTES -----
  if (req.url === "/api/owner/publish" && req.method === "POST") {
    getBody(req, (err, data) => {
      if (err || data.key !== OWNER_KEY) { res.writeHead(401); res.end(JSON.stringify({ error: "Unauthorized" })); return; }
      announcement = String(data.message || "").trim();
      wss.clients.forEach((client) => { if (client.readyState === WebSocket.OPEN) { client.send(JSON.stringify({ type: "announcement", message: announcement })); } });
      res.writeHead(200); res.end(JSON.stringify({ ok: true, sent: connectedCount }));
    });
    return;
  }

  if (req.url === "/api/owner/withdraw" && req.method === "POST") {
    getBody(req, (err, data) => {
      if (err || data.key !== OWNER_KEY) { res.writeHead(401); res.end(JSON.stringify({ error: "Unauthorized" })); return; }
      const amount = Number(data.amount);
      const reference = `WD-${Date.now().toString().slice(-6)}`;
      wss.clients.forEach((client) => { if (client.readyState === WebSocket.OPEN) { client.send(JSON.stringify({ type: "wallet_credit", amount, reference })); } });
      res.writeHead(200); res.end(JSON.stringify({ ok: true, reference }));
    });
    return;
  }

  if (req.url === "/owner") {
    try {
      const html = fs.readFileSync(__dirname + "/owner.html", "utf8");
      res.writeHead(200, { "Content-Type": "text/html" }); res.end(html);
    } catch (e) { res.writeHead(200); res.end("<h1>Owner panel missing</h1>"); }
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("BEAST API is running.");
});

const wss = new WebSocket.Server({ server });
wss.on("connection", (socket) => {
  connectedCount++;
  if (announcement) socket.send(JSON.stringify({ type: "announcement", message: announcement }));
  socket.on("close", () => { connectedCount--; });
});

server.listen(PORT, () => { console.log("Server on port " + PORT); });
