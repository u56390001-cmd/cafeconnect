import {
  getApp,
  getApps,
  initializeApp,
  cert,
  App,
} from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";

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

let adminApp: App;
let adminDb: Firestore;
let adminAuth: Auth;

if (!getApps().length) {
  adminApp = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
} else {
  adminApp = getApp();
}

adminDb = getFirestore(adminApp);
adminAuth = getAuth(adminApp);

export { adminApp, adminDb, adminAuth };
