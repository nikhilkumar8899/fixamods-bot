// ═══════════════════════════════════════════════════════════
//   FIXAMODS BOT — User Selected Duration (min/hour/day)
//   Chalao: npm start
// ═══════════════════════════════════════════════════════════

import axios from "axios";
import http from "http";

// ═══════════════════════════════════════════════════════════
//  ⚙️ CONFIG — YAHAN SIRF 2 CHEEZEIN CHANGE KARO
// ═══════════════════════════════════════════════════════════
const DB_URL  = "https://shalukachalu-5596d-default-rtdb.firebaseio.com";
const API_KEY = "fxa_WeUGhFtVFSfmyg7jJTx9qLj8b2TkrCYapT2wUgNF8lcIuuPu";
const PORT    = process.env.PORT || 3000;
// ═══════════════════════════════════════════════════════════

const pad = n => String(n).padStart(2, "0");

/* ─────────────────────────────────────────────
   RANDOM KEY GENERATE
   ───────────────────────────────────────────── */
function randomKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let raw = "";
  for (let i = 0; i < 12; i++) raw += chars[Math.floor(Math.random() * chars.length)];
  return `FIXA-${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8,12)}`;
}

/* ─────────────────────────────────────────────
   VALIDITY CALCULATE — min / hours / days
   ───────────────────────────────────────────── */
