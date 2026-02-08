// app/firebaseConfig.ts

import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  Auth,
} from 'firebase/auth';
// @ts-ignore - getReactNativePersistence is available in firebase/auth/react-native
import { getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase configuration from environment variables
// In production, these should be set via EAS secrets or .env files
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBAC0q10qWH-_v1j9KOpnCqTQnXP7EZBwM',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'frogwatch-backend.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'frogwatch-backend',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'frogwatch-backend.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '1066546787031',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:1066546787031:web:026e93e5c6050910a9b692',
};

// Initialize Firebase app
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Initialize Auth with React Native persistence using AsyncStorage
// This ensures auth state persists between app restarts
function initializeFirebaseAuth(): Auth {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error: any) {
    // If auth is already initialized (e.g., hot reload), use getAuth instead
    if (error.code === 'auth/already-initialized') {
      return getAuth(app);
    }
    throw error;
  }
}

export const auth: Auth = initializeFirebaseAuth();
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');

export default app;
