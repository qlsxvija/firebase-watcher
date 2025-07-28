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

// ✅ AES-128-CBC giải mã với base64 key và iv
function decryptAESBase64(encryptedBase64, base64Key, base64IV) {
  try {
    const key = Buffer.from(base64Key, "base64");
    const iv = Buffer.from(base64IV, "base64");
        const keyBuffer = Buffer.from("CkDw0wZfMTiLqEi7azBwuw==", "base64");
    const ivBuffer  = Buffer.from("BDV7JMdu2i+MPrFF", "base64");
    
    console.log("Key bytes:", keyBuffer.length);
    console.log("IV bytes :", ivBuffer.length);
    if (key.length !== 16 || iv.length !== 16) {
      throw new Error("Key hoặc IV không đúng 16 byte cho AES-128.");
    }

    const encrypted = Buffer.from(encryptedBase64, "base64");
    const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString("utf8");
  } catch (err) {
    log(`❌ Giải mã thất bại: ${err.message}`);
    return null;
  }
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

      log("✅ AES key và IV đã load.");
      log(`Key base64: ${encData.key}`);
      log(`IV base64: ${encData.iv}`);

      const decryptedStr = decryptAESBase64(encryptedContent, encData.key, encData.iv);
      if (!decryptedStr) return;

      const data = JSON.parse(decryptedStr);

      log("✅ Đã giải mã thành công StartConGa/SetRuContent.");
      log(data);

      if (data.DeleteExpiredUDID === true) {
        log("⚠️ Bật chức năng xóa UDID hết hạn...");
        // 👉 Gọi hàm xóa tại đây nếu cần
      } else {
        log("ℹ️ Chức năng xóa UDID đang tắt.");
      }

    } catch (error) {
      log(`❌ Lỗi xử lý dữ liệu: ${error.message}`);
    }
  });
}

// Server HTTP đơn giản để theo dõi
app.get("/", (req, res) => {
  res.send("✅ Firebase AES Watcher is running...");
});

app.listen(port, () => {
  log(`🟢 Server listening on port ${port}`);
  refWatcher();
});
