import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getFirebaseClients } from '../firebase/config';

const HELPER_AGREEMENT_DOCUMENT_ID = 'helper_agreement';
const HELPER_AGREEMENT_TITLE = 'Helper Agreement';
const HELPER_AGREEMENT_STAMP_LABEL = 'UNCEDO HELPER AGREEMENT RECORD';
const HELPER_AGREEMENT_STATUS = {
  ACTIVE: 'active',
  DRAFT: 'draft',
  ARCHIVED: 'archived',
};
const HELPER_AGREEMENT_VERSION_PREFIX = 'helper_agreement_';
const LEGAL_ENTITY_NAME = 'Parakleo, operated by Jabu Msiza';

function buildHelperAgreementMarkdown() {
  return `# Helper Agreement

**Parties**

This Helper Agreement is entered into between **${LEGAL_ENTITY_NAME}** ("Uncedo") and the helper accepting this agreement.

**1. Independent contractor status**

- The helper is an independent contractor and not an employee, partner, agent, or representative of Uncedo.
- The helper is responsible for all taxes, registrations, statutory obligations, and filings arising from services performed through the platform.
- Uncedo does not guarantee work volume, earnings, or minimum income.

**2. Helper eligibility and profile accuracy**

- The helper must provide accurate identity, contact, banking, skills, service area, and business information where applicable.
- The helper must keep their profile information current and accurate at all times.
- False information, forged documents, or identity misrepresentation may result in immediate suspension or removal.

**3. Service conduct**

- The helper must act professionally, respectfully, safely, and lawfully when dealing with customers.
- Harassment, abuse, threats, discrimination, fraud, theft, misleading conduct, or unsafe behavior are prohibited.
- The helper must only accept jobs they can competently complete.

**4. Customer safety and property**

- The helper must take reasonable care when working at a customer site or handling customer property.
- The helper must follow lawful safety instructions, building rules, and platform safety requirements.
- The helper must immediately report safety incidents, disputes, damage, or suspicious conduct to Uncedo.

**5. Platform use**

- Accepted jobs must be handled through Uncedo workflows and platform rules.
- The helper must not use Uncedo to move accepted customers off-platform for direct payment or repeat work that bypasses platform rules.
- The helper must not ask customers to pay outside approved platform channels.

**6. Availability, routing, and live updates**

- The helper is responsible for keeping their availability, location-sharing status, and job progress updates accurate when using live dispatch features.
- The helper must not falsely mark arrival, work started, job completion, or other operational states.

**7. Skills, photos, and uploaded materials**

- Skill listings, work photos, and business details submitted to Uncedo must be truthful and owned or lawfully controlled by the helper.
- The helper grants Uncedo the right to store and display submitted skill and profile materials for platform operations, moderation, and customer discovery.

**8. Payouts and fees**

- Payout percentages, deductions, timing, and settlement rules are determined by Uncedo and may be displayed in-product or communicated separately.
- Payouts may be adjusted for refunds, disputes, cancellations, fraud, chargebacks, policy breaches, or operational corrections.
- The helper is responsible for the accuracy of payout details and for all tax obligations.

**9. Cancellations, disputes, and platform enforcement**

- Uncedo may investigate service complaints, disputes, safety incidents, customer reports, and suspicious account activity.
- Uncedo may pause dispatch, suspend a helper, withhold payouts where permitted, or remove platform access where justified by policy or legal risk.

**10. Privacy and data handling**

- The helper must protect customer personal information and only use it for the permitted service purpose.
- Customer data may not be copied, sold, published, or reused outside the platform relationship.

**11. Limitation of liability**

- Uncedo operates as a platform and does not guarantee uninterrupted availability, demand, or income.
- Uncedo is not liable for third-party failures, outages, routing inaccuracies, software issues, or indirect losses beyond applicable law.

**12. Governing law and policy updates**

- This agreement is governed by the laws of the Republic of South Africa.
- Uncedo may update this agreement by publishing a new version.
- Helpers must accept the latest active version before continuing as active, available, or payout-ready helpers.

**13. Acceptance**

- Checking the acceptance box and typing the helper's full legal name constitutes electronic acceptance.
- Acceptance records capture the helper identity, accepted version, acceptance time, and the agreement text accepted at that time.

**Version note**

This is a starter legal template for MVP use only and must be reviewed by a South African attorney before public launch.
`;
}

