const admin = require("firebase-admin");
const express = require("express");
const crypto = require("crypto"); // ĐÚNG: Node.js crypto

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

// Giải mã AES-192-CBC giống Unity C#
// Lưu ý: keyBase64Str và ivBase64Str là chuỗi base64, nhưng không decode → chỉ dùng utf8 bytes của chúng
function decryptAES_NodeCrypto(encryptedBase64, keyBase64Str, ivBase64Str) {
  const key = Buffer.from(keyBase64Str, "utf8"); // giống Encoding.UTF8.GetBytes(base64 string)
  const iv = Buffer.from(ivBase64Str, "utf8");

  const ciphertext = Buffer.from(encryptedBase64, "base64");

  const decipher = crypto.createDecipheriv("aes-192-cbc", key, iv);
  let decrypted = decipher.update(ciphertext, undefined, "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

async function refWatcher() {
  const ref = db.ref(SET_CONTENT_PATH);
  ref.on("value", async (snapshot) => {
    const encryptedContent = snapshot.val();
    if (!encryptedContent || typeof encryptedContent !== "string") {
      log("❌ Không tìm thấy encrypted content.");
      return;
    }

    // 👉 In nội dung đã mã hóa (base64)
    log(`🔐 Encrypted (base64): ${encryptedContent}`);

    try {
      const encSnap = await db.ref(ENCKEY_NODE).once("value");
      const encData = encSnap.val();

      if (!encData || !encData.key || !encData.iv) {
        log("❌ Thiếu key hoặc iv trong ENCKEY node.");
        return;
      }

      // 👉 In key và IV (dạng chuỗi)
      log(`🗝️  Key (utf8 string): ${encData.key}`);
      log(`🧂 IV (utf8 string): ${encData.iv}`);

      // 👉 Thực hiện giải mã
      const decryptedStr = decryptAES_NodeCrypto(encryptedContent, encData.key, encData.iv);

      // 👉 In kết quả rõ ràng
      log("✅ Đã giải mã thành công.");
      log(JSON.stringify(JSON.parse(decryptedStr), null, 2));

      const data = JSON.parse(decryptedStr);

      if (data.DeleteExpiredUDID === true) {
        log("⚠️ Bật chức năng xóa UDID hết hạn...");
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
