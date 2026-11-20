import { getFirebaseClients, getFunctionEndpoint } from '../firebase/config';

export const HELPER_AGREEMENT_DOCUMENT_ID = 'helper_agreement';
export const WHATSAPP_CHAT_URL = 'https://wa.me/27605239926';

function normalizeId(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeRole(value = '') {
  return String(value || '').trim().toLowerCase();
}

function collectRoles(profile = {}) {
  return new Set(
    [
      normalizeRole(profile?.role),
      normalizeRole(profile?.activeRole),
      ...(Array.isArray(profile?.roles) ? profile.roles.map(normalizeRole) : []),
    ].filter(Boolean),
  );
}

function hasHelperSignals(profile = {}) {
  return Boolean(
    profile?.agreement
      || profile?.payout
      || normalizeRole(profile?.providerType)
      || String(profile?.businessName || '').trim()
      || normalizeRole(profile?.verificationStatus)
      || normalizeRole(profile?.onlineStatus)
      || profile?.locationSharingEnabled !== undefined,
  );
}

export function shouldTreatAsHelper(profile = {}) {
  const roles = collectRoles(profile);
  return roles.has('helper') || roles.has('provider') || roles.has('tutor') || hasHelperSignals(profile);
}

export function shouldBlockAsCustomer(profile = {}) {
  const roles = collectRoles(profile);
  const hasCustomerRole = roles.has('customer') || roles.has('student');
  const hasCustomerSignals = Boolean(
    profile?.wallet
      || Array.isArray(profile?.paymentMethods)
      || profile?.freeMinutesRemaining !== undefined
      || profile?.customerProfile
      || profile?.studentProfile,
  );
  return !shouldTreatAsHelper(profile) && hasCustomerSignals && hasCustomerRole;
}

export function requireE164PhoneNumber(value = '') {
  const cleaned = String(value || '').replace(/[\s().-]/g, '').trim();
  if (!/^\+[1-9]\d{7,14}$/.test(cleaned)) {
    throw new Error('Enter your WhatsApp number with its international country code, for example +27 71 234 5678.');
  }
  return cleaned;
}

function buildDefaultHelperProfile({ uid, email, fullName }) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return {
    uid,
    email: email || '',
    fullName: String(fullName || '').trim(),
    displayName: String(fullName || '').trim(),
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
    role: 'helper',
    activeRole: 'helper',
    roles: ['helper'],
    providerType: '',
    businessName: '',
    phoneNumber: '',
    homeAddress: '',
    city: 'Johannesburg',
    profilePhoto: '',
    profilePhotoObjectPath: '',
    onlineStatus: 'offline',
    locationSharingEnabled: false,
    verificationStatus: 'pending',
    referralSlug: `hlp-${Math.random().toString(36).slice(2, 12)}`,
    payout: {
      bankName: '',
      accountHolder: '',
      accountNumber: '',
      recipientCode: '',
      verificationStatus: 'pending',
    },
  };
}

export function subscribeToAuthSession(onUser, onError) {
  const { auth, authModule, db, firestoreModule } = getFirebaseClients();
  return authModule.onAuthStateChanged(
    auth,
    async (firebaseUser) => {
      if (!firebaseUser) {
        onUser(null);
        return;
      }
      try {
        const snap = await firestoreModule.getDoc(firestoreModule.doc(db, 'users', firebaseUser.uid));
        const profile = snap.exists() ? { uid: snap.id, ...snap.data() } : null;
        if (profile && shouldBlockAsCustomer(profile)) {
          await authModule.signOut(auth);
          onError?.(new Error('Customer accounts cannot use Helper onboarding. Sign in or register with a helper email account.'));
          onUser(null);
          return;
        }
        onUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: profile?.fullName || profile?.displayName || firebaseUser.displayName || '',
          profile: profile || buildDefaultHelperProfile({
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            fullName: firebaseUser.displayName || '',
          }),
        });
      } catch (err) {
        onError?.(err);
      }
    },
    onError,
  );
}