function normalizeTime(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeVersionInput(version = '') {
  return String(version || '').trim();
}

function makeHelperVersionDocId(version) {
  return `${HELPER_AGREEMENT_VERSION_PREFIX}${normalizeVersionInput(version).replace(/\s+/g, '_')}`;
}

function isAdminUser(user = {}, profile = {}) {
  const roles = new Set(
    [
      profile?.role,
      profile?.activeRole,
      ...(Array.isArray(profile?.roles) ? profile.roles : []),
    ]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean),
  );

  return Boolean(
    String(user?.email || '').trim().toLowerCase() === 'jabuobed1@gmail.com'
      || profile?.isAdmin === true
      || roles.has('admin')
  );
}

async function computeContentHash(content = '') {
  const normalized = String(content || '');
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(normalized);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hashBuffer))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
  }

  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(index);
    hash |= 0;
  }
  return `fallback_${Math.abs(hash)}`;
}

export async function getHelperAgreementBundle() {
  const clients = await getFirebaseClients();
  const auth = clients?.auth;
  const db = clients?.db;
  if (!auth?.currentUser || !db) {
    throw new Error('You must be signed in before accessing helper agreement management.');
  }

  const [documentSnap, versionsSnap] = await Promise.all([
    getDoc(doc(db, 'legalDocuments', HELPER_AGREEMENT_DOCUMENT_ID)),
    getDocs(query(collection(db, 'legalDocumentVersions'), where('documentId', '==', HELPER_AGREEMENT_DOCUMENT_ID))),
  ]);

  const documentData = documentSnap.exists() ? { id: documentSnap.id, ...documentSnap.data() } : null;
  const versions = versionsSnap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((left, right) => normalizeTime(right.createdAt || right.effectiveDate) - normalizeTime(left.createdAt || left.effectiveDate));
  const activeVersion = versions.find((item) => item.id === documentData?.currentVersionId)
    || versions.find((item) => String(item.version || '').trim() === String(documentData?.currentVersion || '').trim())
    || versions[0]
    || null;

  return {
    success: true,
    document: documentData,
    activeVersion,
    versions,
    acceptances: [],
  };
}

