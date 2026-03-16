import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCajj2Ye2ZTuZRD25dIxuwdMH2ve4NZ0Pg",
  authDomain: "sistema-tv-f237e.firebaseapp.com",
  projectId: "sistema-tv-f237e",
  storageBucket: "sistema-tv-f237e.firebasestorage.app",
  messagingSenderId: "675706289247",
  appId: "1:675706289247:web:054bba4e18dd541ff62fea"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