export async function saveWhatsAppContactNumber(phoneNumber) {
  const { functions, httpsCallable } = getFirebaseClients();
  const call = httpsCallable(functions, 'setWhatsAppContactNumber');
  const res = await call({ role: 'helper', phoneNumber: requireE164PhoneNumber(phoneNumber) });
  return res.data || {};
}

export async function upsertHelperProfile({ uid, email, fullName, phoneNumber = '' }) {
  const { db, firestoreModule } = getFirebaseClients();
  const ref = firestoreModule.doc(db, 'users', uid);
  const snap = await firestoreModule.getDoc(ref);
  const existing = snap.exists() ? snap.data() || {} : null;
  const fallback = buildDefaultHelperProfile({ uid, email, fullName });

  const merged = {
    uid,
    email: email || existing?.email || '',
    fullName: existing?.fullName || fallback.fullName,
    displayName: existing?.displayName || fallback.displayName,
    firstName: existing?.firstName || fallback.firstName,
    lastName: existing?.lastName || fallback.lastName,
    role: 'helper',
    activeRole: 'helper',
    roles: ['helper'],
    providerType: String(existing?.providerType || ''),
    businessName: String(existing?.businessName || ''),
    phoneNumber: String(existing?.phoneNumber || ''),
    homeAddress: String(existing?.homeAddress || ''),
    city: String(existing?.city || 'Johannesburg'),
    profilePhoto: String(existing?.profilePhoto || ''),
    profilePhotoObjectPath: String(existing?.profilePhotoObjectPath || ''),
    onlineStatus: String(existing?.onlineStatus || 'offline'),
    locationSharingEnabled: existing?.locationSharingEnabled === true,
    verificationStatus: String(existing?.verificationStatus || 'pending'),
    updatedAt: firestoreModule.serverTimestamp(),
    ...(existing ? {} : { createdAt: firestoreModule.serverTimestamp(), referralSlug: fallback.referralSlug }),
  };

  await firestoreModule.setDoc(ref, merged, { merge: true });

  if (phoneNumber && !existing?.whatsappVerifiedAt && String(existing?.phoneNumber || '').trim() !== phoneNumber.trim()) {
    await saveWhatsAppContactNumber(phoneNumber);
  }

  const refreshed = await firestoreModule.getDoc(ref);
  return refreshed.exists() ? { uid: refreshed.id, ...refreshed.data() } : merged;
}

export async function signUpHelperAccount({ fullName, email, password, phoneNumber }) {
  const { auth, authModule } = getFirebaseClients();
  const cleanName = String(fullName || '').trim();
  if (cleanName.length < 2) throw new Error('Enter your full name to create your helper account.');
  const safePhone = phoneNumber ? requireE164PhoneNumber(phoneNumber) : '';
  const credential = await authModule.createUserWithEmailAndPassword(auth, String(email || '').trim(), password);
  await authModule.updateProfile(credential.user, { displayName: cleanName });
  await upsertHelperProfile({
    uid: credential.user.uid,
    email: credential.user.email,
    fullName: cleanName,
    phoneNumber: safePhone,
  });
  return credential.user;
}

export async function signInHelperAccount({ email, password }) {
  const { auth, authModule, db, firestoreModule } = getFirebaseClients();
  const credential = await authModule.signInWithEmailAndPassword(auth, String(email || '').trim(), password);
  const snap = await firestoreModule.getDoc(firestoreModule.doc(db, 'users', credential.user.uid));
  const profile = snap.exists() ? snap.data() : null;
  if (profile && shouldBlockAsCustomer(profile)) {
    await authModule.signOut(auth);
    throw new Error('Customer accounts cannot sign in to Uncedo Helpers onboarding. Create or use a helper account.');
  }
  await upsertHelperProfile({
    uid: credential.user.uid,
    email: credential.user.email,
    fullName: credential.user.displayName || profile?.fullName || '',
  });
  return credential.user;
}

export async function signOutHelperAccount() {
  const { auth, authModule } = getFirebaseClients();
  await authModule.signOut(auth);
}

export async function inspectWhatsAppSignupLink(token) {
  const safeToken = String(token || '').trim();
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(safeToken)) {
    return { status: 'invalid', expired: true, eligible: false };
  }
  const { functions, httpsCallable } = getFirebaseClients();
  const call = httpsCallable(functions, 'inspectWhatsAppSignupLink');
  const res = await call({ token: safeToken });
  return res.data || {};
}