export async function publishHelperAgreementVersion(payload = {}) {
  const clients = await getFirebaseClients();
  const auth = clients?.auth;
  const db = clients?.db;
  const firestoreModule = clients?.firestoreModule;
  if (!auth?.currentUser || !db || !firestoreModule) {
    throw new Error('You must be signed in before accessing helper agreement management.');
  }

  const adminProfileSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
  const adminProfile = adminProfileSnap.exists() ? adminProfileSnap.data() || {} : {};
  if (!isAdminUser(auth.currentUser, adminProfile)) {
    throw new Error('Admin access required.');
  }

  const version = normalizeVersionInput(payload.version);
  if (!version) {
    throw new Error('Version is required.');
  }

  const title = String(payload.title || HELPER_AGREEMENT_TITLE).trim() || HELPER_AGREEMENT_TITLE;
  const contentMarkdown = String(payload.contentMarkdown || buildHelperAgreementMarkdown()).trim() || buildHelperAgreementMarkdown();
  const effectiveDate = String(payload.effectiveDate || '').trim() || new Date().toISOString();
  const reviewedBy = String(payload.reviewedBy || 'Uncedo').trim() || 'Uncedo';
  const reviewedAt = String(payload.reviewedAt || effectiveDate).trim() || effectiveDate;
  const nextReviewAt = String(payload.nextReviewAt || '').trim();
  const stampLabel = String(payload.stampLabel || HELPER_AGREEMENT_STAMP_LABEL).trim() || HELPER_AGREEMENT_STAMP_LABEL;
  const changeSummary = String(payload.changeSummary || '').trim();
  const status = String(payload.status || HELPER_AGREEMENT_STATUS.ACTIVE).trim().toLowerCase() === HELPER_AGREEMENT_STATUS.DRAFT
    ? HELPER_AGREEMENT_STATUS.DRAFT
    : HELPER_AGREEMENT_STATUS.ACTIVE;
  const updatedBy = String(auth.currentUser.email || auth.currentUser.uid || 'admin').trim();
  const versionId = makeHelperVersionDocId(version);
  const contentHash = await computeContentHash(contentMarkdown);
  const documentRef = doc(db, 'legalDocuments', HELPER_AGREEMENT_DOCUMENT_ID);
  const versionRef = doc(db, 'legalDocumentVersions', versionId);
  const isActivePublish = status === HELPER_AGREEMENT_STATUS.ACTIVE;

  await runTransaction(db, async (transaction) => {
    const [documentSnap, versionSnap] = await Promise.all([
      transaction.get(documentRef),
      transaction.get(versionRef),
    ]);
    const existingDocument = documentSnap.exists() ? documentSnap.data() || {} : {};
    const previousVersionId = String(existingDocument.currentVersionId || '').trim();

    if (versionSnap.exists()) {
      throw new Error(`Version ${version} already exists. Publish a new version number to preserve immutable history.`);
    }

    transaction.set(versionRef, {
      documentId: HELPER_AGREEMENT_DOCUMENT_ID,
      version,
      title,
      effectiveDate,
      status,
      contentMarkdown,
      createdAt: serverTimestamp(),
      createdBy: updatedBy,
      legalEntityName: LEGAL_ENTITY_NAME,
      changeSummary,
      reviewedBy,
      reviewedAt,
      nextReviewAt,
      stampLabel,
      contentHash,
    }, { merge: true });

    if (isActivePublish && previousVersionId && previousVersionId !== versionId) {
      transaction.set(doc(db, 'legalDocumentVersions', previousVersionId), {
        status: HELPER_AGREEMENT_STATUS.ARCHIVED,
        updatedAt: serverTimestamp(),
        updatedBy,
      }, { merge: true });
    }

    if (isActivePublish) {
      transaction.set(documentRef, {
        documentId: HELPER_AGREEMENT_DOCUMENT_ID,
        title,
        currentVersion: version,
        currentVersionId: versionId,
        status,
        updatedAt: serverTimestamp(),
        updatedBy,
        legalEntityName: LEGAL_ENTITY_NAME,
      }, { merge: true });
    }
  });

  if (isActivePublish) {
    const helpersSnap = await getDocs(query(collection(db, 'users'), where('activeRole', '==', 'helper')));
    const docs = helpersSnap.docs;
    const batchSize = 400;

    for (let index = 0; index < docs.length; index += batchSize) {
      const batch = writeBatch(db);
      docs.slice(index, index + batchSize).forEach((item) => {
        const helperAgreement = item.data()?.agreement || {};
        batch.set(item.ref, {
          agreement: {
            ...helperAgreement,
            documentId: HELPER_AGREEMENT_DOCUMENT_ID,
            title,
            legalEntityName: LEGAL_ENTITY_NAME,
            requiredVersion: version,
            requiredVersionId: versionId,
            currentVersion: version,
            currentVersionId: versionId,
            currentVersionEffectiveDate: effectiveDate,
            currentVersionContentHash: contentHash,
            currentVersionAccepted: false,
            acceptedCurrentVersion: false,
            acceptedVersion: helperAgreement.acceptedVersion || '',
            acceptedAt: helperAgreement.acceptedAt || null,
            acceptanceId: helperAgreement.acceptanceId || '',
            latestAcceptedVersion: helperAgreement.latestAcceptedVersion || '',
            latestAcceptedAt: helperAgreement.latestAcceptedAt || null,
            latestAcceptanceId: helperAgreement.latestAcceptanceId || '',
            latestAcceptancePdfUrl: helperAgreement.latestAcceptancePdfUrl || '',
          },
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });
      await batch.commit();
    }
  }

  return {
    success: true,
    message: 'Helper Agreement version published.',
    version,
    versionId,
    title,
    effectiveDate,
    status,
    contentMarkdown,
    contentHash,
    legalEntityName: LEGAL_ENTITY_NAME,
    reviewedBy,
    reviewedAt,
    nextReviewAt,
    stampLabel,
  };
}
