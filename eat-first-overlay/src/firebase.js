import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/** Під час Vite HMR модуль перезавантажується — Firebase лишає один app / один Firestore за життєвий цикл вкладки. */
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)

/** Потрібно для Callable + linkPlayerSlot / submitVote (anonymous за замовчуванням). */
export const auth = getAuth(app)

/**
 * У production: IndexedDB + кілька вкладок (реальний офлайн).
 * У Vite dev за замовчуванням: лише RAM — менше розсинхрону після HMR/швидких перезавантажень
 * і попереджень Firestore на кшталт BloomFilter. Персист у dev: VITE_FIRESTORE_DEV_PERSIST=true.
 */
const usePersistentCache =
  import.meta.env.PROD === true ||
  String(import.meta.env.VITE_FIRESTORE_DEV_PERSIST ?? '').toLowerCase() === 'true'

const firestoreSingletonKey = '__eat_first_overlay_firestore__'

function createFirestore() {
  return initializeFirestore(app, {
    localCache: usePersistentCache
      ? persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        })
      : memoryLocalCache(),
  })
}

export const db =
  globalThis[firestoreSingletonKey] ?? (globalThis[firestoreSingletonKey] = createFirestore())