export async function completeWhatsAppSignupLink(token) {
  const safeToken = String(token || '').trim();
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(safeToken)) {
    throw new Error('This WhatsApp signup link is invalid or expired. Request a fresh link from your Uncedo WhatsApp chat.');
  }
  const { functions, httpsCallable } = getFirebaseClients();
  const call = httpsCallable(functions, 'completeWhatsAppSignupLink');
  const res = await call({ token: safeToken });
  return res.data || {};
}

export async function resendWhatsAppSignupLink(token) {
  const safeToken = String(token || '').trim();
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(safeToken)) {
    throw new Error('This WhatsApp link token is invalid. Send "Resend link" in your Uncedo WhatsApp chat.');
  }
  const { functions, httpsCallable } = getFirebaseClients();
  const call = httpsCallable(functions, 'resendWhatsAppSignupLink');
  const res = await call({ token: safeToken });
  return res.data || {};
}

export async function completeWhatsAppAccountLink(token) {
  const safeToken = String(token || '').trim();
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(safeToken)) {
    throw new Error('This WhatsApp link is invalid or expired. Request a fresh link from your Uncedo WhatsApp chat.');
  }
  const { functions, httpsCallable } = getFirebaseClients();
  const call = httpsCallable(functions, 'completeWhatsAppAccountLink');
  const res = await call({ token: safeToken });
  return res.data || {};
}

export function subscribeToUserProfile(uid, onData, onError) {
  if (!uid) {
    onData(null);
    return () => {};
  }
  const { db, firestoreModule } = getFirebaseClients();
  return firestoreModule.onSnapshot(
    firestoreModule.doc(db, 'users', uid),
    (snap) => onData(snap.exists() ? { uid: snap.id, ...snap.data() } : null),
    onError,
  );
}

