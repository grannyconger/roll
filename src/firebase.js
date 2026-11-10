// Firebase init, auth, and Firestore handles. Every view imports from here.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./shared/firebase-config.js";

export {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where,
  onSnapshot, serverTimestamp, Timestamp, writeBatch, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const TEACHER_EMAIL = "bweaver@greermiddlecollege.org";
export const OBSERVER_EMAIL = "jlowman@greermiddlecollege.org";
export const SCHOOL_DOMAIN = "greermiddlecollege.org";

export function signInWithSchoolGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ hd: SCHOOL_DOMAIN, prompt: "select_account" });
  return signInWithPopup(auth, provider);
}

export function signInWithClassCode() {
  return signInAnonymously(auth);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function signOutNow() {
  return signOut(auth);
}

export function isTeacherUser(user) {
  return !!user && user.email === TEACHER_EMAIL;
}

export function isObserverUser(user) {
  return !!user && (user.email === OBSERVER_EMAIL || user.email === TEACHER_EMAIL);
}
