const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Manually load .env.local
try {
  const dotenvContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
  dotenvContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value;
    }
  });
} catch (e) {
  console.error('Error loading .env.local:', e.message);
}

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing Firebase Admin environment variables.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, '\n'),
  }),
});

const db = admin.firestore();

async function run() {
  try {
    console.log('--- SHUTTLES ---');
    const shuttlesSnap = await db.collection('shuttles').get();
    const shuttles = [];
    shuttlesSnap.forEach(doc => {
      shuttles.push({ id: doc.id, ...doc.data() });
      console.log(`Shuttle ID: ${doc.id}, Plate: ${doc.data().plateNumber}, Capacity: ${doc.data().capacity}`);
    });

    console.log('\n--- TRIPS ---');
    const tripsSnap = await db.collection('trips').limit(10).get();
    for (const doc of tripsSnap.docs) {
      const trip = doc.data();
      console.log(`Trip ID: ${doc.id}, ShuttleId: ${trip.shuttleId}, plateNumber: ${trip.plateNumber || trip.shuttleNumber}, Status: ${trip.status}, totalPassengers: ${trip.totalPassengers}`);
      
      // Fetch station history for this trip
      const stationsSnap = await doc.ref.collection('station_history').get();
      console.log(`  Station History (${stationsSnap.size} visits):`);
      stationsSnap.forEach(sDoc => {
        const s = sDoc.data();
        console.log(`    Station: ${s.stationName}, Arrived: ${s.arrivalTime?.toDate?.() || s.arrivalTime}, Boarded: ${s.passengersBoarded}, Dropped: ${s.passengersDropped}`);
      });
    }
  } catch (error) {
    console.error('Error querying Firestore:', error);
  }
}

run();
