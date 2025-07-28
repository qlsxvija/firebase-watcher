const admin = require("firebase-admin");
const crypto = require("crypto");
const express = require("express");

const serviceAccount = require("/etc/secrets/gamestartchung2-firebase-adminsdk-q6v48-ea43bfa520.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://gamestartchung2-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

const MAIN_NODE = "StartConGa"; // ✅ dễ đổi
const SET_CONTENT_PATH = `${MAIN_NODE}/SetRuContent`;
const ENCKEY_PATH = `ENCKEY`; // ✅ nằm ngang hàng

let prevListIDON = "";
let prevListIDONC = "";

// ✅ Tạo server xem log online
const app = express();
const port = 10000;
let latestLog = [];

app.get("/", (req, res) => {
  res.send(`<pre>${latestLog.join("\n")}</pre>`);
});
app.listen(port, () => {
  log(`🟢 Server listening on port ${port}`);
});

// ✅ Ghi log ra cả console và web
function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  latestLog.push(line);
  if (latestLog.length > 100) latestLog.shift(); // giữ lại 100 dòng
}

// ✅ Giải mã AES-192
function decryptAES(encryptedBase64, keyHex, ivHex) {
  const key = Buffer.from(keyHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedBase64, "base64");

  const decipher = crypto.createDecipheriv("aes-192-cbc", key, iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString("utf8");
}

// ✅ Lắng nghe thay đổi
refWatcher();

function refWatcher() {
  const ref = db.ref(SET_CONTENT_PATH);
  ref.on("value", async (snapshot) => {
    const encryptedContent = snapshot.val();
    if (!encryptedContent || typeof encryptedContent !== "string") {
      log("❌ Dữ liệu mã hóa không hợp lệ.");
      return;
    }

    try {
      const encRef = db.ref(ENCKEY);
      const encSnap = await encRef.once("value");
      const encData = encSnap.val();

      if (!encData || !encData.key || !encData.iv) {
        log("❌ Thiếu key hoặc iv trong ENCKEY node.");
        return;
      }

      const keyHex = Buffer.from(encData.key, "base64").toString("hex");
      const ivHex = Buffer.from(encData.iv, "base64").toString("hex");

      log(`✅ AES key và IV đã load.`);
      log(`Key: ${keyHex}`);
      log(`IV: ${ivHex}`);

      const decryptedStr = decryptAES(encryptedContent, keyHex, ivHex);
      const data = JSON.parse(decryptedStr);
      log("✅ Đã giải mã thành công SetRuContent.");

      // xử lý logic
      const now = Math.floor(Date.now() / 1000);
      const currentON = data.listIDON || "";
      const currentONC = data.listIDONC || "";

      const newON = getNewIDs(currentON, prevListIDON);
      const newONC = getNewIDs(currentONC, prevListIDONC);

      for (const id of newON) {
        await db.ref(`${MAIN_NODE}/ActivatedTime/listIDON/${id}`).set(now);
        log(`🟩 listIDON thêm: ${id} lúc ${now}`);
      }

      for (const id of newONC) {
        await db.ref(`${MAIN_NODE}/ActivatedTime/listIDONC/${id}`).set(now);
        log(`🟦 listIDONC thêm: ${id} lúc ${now}`);
      }

      prevListIDON = currentON;
      prevListIDONC = currentONC;

    } catch (error) {
      log(`❌ Giải mã thất bại: ${error}`);
    }
  });
}

// ✅ Hàm so sánh danh sách ID mới
function getNewIDs(current, prev) {
  const currArr = current.split(",").filter(Boolean);
  const prevArr = prev.split(",").filter(Boolean);
  return currArr.filter(id => !prevArr.includes(id));
}
