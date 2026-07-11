import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import { getFirebaseClients } from '../firebase/config';
import { logError } from './logger';

export const HELPER_AGREEMENT_DOCUMENT_ID = 'helper_agreement';
const HELPER_AGREEMENT_TITLE = 'Helper Agreement';
const HELPER_AGREEMENT_DEFAULT_VERSION = '1.0.1';
const HELPER_AGREEMENT_STAMP_LABEL = 'UNCEDO HELPER AGREEMENT RECORD';
const HELPER_AGREEMENT_VERSION_PREFIX = 'helper_agreement_';
const LEGAL_ENTITY_NAME = 'Parakleo, operated by Jabu Msiza';

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

function normalizeText(value = '') {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function escapePdfText(value = '') {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function stringToBytes(value) {
  const normalized = String(value || '');
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(normalized);
  }

  const bytes = new Uint8Array(normalized.length);
  for (let index = 0; index < normalized.length; index += 1) {
    bytes[index] = normalized.charCodeAt(index) & 0xff;
  }
  return bytes;
}

function bytesToBase64(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';

  for (let index = 0; index < input.length; index += 3) {
    const first = input[index];
    const hasSecond = index + 1 < input.length;
    const hasThird = index + 2 < input.length;
    const second = hasSecond ? input[index + 1] : 0;
    const third = hasThird ? input[index + 2] : 0;

    output += base64Chars[first >> 2];
    output += base64Chars[((first & 0x03) << 4) | (second >> 4)];
    output += hasSecond ? base64Chars[((second & 0x0f) << 2) | (third >> 6)] : '=';
    output += hasThird ? base64Chars[third & 0x3f] : '=';
  }

  return output;
}

function wrapPdfLine(line = '', maxChars = 86) {
  const normalized = normalizeText(line);
  if (!normalized) return [''];

  const words = normalized.split(/\s+/);
  const lines = [];
  let current = '';

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      return;
    }

    if (current) {
      lines.push(current);
    }

    if (word.length <= maxChars) {
      current = word;
      return;
    }

    let remaining = word;
    while (remaining.length > maxChars) {
      lines.push(remaining.slice(0, maxChars));
      remaining = remaining.slice(maxChars);
    }
    current = remaining;
  });

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [''];
}

