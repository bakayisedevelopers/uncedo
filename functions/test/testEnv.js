const admin = require('firebase-admin');
const { DEFAULT_REWARD_CONFIG } = require('../rewards/config');

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || 'demo-uncedo-phase0';
const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

const adminApps = [];

function createAdminDb(appName) {
  const app = admin.initializeApp({ projectId: PROJECT_ID }, appName);
  adminApps.push(app);
  return app.firestore();
}

async function clearFirestore() {
  const response = await fetch(`http://${FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to clear Firestore emulator: ${response.status} ${body}`);
  }
}

async function shutdownAdminApps() {
  await Promise.all(adminApps.splice(0).map((app) => app.delete().catch(() => null)));
}

async function seedRewardConfig(db) {
  const batch = db.batch();
  Object.entries(DEFAULT_REWARD_CONFIG).forEach(([id, config]) => {
    batch.set(db.collection('rewardConfig').doc(id), {
      ...config,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  await batch.commit();
}

function timestampFromDate(date) {
  return admin.firestore.Timestamp.fromDate(date);
}

module.exports = {
  PROJECT_ID,
  FIRESTORE_EMULATOR_HOST,
  clearFirestore,
  createAdminDb,
  seedRewardConfig,
  shutdownAdminApps,
  timestampFromDate,
  admin,
};
