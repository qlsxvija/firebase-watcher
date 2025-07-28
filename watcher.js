const express = require("express");
const admin = require("firebase-admin");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// === Firebase ===
const serviceAccount = require("/etc/secrets/gamestartchung2-firebase-adminsdk-q6v48-ea43bfa520.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://gamestartchung2-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();
const BASE_NODE = "StartConGa";
const ref = db.ref(`${BASE_NODE}/SetRuContent`);
const keyRef = db.ref(`${BASE_NODE}/ENCKEY`);

let prevListIDON = "";
let prevListIDONC = "";

// === Lắng nghe thay đổi dữ liệu mã hóa ===
ref.on("value", async (snapshot) => {
  const encrypted = snapshot.val();
  if (!encrypted) return;

  // Lấy key và iv từ ENCKEY
  const encKeySnap = await keyRef.once("value");
  const { key, iv } = encKeySnap.val() || {};
  if (!key || !iv) return console.error("Missing AES key or IV");

  try {
    // Giải mã AES-256-CBC
    const decrypted = decryptAES(encrypted, key, iv);
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
  } catch (e) {
    console.error("Giải mã hoặc xử lý JSON thất bại:", e.message);
  }
});

// === Giải mã AES-256-CBC ===
function decryptAES(encryptedText, base64Key, base64IV) {
  const key = Buffer.from(base64Key, "base64");
  const iv = Buffer.from(base64IV, "base64");
  const encrypted = Buffer.from(encryptedText, "base64");

  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}

function getNewIDs(current, prev) {
  const currArr = current.split(",").filter(Boolean);
  const prevArr = prev.split(",").filter(Boolean);
  return currArr.filter(id => !prevArr.includes(id));
}

// === Giữ server sống trên Render ===
app.get("/", (req, res) => res.send("AES Watcher running"));
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
