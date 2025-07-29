const admin = require("firebase-admin");
const express = require("express");
const crypto = require("crypto");

const app = express();
const port = process.env.PORT || 10000;

const serviceAccount = require("/etc/secrets/gamestartchung2-firebase-adminsdk-q6v48-ea43bfa520.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://gamestartchung2-default-rtdb.asia-southeast1.firebasedatabase.app/",
});

const db = admin.database();

// 🔁 Theo dõi nhiều MAIN_NODE (bạn thêm bớt ở đây)
const MAIN_NODES = ["StartConGa"];
const ENCKEY_NODE = "ENCKEY";

// ⏱️ Thời gian tự xoá ID (test 10 giây; production: 60 * 60 * 1000)
const DELAY_REMOVE_MS = 10 * 1000;

// ================== Helpers chung ==================
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function formatVNTime(d) {
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}h${m}p`;
}

function parseIDList(str) {
  if (!str || str === "0") return [];
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
function joinOrZero(arr) {
  return arr.length > 0 ? arr.join(",") : "0";
}

// ================ AES helpers (giống Unity C#) ================
function decryptAES(encryptedBase64, keyBase64Str, ivBase64Str) {
  const key = Buffer.from(keyBase64Str, "utf8"); // giống Encoding.UTF8.GetBytes(base64 string)
  const iv = Buffer.from(ivBase64Str, "utf8");
  const ciphertext = Buffer.from(encryptedBase64, "base64");

  const decipher = crypto.createDecipheriv("aes-192-cbc", key, iv);
  let decrypted = decipher.update(ciphertext, undefined, "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function encryptAES(plainText, keyBase64Str, ivBase64Str) {
  const key = Buffer.from(keyBase64Str, "utf8");
  const iv = Buffer.from(ivBase64Str, "utf8");

  const cipher = crypto.createCipheriv("aes-192-cbc", key, iv);
  let encrypted = cipher.update(plainText, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

// ====== Quản lý lịch ID: lưu thời điểm bật & tắt để log danh sách ======
/**
 * metaStore: Map<mainNode, Map<field, Map<id, {activatedAt:Date, expiresAt:Date, timer:Timeout}>>>
 */
const metaStore = new Map();

function ensureNodeMaps(mainNode, field) {
  if (!metaStore.has(mainNode)) metaStore.set(mainNode, new Map());
  const nodeMap = metaStore.get(mainNode);
  if (!nodeMap.has(field)) nodeMap.set(field, new Map());
  return nodeMap.get(field);
}

function printScheduleList(mainNode) {
  const nodeMap = metaStore.get(mainNode);
  if (!nodeMap) return;

  for (const field of ["listIDON", "listIDONC"]) {
    const fieldMap = nodeMap.get(field);
    if (!fieldMap || fieldMap.size === 0) continue;

    log(`📋 [${mainNode}] Danh sách mã đang mở (${field}):`);
    for (const [id, meta] of fieldMap.entries()) {
      const line = `${id} - ${formatVNTime(meta.activatedAt)} - ${formatVNTime(meta.expiresAt)}`;
      log(line);
    }
  }
}

// ========== Cập nhật đúng field trong JSON mã hoá rồi ghi lại ==========
async function updateEncryptedField(mainNode, field, updaterFn) {
  const contentPath = `${mainNode}/SetRuContent`;

  const [encKeySnap, contentSnap] = await Promise.all([
    db.ref(ENCKEY_NODE).once("value"),
    db.ref(contentPath).once("value"),
  ]);

  const encData = encKeySnap.val();
  const encryptedContent = contentSnap.val();

  if (!encData?.key || !encData?.iv || typeof encryptedContent !== "string") {
    throw new Error(`[${mainNode}] Thiếu key/iv hoặc SetRuContent không hợp lệ`);
  }

  const json = JSON.parse(decryptAES(encryptedContent, encData.key, encData.iv));

  const before = json[field] ?? "0";
  const after = updaterFn(before);
  json[field] = after;

  const newEncrypted = encryptAES(JSON.stringify(json), encData.key, encData.iv);
  await db.ref(contentPath).set(newEncrypted);

  return json;
}

// ================= Lên lịch xoá từng ID =================
function scheduleRemove(mainNode, field, id, now = new Date(), delayMs = DELAY_REMOVE_MS) {
  const fieldMap = ensureNodeMaps(mainNode, field);
  if (fieldMap.has(id)) return; // đã có lịch

  const activatedAt = now;
  const expiresAt = new Date(activatedAt.getTime() + delayMs);

  // Lưu meta để in danh sách
  const timer = setTimeout(async () => {
    try {
      const updatedJson = await updateEncryptedField(mainNode, field, (currentStr) => {
        const ids = parseIDList(currentStr);
        const remain = ids.filter((x) => x !== id);
        return joinOrZero(remain);
      });
      log(`🗑️ [${mainNode}] Đã xoá ID '${id}' khỏi ${field}`);
      log(`📤 [${mainNode}] JSON sau khi xoá:`);
      console.dir(updatedJson, { depth: null });
    } catch (err) {
      log(`❌ [${mainNode}] Lỗi khi xoá ID '${id}' khỏi ${field}: ${err.message}`);
    } finally {
      // Xoá meta và in lại danh sách
      fieldMap.delete(id);
      printScheduleList(mainNode);
    }
  }, delayMs);

  fieldMap.set(id, { activatedAt, expiresAt, timer });

  // Log từng ID và in toàn bộ danh sách sau khi thêm
  log(`🕒 [${mainNode}] ID mới: ${id} trong ${field}`);
  log(`    Bật lúc: ${formatVNTime(activatedAt)}`);
  log(`    Sẽ xoá lúc: ${formatVNTime(expiresAt)}`);
  printScheduleList(mainNode);
}

// Huỷ timer cho ID không còn hiện diện trong JSON (đã bị gỡ tay, hoặc thay đổi khác)
function cancelMissingTimersForState(mainNode, data) {
  const liveKeys = new Set();
  for (const field of ["listIDON", "listIDONC"]) {
    parseIDList(data[field] || "0")
      .filter((id) => id !== "0")
      .forEach((id) => liveKeys.add(`${field}:${id}`));
  }

  const nodeMap = metaStore.get(mainNode);
  if (!nodeMap) return;

  for (const field of ["listIDON", "listIDONC"]) {
    const fieldMap = nodeMap.get(field);
    if (!fieldMap) continue;

    for (const [id, meta] of Array.from(fieldMap.entries())) {
      if (!liveKeys.has(`${field}:${id}`)) {
        clearTimeout(meta.timer);
        fieldMap.delete(id);
        log(`⏹️ [${mainNode}] Huỷ timer do ID không còn trong ${field}: ${id}`);
      }
    }
  }

  // In lại danh sách sau khi dọn dẹp
  printScheduleList(mainNode);
}

// ================== Watcher cho từng MAIN_NODE ==================
async function watchMainNode(mainNode) {
  const contentPath = `${mainNode}/SetRuContent`;
  db.ref(contentPath).on("value", async (snap) => {
    const encryptedContent = snap.val();
    if (typeof encryptedContent !== "string") {
      log(`❌ [${mainNode}] SetRuContent không phải chuỗi.`);
      return;
    }

    try {
      const encSnap = await db.ref(ENCKEY_NODE).once("value");
      const encData = encSnap.val();
      if (!encData?.key || !encData?.iv) {
        log(`❌ [${mainNode}] Thiếu key/iv trong ENCKEY.`);
        return;
      }

      const decryptedStr = decryptAES(encryptedContent, encData.key, encData.iv);
      const data = JSON.parse(decryptedStr);

      log(`✅ [${mainNode}] Đã giải mã.`);

      // Lên lịch cho các ID đang hiện diện (mỗi ID 1 timer riêng, không đặt trùng)
      for (const field of ["listIDON", "listIDONC"]) {
        const ids = parseIDList(data[field] || "0");
        ids.filter((id) => id !== "0").forEach((id) => {
          scheduleRemove(mainNode, field, id, new Date());
        });
      }

      // Huỷ timer cho ID đã biến mất
      cancelMissingTimersForState(mainNode, data);
    } catch (e) {
      log(`❌ [${mainNode}] Giải mã thất bại: ${e.message}`);
    }
  });
}

// ================== HTTP & Start ==================
app.get("/", (_, res) => res.send("✅ Firebase Watcher is running..."));
app.get("/healthz", (_, res) => res.send("OK"));

app.listen(port, "0.0.0.0", () => {
  log(`🟢 Server listening on port ${port}`);
  MAIN_NODES.forEach((n) => watchMainNode(n));
});
