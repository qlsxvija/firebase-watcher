const admin = require("firebase-admin");
const crypto = require("crypto");
const express = require("express");

const serviceAccount = require("/etc/secrets/gamestartchung2-firebase-adminsdk-q6v48-ea43bfa520.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://gamestartchung2-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

// ✅ Cấu hình tên node gốc dễ thay đổi
const ROOT_NODE = "StartConGa";

// ✅ Tạo express để hiển thị log ra trình duyệt
const app = express();
let lastLog = "";

app.get("/", (req, res) => {
  res.send(`<pre>${lastLog}</pre>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🟢 Server listening on port ${PORT}`);
});

// ✅ Đọc ENCKEY nằm **ngang hàng** với MaiNhoBC2
const keyRef = db.ref("ENCKEY");
let aesKey = null;
let aesIv = null;

keyRef.on("value", (snapshot) => {
  const encData = snapshot.val();
  if (!encData || !encData.key || !encData.iv) {
    lastLog = "❌ Thiếu key hoặc iv trong ENCKEY node.\n";
    console.error(lastLog);
    return;
  }

  try {
    aesKey = Buffer.from(encData.key, "base64");
    aesIv = Buffer.from(encData.iv, "base64");
    lastLog = `✅ AES key và IV đã load.\nKey: ${aesKey.toString("hex")}\nIV: ${aesIv.toString("hex")}`;
    console.log(lastLog);
  } catch (err) {
    lastLog = `❌ Giải mã thất bại khi load key/iv: ${err}`;
    console.error(lastLog);
  }
});

// ✅ Theo dõi thay đổi node mã hóa
const ref = db.ref(`${ROOT_NODE}/SetRuContent`);
let prevListIDON = "";
let prevListIDONC = "";

ref.on("value", async (snapshot) => {
  const encryptedData = snapshot.val();
  if (!encryptedData || !encryptedData.encrypted) {
    lastLog = "❌ Không tìm thấy encrypted content.";
    return;
  }

  if (!aesKey || !aesIv) {
    lastLog = "❌ Giải mã thất bại: Thiếu AES key hoặc IV";
    console.error(lastLog);
    return;
  }

  let decrypted = null;
  try {
    const decipher = crypto.createDecipheriv("aes-192-cbc", aesKey, aesIv);
    let decryptedText = decipher.update(encryptedData.encrypted, "base64", "utf8");
    decryptedText += decipher.final("utf8");
    decrypted = JSON.parse(decryptedText);
    lastLog = `✅ Giải mã thành công: ${decryptedText}`;
  } catch (err) {
    lastLog = `❌ Giải mã thất bại: ${err}`;
    console.error(lastLog);
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const currentON = decrypted.listIDON || "";
  const currentONC = decrypted.listIDONC || "";

  const newON = getNewIDs(currentON, prevListIDON);
  const newONC = getNewIDs(currentONC, prevListIDONC);

  for (const id of newON) {
    await db.ref(`${ROOT_NODE}/ActivatedTime/listIDON/${id}`).set(now);
    lastLog += `\n[listIDON] ➕ Thêm ${id} lúc ${now}`;
  }

  for (const id of newONC) {
    await db.ref(`${ROOT_NODE}/ActivatedTime/listIDONC/${id}`).set(now);
    lastLog += `\n[listIDONC] ➕ Thêm ${id} lúc ${now}`;
  }

  prevListIDON = currentON;
  prevListIDONC = currentONC;
});

function getNewIDs(current, prev) {
  const currArr = current.split(",").filter(Boolean);
  const prevArr = prev.split(",").filter(Boolean);
  return currArr.filter(id => !prevArr.includes(id));
}
