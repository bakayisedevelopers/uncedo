const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const LEGAL_ENTITY_NAME = 'Parakleo, operated by Jabu Msiza';
const HELPER_AGREEMENT_DOCUMENT_ID = 'helper_agreement';
const HELPER_AGREEMENT_TITLE = 'Helper Agreement';
const HELPER_AGREEMENT_DEFAULT_VERSION = '1.0.1';
const HELPER_AGREEMENT_STAMP_LABEL = 'UNCEDO HELPER AGREEMENT RECORD';
const HELPER_AGREEMENT_VERSION_PREFIX = 'helper_agreement_';
const HELPER_AGREEMENT_STATUS = {
  ACTIVE: 'active',
  DRAFT: 'draft',
  ARCHIVED: 'archived',
};

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

function normalizeVersionInput(version = '') {
  return String(version || '').trim();
}

function makeHelperVersionDocId(version) {
  return `${HELPER_AGREEMENT_VERSION_PREFIX}${normalizeVersionInput(version).replace(/\s+/g, '_')}`;
}

function computeContentHash(contentMarkdown = '') {
  return createHash('sha256').update(String(contentMarkdown || ''), 'utf8').digest('hex');
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value) {
  const millis = toMillis(value);
  if (!millis) return '';
  return new Date(millis).toISOString();
}

