import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInAnonymously,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import type { JournalEntry, ChatMessage, SustainabilitySummary, ImpactWallData, ImpactAdjustment, PlasticScanRecord } from '../types';
import appConfig from '../../firebase-applet-config.json';

const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || appConfig.projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || appConfig.appId,
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || appConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || appConfig.authDomain,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || appConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || appConfig.messagingSenderId,
};

// Initialize Firebase App singleton
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Initialize Firestore (using custom databaseId if configured)
const firestoreDbId = import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || appConfig.firestoreDatabaseId;
export const db = firestoreDbId && firestoreDbId !== '(default)'
  ? getFirestore(app, firestoreDbId)
  : getFirestore(app);

// Strict Undefined-Stripping (Zero-Crash Payload Hygiene)
export function sanitizeForFirestore<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, value) => (value === undefined ? null : value)));
}

// Authentication Helpers
export async function signInWithGoogle(): Promise<User> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    // If popup was blocked or denied in iframe, fallback to redirect or error
    console.warn('Popup sign in failed, attempting redirect or fallback:', error);
    if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
      await signInWithRedirect(auth, googleProvider);
      throw new Error('Redirecting to Google Sign-In...');
    }
    throw error;
  }
}

export async function signInAsGuest(): Promise<User> {
  const result = await signInAnonymously(auth);
  return result.user;
}

export async function logOut(): Promise<void> {
  await fbSignOut(auth);
}

export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

// ========================================================
// Firestore Data Operations (Strict User-Isolated Storage)
// ========================================================

export async function saveJournalEntry(userId: string, entry: JournalEntry): Promise<void> {
  if (!userId) throw new Error('User ID is required to save journal entry.');
  const entryRef = doc(db, 'users', userId, 'journalEntries', entry.id);
  const cleanPayload = sanitizeForFirestore({
    ...entry,
    updatedAt: Date.now(),
  });
  await setDoc(entryRef, cleanPayload, { merge: true });
}

export async function fetchJournalEntries(userId: string): Promise<JournalEntry[]> {
  if (!userId) return [];
  const entriesCol = collection(db, 'users', userId, 'journalEntries');
  const q = query(entriesCol, orderBy('timestamp', 'desc'), limit(100));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as JournalEntry);
}

export async function deleteJournalEntry(userId: string, entryId: string): Promise<void> {
  if (!userId || !entryId) return;
  const entryRef = doc(db, 'users', userId, 'journalEntries', entryId);
  await deleteDoc(entryRef);
}

export async function saveChatMessage(userId: string, message: ChatMessage): Promise<void> {
  if (!userId) return;
  const msgRef = doc(db, 'users', userId, 'conversations', message.id);
  const cleanPayload = sanitizeForFirestore(message);
  await setDoc(msgRef, cleanPayload, { merge: true });
}

export async function fetchChatMessages(userId: string): Promise<ChatMessage[]> {
  if (!userId) return [];
  const convoCol = collection(db, 'users', userId, 'conversations');
  const q = query(convoCol, orderBy('timestamp', 'asc'), limit(150));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as ChatMessage);
}

export async function saveSummary(userId: string, summary: SustainabilitySummary): Promise<void> {
  if (!userId) return;
  const sumRef = doc(db, 'users', userId, 'summaries', summary.id);
  const cleanPayload = sanitizeForFirestore(summary);
  await setDoc(sumRef, cleanPayload, { merge: true });
}

export async function fetchSummaries(userId: string): Promise<SustainabilitySummary[]> {
  if (!userId) return [];
  const sumCol = collection(db, 'users', userId, 'summaries');
  const q = query(sumCol, orderBy('createdAt', 'desc'), limit(20));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as SustainabilitySummary);
}

// ==========================================
// Impact Wall Firestore Operations
// ==========================================

export async function saveImpactWallData(userId: string, data: ImpactWallData): Promise<void> {
  if (!userId) throw new Error('User ID is required to save impact wall data.');
  const impactRef = doc(db, 'users', userId, 'impactWall', 'summary');
  const cleanPayload = sanitizeForFirestore({
    ...data,
    lastUpdated: Date.now(),
  });
  await setDoc(impactRef, cleanPayload, { merge: true });
}

export async function fetchImpactWallData(userId: string): Promise<ImpactWallData | null> {
  if (!userId) return null;
  const impactRef = doc(db, 'users', userId, 'impactWall', 'summary');
  const snapshot = await getDoc(impactRef);
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.data() as ImpactWallData;
}

// ==========================================
// Plastic Scanner Firestore Operations
// ==========================================

export async function saveScanRecord(userId: string, scan: PlasticScanRecord): Promise<void> {
  if (!userId) throw new Error('User ID is required to save scan.');
  const scanRef = doc(db, 'users', userId, 'scans', scan.id);
  const cleanPayload = sanitizeForFirestore(scan);
  await setDoc(scanRef, cleanPayload, { merge: true });
}

export async function fetchScanRecords(userId: string): Promise<PlasticScanRecord[]> {
  if (!userId) return [];
  const scansCol = collection(db, 'users', userId, 'scans');
  const q = query(scansCol, orderBy('timestamp', 'desc'), limit(50));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as PlasticScanRecord);
}

export async function deleteScanRecord(userId: string, scanId: string): Promise<void> {
  if (!userId || !scanId) return;
  const scanRef = doc(db, 'users', userId, 'scans', scanId);
  await deleteDoc(scanRef);
}