export async function updateHelperBasics(uid, updates) {
  const { db, firestoreModule } = getFirebaseClients();
  const payload = { ...updates };
  if (Object.hasOwn(payload, 'phoneNumber')) {
    const rawPhone = String(payload.phoneNumber || '').trim();
    delete payload.phoneNumber;
    if (rawPhone) {
      await saveWhatsAppContactNumber(rawPhone);
    }
  }

  await firestoreModule.setDoc(
    firestoreModule.doc(db, 'users', uid),
    {
      ...payload,
      role: 'helper',
      activeRole: 'helper',
      roles: ['helper'],
      updatedAt: firestoreModule.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function uploadHelperFile({ uid, file, pathPrefix, objectPath: customPath = '' }) {
  if (!uid || !file) throw new Error('Select a file to upload.');
  const { storage, storageModule } = getFirebaseClients();
  const safeName = String(file.name || 'upload.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const objectPath = customPath || `${pathPrefix}/${uid}/${Date.now()}-${safeName}`;
  const ref = storageModule.ref(storage, objectPath);
  await storageModule.uploadBytes(ref, file, {
    contentType: file.type || 'application/octet-stream',
    cacheControl: 'public,max-age=3600',
  });
  const downloadUrl = await storageModule.getDownloadURL(ref);
  return {
    id: `pic_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    uri: downloadUrl,
    downloadUrl,
    objectPath,
    fileName: safeName,
    mimeType: file.type || 'application/octet-stream',
    uploadedAt: new Date().toISOString(),
  };
}

export async function deleteStorageObject(objectPath = '') {
  const cleanPath = String(objectPath || '').trim();
  if (!cleanPath) return;
  const { storage, storageModule } = getFirebaseClients();
  try {
    await storageModule.deleteObject(storageModule.ref(storage, cleanPath));
  } catch (error) {
    if (String(error?.code || '').toLowerCase() === 'storage/object-not-found') return;
    throw error;
  }
}

export function subscribeToServiceCatalog(onData, onError) {
  const { db, firestoreModule } = getFirebaseClients();
  return firestoreModule.onSnapshot(
    firestoreModule.query(firestoreModule.collection(db, 'serviceCatalog')),
    (snapshot) => {
      const items = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data() || {};
          const id = String(data.id || data.serviceId || docSnap.id).trim();
          return {
            id,
            catalogId: id,
            categoryId: String(data.categoryId || '').trim().toLowerCase(),
            categoryName: String(data.categoryName || data.categoryId || '').trim(),
            label: String(data.label || data.serviceName || id).trim(),
            description: String(data.description || '').trim(),
            type: String(data.type || 'service').trim().toLowerCase(),
            active: data.active !== false,
            approved: data.approved !== false,
            optionApplicationMode: data.optionApplicationMode === 'unified' ? 'unified' : 'per_option',
            inheritBundleImages: data.inheritBundleImages !== false,
            includedServiceIds: Array.isArray(data.includedServiceIds) ? data.includedServiceIds : [],
            options: (Array.isArray(data.options) ? data.options : []).map((opt, idx) => ({
              id: String(opt?.id || normalizeId(opt?.title || opt?.label || `option_${idx + 1}`)).trim(),
              title: String(opt?.title || opt?.label || '').trim(),
              description: String(opt?.description || '').trim(),
              imageUrl: String(opt?.imageUrl || '').trim(),
              price: Number(opt?.price ?? opt?.priceAdder ?? 0),
            })),
            images: Array.isArray(data.images) ? data.images : [],
          };
        })
        .filter((entry) => entry.active !== false && entry.approved !== false);
      onData(items);
    },
    onError,
  );
}

export function buildHelperServiceOfferingId(helperId = '', serviceId = '', optionId = '') {
  const normOpt = normalizeId(optionId);
  return normOpt
    ? `${String(helperId || '').trim()}_${normalizeId(serviceId)}__${normOpt}`
    : `${String(helperId || '').trim()}_${normalizeId(serviceId)}`;
}

export function subscribeToHelperOfferings(helperId, onData, onError) {
  if (!helperId) {
    onData([]);
    return () => {};
  }
  const { db, firestoreModule } = getFirebaseClients();
  const q = firestoreModule.query(
    firestoreModule.collection(db, 'helperServices'),
    firestoreModule.where('helperId', '==', helperId),
  );
  return firestoreModule.onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() || {};
        return {
          id: String(data.offeringId || docSnap.id).trim(),
          offeringId: String(data.offeringId || docSnap.id).trim(),
          helperId: String(data.helperId || '').trim(),
          serviceId: normalizeId(data.serviceId || ''),
          categoryId: normalizeId(data.categoryId || ''),
          optionId: normalizeId(data.optionId || ''),
          optionTitle: String(data.optionTitle || data.optionLabel || '').trim(),
          serviceName: String(data.serviceName || data.name || data.serviceId || '').trim(),
          status: String(data.status || 'pending').trim().toLowerCase(),
          active: data.active === true,
          approved: data.approved === true,
          verified: data.verified === true,
          photos: Array.isArray(data.photos) ? data.photos : [],
          declineReason: String(data.declineReason || data.rejectionReason || data.moderationReason || '').trim(),
        };
      });
      onData(items);
    },
    onError,
  );
}

export async function saveHelperServiceOffering({
  helperId,
  serviceId,
  categoryId,
  serviceName,
  optionId = '',
  optionTitle = '',
  photos = [],
}) {
  const { db, firestoreModule } = getFirebaseClients();
  const normOpt = normalizeId(optionId);
  const offeringId = buildHelperServiceOfferingId(helperId, serviceId, normOpt);
  const normalizedPhotos = photos
    .map((photo) => {
      const uri = String(photo?.uri || photo?.downloadUrl || '').trim();
      if (!uri) return null;
      return {
        id: String(photo.id || `pic_${Date.now()}`),
        uri,
        objectPath: String(photo.objectPath || '').trim(),
        uploadedAt: photo.uploadedAt || new Date().toISOString(),
      };
    })
    .filter(Boolean);

  await firestoreModule.setDoc(
    firestoreModule.doc(db, 'helperServices', offeringId),
    {
      offeringId,
      helperId,
      serviceId: normalizeId(serviceId),
      categoryId: normalizeId(categoryId),
      optionId: normOpt,
      optionTitle: String(optionTitle || '').trim(),
      applicationMode: normOpt ? 'option' : 'service',
      serviceName: String(serviceName || serviceId).trim(),
      status: 'pending',
      active: false,
      approved: false,
      verified: false,
      photos: normalizedPhotos,
      approvalSource: '',
      derivedFromBundleIds: [],
      updatedAt: firestoreModule.serverTimestamp(),
      createdAt: firestoreModule.serverTimestamp(),
    },
    { merge: true },
  );

  return offeringId;
}

export async function removeHelperServiceOffering(offeringId) {
  const { db, firestoreModule } = getFirebaseClients();
  await firestoreModule.deleteDoc(firestoreModule.doc(db, 'helperServices', offeringId));
}

export async function getHelperAgreementBundle(uid) {
  const { db, firestoreModule } = getFirebaseClients();
  const [docSnap, versionsSnap, acceptancesSnap] = await Promise.all([
    firestoreModule.getDoc(firestoreModule.doc(db, 'legalDocuments', HELPER_AGREEMENT_DOCUMENT_ID)),
    firestoreModule.getDocs(
      firestoreModule.query(
        firestoreModule.collection(db, 'legalDocumentVersions'),
        firestoreModule.where('documentId', '==', HELPER_AGREEMENT_DOCUMENT_ID),
      ),
    ),
    firestoreModule.getDocs(
      firestoreModule.query(
        firestoreModule.collection(db, 'userAgreementAcceptances'),
        firestoreModule.where('userId', '==', uid),
      ),
    ),
  ]);

  const toMillis = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    if (typeof val?.toMillis === 'function') return val.toMillis();
    if (typeof val?.seconds === 'number') return val.seconds * 1000;
    const parsed = Date.parse(val);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const docData = docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
  const versions = versionsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => toMillis(b.createdAt || b.effectiveDate) - toMillis(a.createdAt || a.effectiveDate));
  const activeVersion =
    versions.find((v) => v.id === String(docData?.currentVersionId || '').trim())
    || versions.find((v) => v.version === docData?.currentVersion)
    || versions[0]
    || null;
  const acceptances = acceptancesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((item) => item.documentId === HELPER_AGREEMENT_DOCUMENT_ID)
    .sort((a, b) => toMillis(b.acceptedAt) - toMillis(a.acceptedAt));

  return { document: docData, activeVersion, versions, acceptances };
}

export async function acceptHelperAgreement({ typedSignatureName, expectedVersion }) {
  const { functions, httpsCallable } = getFirebaseClients();
  const call = httpsCallable(functions, 'acceptHelperAgreement');
  const res = await call({
    typedSignatureName: String(typedSignatureName || '').trim(),
    checkboxAccepted: true,
    expectedVersion,
  });
  return res.data || {};
}

export async function getWhatsAppHelperAgreementSession(token) {
  const { functions, httpsCallable } = getFirebaseClients();
  const call = httpsCallable(functions, 'getWhatsAppHelperAgreementSession');
  const res = await call({ token });
  return res.data || {};
}

export async function acceptWhatsAppHelperAgreement({ token, typedSignatureName, expectedVersion }) {
  const { functions, httpsCallable } = getFirebaseClients();
  const call = httpsCallable(functions, 'acceptWhatsAppHelperAgreement');
  const res = await call({
    token,
    typedSignatureName: String(typedSignatureName || '').trim(),
    checkboxAccepted: true,
    expectedVersion,
  });
  return res.data || {};
}

export async function getMyPoliceClearanceReview() {
  const { functions, httpsCallable } = getFirebaseClients();
  const call = httpsCallable(functions, 'getMyHelperPoliceClearanceReview');
  const res = await call({});
  return res.data || { required: true, status: 'missing', submissions: [] };
}

export async function submitWebHelperPoliceClearance(file) {
  if (!file) throw new Error('Select your police-clearance PDF, JPG, or PNG file first.');
  const allowedMimes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  const mimeType = String(file.type || '').toLowerCase();
  if (!allowedMimes.includes(mimeType)) {
    throw new Error('Only PDF, JPG, or PNG files are supported for police clearance.');
  }
  const maxBytes = mimeType === 'application/pdf' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(mimeType === 'application/pdf' ? 'PDF must be 10 MB or smaller.' : 'Images must be 5 MB or smaller.');
  }

  const base64Data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });

  const { functions, httpsCallable } = getFirebaseClients();
  const call = httpsCallable(functions, 'submitWebHelperPoliceClearance');
  const res = await call({ mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType, base64Data });
  return res.data || {};
}

export async function getMyPoliceClearanceViewUrl(submissionId) {
  const { functions, httpsCallable } = getFirebaseClients();
  const call = httpsCallable(functions, 'getMyHelperPoliceClearanceViewUrl');
  const res = await call({ submissionId });
  return res.data || {};
}

async function callPayoutEndpoint(functionName, { method = 'POST', body = null } = {}) {
  const { auth } = getFirebaseClients();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('You must be signed in.');
  const response = await fetch(getFunctionEndpoint(functionName), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || `Unable to complete payout request (${response.status}).`);
  }
  return payload;
}

export async function getHelperPayoutBanks() {
  const res = await callPayoutEndpoint('getHelperPayoutBanks', { method: 'GET' });
  return Array.isArray(res?.banks) ? res.banks : [];
}

export async function verifyHelperPayout(payout) {
  return callPayoutEndpoint('verifyHelperPayout', { body: { payout } });
}

export async function getHelperWalletSnapshot() {
  const { auth } = getFirebaseClients();
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    return {
      wallet: { availableMinor: 0, reservedMinor: 0, outstandingCommissionMinor: 0, currency: 'ZAR' },
      nextPayoutEstimateMinor: 0,
      transactions: [],
    };
  }
  const fetchJson = async (fnName) => {
    const res = await fetch(getFunctionEndpoint(fnName), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || payload?.success !== true) {
      throw new Error(payload?.message || `Unable to load ${fnName}.`);
    }
    return payload;
  };
  const [summary, history] = await Promise.all([
    fetchJson('getHelperWallet'),
    fetchJson('getHelperWalletTransactions'),
  ]);
  return {
    wallet: summary.wallet || { availableMinor: 0, reservedMinor: 0, outstandingCommissionMinor: 0, currency: 'ZAR' },
    nextPayoutEstimateMinor: Math.max(0, Number(summary.nextPayoutEstimateMinor || 0)),
    transactions: Array.isArray(history.transactions) ? history.transactions : [],
  };
}

export async function syncMyHelperVerificationStatus() {
  const { functions, httpsCallable } = getFirebaseClients();
  const call = httpsCallable(functions, 'syncMyHelperVerificationStatus');
  const res = await call({});
  return res.data || {};
}

export async function updateWebHelperLiveLocation(coords) {
  const { functions, httpsCallable } = getFirebaseClients();
  const call = httpsCallable(functions, 'updateWebHelperLiveLocation');
  const res = await call(coords);
  return res.data || {};
}

export async function reportHelperAppVisibility(state) {
  const { functions, httpsCallable } = getFirebaseClients();
  const call = httpsCallable(functions, 'reportHelperAppVisibility');
  const res = await call(state);
  return res.data || {};
}

export async function sendHelperRequestMessage({ requestId, text }) {
  const { functions, httpsCallable } = getFirebaseClients();
  const call = httpsCallable(functions, 'sendHelperRequestMessage');
  const res = await call({ requestId, text });
  return res.data || {};
}

export async function respondToServiceRequestOfferApi({ requestId, offerToken, offerRevision, action }) {
  const { auth } = getFirebaseClients();
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('You must be signed in to respond to this offer.');
  }
  const endpoint = getFunctionEndpoint('respondToServiceRequestOffer');
  return fetchJsonWithRetry(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ requestId, offerToken, offerRevision, action }),
    },
    { defaultErrorMessage: 'Unable to process offer response.' },
  );
}

async function fetchJsonWithRetry(url, fetchOptions, { retries = 2, defaultErrorMessage = 'Request failed right now.' } = {}) {
  let lastNetworkError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, fetchOptions);
      if ([502, 503, 504].includes(response.status) && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        continue;
      }
      const text = await response.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { message: response.ok ? 'Invalid response from server.' : `${defaultErrorMessage} (${response.status})` };
        }
      }
      if (!response.ok || data?.success === false) {
        throw new Error(data?.message || defaultErrorMessage);
      }
      return data;
    } catch (err) {
      const isNetworkError = err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(String(err?.message || ''));
      if (isNetworkError && attempt < retries) {
        lastNetworkError = err;
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        continue;
      }
      if (isNetworkError) {
        throw new Error('Unable to reach Uncedo servers right now. Please check your connection and try again.');
      }
      throw err;
    }
  }
  throw lastNetworkError || new Error(defaultErrorMessage);
}

export async function updateHelperServiceRequestApi({ requestId, action, status, reason, arrivalPin }) {
  const { auth } = getFirebaseClients();
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('You must be signed in to update this job.');
  }
  const endpoint = getFunctionEndpoint('updateHelperServiceRequest');
  const payload = { requestId, action, status, reason };
  if (arrivalPin !== undefined && arrivalPin !== null && String(arrivalPin).trim() !== '') {
    payload.arrivalPin = String(arrivalPin).replace(/\D+/g, '').trim();
  }
  return fetchJsonWithRetry(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    },
    { defaultErrorMessage: 'Unable to update service request.' },
  );
}

export async function uploadCompletionProofPhotos({ helperId, requestId, files = [] }) {
  if (!helperId || !requestId || !files.length) return [];
  const uploads = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const safeName = String(file?.name || `job-proof-${index + 1}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const uploaded = await uploadHelperFile({
      uid: helperId,
      file,
      pathPrefix: 'helper-completion-proof',
      objectPath: `helper-completion-proof/${helperId}/${requestId}/${Date.now()}-${index + 1}-${safeName}`,
    });
    uploads.push(uploaded);
  }
  const { db, firestoreModule } = getFirebaseClients();
  await firestoreModule.updateDoc(firestoreModule.doc(db, 'serviceRequests', requestId), {
    completionProofAttachments: uploads,
    completionProofCount: uploads.length,
    completionProofCapturedAt: firestoreModule.serverTimestamp(),
    updatedAt: firestoreModule.serverTimestamp(),
  });
  return uploads;
}

export async function finalizeServiceRequestBillingApi({ requestId, retryConfirmedFailure = false }) {
  const { auth } = getFirebaseClients();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('You must be signed in to complete this job.');
  return fetchJsonWithRetry(
    getFunctionEndpoint('finalizeServiceRequestBilling'),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requestId, retryConfirmedFailure }),
    },
    { defaultErrorMessage: 'Unable to finalize service billing right now.' },
  );
}

export async function getHelperCashPaymentConfirmationsApi() {
  const { auth } = getFirebaseClients();
  const token = await auth.currentUser?.getIdToken();
  if (!token) return [];
  const response = await fetch(getFunctionEndpoint('getHelperCashPaymentConfirmations'), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.message || 'Unable to load pending cash confirmations.');
  }
  return Array.isArray(payload.confirmations) ? payload.confirmations : [];
}