function toPlainText(markdown = '') {
  return String(markdown || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\-\s+/gm, '- ')
    .replace(/^\*\s+/gm, '- ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildAgreementPdfBuffer({
  title,
  version,
  effectiveDate,
  legalEntityName,
  contentMarkdown,
  reviewedAt,
  nextReviewAt,
  stampLabel = HELPER_AGREEMENT_STAMP_LABEL,
  acceptance,
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: {
        top: 120,
        left: 48,
        right: 48,
        bottom: 60,
      },
      compress: false,
      info: {
        Title: `${title} ${version}`,
        Author: legalEntityName,
        Subject: `${title} acceptance record`,
      },
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const pageMargin = 24;
    const contentWidth = doc.page.width - (doc.page.margins.left + doc.page.margins.right);
    const innerPaddingX = 8;
    const safeContentX = doc.page.margins.left + innerPaddingX;
    const safeContentWidth = contentWidth - (innerPaddingX * 2);
    const safeBottomY = pageHeight - doc.page.margins.bottom - 14;

    const ensureSpace = (requiredHeight = 40) => {
      if (doc.y + requiredHeight > safeBottomY) {
        doc.addPage();
        doc.x = safeContentX;
      }
    };

    const drawPageFrame = () => {
      doc.save();
      doc.rect(pageMargin, pageMargin, pageWidth - (pageMargin * 2), pageHeight - (pageMargin * 2))
        .lineWidth(1)
        .strokeColor('#E4E4E7')
        .stroke();
      doc
        .moveTo(doc.page.margins.left, 96)
        .lineTo(pageWidth - doc.page.margins.right, 96)
        .lineWidth(2)
        .strokeColor('#10B981')
        .stroke();
      doc.restore();
    };

    const drawFooter = () => {
      const footerY = pageHeight - 42;
      doc.save();
      doc.font('Helvetica').fontSize(8).fillColor('#52525B');
      doc.text(
        'This PDF represents the exact Helper Agreement version accepted by the helper on the acceptance date shown above.',
        doc.page.margins.left,
        footerY,
        { width: contentWidth - 70 },
      );
      doc.text(`Page ${doc.page.number}`, pageWidth - doc.page.margins.right - 40, footerY, { width: 40, align: 'right' });
      doc.restore();
    };

    drawPageFrame();
    doc.on('pageAdded', () => {
      drawPageFrame();
    });

    const logoPath = path.resolve(__dirname, 'assets/logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, doc.page.margins.left, 42, { fit: [48, 48] });
    }

    doc
      .fillColor('#059669')
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('Uncedo', doc.page.margins.left + 56, 46, { width: safeContentWidth - 56 });

    doc
      .fillColor('#059669')
      .fontSize(18)
      .font('Helvetica-Bold')
      .text(title, doc.page.margins.left + 56, 72, { width: safeContentWidth - 56, align: 'left' });

    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#52525B')
      .text(legalEntityName, doc.page.margins.left + 56, 92, { width: safeContentWidth - 56, align: 'left' });

    doc.x = safeContentX;
    doc.y = doc.page.margins.top;

    doc.moveDown(1);
    doc.fontSize(11).fillColor('#18181B');
    doc.text(`Version: ${version}`);
    doc.text(`Effective date: ${effectiveDate || 'Not specified'}`);
    doc.text(`Reviewed date: ${reviewedAt || 'Not specified'}`);
    if (nextReviewAt) {
      doc.text(`Next review date: ${nextReviewAt}`);
    }
    doc.text(`Legal entity: ${legalEntityName}`);
    doc.text(`Accepted by: ${acceptance.typedSignatureName || acceptance.acceptedByFullName || 'Unknown'}`);
    doc.text(`Accepted by email: ${acceptance.acceptedByEmail || 'Unknown'}`);
    doc.text(`User ID: ${acceptance.userId || 'Unknown'}`);
    doc.text(`Signature type: ${acceptance.signatureType || 'checkbox_and_typed_name'}`);
    doc.text(`Accepted at: ${acceptance.acceptedAt || ''}`);

    doc.moveDown(1);
    ensureSpace(60);
    doc.font('Helvetica-Bold').fillColor('#059669').text('Accepted contract text');
    doc.moveDown(0.35);
    doc.font('Helvetica').fillColor('#18181B');

    const paragraphs = toPlainText(contentMarkdown).split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
    paragraphs.forEach((paragraph) => {
      ensureSpace(48);
      doc.text(paragraph, {
        width: safeContentWidth,
        align: 'left',
      });
      doc.moveDown(0.5);
    });

    doc.moveDown(1);
    ensureSpace(80);
    doc.font('Helvetica-Bold').fillColor('#059669').text('Acceptance Information');
    doc.font('Helvetica').fillColor('#18181B');
    doc.text(`Checkbox accepted: ${acceptance.checkboxAccepted ? 'true' : 'false'}`);
    doc.text(`Typed signature name: ${acceptance.typedSignatureName || ''}`);
    doc.text(`Content hash: ${acceptance.contentHash || ''}`);
    doc.moveDown(0.6);

    if (doc.y + 130 > safeBottomY) {
      doc.addPage();
      doc.x = safeContentX;
    }

    const stampTop = doc.y;
    const stampHeight = 92;
    doc.roundedRect(safeContentX, stampTop, safeContentWidth, stampHeight, 10)
      .fillAndStroke('#ECFDF5', '#059669');
    doc.fillColor('#065F46').font('Helvetica-Bold').fontSize(11)
      .text(stampLabel, safeContentX + 12, stampTop + 12);
    doc.fillColor('#065F46').font('Helvetica').fontSize(10)
      .text('Operated by Jabu Msiza', safeContentX + 12, stampTop + 30)
      .text(`Agreement Version: ${version}`, safeContentX + 12, stampTop + 44)
      .text(`Accepted: ${acceptance.acceptedAt || 'Not specified'}`, safeContentX + 12, stampTop + 58);
    if (reviewedAt) {
      doc.text(`Reviewed: ${reviewedAt}`, safeContentX + 280, stampTop + 44, { width: 180 });
    }
    if (nextReviewAt) {
      doc.text(`Next Review: ${nextReviewAt}`, safeContentX + 280, stampTop + 58, { width: 180 });
    }
    doc.moveDown(1);

    drawFooter();

    doc.end();
  });
}

