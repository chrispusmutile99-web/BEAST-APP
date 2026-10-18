/* =========================================================
   BEAST SERVER — Fully Corrected Backend
========================================================= */

const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const Database = require('better-sqlite3');

const PORT = 3000;
const APP_KEY = "beast-9Kx-mP4-vR2-zW7-abc"; // Must match app.js

// Load Owner Key
let OWNER_KEY = process.env.OWNER_KEY || "";
if (!OWNER_KEY) {
  try { OWNER_KEY = fs.readFileSync(__dirname + "/.ownerkey", "utf8").trim(); } catch (e) {}
}
console.log("Owner key ready: " + (OWNER_KEY ? "yes" : "no"));

/* ================= DATABASE SETUP ================= */
const db = new Database('./beast.db');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS revenue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL,
      source TEXT,
      type TEXT,
      date TEXT
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      label TEXT,
      amount REAL,
      date TEXT
    );
    CREATE TABLE IF NOT EXISTS withdrawals (
      id TEXT PRIMARY KEY,
      amount REAL,
      note TEXT,
      date TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      senderId TEXT,
      receiverId TEXT,
      text TEXT,
      date TEXT
    );
  `);
  console.log("Database tables ready.");
} catch (err) {
  console.error("Database error:", err.message);
}

let announcement = null;
let connectedCount = 0;

/* ================= HELPERS ================= */
function jsonResponse(res, code, data){
  res.writeHead(code, { 
    "Content-Type": "application/json", 
    "Access-Control-Allow-Origin": "*", 
    "Access-Control-Allow-Headers": "Content-Type", 
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS" 
  });
  res.end(JSON.stringify(data));
}

function readBody(req, callback){ 
  let body = ""; 
  req.on("data", chunk => { body += chunk; }); 
  req.on("end", () => callback(body)); 
}

function parseJSON(body){ 
  try { return JSON.parse(body); } catch(e){ return null; } 
}

function checkAppKey(data){ 
  return data && data.appKey === APP_KEY; 
}

function checkOwnerKey(data){ 
  return data && data.key === OWNER_KEY; 
}

/* ================= HTTP SERVER ================= */
const server = http.createServer((req, res) => {
  
  // CORS Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, { 
      "Access-Control-Allow-Origin": "*", 
      "Access-Control-Allow-Headers": "Content-Type", 
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS" 
    });
    res.end();
    return;
  }

  /* ---------- API: status ---------- */
  if (req.url === "/api/status") {
    return jsonResponse(res, 200, { status: "ok", service: "BEAST", connected: connectedCount, announcement });
  }

  /* ---------- API: revenue record ---------- */
  if (req.url === "/api/revenue/record" && req.method === "POST") {
    return readBody(req, body => {
      const data = parseJSON(body);
      if (!checkAppKey(data)) return jsonResponse(res, 401, { error: "Invalid app key" });
      
      const cut = Number(data.beastCut || 0);
      const source = String(data.source || "other");
      if (cut <= 0) return jsonResponse(res, 200, { ok: true, added: 0 });

      try {
        const stmt = db.prepare("INSERT INTO revenue (amount, source, type, date) VALUES (?, ?, ?, ?)");
        stmt.run(cut, source, data.type || "transaction", new Date().toISOString());
        return jsonResponse(res, 200, { ok: true, added: cut });
      } catch (err) {
        return jsonResponse(res, 500, { error: err.message });
      }
    });
  }

  /* ---------- API: withdrawals (App sync) ---------- */
  if (req.url === "/api/withdrawals" && req.method === "GET") {
    try {
      const rows = db.prepare("SELECT * FROM withdrawals ORDER BY date DESC").all();
      return jsonResponse(res, 200, { withdrawals: rows });
    } catch (err) {
      return jsonResponse(res, 500, { error: err.message });
    }
  }

  /* ---------- API: Save Chat Message ---------- */
  if (req.url === "/api/chat/send" && req.method === "POST") {
    return readBody(req, body => {
      const data = parseJSON(body);
      // Security: Require APP_KEY so random people can't spam
      if (!checkAppKey(data)) return jsonResponse(res, 401, { error: "Unauthorized" });
      if (!data.senderId || !data.receiverId || !data.text) return jsonResponse(res, 400, { error: "Missing data" });
      
      try {
        const stmt = db.prepare("INSERT INTO messages (senderId, receiverId, text, date) VALUES (?, ?, ?, ?)");
        stmt.run(data.senderId, data.receiverId, data.text, new Date().toISOString());
        return jsonResponse(res, 200, { ok: true });
      } catch (err) {
        return jsonResponse(res, 500, { error: err.message });
      }
    });
  }

  /* ---------- API: Get Chat History ---------- */
  if (req.url === "/api/chat/history" && req.method === "POST") {
    return readBody(req, body => {
      const data = parseJSON(body);
      if (!checkAppKey(data)) return jsonResponse(res, 401, { error: "Unauthorized" });
      if (!data.user1 || !data.user2) return jsonResponse(res, 400, { error: "Missing data" });

      try {
        const stmt = db.prepare(`
          SELECT * FROM messages 
          WHERE (senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?) 
          ORDER BY date ASC
        `);
        const rows = stmt.all(data.user1, data.user2, data.user2, data.user1);
        return jsonResponse(res, 200, { messages: rows });
      } catch (err) {
        return jsonResponse(res, 500, { error: err.message });
      }
    });
  }

  /* ---------- API: owner dashboard ---------- */
  if (req.url === "/api/owner/dashboard" && req.method === "POST") {
    return readBody(req, body => {
      const data = parseJSON(body);
      if (!checkOwnerKey(data)) return jsonResponse(res, 401, { error: "Invalid owner key" });

      try {
        const revRow = db.prepare("SELECT SUM(amount) as total FROM revenue").get();
        const revHistory = db.prepare("SELECT * FROM revenue ORDER BY date DESC LIMIT 20").all();
        const revBySource = db.prepare("SELECT source, SUM(amount) as total FROM revenue GROUP BY source").all();
        const expRows = db.prepare("SELECT * FROM expenses ORDER BY date DESC").all();
        const wdRows = db.prepare("SELECT * FROM withdrawals ORDER BY date DESC").all();
        
        const revenueTotal = revRow.total || 0;
        const expensesTotal = expRows.reduce((s, e) => s + Number(e.amount || 0), 0);
        const withdrawnTotal = wdRows.reduce((s, w) => s + Number(w.amount || 0), 0);

        const bySource = { mpesa: 0, tkash: 0, airtel: 0, bank: 0, card: 0, wallet: 0, other: 0 };
        revBySource.forEach(r => { bySource[r.source] = r.total; });

        return jsonResponse(res, 200, {
          ok: true,
          revenue: { total: revenueTotal, bySource: bySource, transactionCount: revHistory.length, history: revHistory },
          expenses: expRows,
          withdrawals: wdRows,
          pnl: { 
            revenue: revenueTotal, 
            expenses: expensesTotal, 
            withdrawn: withdrawnTotal, 
            available: Math.max(0, revenueTotal - expensesTotal - withdrawnTotal) // Prevent negative available
          },
          connected: connectedCount,
          announcement
        });
      } catch (err) {
        return jsonResponse(res, 500, { error: err.message });
      }
    });
  }

  /* ---------- API: expenses add/delete ---------- */
  if (req.url === "/api/expenses/add" && req.method === "POST") {
    return readBody(req, body => {
      const data = parseJSON(body);
      if (!checkOwnerKey(data)) return jsonResponse(res, 401, { error: "Invalid owner key" });
      const amount = Number(data.amount || 0);
      if (amount <= 0) return jsonResponse(res, 400, { error: "Invalid amount" });
      
      try {
        const stmt = db.prepare("INSERT INTO expenses (type, label, amount, date) VALUES (?, ?, ?, ?)");
        stmt.run(data.type || "other", data.label || "", amount, new Date().toISOString());
        return jsonResponse(res, 200, { ok: true });
      } catch (err) {
        return jsonResponse(res, 500, { error: err.message });
      }
    });
  }

  if (req.url === "/api/expenses/delete" && req.method === "POST") {
    return readBody(req, body => {
      const data = parseJSON(body);
      if (!checkOwnerKey(data)) return jsonResponse(res, 401, { error: "Invalid owner key" });
      
      try {
        db.prepare("DELETE FROM expenses WHERE id = ?").run(data.id);
        return jsonResponse(res, 200, { ok: true });
      } catch (err) {
        return jsonResponse(res, 500, { error: err.message });
      }
    });
  }

  /* ---------- API: withdraw ---------- */
  if (req.url === "/api/withdraw" && req.method === "POST") {
    return readBody(req, body => {
      const data = parseJSON(body);
      if (!checkOwnerKey(data)) return jsonResponse(res, 401, { error: "Invalid owner key" });

      try {
        const revRow = db.prepare("SELECT SUM(amount) as total FROM revenue").get();
        const expRow = db.prepare("SELECT SUM(amount) as total FROM expenses").get();
        const wdRow = db.prepare("SELECT SUM(amount) as total FROM withdrawals").get();
        
        const available = (revRow.total || 0) - (expRow.total || 0) - (wdRow.total || 0);
        if (available <= 0) return jsonResponse(res, 400, { error: "Nothing to withdraw" });

        const id = Date.now().toString();
        const note = String(data.note || "Monthly withdrawal");
        const date = new Date().toISOString();

        const stmt = db.prepare("INSERT INTO withdrawals (id, amount, note, date) VALUES (?, ?, ?, ?)");
        stmt.run(id, available, note, date);
        
        return jsonResponse(res, 200, { ok: true, withdrawal: { id, amount: available, note, date } });
      } catch (err) {
        return jsonResponse(res, 500, { error: err.message });
      }
    });
  }

  /* ---------- API: owner publish/clear ---------- */
  if (req.url === "/api/owner/publish" && req.method === "POST") {
    return readBody(req, body => {
      const data = parseJSON(body);
      if (!checkOwnerKey(data)) return jsonResponse(res, 401, { error: "Invalid owner key" });
      const text = String(data.message || "").trim();
      if (!text) return jsonResponse(res, 400, { error: "Empty message" });
      
      announcement = text;
      wss.clients.forEach(client => { 
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: "announcement", message: text })); 
      });
      return jsonResponse(res, 200, { ok: true, sent: connectedCount });
    });
  }

  if (req.url === "/api/owner/clear" && req.method === "POST") {
    return readBody(req, body => {
      const data = parseJSON(body);
      if (!checkOwnerKey(data)) return jsonResponse(res, 401, { error: "Invalid owner key" });
      
      announcement = null;
      wss.clients.forEach(client => { 
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: "announcement", message: null })); 
      });
      return jsonResponse(res, 200, { ok: true });
    });
  }

  /* ---------- Static: owner panel & test ---------- */
  if (req.url === "/owner") {
    try { 
      const html = fs.readFileSync(__dirname + "/owner.html", "utf8"); 
      res.writeHead(200, { "Content-Type": "text/html" }); 
      return res.end(html); 
    } catch (e) { 
      res.writeHead(200, { "Content-Type": "text/html" }); 
      return res.end("<h1>Owner panel not found</h1>"); 
    }
  }
  
  try { 
    const html = fs.readFileSync(__dirname + "/test.html", "utf8"); 
    res.writeHead(200, { "Content-Type": "text/html" }); 
    res.end(html); 
  } catch (e) { 
    res.writeHead(200, { "Content-Type": "text/html" }); 
    res.end("<h1>BEAST API is running</h1>"); 
  }
});

/* ================= WEBSOCKET ================= */
const wss = new WebSocket.Server({ server });
const activeClients = new Map();

wss.on("connection", socket => {
  connectedCount++;
  
  if (announcement) socket.send(JSON.stringify({ type: "announcement", message: announcement }));

  socket.on("message", raw => {
    try {
      const data = JSON.parse(raw.toString());
      
      // Identify user to route messages
      if (data.type === "identify" && data.beastId) {
        activeClients.set(data.beastId, socket);
      }

      // Route real-time chat
      if (data.type === "chat" && data.receiverId) {
        const receiverSocket = activeClients.get(data.receiverId);
        if (receiverSocket && receiverSocket.readyState === WebSocket.OPEN) {
          receiverSocket.send(JSON.stringify({
            type: "chat", 
            senderId: data.senderId, 
            senderName: data.senderName,
            text: data.text, 
            date: data.date
          }));
        }
      }
    } catch(e) {}
  });

  socket.on("close", () => {
    connectedCount--;
    for (const [beastId, savedSocket] of activeClients.entries()) {
      if (savedSocket === socket) { activeClients.delete(beastId); break; }
    }
  });
});

/* ================= START ================= */
server.listen(PORT, () => { 
  console.log("Server on port " + PORT); 
  console.log("Owner panel: http://localhost:" + PORT + "/owner"); 
});
