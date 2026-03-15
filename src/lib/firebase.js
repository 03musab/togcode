// src/lib/firebase.js
// Replace these with your actual Firebase config values
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "[GCP_API_KEY]",
  authDomain: "studio-4251301193-d6f62.firebaseapp.com",
  databaseURL: "https://studio-4251301193-d6f62-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "studio-4251301193-d6f62",
  storageBucket: "studio-4251301193-d6f62.firebasestorage.app",
  messagingSenderId: "1049444633288",
  appId: "1:1049444633288:web:72957515579548754068",
  measurementId: "G-07Q19022QY"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