async function ensureHelperAgreementSeeded({ db, admin, now = new Date() }) {
  const documentRef = db.collection('legalDocuments').doc(HELPER_AGREEMENT_DOCUMENT_ID);
  const versionId = makeHelperVersionDocId(HELPER_AGREEMENT_DEFAULT_VERSION);
  const versionRef = db.collection('legalDocumentVersions').doc(versionId);

  await db.runTransaction(async (transaction) => {
    const documentSnap = await transaction.get(documentRef);
    const versionSnap = await transaction.get(versionRef);

    if (!versionSnap.exists) {
      const contentMarkdown = buildHelperAgreementMarkdown();
      transaction.set(versionRef, {
        documentId: HELPER_AGREEMENT_DOCUMENT_ID,
        version: HELPER_AGREEMENT_DEFAULT_VERSION,
        title: HELPER_AGREEMENT_TITLE,
        effectiveDate: formatDate(now),
        status: HELPER_AGREEMENT_STATUS.ACTIVE,
        contentMarkdown,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'system',
        legalEntityName: LEGAL_ENTITY_NAME,
        reviewedBy: 'Uncedo',
        reviewedAt: formatDate(now),
        nextReviewAt: formatDate(new Date(now.getTime() + (365 * 24 * 60 * 60 * 1000))),
        stampLabel: HELPER_AGREEMENT_STAMP_LABEL,
        changeSummary: 'Initial helper agreement template.',
        contentHash: computeContentHash(contentMarkdown),
      }, { merge: true });
    }

    if (!documentSnap.exists) {
      transaction.set(documentRef, {
        documentId: HELPER_AGREEMENT_DOCUMENT_ID,
        title: HELPER_AGREEMENT_TITLE,
        currentVersion: HELPER_AGREEMENT_DEFAULT_VERSION,
        currentVersionId: versionId,
        status: HELPER_AGREEMENT_STATUS.ACTIVE,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: 'system',
        legalEntityName: LEGAL_ENTITY_NAME,
      }, { merge: true });
    }
  });

  return {
    documentId: HELPER_AGREEMENT_DOCUMENT_ID,
    version: HELPER_AGREEMENT_DEFAULT_VERSION,
    versionId,
  };
}

async function getHelperAgreementBundle({ db, admin, userId = '' } = {}) {
  await ensureHelperAgreementSeeded({ db, admin });
  const documentRef = db.collection('legalDocuments').doc(HELPER_AGREEMENT_DOCUMENT_ID);
  const documentSnap = await documentRef.get();
  const documentData = documentSnap.exists ? documentSnap.data() : {};
  const activeVersionId = documentData.currentVersionId || makeHelperVersionDocId(documentData.currentVersion || HELPER_AGREEMENT_DEFAULT_VERSION);
  const activeVersionSnap = await db.collection('legalDocumentVersions').doc(activeVersionId).get();
  const activeVersionData = activeVersionSnap.exists ? activeVersionSnap.data() : null;

  const versionsSnap = await db.collection('legalDocumentVersions').get();
  const versions = versionsSnap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => item.documentId === HELPER_AGREEMENT_DOCUMENT_ID)
    .sort((a, b) => toMillis(b.createdAt || b.effectiveDate) - toMillis(a.createdAt || a.effectiveDate));

  let acceptances = [];
  if (userId) {
    const acceptancesSnap = await db.collection('userAgreementAcceptances').where('userId', '==', userId).get();
    acceptances = acceptancesSnap.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((item) => item.documentId === HELPER_AGREEMENT_DOCUMENT_ID)
      .sort((a, b) => toMillis(b.acceptedAt) - toMillis(a.acceptedAt));
  }

  return {
    document: documentSnap.exists ? { id: documentSnap.id, ...documentData } : null,
    activeVersion: activeVersionData ? { id: activeVersionSnap.id, ...activeVersionData } : null,
    versions,
    acceptances,
  };
}

function isHelperAgreementCurrent(user = {}) {
  const agreement = user?.agreement || {};
  const requiredVersion = normalizeVersionInput(agreement.requiredVersion || HELPER_AGREEMENT_DEFAULT_VERSION);
  const acceptedVersion = normalizeVersionInput(agreement.acceptedVersion || '');
  const acceptedCurrentVersion = agreement.currentVersionAccepted === true || agreement.acceptedCurrentVersion === true;
  return Boolean(
    requiredVersion
      && acceptedVersion
      && (
        (acceptedCurrentVersion && requiredVersion === acceptedVersion)
        || requiredVersion === acceptedVersion
      ),
  );
}

