import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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
const db = getFirestore(app);

async function getShuttles() {
  const q = query(collection(db, 'shuttles'), where('isActive', '==', true));
  const snapshot = await getDocs(q);
  const shuttles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  console.log(JSON.stringify(shuttles, null, 2));
}

getShuttles();