export async function respondToCashServicePaymentApi({ requestId, attemptId, action }) {
  const { auth } = getFirebaseClients();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('You must be signed in to confirm cash payments.');
  return fetchJsonWithRetry(
    getFunctionEndpoint('respondToCashServicePayment'),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requestId, attemptId, action }),
    },
    { defaultErrorMessage: 'Unable to update cash payment status.' },
  );
}

export function subscribeToServicePaymentOperation(requestId, callback) {
  if (!requestId) {
    callback(null);
    return () => {};
  }
  const { db, firestoreModule } = getFirebaseClients();
  return firestoreModule.onSnapshot(
    firestoreModule.doc(db, 'servicePaymentOperations', requestId),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    () => callback(null),
  );
}

export async function submitServiceRequestRatingApi({ requestId, score, comment = '' }) {
  const { auth } = getFirebaseClients();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('You must be signed in to submit a rating.');
  const normalizedScore = Math.max(1, Math.min(5, Math.round(Number(score || 0))));
  return fetchJsonWithRetry(
    getFunctionEndpoint('submitServiceRequestRating'),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requestId,
        score: normalizedScore,
        comment: String(comment || '').trim(),
      }),
    },
    { defaultErrorMessage: 'Unable to submit rating.' },
  );
}

export function normalizeTimestampMs(value) {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mapServiceRequestToOffer(request) {
  if (!request?.id) return null;
  const timingPreference = String(request?.requestPayload?.timingPreference || 'now').trim().toLowerCase();
  const scheduledForText = String(request?.requestPayload?.scheduledForText || '').trim();
  const payoutEstimate =
    Number(
      request.pricingSnapshot?.total
        ?? request.pricingSnapshot?.totalAmount
        ?? request.pricingSnapshot?.finalPrice
        ?? request.pricingSnapshot?.finalAmount
        ?? request.pricingSnapshot?.basePrice
        ?? 0,
    ) || 0;

  return {
    ...request,
    id: request.id,
    requestId: request.id,
    title: request.topic || request.subject || request.serviceSummary || 'Service request',
    description: request.description || request.serviceSummary || 'A customer is requesting help.',
    customerName: request.customerName || 'Customer',
    payoutEstimate,
    offerExpiresAt: normalizeTimestampMs(request.offerExpiresAt),
    lastOfferAt: normalizeTimestampMs(request.lastOfferAt),
    offerToken: String(request.offerToken || ''),
    offerRevision: Number(request.offerRevision || 0),
    offerType: String(request.offerType || ''),
    offerBusyActiveRequestId: String(request.offerBusyActiveRequestId || ''),
    queuedEtaSummary: request.queuedEtaSummary || null,
    pendingBusyAssignment: request.pendingBusyAssignment || null,
    area:
      request.requestPayload?.serviceAddress
      || request.requestPayload?.address
      || request.serviceAddress
      || 'Location pending',
    timingPreference,
    scheduledForText,
  };
}

export function subscribeToPendingHelperOffers(helperId, callback) {
  if (!helperId) {
    callback([]);
    return () => {};
  }
  const { db, firestoreModule } = getFirebaseClients();
  const q = firestoreModule.query(
    firestoreModule.collection(db, 'serviceRequests'),
    firestoreModule.where('currentOfferHelperId', '==', helperId),
  );
  return firestoreModule.onSnapshot(q, (snap) => {
    const now = Date.now();
    const offers = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((item) => String(item.status || '').toLowerCase() === 'helper_found')
      .filter((item) => {
        const exp = normalizeTimestampMs(item.offerExpiresAt);
        return !exp || exp > now;
      })
      .sort((left, right) => normalizeTimestampMs(right.updatedAt) - normalizeTimestampMs(left.updatedAt))
      .map(mapServiceRequestToOffer)
      .filter(Boolean);
    callback(offers);
  }, () => callback([]));
}

export function subscribeToActiveServiceRequest(requestId, callback) {
  const { db, firestoreModule } = getFirebaseClients();
  return firestoreModule.onSnapshot(firestoreModule.doc(db, 'serviceRequests', requestId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, () => callback(null));
}

export function subscribeToRequestMessages(requestId, callback) {
  const { db, firestoreModule } = getFirebaseClients();
  const q = firestoreModule.query(
    firestoreModule.collection(db, 'serviceRequests', requestId, 'messages'),
    firestoreModule.orderBy('createdAtMs', 'asc'),
  );
  return firestoreModule.onSnapshot(q, (snap) => {
    const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(msgs);
  }, () => callback([]));
}

export function subscribeToHelperServiceRequests(helperId, callback, onError) {
  if (!helperId) {
    callback([]);
    return () => {};
  }
  const { db, firestoreModule } = getFirebaseClients();
  const q = firestoreModule.query(
    firestoreModule.collection(db, 'serviceRequests'),
    firestoreModule.where('helperAssignment.helperId', '==', helperId),
    firestoreModule.orderBy('createdAt', 'desc'),
    firestoreModule.limit(30),
  );
  return firestoreModule.onSnapshot(
    q,
    (snap) => {
      const requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(requests);
    },
    (err) => {
      onError?.(err);
      callback([]);
    },
  );
}

