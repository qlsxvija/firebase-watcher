const admin = require("firebase-admin");
const serviceAccount = require("/etc/secrets/gamestartchung2-firebase-adminsdk-q6v48-ea43bfa520.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://gamestartchung2-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();
const ref = db.ref("MaiNhoBC2/SetRuContent");

let prevListIDON = "";
let prevListIDONC = "";

ref.on("value", async (snapshot) => {
  const data = snapshot.val();
  if (!data) return;

  const now = Math.floor(Date.now() / 1000);
  const currentON = data.listIDON || "";
  const currentONC = data.listIDONC || "";

  const newON = getNewIDs(currentON, prevListIDON);
  const newONC = getNewIDs(currentONC, prevListIDONC);

  for (const id of newON) {
    await db.ref(`MaiNhoBC2/ActivatedTime/listIDON/${id}`).set(now);
    console.log(`[listIDON] Added ${id} at ${now}`);
  }

  for (const id of newONC) {
    await db.ref(`MaiNhoBC2/ActivatedTime/listIDONC/${id}`).set(now);
    console.log(`[listIDONC] Added ${id} at ${now}`);
  }

  prevListIDON = currentON;
  prevListIDONC = currentONC;
});

function getNewIDs(current, prev) {
  const currArr = current.split(",").filter(Boolean);
  const prevArr = prev.split(",").filter(Boolean);
  return currArr.filter(id => !prevArr.includes(id));
}
