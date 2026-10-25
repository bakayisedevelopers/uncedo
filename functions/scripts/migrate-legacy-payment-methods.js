'use strict';

const admin = require('firebase-admin');
const { migrateLegacyPaymentMethods } = require('../paymentMethodStore');

async function migrateLegacyCards({ db, adminSdk, execute = false, pageSize = 250 }) {
  let cursor = null;
  let scanned = 0;
  let candidates = 0;
  let migrated = 0;
  do {
    let query = db.collection('users')
      .orderBy(adminSdk.firestore.FieldPath.documentId())
      .limit(Math.max(1, Math.min(Number(pageSize) || 250, 500)));
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    for (const userDoc of page.docs) {
      scanned += 1;
      const paymentMethods = Array.isArray(userDoc.data()?.paymentMethods) ? userDoc.data().paymentMethods : [];
      const hasLegacySecrets = paymentMethods.some((method) => (
        String(method?.paystackAuthorizationCode || '').trim()
        || Object.prototype.hasOwnProperty.call(method || {}, 'signature')
      ));
      if (!hasLegacySecrets) continue;
      candidates += 1;
      if (execute) {
        await migrateLegacyPaymentMethods({ db, admin: adminSdk, uid: userDoc.id });
        migrated += 1;
      }
    }
    cursor = page.docs[page.docs.length - 1];
    if (page.size < Math.max(1, Math.min(Number(pageSize) || 250, 500))) break;
  } while (cursor);
  return { scanned, candidates, migrated, dryRun: !execute };
}

async function main() {
  const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  const execute = process.env.CONFIRM_LEGACY_CARD_MIGRATION === 'YES';
  if (!projectId) throw new Error('Set FIREBASE_PROJECT_ID explicitly.');
  if (!admin.apps.length) admin.initializeApp({ projectId });
  const result = await migrateLegacyCards({ db: admin.firestore(), adminSdk: admin, execute });
  process.stdout.write(`${JSON.stringify({ projectId, ...result })}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Saved-card migration failed: ${String(error?.message || 'unknown error')}\n`);
    process.exitCode = 1;
  });
}

module.exports = { migrateLegacyCards };
