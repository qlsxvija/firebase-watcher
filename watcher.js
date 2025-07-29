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

// 🔁 Danh sách các MAIN_NODE cần theo dõi
const MAIN_NODES = ["StartConGa", "StartConGa"];
const ENCKEY_NODE = "ENCKEY";

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ✅ Giải mã AES (192-bit, CBC) giống Unity/C#
function decryptAES_NodeCrypto(encryptedBase64, keyBase64Str, ivBase64Str) {
  const key = Buffer.from(keyBase64Str, "utf8");
  const iv = Buffer.from(ivBase64Str, "utf8");
  const ciphertext = Buffer.from(encryptedBase64, "base64");

  const decipher = crypto.createDecipheriv("aes-192-cbc", key, iv);
  let decrypted = decipher.update(ciphertext, undefined, "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ✅ Mã hóa AES (để ghi đè lại Firebase sau khi xóa)
function encryptAES_NodeCrypto(plainText, keyBase64Str, ivBase64Str) {
  const key = Buffer.from(keyBase64Str, "utf8");
  const iv = Buffer.from(ivBase64Str, "utf8");

  const cipher = crypto.createCipheriv("aes-192-cbc", key, iv);
  let encrypted = cipher.update(plainText, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

// ✅ Tách chuỗi ID → mảng số
function parseIDList(str) {
  if (!str || str === "0") return [];
  return str
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "")
    .map((id) => parseInt(id));
}

// ✅ Lập lịch xóa ID sau 10 giây
function scheduleIDRemoval(ids, field, mainNode) {
  const path = `${mainNode}/SetRuContent`;

  ids.forEach((id) => {
    setTimeout(async () => {
      try {
        const snapshot = await db.ref(path).once("value");
        const encryptedContent = snapshot.val();
        if (!encryptedContent || typeof encryptedContent !== "string") return;

        const encSnap = await db.ref(ENCKEY_NODE).once("value");
        const encData = encSnap.val();
        const decryptedStr = decryptAES_NodeCrypto(
          encryptedContent,
          encData.key,
          encData.iv
        );

        const data = JSON.parse(decryptedStr);
        const currentIDs = parseIDList(data[field]);

        if (currentIDs.includes(id)) {
          const updatedIDsArray = currentIDs.filter((x) => x !== id);
          data[field] =
            updatedIDsArray.length > 0 ? updatedIDsArray.join(",") : "0";

          const newEncrypted = encryptAES_NodeCrypto(
            JSON.stringify(data),
            encData.key,
            encData.iv
          );

          await db.ref(path).set(newEncrypted);
          log(`🗑️ [${mainNode}] Đã xóa ID '${id}' khỏi ${field}`);
          log(`📤 [${mainNode}] JSON sau khi xóa ID:`);
          console.dir(data, { depth: null });
        }
      } catch (err) {
        log(`❌ [${mainNode}] Lỗi khi xóa ID '${id}' khỏi ${field}: ${err.message}`);
      }
    }, 10 * 60 * 1000); // 10 giây thử nghiệm
  });
}

// ✅ Theo dõi thay đổi từ Firebase
async function refWatcher() {
  for (const mainNode of MAIN_NODES) {
    const ref = db.ref(`${mainNode}/SetRuContent`);
    ref.on("value", async (snapshot) => {
      const encryptedContent = snapshot.val();
      if (!encryptedContent || typeof encryptedContent !== "string") {
        log(`❌ [${mainNode}] Không tìm thấy encrypted content.`);
        return;
      }

      try {
        const encSnap = await db.ref(ENCKEY_NODE).once("value");
        const encData = encSnap.val();
        if (!encData || !encData.key || !encData.iv) {
          log(`❌ [${mainNode}] Thiếu key hoặc iv trong ENCKEY node.`);
          return;
        }

        const decryptedStr = decryptAES_NodeCrypto(
          encryptedContent,
          encData.key,
          encData.iv
        );
        const data = JSON.parse(decryptedStr);

        log(`✅ [${mainNode}] Đã giải mã thành công.`);
        console.dir(data, { depth: null });

        if (data.listIDON || data.listIDONC) {
          const idsOn = parseIDList(data.listIDON);
          const idsOnC = parseIDList(data.listIDONC);

          if (idsOn.length > 0) scheduleIDRemoval(idsOn, "listIDON", mainNode);
          if (idsOnC.length > 0) scheduleIDRemoval(idsOnC, "listIDONC", mainNode);
        }
      } catch (error) {
        log(`❌ [${mainNode}] Giải mã thất bại: ${error.message}`);
      }
    });
  }
}

// ✅ Khởi động Express
app.get("/", (req, res) => {
  res.send("✅ Firebase Watcher is running...");
});

app.listen(port, () => {
  log(`🟢 Server listening on port ${port}`);
  refWatcher();
});
