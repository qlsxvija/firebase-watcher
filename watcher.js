const admin = require("firebase-admin");
const crypto = require("crypto");
const express = require("express");
const app = express();

// 🔧 Biến cấu hình chính
const ROOT_NODE = "StartConGa"; // Bạn chỉ cần sửa chỗ này nếu đổi node gốc
const PORT = process.env.PORT || 3000;

// 📁 Tải file key dịch vụ Firebase
const serviceAccount = require("/etc/secrets/gamestartchung2-firebase-adminsdk-q6v48-ea43bfa520.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://gamestartchung2-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();
const ref = db.ref(`${ROOT_NODE}/SetRuContent`);
const keyRef = db.ref(`${ROOT_NODE}/ENCKEY`);

let aesKey = null;
let aesIV = null;
let prevListIDON = "";
let prevListIDONC = "";

// 📥 Lấy KEY và IV từ ENCKEY
keyRef.on("value", (snapshot) => {
  const encData = snapshot.val();
  if (encData && encData.key && encData.iv) {
    try {
      aesKey = Buffer.from(encData.key, "base64");
      aesIV = Buffer.from(encData.iv, "base64");

      if (aesKey.length !== 24) throw new Error("AES-192 yêu cầu key 24 bytes");
      if (aesIV.length !== 16) throw new Error("AES yêu cầu IV 16 bytes");

      console.log("✅ Đã tải AES key và IV thành công");
      console.log("🔑 Key (hex):", aesKey.toString("hex"));
      console.log("🔐 IV  (hex):", aesIV.toString("hex"));
    } catch (e) {
      console.error("❌ Lỗi khi xử lý AES key/iv:", e.message);
    }
  } else {
    console.error("❌ Thiếu key hoặc iv trong ENCKEY node.");
  }
});

// 👀 Theo dõi thay đổi SetRuContent
ref.on("value", async (snapshot) => {
  const encrypted = snapshot.val();
  if (!encrypted) return;

  if (!aesKey || !aesIV) {
    console.error("❌ Giải mã thất bại: Thiếu AES key hoặc IV");
    return;
  }

  try {
    const decrypted = decryptAES192(JSON.stringify(encrypted), aesKey, aesIV);
    const data = JSON.parse(decrypted);

    const now = Math.floor(Date.now() / 1000);
    const currentON = data.listIDON || "";
    const currentONC = data.listIDONC || "";

    const newON = getNewIDs(currentON, prevListIDON);
    const newONC = getNewIDs(currentONC, prevListIDONC);

    for (const id of newON) {
      await db.ref(`${ROOT_NODE}/ActivatedTime/listIDON/${id}`).set(now);
      console.log(`[listIDON] ➕ Thêm ${id} lúc ${now}`);
    }

    for (const id of newONC) {
      await db.ref(`${ROOT_NODE}/ActivatedTime/listIDONC/${id}`).set(now);
      console.log(`[listIDONC] ➕ Thêm ${id} lúc ${now}`);
    }

    prevListIDON = currentON;
    prevListIDONC = currentONC;
  } catch (e) {
    console.error("❌ Giải mã thất bại:", e.message);
  }
});

// 🔓 Hàm giải mã AES-192-CBC
function decryptAES192(encryptedText, key, iv) {
  const decipher = crypto.createDecipheriv("aes-192-cbc", key, iv);
  let decrypted = decipher.update(encryptedText, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// 🧮 Hàm so sánh ID mới
function getNewIDs(current, prev) {
  const currArr = current.split(",").filter(Boolean);
  const prevArr = prev.split(",").filter(Boolean);
  return currArr.filter(id => !prevArr.includes(id));
}

// 🌐 Server kiểm tra hoạt động
app.get("/", (req, res) => {
  res.send("👀 Firebase Watcher đang chạy!");
});
app.listen(PORT, () => {
  console.log(`🚀 Watcher đang chạy tại cổng ${PORT}`);
});
