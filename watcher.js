const express = require("express");
const admin = require("firebase-admin");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

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

let latestKey = "";
let latestIV = "";
let lastDecryptionError = "";
let lastDecrypted = "";

// === Theo dõi thay đổi SetRuContent ===
ref.on("value", async (snapshot) => {
  const encrypted = snapshot.val();
  if (!encrypted) return;

  try {
    const encKeySnap = await keyRef.once("value");
    const { key, iv } = encKeySnap.val() || {};
    latestKey = key || "(empty)";
    latestIV = iv || "(empty)";

    if (!key || !iv) throw new Error("Missing AES key or IV");

    const decrypted = decryptAES(encrypted, key, iv);
    lastDecrypted = decrypted;
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
    lastDecryptionError = "";
  } catch (e) {
    lastDecryptionError = e.message;
    console.error("Giải mã thất bại:", e);
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

// === Đường dẫn gốc check sống ===
app.get("/", (req, res) => {
  res.send("Watcher is running.");
});

// === Debug hiển thị key, iv, lỗi, json giải mã ===
app.get("/debug", (req, res) => {
  res.send(`
    <h2>Firebase AES Watcher Debug</h2>
    <pre>
<b>KEY (base64):</b> ${latestKey}
<b>IV  (base64):</b> ${latestIV}

<b>Decryption Error:</b> ${lastDecryptionError || "None"}

<b>Last Decrypted JSON:</b>
${lastDecrypted || "(empty)"}
    </pre>
  `);
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
