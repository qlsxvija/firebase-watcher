const admin = require("firebase-admin");
const crypto = require("crypto");
const express = require("express");

const app = express();
const port = 10000;

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://gamestartchung2-default-rtdb.asia-southeast1.firebasedatabase.app/",
});

const db = admin.database();

// Cấu hình các đường dẫn node
const MAIN_NODE = "StartConGa";  // ✅ Đổi sang StartConGa
const ENCKEY_NODE = "ENCKEY";
const SET_CONTENT_PATH = `${MAIN_NODE}/SetRuContent`;

// Hàm log có timestamp
function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// Hàm giải mã AES
function decryptAES(encryptedBase64, keyHex, ivHex) {
  const key = Buffer.from(keyHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedBase64, "base64");

  const decipher = crypto.createDecipheriv("aes-192-cbc", key, iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString("utf8");
}

// Theo dõi dữ liệu
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

      const keyHex = Buffer.from(encData.key, "base64").toString("hex");
      const ivHex = Buffer.from(encData.iv, "base64").toString("hex");

      log("✅ AES key và IV đã load.");
      log(`Key: ${keyHex}`);
      log(`IV: ${ivHex}`);

      const decryptedStr = decryptAES(encryptedContent, keyHex, ivHex);
      const data = JSON.parse(decryptedStr);

      log("✅ Đã giải mã thành công StartConGa/SetRuContent.");
      log(data);

      // Thêm xử lý điều kiện
      if (data.DeleteExpiredUDID === true) {
        log("⚠️ Bật chức năng xóa UDID hết hạn...");
        // Gọi hàm xóa UDID tại đây nếu cần
      }

    } catch (error) {
      log(`❌ Giải mã thất bại: ${error}`);
    }
  });
}

// Khởi động server
app.get("/", (req, res) => {
  res.send("✅ Firebase Watcher is running...");
});

app.listen(port, () => {
  log(`🟢 Server listening on port ${port}`);
  refWatcher();
});
