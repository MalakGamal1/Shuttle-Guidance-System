import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, child } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyCQ0bUhA_viLpyl7fPM6beCZvdqNN2_-XM",
  authDomain: "shuttle-guidance-system.firebaseapp.com",
  projectId: "shuttle-guidance-system",
  storageBucket: "shuttle-guidance-system.firebasestorage.app",
  messagingSenderId: "797180860066",
  appId: "1:797180860066:web:1075653b1f836f1a08e9fb",
  databaseURL: "https://shuttle-guidance-system-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function getShuttles() {
  const dbRef = ref(db);
  const snapshot = await get(child(dbRef, 'shuttles'));
  if (snapshot.exists()) {
    console.log(JSON.stringify(snapshot.val(), null, 2));
  } else {
    console.log("No shuttles found");
  }
}

getShuttles();
