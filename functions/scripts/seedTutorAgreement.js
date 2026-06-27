const admin = require('firebase-admin');
const { ensureTutorAgreementSeeded } = require('../legalAgreements');

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }

  const db = admin.firestore();
  await ensureTutorAgreementSeeded({ db, admin });
  console.log('Tutor Agreement seeded successfully.');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