function buildHelperAgreementSnapshot({
  user,
  activeVersion,
  acceptanceId,
  pdfUrl = '',
}) {
  const nowIso = new Date().toISOString();
  return {
    agreement: {
      ...(user?.agreement || {}),
      documentId: HELPER_AGREEMENT_DOCUMENT_ID,
      title: activeVersion?.title || HELPER_AGREEMENT_TITLE,
      legalEntityName: LEGAL_ENTITY_NAME,
      requiredVersion: activeVersion?.version || HELPER_AGREEMENT_DEFAULT_VERSION,
      requiredVersionId: activeVersion?.id || makeHelperVersionDocId(activeVersion?.version || HELPER_AGREEMENT_DEFAULT_VERSION),
      currentVersion: activeVersion?.version || HELPER_AGREEMENT_DEFAULT_VERSION,
      currentVersionId: activeVersion?.id || makeHelperVersionDocId(activeVersion?.version || HELPER_AGREEMENT_DEFAULT_VERSION),
      currentVersionEffectiveDate: activeVersion?.effectiveDate || '',
      currentVersionContentHash: activeVersion?.contentHash || computeContentHash(activeVersion?.contentMarkdown || ''),
      currentVersionAccepted: true,
      acceptedCurrentVersion: true,
      acceptedVersion: activeVersion?.version || HELPER_AGREEMENT_DEFAULT_VERSION,
      acceptedAt: nowIso,
      acceptanceId,
      latestAcceptedVersion: activeVersion?.version || HELPER_AGREEMENT_DEFAULT_VERSION,
      latestAcceptedAt: nowIso,
      latestAcceptanceId: acceptanceId,
      latestAcceptancePdfUrl: pdfUrl || '',
      acceptedByUserId: user?.uid || '',
    },
  };
}

async function uploadAgreementPdf({
  admin,
  acceptanceId,
  userId,
  version,
  documentTitle,
  effectiveDate,
  reviewedAt = '',
  nextReviewAt = '',
  stampLabel = HELPER_AGREEMENT_STAMP_LABEL,
  contentMarkdown,
  acceptance,
}) {
  const bucket = admin.storage().bucket();
  const pdfBuffer = await buildAgreementPdfBuffer({
    title: documentTitle,
    version,
    effectiveDate,
    legalEntityName: LEGAL_ENTITY_NAME,
    reviewedAt,
    nextReviewAt,
    stampLabel,
    contentMarkdown,
    acceptance,
  });
  const filePath = `helper-agreements/${userId}/${version}/${acceptanceId}.pdf`;
  const file = bucket.file(filePath);
  await file.save(pdfBuffer, {
    contentType: 'application/pdf',
    resumable: false,
    metadata: {
      cacheControl: 'private, max-age=0, no-store',
      metadata: {
        userId,
        version,
        acceptanceId,
        documentId: HELPER_AGREEMENT_DOCUMENT_ID,
      },
    },
  });
  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: '01-01-2500',
  });
  return signedUrl;
}

