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

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function decryptAES_NodeCrypto(encryptedBase64, keyBase64Str, ivBase64Str) {
  const key = Buffer.from(keyBase64Str, "utf8");
  const iv = Buffer.from(ivBase64Str, "utf8");
  const ciphertext = Buffer.from(encryptedBase64, "base64");

  const decipher = crypto.createDecipheriv("aes-192-cbc", key, iv);
  let decrypted = decipher.update(ciphertext, undefined, "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function encryptAES_NodeCrypto(plaintext, keyBase64Str, ivBase64Str) {
  const key = Buffer.from(keyBase64Str, "utf8");
  const iv = Buffer.from(ivBase64Str, "utf8");

  const cipher = crypto.createCipheriv("aes-192-cbc", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

function parseIDList(str) {
  return str
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

function scheduleIDRemoval(ids, field) {
  const path = `${MAIN_NODE}/SetRuContent`;

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
          data[field] = updatedIDsArray.length > 0 ? updatedIDsArray.join(",") : "0";

          const newEncrypted = encryptAES_NodeCrypto(
            JSON.stringify(data),
            encData.key,
            encData.iv
          );

          await db.ref(path).set(newEncrypted);
          log(`🗑️ Đã xóa ID '${id}' khỏi ${field}`);
          log("📤 JSON sau khi xóa ID:");
          console.dir(data, { depth: null }); // Hiển thị toàn bộ JSON sau cập nhật
        }
      } catch (err) {
        log(`❌ Lỗi khi xóa ID '${id}' khỏi ${field}: ${err.message}`);
      }
    }, 60 * 1000); // ⏱️ 10 giây thử nghiệm
  });
}


let previousListIDON = "";
let previousListIDONC = "";

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

      const decryptedStr = decryptAES_NodeCrypto(
        encryptedContent,
        encData.key,
        encData.iv
      );

      const data = JSON.parse(decryptedStr);

      log("✅ Đã giải mã thành công.");
      log(JSON.stringify(data, null, 2));

      // Theo dõi listIDON
      if (data.listIDON !== previousListIDON) {
        const newIDs = parseIDList(data.listIDON);
        const oldIDs = parseIDList(previousListIDON);
        const addedIDs = newIDs.filter((id) => !oldIDs.includes(id));
        if (addedIDs.length > 0) {
          log(`🔔 listIDON có ID mới: ${addedIDs.join(", ")}`);
          scheduleIDRemoval(addedIDs, "listIDON");
        }
        previousListIDON = data.listIDON;
      }

      // Theo dõi listIDONC
      if (data.listIDONC !== previousListIDONC) {
        const newIDs = parseIDList(data.listIDONC);
        const oldIDs = parseIDList(previousListIDONC);
        const addedIDs = newIDs.filter((id) => !oldIDs.includes(id));
        if (addedIDs.length > 0) {
          log(`🔔 listIDONC có ID mới: ${addedIDs.join(", ")}`);
          scheduleIDRemoval(addedIDs, "listIDONC");
        }
        previousListIDONC = data.listIDONC;
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
