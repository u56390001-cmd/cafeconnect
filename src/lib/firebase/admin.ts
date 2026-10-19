import { getApp, getApps, initializeApp, FirebaseApp } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";

let adminApp: FirebaseApp;
let adminDb: Firestore;
let adminAuth: Auth;

const requiredEnv = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
];

const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(
    `Missing required Firebase Admin environment variables: ${missing.join(", ")}`
  );
}

if (!getApps().length) {
  adminApp = initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  });
} else {
  adminApp = getApps()[0];
}

adminDb = getFirestore(adminApp);
adminAuth = getAuth(adminApp);

export { adminApp, adminDb, adminAuth };