async function acceptHelperAgreement({
  db,
  admin,
  user,
  typedSignatureName,
  checkboxAccepted,
  ipAddress = '',
  userAgent = '',
}) {
  if (!user?.uid) {
    throw new Error('You must be signed in to accept the Helper Agreement.');
  }

  const activeBundle = await getHelperAgreementBundle({ db, admin, userId: user.uid });
  const activeVersion = activeBundle.activeVersion;
  if (!activeVersion) {
    throw new Error('The active Helper Agreement is not available right now.');
  }

  const agreement = user?.agreement || {};
  const requiredVersion = normalizeVersionInput(agreement.requiredVersion || activeVersion.version);
  const requiredVersionMismatch = normalizeVersionInput(activeVersion.version) !== requiredVersion;
  const signatureName = String(typedSignatureName || '').trim();

  if (!checkboxAccepted) {
    throw new Error('You must confirm that you accept the Helper Agreement.');
  }

  if (!signatureName) {
    throw new Error('Please type your full legal name to sign the Helper Agreement.');
  }

  const acceptanceId = `${user.uid}_${activeVersion.version}`;
  const acceptanceRef = db.collection('userAgreementAcceptances').doc(acceptanceId);
  const acceptanceSnap = await acceptanceRef.get();
  const existingAcceptance = acceptanceSnap.exists ? acceptanceSnap.data() : null;
  if (existingAcceptance?.pdfUrl) {
    await db.collection('users').doc(user.uid).set({
      ...buildHelperAgreementSnapshot({
        user,
        activeVersion,
        acceptanceId,
        pdfUrl: existingAcceptance.pdfUrl,
      }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      acceptanceId,
      acceptance: {
        id: acceptanceId,
        ...existingAcceptance,
      },
      pdfUrl: existingAcceptance.pdfUrl,
      activeVersion: { id: activeVersion.id, ...activeVersion },
    };
  }

  const nowIso = new Date().toISOString();
  const acceptance = {
    userId: user.uid,
    documentId: HELPER_AGREEMENT_DOCUMENT_ID,
    version: activeVersion.version,
    acceptedAt: nowIso,
    acceptedByFullName: String(user.fullName || user.displayName || '').trim() || signatureName,
    acceptedByEmail: String(user.email || '').trim(),
    ipAddress: String(ipAddress || '').trim(),
    userAgent: String(userAgent || '').trim(),
    signatureType: 'checkbox_and_typed_name',
    typedSignatureName: signatureName,
    checkboxAccepted: true,
    requiredVersionAtAcceptance: requiredVersion,
    requiredVersionMismatchAtAcceptance: requiredVersionMismatch,
    legalEntityName: LEGAL_ENTITY_NAME,
    documentTitle: activeVersion.title || HELPER_AGREEMENT_TITLE,
    documentEffectiveDate: activeVersion.effectiveDate || '',
    contentHash: activeVersion.contentHash || computeContentHash(activeVersion.contentMarkdown || ''),
    immutableContentSnapshot: activeVersion.contentMarkdown || '',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const pdfUrl = await uploadAgreementPdf({
    admin,
    acceptanceId,
    userId: user.uid,
    version: activeVersion.version,
    documentTitle: activeVersion.title || HELPER_AGREEMENT_TITLE,
    effectiveDate: activeVersion.effectiveDate || '',
    reviewedAt: activeVersion.reviewedAt || '',
    nextReviewAt: activeVersion.nextReviewAt || '',
    stampLabel: activeVersion.stampLabel || HELPER_AGREEMENT_STAMP_LABEL,
    contentMarkdown: activeVersion.contentMarkdown || '',
    acceptance,
  });

  acceptance.pdfUrl = pdfUrl;
  acceptance.pdfStoragePath = `helper-agreements/${user.uid}/${activeVersion.version}/${acceptanceId}.pdf`;

  await db.runTransaction(async (transaction) => {
    transaction.set(acceptanceRef, {
      ...acceptance,
      pdfUrl,
    }, { merge: true });

    transaction.set(
      db.collection('users').doc(user.uid),
      {
        ...buildHelperAgreementSnapshot({
          user,
          activeVersion,
          acceptanceId,
          pdfUrl,
        }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  return {
    acceptanceId,
    acceptance: {
      id: acceptanceId,
      ...acceptance,
      createdAt: nowIso,
      updatedAt: nowIso,
      pdfUrl,
    },
    pdfUrl,
    activeVersion: { id: activeVersion.id, ...activeVersion },
  };
}

async function publishHelperAgreementVersion({
  db,
  admin,
  version,
  title = HELPER_AGREEMENT_TITLE,
  effectiveDate = '',
  contentMarkdown = '',
  changeSummary = '',
  reviewedBy = 'Uncedo',
  reviewedAt = '',
  nextReviewAt = '',
  stampLabel = HELPER_AGREEMENT_STAMP_LABEL,
  updatedBy = 'admin',
  status = HELPER_AGREEMENT_STATUS.ACTIVE,
}) {
  const normalizedVersion = normalizeVersionInput(version);
  if (!normalizedVersion) {
    throw new Error('Version is required.');
  }

  const versionId = makeHelperVersionDocId(normalizedVersion);
  const documentRef = db.collection('legalDocuments').doc(HELPER_AGREEMENT_DOCUMENT_ID);
  const versionRef = db.collection('legalDocumentVersions').doc(versionId);
  const content = String(contentMarkdown || buildHelperAgreementMarkdown()).trim();
  const contentHash = computeContentHash(content);
  const now = new Date();
  const isActivePublish = status === HELPER_AGREEMENT_STATUS.ACTIVE;

  await db.runTransaction(async (transaction) => {
    const documentSnap = await transaction.get(documentRef);
    const versionSnap = await transaction.get(versionRef);
    const existingDocument = documentSnap.exists ? documentSnap.data() : {};
    const previousVersionId = existingDocument.currentVersionId || null;

    if (versionSnap.exists) {
      throw new Error(`Version ${normalizedVersion} already exists. Publish a new version number to preserve immutable history.`);
    }

    transaction.set(versionRef, {
      documentId: HELPER_AGREEMENT_DOCUMENT_ID,
      version: normalizedVersion,
      title,
      effectiveDate: effectiveDate || now.toISOString(),
      status,
      contentMarkdown: content,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: updatedBy || 'admin',
      legalEntityName: LEGAL_ENTITY_NAME,
      changeSummary: String(changeSummary || '').trim(),
      reviewedBy: String(reviewedBy || 'Uncedo').trim() || 'Uncedo',
      reviewedAt: String(reviewedAt || effectiveDate || now.toISOString()).trim(),
      nextReviewAt: String(nextReviewAt || '').trim(),
      stampLabel: String(stampLabel || HELPER_AGREEMENT_STAMP_LABEL).trim() || HELPER_AGREEMENT_STAMP_LABEL,
      contentHash,
    }, { merge: true });

    if (isActivePublish && previousVersionId && previousVersionId !== versionId) {
      transaction.set(db.collection('legalDocumentVersions').doc(previousVersionId), {
        status: HELPER_AGREEMENT_STATUS.ARCHIVED,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy,
      }, { merge: true });
    }

    if (isActivePublish) {
      transaction.set(documentRef, {
        documentId: HELPER_AGREEMENT_DOCUMENT_ID,
        title,
        currentVersion: normalizedVersion,
        currentVersionId: versionId,
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy,
        legalEntityName: LEGAL_ENTITY_NAME,
      }, { merge: true });
    }
  });

  if (isActivePublish) {
    const helpersSnap = await db.collection('users').where('activeRole', '==', 'helper').get();
    const docs = helpersSnap.docs;
    const batchSize = 400;
    for (let index = 0; index < docs.length; index += batchSize) {
      const batch = db.batch();
      docs.slice(index, index + batchSize).forEach((item) => {
        batch.set(item.ref, {
          agreement: {
            ...(item.data()?.agreement || {}),
            documentId: HELPER_AGREEMENT_DOCUMENT_ID,
            title,
            legalEntityName: LEGAL_ENTITY_NAME,
            requiredVersion: normalizedVersion,
            requiredVersionId: versionId,
            currentVersion: normalizedVersion,
            currentVersionId: versionId,
            currentVersionEffectiveDate: effectiveDate || now.toISOString(),
            currentVersionContentHash: contentHash,
            currentVersionAccepted: false,
            acceptedCurrentVersion: false,
            acceptedVersion: item.data()?.agreement?.acceptedVersion || '',
            acceptedAt: item.data()?.agreement?.acceptedAt || null,
            acceptanceId: item.data()?.agreement?.acceptanceId || '',
            latestAcceptedVersion: item.data()?.agreement?.latestAcceptedVersion || '',
            latestAcceptedAt: item.data()?.agreement?.latestAcceptedAt || null,
            latestAcceptanceId: item.data()?.agreement?.latestAcceptanceId || '',
            latestAcceptancePdfUrl: item.data()?.agreement?.latestAcceptancePdfUrl || '',
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      await batch.commit();
    }
  }

  return {
    version: normalizedVersion,
    versionId,
    title,
    effectiveDate: effectiveDate || now.toISOString(),
    status,
    contentMarkdown: content,
    contentHash,
    legalEntityName: LEGAL_ENTITY_NAME,
    reviewedBy: String(reviewedBy || 'Uncedo').trim() || 'Uncedo',
    reviewedAt: String(reviewedAt || effectiveDate || now.toISOString()).trim(),
    nextReviewAt: String(nextReviewAt || '').trim(),
    stampLabel: String(stampLabel || HELPER_AGREEMENT_STAMP_LABEL).trim() || HELPER_AGREEMENT_STAMP_LABEL,
  };
}

module.exports = {
  LEGAL_ENTITY_NAME,
  HELPER_AGREEMENT_DOCUMENT_ID,
  HELPER_AGREEMENT_TITLE,
  HELPER_AGREEMENT_DEFAULT_VERSION,
  HELPER_AGREEMENT_STATUS,
  HELPER_AGREEMENT_STAMP_LABEL,
  buildHelperAgreementMarkdown,
  computeContentHash,
  ensureHelperAgreementSeeded,
  getHelperAgreementBundle,
  isHelperAgreementCurrent,
  acceptHelperAgreement,
  publishHelperAgreementVersion,
  makeHelperVersionDocId,
};
