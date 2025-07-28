const express = require('express');
const admin = require('firebase-admin');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Khởi tạo Firebase Admin SDK
const serviceAccount = require("/etc/secrets/gamestartchung2-firebase-adminsdk-q6v48-ea43bfa520.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://gamestartchung2-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();
const refPath = "MaiNhoBC2/SetRuContent"; // chỉnh theo DB của bạn

// Hàm kiểm tra và xóa mã hết hạn
async function checkExpiredCodes() {
  const snapshot = await db.ref(refPath).once('value');
  const data = snapshot.val();

  if (!data) return;

  const currentTimestamp = Date.now();
  let list = data.listIDON.split(',');
  let changed = false;

  if (data.ActivatedTime) {
    for (let udid in data.ActivatedTime) {
      let createdAt = data.ActivatedTime[udid];
      if (currentTimestamp - createdAt >= 60 * 60 * 1000) { // sau 1 giờ
        list = list.filter(id => id !== udid);
        delete data.ActivatedTime[udid];
        changed = true;
      }
    }
  }

  if (changed) {
    data.listIDON = list.join(',');
    await db.ref(refPath).set(data);
    console.log("Expired UDIDs removed.");
  }
}

app.get('/', async (req, res) => {
  await checkExpiredCodes();
  res.send("Check complete.");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
