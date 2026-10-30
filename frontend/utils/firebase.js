import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signOut } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: 'sutrai.firebaseapp.com',
  projectId: 'sutrai',
  storageBucket: 'sutrai.firebasestorage.app',
  messagingSenderId: '487515600312',
  appId: '1:487515600312:web:6435abbcd38617c28c8b4d',
}

// Guests can explore before the Firebase client is initialized.
export function getFirebaseClient() {
  if (!firebaseConfig.apiKey) throw new Error('Google sign-in is not configured.')
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
  return { auth: getAuth(app), googleProvider: new GoogleAuthProvider() }
}

export async function signOutFirebase() {
  if (getApps().length) await signOut(getAuth(getApp()))
}
