const admin = require("firebase-admin");
const CryptoJS = require("crypto-js");

// Đường dẫn đến file JSON key Firebase
const serviceAccount = require("/etc/secrets/gamestartchung2-firebase-adminsdk-q6v48-ea43bfa520.json");
// ✅ Node gốc bạn muốn theo dõi → chỉ cần sửa chỗ này
const BASE_NODE = "StartConGa";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
databaseURL: "https://gamestartchung2-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

// Đường dẫn key và dữ liệu mã hóa
const keyRef = db.ref(`${BASE_NODE}/ENCKEY`);
const ref = db.ref(`${BASE_NODE}/SetRuContent`);

let AES_KEY = null;
let AES_IV = null;

// Lắng nghe key AES từ Firebase
keyRef.on("value", (snapshot) => {
  const data = snapshot.val();
  if (data?.key && data?.iv) {
    AES_KEY = CryptoJS.enc.Utf8.parse(data.key);
    AES_IV = CryptoJS.enc.Utf8.parse(data.iv);
    console.log("🔐 AES key/iv loaded");
  } else {
    console.warn("⚠️ ENCKEY không hợp lệ");
  }
});

// Hàm giải mã AES
function decryptAES(ciphertext, key, iv) {
  const bytes = CryptoJS.AES.decrypt(ciphertext, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  return bytes.toString(CryptoJS.enc.Utf8);
}

let prevListIDON = "";
let prevListIDONC = "";

// Theo dõi thay đổi nội dung mã hóa
ref.on("value", async (snapshot) => {
  const encrypted = snapshot.val();
  if (!encrypted || !AES_KEY || !AES_IV) return;

  try {
    const decrypted = decryptAES(encrypted, AES_KEY, AES_IV);
    const data = JSON.parse(decrypted);

    const now = Math.floor(Date.now() / 1000);
    const currentON = data.listIDON || "";
    const currentONC = data.listIDONC || "";

    const newON = getNewIDs(currentON, prevListIDON);
    const newONC = getNewIDs(currentONC, prevListIDONC);

    for (const id of newON) {
      await db.ref(`${BASE_NODE}/ActivatedTime/listIDON/${id}`).set(now);
      console.log(`[listIDON] Added ${id} at ${now}`);
    }

    for (const id of newONC) {
      await db.ref(`${BASE_NODE}/ActivatedTime/listIDONC/${id}`).set(now);
      console.log(`[listIDONC] Added ${id} at ${now}`);
    }

    prevListIDON = currentON;
    prevListIDONC = currentONC;
  } catch (err) {
    console.error("❌ Lỗi giải mã hoặc sai JSON:", err.message);
  }
});

function getNewIDs(current, prev) {
  const currArr = current.split(",").filter(Boolean);
  const prevArr = prev.split(",").filter(Boolean);
  return currArr.filter(id => !prevArr.includes(id));
}
