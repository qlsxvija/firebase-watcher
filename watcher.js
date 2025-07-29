const admin = require("firebase-admin");
const express = require("express");
const crypto = require("crypto");

const app = express();
const port = 10000;

const serviceAccount = require("/etc/secrets/gamestartchung2-firebase-adminsdk-q6v48-ea43bfa520.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://gamestartchung2-default-rtdb.asia-southeast1.firebasedatabase.app/",
});

const db = admin.database();
const MAIN_NODE = "StartConGa";
const ENCKEY_NODE = "ENCKEY";
const SET_CONTENT_PATH = `${MAIN_NODE}/SetRuContent`;

// ⚙️ Cấu hình delay xoá (dùng 10 giây test, đổi 1h khi thật)
const DELAY_REMOVE_MS = 60 * 1000;

const idTimers = new Map();

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function decryptAES(encryptedBase64, keyBase64Str, ivBase64Str) {
  const key = Buffer.from(keyBase64Str, "utf8");
  const iv = Buffer.from(ivBase64Str, "utf8");
  const ciphertext = Buffer.from(encryptedBase64, "base64");

  const decipher = crypto.createDecipheriv("aes-192-cbc", key, iv);
  let decrypted = decipher.update(ciphertext, undefined, "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function scheduleRemove(id, field, data, delay = DELAY_REMOVE_MS) {
  const timerKey = `${field}_${id}`;
  if (idTimers.has(timerKey)) return;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + delay);

  log(`🕒 Phát hiện ID mới: ${id} trong ${field}`);
  log(`   Bật lúc: ${now.toLocaleTimeString()}`);
  log(`   Sẽ xoá lúc: ${expiresAt.toLocaleTimeString()}`);

  const timer = setTimeout(async () => {
    const ids = data[field]
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x && x !== id);
    const updated = ids.length > 0 ? ids.join(",") : "0";

    await db.ref(SET_CONTENT_PATH).child(field).set(updated);
    log(`🗑️ Đã xóa ID ${id} khỏi ${field}`);
    log(`🧾 JSON sau khi xóa: ${field} = ${updated}`);

    idTimers.delete(timerKey);
  }, delay);

  idTimers.set(timerKey, timer);
}

async function refWatcher() {
  const ref = db.ref(SET_CONTENT_PATH);
  ref.on("value", async (snapshot) => {
    const encryptedContent = snapshot.val();
    if (!encryptedContent || typeof encryptedContent !== "string") {
      log("❌ Không tìm thấy encrypted content.");
      return;
    }

    try {
      const encSnap = await db.ref(ENCKEY_NODE).once("value");
      const encData = encSnap.val();
      if (!encData?.key || !encData?.iv) {
        log("❌ Thiếu key hoặc iv trong ENCKEY node.");
        return;
      }

      const decryptedStr = decryptAES(encryptedContent, encData.key, encData.iv);
      const data = JSON.parse(decryptedStr);

      log("✅ Đã giải mã thành công.");
      console.log(JSON.stringify(data, null, 2));

      for (const field of ["listIDON", "listIDONC"]) {
        const raw = data[field] || "";
        const ids = raw.split(",").map((x) => x.trim()).filter(Boolean);
        ids.forEach((id) => {
          if (id !== "0") {
            scheduleRemove(id, field, data);
          }
        });
      }

    } catch (error) {
      log(`❌ Giải mã thất bại: ${error.message}`);
    }
  });
}

app.get("/", (req, res) => {
  res.send("✅ Firebase Watcher is running...");
});

app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});

app.listen(port, () => {
  log(`🟢 Server listening on port ${port}`);
  refWatcher();
});
