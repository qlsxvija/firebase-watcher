const admin = require("firebase-admin");
const crypto = require("crypto");
const express = require("express");

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

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// 👉 Chuẩn hóa IV: nếu thiếu thì pad \x00, nếu thừa thì cắt
function normalizeIV(ivBuffer) {
  if (ivBuffer.length < 16) {
    const pad = Buffer.alloc(16 - ivBuffer.length, 0); // pad bằng null bytes
    return Buffer.concat([ivBuffer, pad]);
  } else if (ivBuffer.length > 16) {
    return ivBuffer.slice(0, 16);
  }
  return ivBuffer;
}

// ✅ Giải mã AES-192-CBC
function decryptAES(encryptedBase64, keyBuffer, ivBuffer) {
  const encrypted = Buffer.from(encryptedBase64, "base64");
  const decipher = crypto.createDecipheriv("aes-192-cbc", keyBuffer, ivBuffer);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString("utf8");
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

      if (!encData || !encData.key || !encData.iv) {
        log("❌ Thiếu key hoặc iv trong ENCKEY node.");
        return;
      }

      const keyBuffer = Buffer.from(encData.key, "base64"); // 24 bytes cho AES-192
      const ivRaw = Buffer.from(encData.iv, "base64");      // có thể không đủ 16 bytes
      const ivBuffer = normalizeIV(ivRaw);

      log("✅ AES key và IV đã load.");
      log(`Key (${keyBuffer.length} bytes): ${keyBuffer.toString("hex")}`);
      log(`IV  (${ivBuffer.length} bytes): ${ivBuffer.toString("hex")}`);

      if (keyBuffer.length !== 24) {
        log("❌ Key không đúng độ dài 24 bytes cho AES-192.");
        return;
      }

      const decryptedStr = decryptAES(encryptedContent, keyBuffer, ivBuffer);
      const data = JSON.parse(decryptedStr);

      log("✅ Đã giải mã thành công StartConGa/SetRuContent.");
      log(data);

      if (data.DeleteExpiredUDID === true) {
        log("⚠️ Bật chức năng xóa UDID hết hạn...");
        // Xử lý tại đây nếu cần
      } else {
        log("ℹ️ Chức năng xóa UDID đang tắt.");
      }

    } catch (error) {
      log(`❌ Giải mã thất bại: ${error.message}`);
    }
  });
}

app.get("/", (req, res) => {
  res.send("✅ Firebase Watcher is running...");
});

app.listen(port, () => {
  log(`🟢 Server listening on port ${port}`);
  refWatcher();
});