function makeValidity(duration, unit) {
  const msMap = {
    minutes: 60000,
    hours:   3600000,
    days:    86400000
  };
  const ms = duration * (msMap[unit] || msMap.days);
  const d = new Date(Date.now() + ms);
  return `${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/* ─────────────────────────────────────────────
   DURATION PARSER — smart detect
   ─────────────────────────────────────────────
   Ye function URL se jo bhi milega usko smart 
   tareeke se parse karega:
   
   ?days=30          → 30 din
   ?hours=24         → 24 ghante
   ?minutes=30       → 30 minute
   ?duration=30&unit=hours  → 30 ghante
   ?plan=30_days     → 30 din (plan string se)
   ───────────────────────────────────────────── */
function parseDuration(params) {
  // 1. Direct duration + unit
  if (params.duration) {
    const duration = parseInt(params.duration);
    const unit = (params.unit || "days").toLowerCase();
    if (["minutes", "hours", "days"].includes(unit) && duration > 0) {
      return { duration, unit };
    }
  }

  // 2. Direct days / hours / minutes
  if (params.days) {
    const d = parseInt(params.days);
    if (d > 0) return { duration: d, unit: "days" };
  }
  if (params.hours) {
    const h = parseInt(params.hours);
    if (h > 0) return { duration: h, unit: "hours" };
  }
  if (params.minutes) {
    const m = parseInt(params.minutes);
    if (m > 0) return { duration: m, unit: "minutes" };
  }

  // 3. Plan string se parse karo: "30_days", "24_hours", "30_min"
  if (params.plan) {
    const plan = String(params.plan).toLowerCase();
    const match = plan.match(/(\d+)\s*(min|minute|minutes|hour|hours|hr|hrs|day|days)/);
    if (match) {
      const num = parseInt(match[1]);
      let unit = match[2];
      if (unit.startsWith("min")) unit = "minutes";
      else if (unit.startsWith("h")) unit = "hours";
      else unit = "days";
      if (num > 0) return { duration: num, unit };
    }
  }

  // 4. Default: 30 days
  return { duration: 30, unit: "days" };
}

/* ─────────────────────────────────────────────
   CREATE KEY — Main function
   ───────────────────────────────────────────── */
async function createKey(username, duration = 30, unit = "days", maxDevices = 1) {
  if (!username) return { success: false, error: "Username required" };
  if (!Number.isFinite(duration) || duration < 1) return { success: false, error: "Invalid duration" };
  if (!["minutes", "hours", "days"].includes(unit)) return { success: false, error: "Invalid unit" };

  const key = randomKey();
  const validity = makeValidity(duration, unit);

  const payload = {
    username,
    status: "ACTIVE",
    keyStatus: "ACTIVE",
    deviceId: "",
    lastLogin: "",
    maxDevices: parseInt(maxDevices) || 1,
    validity,
    validityMode: "absolute",
    createdBy: "bot",
    createdAt: new Date().toISOString()
  };

  try {
    await axios.put(`${DB_URL}/FIXAMODS_USERS/${key}.json`, payload, { timeout: 15000 });
    return { success: true, key, username, validity, duration, unit, maxDevices: payload.maxDevices };
  } catch (err) {
    let msg = err.message;
    if (err.response?.status === 401 || err.response?.status === 403) {
      msg = "Permission denied — Firebase Rules check karo!";
    } else if (err.response) {
      msg = `HTTP ${err.response.status}`;
    }
    return { success: false, error: msg };
  }
}

/* ─────────────────────────────────────────────
   GET KEY — Details dekho
   ───────────────────────────────────────────── */
async function getKey(key) {
  try {
    const r = await axios.get(`${DB_URL}/FIXAMODS_USERS/${key}.json`, { timeout: 10000 });
    if (!r.data) return { success: false, error: "Key not found" };
    return { success: true, data: r.data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/* ═══════════════════════════════════════════════════════════
   HTTP SERVER
   ═══════════════════════════════════════════════════════════ */
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-KEY");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;
  const p = Object.fromEntries(urlObj.searchParams);

  console.log(`[${new Date().toISOString()}] ${req.method} ${pathname}${urlObj.search || ""}`);

  /* ─────────── HEALTH CHECK ─────────── */
  if (pathname === "/" || pathname === "/health") {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: "ok",
      service: "FIXAMODS Bot API",
      uptime: Math.floor(process.uptime()) + "s",
      supportedUnits: ["minutes", "hours", "days"]
    }));
    return;
  }

  /* ─────────── GENERATE KEY ─────────── */
  if (pathname === "/generate") {
    // API key verify (optional security)
    const sentKey = p.adminKey || req.headers["x-api-key"] || "";
    if (sentKey && sentKey !== API_KEY) {
      res.writeHead(401);
      res.end(JSON.stringify({ success: false, error: "Invalid adminKey" }));
      return;
    }

    // Username
    const username = p.username || p.email || p.uid || p.name || "user";

    // ⭐ Duration — user ke choose ke hisaab se
    const { duration, unit } = parseDuration(p);

    // Max devices
    const maxDevices = parseInt(p.maxDevices || "1");

    console.log(`   → Creating key: ${username} | ${duration} ${unit} | maxDevices: ${maxDevices}`);

    const result = await createKey(username, duration, unit, maxDevices);

    if (result.success) {
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        key: result.key,
        username: result.username,
        duration: result.duration,
        unit: result.unit,
        validity: result.validity,
        expiresAt: result.validity,
        maxDevices: result.maxDevices,
        message: `Key valid for ${result.duration} ${result.unit}`
      }));
    } else {
      res.writeHead(400);
      res.end(JSON.stringify({ success: false, error: result.error }));
    }
    return;
  }

  /* ─────────── CHECK KEY ─────────── */
  if (pathname.startsWith("/key/")) {
    const key = decodeURIComponent(pathname.slice(5));
    const r = await getKey(key);
    res.writeHead(r.success ? 200 : 404);
    res.end(JSON.stringify(r));
    return;
  }

  /* ─────────── TEST DURATION PARSER ─────────── */
  if (pathname === "/parse") {
    const parsed = parseDuration(p);
    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      input: p,
      parsed,
      message: `Will create key for ${parsed.duration} ${parsed.unit}`
    }));
    return;
  }

  /* ─────────── 404 ─────────── */
  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║   🚀 FIXAMODS BOT — Server Started          ║`);
  console.log(`╚══════════════════════════════════════════════╝`);
  console.log(`\n🌐 Port: ${PORT}`);
  console.log(`\n📡 Endpoints:`);
  console.log(`   GET  /health`);
  console.log(`   GET  /generate?username=rahul&days=30`);
  console.log(`   GET  /generate?username=rahul&hours=24`);
  console.log(`   GET  /generate?username=rahul&minutes=30`);
  console.log(`   GET  /generate?username=rahul&duration=6&unit=hours`);
  console.log(`   GET  /generate?username=rahul&plan=30_days`);
  console.log(`   GET  /key/:key\n`);
  console.log(`✅ Ready to create keys!\n`);
});