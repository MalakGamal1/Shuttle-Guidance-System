import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyCQ0bUhA_viLpyl7fPM6beCZvdqNN2_-XM",
  authDomain: "shuttle-guidance-system.firebaseapp.com",
  projectId: "shuttle-guidance-system",
  storageBucket: "shuttle-guidance-system.firebasestorage.app",
  messagingSenderId: "797180860066",
  appId: "1:797180860066:web:1075653b1f836f1a08e9fb"
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

console.log("Fetching administrators...")
const snapshot = await getDocs(collection(db, 'admins'))
snapshot.forEach(doc => {
  console.log(doc.id, doc.data())
})