function buildHelperAgreementPdfBytes({
  title,
  version,
  effectiveDate,
  reviewedAt,
  nextReviewAt,
  stampLabel,
  contentMarkdown,
  acceptance,
}) {
  const paragraphs = normalizeText(contentMarkdown)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  const documentLines = [
    'Uncedo',
    title || HELPER_AGREEMENT_TITLE,
    '',
    `Version: ${version || HELPER_AGREEMENT_DEFAULT_VERSION}`,
    `Effective date: ${effectiveDate || 'Not specified'}`,
    `Reviewed date: ${reviewedAt || 'Not specified'}`,
    `Next review date: ${nextReviewAt || 'Not specified'}`,
    `Legal entity: ${LEGAL_ENTITY_NAME}`,
    `Accepted by: ${acceptance.typedSignatureName || acceptance.acceptedByFullName || 'Unknown'}`,
    `Accepted by email: ${acceptance.acceptedByEmail || 'Unknown'}`,
    `User ID: ${acceptance.userId || 'Unknown'}`,
    `Accepted at: ${acceptance.acceptedAt || ''}`,
    '',
    'Accepted contract text',
    '',
  ];

  paragraphs.forEach((paragraph) => {
    wrapPdfLine(paragraph).forEach((line) => documentLines.push(line));
    documentLines.push('');
  });

  documentLines.push('Acceptance Information');
  documentLines.push(`Checkbox accepted: ${acceptance.checkboxAccepted ? 'true' : 'false'}`);
  documentLines.push(`Typed signature name: ${acceptance.typedSignatureName || ''}`);
  documentLines.push(`Content hash: ${acceptance.contentHash || ''}`);
  documentLines.push('');
  documentLines.push(stampLabel || HELPER_AGREEMENT_STAMP_LABEL);
  documentLines.push(`Agreement Version: ${version || HELPER_AGREEMENT_DEFAULT_VERSION}`);
  documentLines.push(`Accepted: ${acceptance.acceptedAt || 'Not specified'}`);

  const pageHeight = 742;
  const startY = 780;
  const lineHeight = 14;
  const maxLinesPerPage = Math.floor((startY - 70) / lineHeight);
  const pages = [];

  for (let index = 0; index < documentLines.length; index += maxLinesPerPage) {
    pages.push(documentLines.slice(index, index + maxLinesPerPage));
  }

  const pageCount = pages.length || 1;
  const fontObjectNumber = 3 + (pageCount * 2);
  const pageObjectNumbers = [];
  const contentObjectNumbers = [];
  const objects = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    pageObjectNumbers.push(3 + (pageIndex * 2));
    contentObjectNumbers.push(4 + (pageIndex * 2));
  }

  const pageObjects = pages.length ? pages : [[]];
  pageObjects.forEach((pageLines, pageIndex) => {
    const streamLines = [
      'BT',
      '/F1 11 Tf',
      `${lineHeight} TL`,
      `50 ${startY} Td`,
    ];

    pageLines.forEach((line, lineIndex) => {
      if (lineIndex === 0) {
        streamLines.push(`(${escapePdfText(line)}) Tj`);
      } else {
        streamLines.push(`T* (${escapePdfText(line)}) Tj`);
      }
    });
    streamLines.push('ET');

    const stream = `${streamLines.join('\n')}\n`;
    const contentBytes = stringToBytes(stream);
    objects.push(
      `${contentObjectNumbers[pageIndex]} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n${stream}endstream\nendobj`,
    );
    objects.push(
      `${pageObjectNumbers[pageIndex]} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumbers[pageIndex]} 0 R >>\nendobj`,
    );
  });

  const pagesObject = `2 0 obj\n<< /Type /Pages /Kids [${pageObjectNumbers.map((value) => `${value} 0 R`).join(' ')}] /Count ${pageObjectNumbers.length} >>\nendobj`;
  const catalogObject = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj';
  const fontObject = `${fontObjectNumber} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`;
  const pdfObjects = [catalogObject, pagesObject, ...objects, fontObject];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  pdfObjects.forEach((objectText) => {
    offsets.push(pdf.length);
    pdf += `${objectText}\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${pdfObjects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${pdfObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return stringToBytes(pdf);
}

function buildAgreementSnapshot({ userData = {}, activeVersion, acceptanceId, acceptedAt, pdfUrl }) {
  return {
    agreement: {
      ...(userData?.agreement || {}),
      documentId: HELPER_AGREEMENT_DOCUMENT_ID,
      title: activeVersion?.title || HELPER_AGREEMENT_TITLE,
      legalEntityName: LEGAL_ENTITY_NAME,
      requiredVersion: activeVersion?.version || HELPER_AGREEMENT_DEFAULT_VERSION,
      requiredVersionId: activeVersion?.id || makeHelperVersionDocId(activeVersion?.version || HELPER_AGREEMENT_DEFAULT_VERSION),
      currentVersion: activeVersion?.version || HELPER_AGREEMENT_DEFAULT_VERSION,
      currentVersionId: activeVersion?.id || makeHelperVersionDocId(activeVersion?.version || HELPER_AGREEMENT_DEFAULT_VERSION),
      currentVersionEffectiveDate: activeVersion?.effectiveDate || '',
      currentVersionContentHash: activeVersion?.contentHash || '',
      currentVersionAccepted: true,
      acceptedCurrentVersion: true,
      acceptedVersion: activeVersion?.version || HELPER_AGREEMENT_DEFAULT_VERSION,
      acceptedAt,
      acceptanceId,
      latestAcceptedVersion: activeVersion?.version || HELPER_AGREEMENT_DEFAULT_VERSION,
      latestAcceptedAt: acceptedAt,
      latestAcceptanceId: acceptanceId,
      latestAcceptancePdfUrl: pdfUrl || '',
      acceptedByUserId: userData?.uid || '',
    },
  };
}

async function uploadAgreementPdf({
  storage,
  acceptanceId,
  userId,
  version,
  activeVersion,
  acceptance,
}) {
  const storagePath = `helper-agreements/${userId}/${version}/${acceptanceId}.pdf`;
  const fileRef = ref(storage, storagePath);
  const pdfBytes = buildHelperAgreementPdfBytes({
    title: activeVersion?.title || HELPER_AGREEMENT_TITLE,
    version,
    effectiveDate: activeVersion?.effectiveDate || '',
    reviewedAt: activeVersion?.reviewedAt || '',
    nextReviewAt: activeVersion?.nextReviewAt || '',
    stampLabel: activeVersion?.stampLabel || HELPER_AGREEMENT_STAMP_LABEL,
    contentMarkdown: activeVersion?.contentMarkdown || '',
    acceptance,
  });
  const pdfBase64 = bytesToBase64(pdfBytes);

  await uploadString(fileRef, pdfBase64, 'base64', {
    contentType: 'application/pdf',
    cacheControl: 'private,max-age=0,no-store',
    customMetadata: {
      userId,
      version,
      acceptanceId,
      documentId: HELPER_AGREEMENT_DOCUMENT_ID,
    },
  });

  return {
    pdfUrl: await getDownloadURL(fileRef),
    pdfStoragePath: storagePath,
  };
}

async function tryUploadAgreementPdf(options) {
  try {
    return await uploadAgreementPdf(options);
  } catch (error) {
    logError('legalAgreementService.uploadAgreementPdf', error);
    return {
      pdfUrl: '',
      pdfStoragePath: '',
      uploadError: error,
    };
  }
}

export async function getHelperAgreementBundle() {
  const { auth, db } = getFirebaseClients();
  const uid = String(auth.currentUser?.uid || '').trim();
  if (!uid) {
    throw new Error('You must be signed in before accessing the Helper Agreement.');
  }

  const [documentSnap, versionsSnap, acceptancesSnap] = await Promise.all([
    getDoc(doc(db, 'legalDocuments', HELPER_AGREEMENT_DOCUMENT_ID)),
    getDocs(query(collection(db, 'legalDocumentVersions'), where('documentId', '==', HELPER_AGREEMENT_DOCUMENT_ID))),
    getDocs(query(collection(db, 'userAgreementAcceptances'), where('userId', '==', uid))),
  ]);

  const documentData = documentSnap.exists() ? { id: documentSnap.id, ...documentSnap.data() } : null;
  const versions = versionsSnap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((left, right) => normalizeTime(right.createdAt || right.effectiveDate) - normalizeTime(left.createdAt || left.effectiveDate));
  const activeVersionId = String(documentData?.currentVersionId || '').trim();
  const activeVersion = versions.find((item) => item.id === activeVersionId)
    || versions.find((item) => item.version === documentData?.currentVersion)
    || versions[0]
    || null;
  const acceptances = acceptancesSnap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => item.documentId === HELPER_AGREEMENT_DOCUMENT_ID)
    .sort((left, right) => normalizeTime(right.acceptedAt) - normalizeTime(left.acceptedAt));

  return {
    success: true,
    document: documentData,
    activeVersion,
    versions,
    acceptances,
  };
}

export async function acceptHelperAgreement({ typedSignatureName, checkboxAccepted = true } = {}) {
  const { auth, db, storage } = getFirebaseClients();
  const currentUser = auth.currentUser;
  const uid = String(currentUser?.uid || '').trim();
  if (!uid) {
    throw new Error('You must be signed in before accessing the Helper Agreement.');
  }

  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  const userData = userSnap.exists() ? { uid: userSnap.id, ...userSnap.data() } : {};
  const isHelper = String(userData.activeRole || userData.role || '').trim().toLowerCase() === 'helper';
  if (!isHelper) {
    throw new Error('Only helpers can accept the Helper Agreement.');
  }

  if (!checkboxAccepted) {
    throw new Error('You must confirm that you accept the Helper Agreement.');
  }

  const signatureName = String(typedSignatureName || '').trim();
  if (!signatureName) {
    throw new Error('Please type your full legal name to sign the Helper Agreement.');
  }

  const bundle = await getHelperAgreementBundle();
  const activeVersion = bundle?.activeVersion || null;
  if (!activeVersion) {
    throw new Error('The active Helper Agreement is not available right now.');
  }

  const requiredVersion = normalizeVersionInput(userData?.agreement?.requiredVersion || activeVersion.version);
  const acceptanceId = `${uid}_${activeVersion.version}`;
  const acceptanceRef = doc(db, 'userAgreementAcceptances', acceptanceId);
  const existingAcceptanceSnap = await getDoc(acceptanceRef);
  const existingAcceptance = existingAcceptanceSnap.exists() ? existingAcceptanceSnap.data() || {} : null;

  if (existingAcceptance?.pdfUrl) {
    await setDoc(userRef, {
      ...buildAgreementSnapshot({
        userData,
        activeVersion,
        acceptanceId,
        acceptedAt: existingAcceptance.acceptedAt || new Date().toISOString(),
        pdfUrl: existingAcceptance.pdfUrl,
      }),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return {
      success: true,
      message: 'Helper Agreement accepted successfully.',
      acceptanceId,
      acceptance: {
        id: acceptanceId,
        ...existingAcceptance,
      },
      pdfUrl: existingAcceptance.pdfUrl,
      activeVersion,
      agreement: {
        ...(userData?.agreement || {}),
        ...buildAgreementSnapshot({
          userData,
          activeVersion,
          acceptanceId,
          acceptedAt: existingAcceptance.acceptedAt || new Date().toISOString(),
          pdfUrl: existingAcceptance.pdfUrl,
        }).agreement,
      },
      verificationStatus: userData?.verificationStatus || 'pending',
    };
  }

  const acceptedAt = new Date().toISOString();
  const acceptance = {
    userId: uid,
    documentId: HELPER_AGREEMENT_DOCUMENT_ID,
    version: activeVersion.version,
    acceptedAt,
    acceptedByFullName: String(userData.fullName || userData.displayName || '').trim() || signatureName,
    acceptedByEmail: String(userData.email || currentUser.email || '').trim(),
    ipAddress: '',
    userAgent: String(globalThis?.navigator?.userAgent || 'helper-client').trim(),
    signatureType: 'checkbox_and_typed_name',
    typedSignatureName: signatureName,
    checkboxAccepted: true,
    requiredVersionAtAcceptance: requiredVersion,
    requiredVersionMismatchAtAcceptance: normalizeVersionInput(activeVersion.version) !== requiredVersion,
    legalEntityName: LEGAL_ENTITY_NAME,
    documentTitle: activeVersion.title || HELPER_AGREEMENT_TITLE,
    documentEffectiveDate: activeVersion.effectiveDate || '',
    contentHash: String(activeVersion.contentHash || '').trim(),
    immutableContentSnapshot: activeVersion.contentMarkdown || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const uploaded = await tryUploadAgreementPdf({
    storage,
    acceptanceId,
    userId: uid,
    version: activeVersion.version,
    activeVersion,
    acceptance,
  });

  await runTransaction(db, async (transaction) => {
    const txnUserSnap = await transaction.get(userRef);
    const txnUserData = txnUserSnap.exists() ? { uid: txnUserSnap.id, ...txnUserSnap.data() } : userData;

    transaction.set(acceptanceRef, {
      ...acceptance,
      pdfUrl: uploaded.pdfUrl,
      pdfStoragePath: uploaded.pdfStoragePath,
      pdfUploadFailed: !uploaded.pdfUrl,
      pdfUploadErrorMessage: uploaded.uploadError ? String(uploaded.uploadError?.message || 'PDF upload failed.') : '',
    }, { merge: true });

    transaction.set(userRef, {
      ...buildAgreementSnapshot({
        userData: txnUserData,
        activeVersion,
        acceptanceId,
        acceptedAt,
        pdfUrl: uploaded.pdfUrl,
      }),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });

  const refreshedSnap = await getDoc(userRef);
  const refreshedUser = refreshedSnap.exists() ? refreshedSnap.data() || {} : {};

  return {
    success: true,
    message: uploaded.pdfUrl
      ? 'Helper Agreement accepted successfully.'
      : 'Helper Agreement accepted successfully. The signed PDF could not be uploaded on this device.',
    acceptanceId,
    acceptance: {
      id: acceptanceId,
      ...acceptance,
      createdAt: acceptedAt,
      updatedAt: acceptedAt,
      pdfUrl: uploaded.pdfUrl,
      pdfStoragePath: uploaded.pdfStoragePath,
      pdfUploadFailed: !uploaded.pdfUrl,
      pdfUploadErrorMessage: uploaded.uploadError ? String(uploaded.uploadError?.message || 'PDF upload failed.') : '',
    },
    pdfUrl: uploaded.pdfUrl,
    activeVersion,
    agreement: refreshedUser.agreement || {},
    verificationStatus: refreshedUser.verificationStatus || 'pending',
  };
}

export function getHelperAgreementPdfUrl({ acceptance = null, versionRecord = null } = {}) {
  if (!acceptance) return '';

  const storedUrl = String(acceptance?.pdfUrl || '').trim();
  if (storedUrl) {
    return storedUrl;
  }

  const contentMarkdown = String(
    acceptance?.immutableContentSnapshot
    || versionRecord?.contentMarkdown
    || '',
  ).trim();

  if (!contentMarkdown) {
    return '';
  }

  const pdfBytes = buildHelperAgreementPdfBytes({
    title: acceptance?.documentTitle || versionRecord?.title || HELPER_AGREEMENT_TITLE,
    version: acceptance?.version || versionRecord?.version || HELPER_AGREEMENT_DEFAULT_VERSION,
    effectiveDate: acceptance?.documentEffectiveDate || versionRecord?.effectiveDate || '',
    reviewedAt: versionRecord?.reviewedAt || '',
    nextReviewAt: versionRecord?.nextReviewAt || '',
    stampLabel: versionRecord?.stampLabel || HELPER_AGREEMENT_STAMP_LABEL,
    contentMarkdown,
    acceptance: {
      ...acceptance,
      acceptedByFullName: acceptance?.acceptedByFullName || acceptance?.typedSignatureName || '',
      acceptedByEmail: acceptance?.acceptedByEmail || '',
      userId: acceptance?.userId || '',
      acceptedAt: acceptance?.acceptedAt || '',
      checkboxAccepted: acceptance?.checkboxAccepted !== false,
      typedSignatureName: acceptance?.typedSignatureName || '',
      contentHash: acceptance?.contentHash || versionRecord?.contentHash || '',
    },
  });

  return `data:application/pdf;base64,${bytesToBase64(pdfBytes)}`;
}

export function formatAgreementDate(value) {
  if (!value) return 'Not specified';
  const parsed = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not specified';
  return parsed.toLocaleDateString();
}
