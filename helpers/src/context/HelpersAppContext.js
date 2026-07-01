import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getServiceById } from '../constants/serviceCatalog';
import { useAuth } from './AuthContext';
import { updateHelperProfile } from '../services/userService';
import { logError, logInfo } from '../services/logger';
import { deleteUploadedFile, uploadLocalFile } from '../services/storageService';
import { groupCompletedJobsByWeek, HELPER_PAYOUT_RATE, PLATFORM_FEE_RATE, shouldIncludeJobInPayouts } from '../utils/payouts';
import { acceptHelperAgreement as acceptHelperAgreementRequest } from '../services/legalAgreementService';
import { subscribeToHelperWeeklyPayouts } from '../services/helperPayoutService';
import {
  requestHelperLocationPermission,
  syncHelperCurrentLocation,
  watchAndSyncHelperLocation,
} from '../services/helperLocationService';
import { subscribeToServiceCatalog } from '../services/serviceCatalogService';
import {
  getStoredActiveTrackingSession,
  isTrackableActiveJobStatus,
  stopActiveJobTracking,
} from '../services/activeJobTrackingService';
import {
  acceptServiceRequestOffer,
  declineServiceRequestOffer,
  mapServiceRequestToActiveJob,
  mapServiceRequestToHistoryItem,
  mapServiceRequestToOffer,
  subscribeToHelperActiveServiceRequest,
  subscribeToHelperAvailableServiceRequests,
  subscribeToHelperServiceRequests,
  updateHelperActiveRequestStatus,
  cancelServiceRequest,
  finalizeServiceRequestBilling,
} from '../services/serviceRequestService';

const HelpersAppContext = createContext(null);

const FALLBACK_PROFILE = {
  firstName: '',
  lastName: '',
  fullName: '',
  providerType: '',
  businessName: '',
  phoneNumber: '',
  homeAddress: '',
  city: 'Johannesburg',
  rating: 0,
  profilePhoto: '',
  profilePhotoObjectPath: '',
  onlineStatus: 'offline',
  locationSharingEnabled: false,
  liveLocation: null,
  verificationStatus: 'pending',
  agreement: {
    documentId: 'helper_agreement',
    title: 'Helper Agreement',
    legalEntityName: 'Parakleo, operated by Jabu Msiza',
    acceptedVersion: '',
    requiredVersion: '1.0.1',
    requiredVersionId: 'helper_agreement_1.0.1',
    currentVersion: '1.0.1',
    currentVersionId: 'helper_agreement_1.0.1',
    currentVersionAccepted: false,
    acceptedCurrentVersion: false,
    acceptedAt: null,
  },
  payout: {
    bankName: '',
    accountHolder: '',
    accountNumber: '',
    recipientCode: '',
    verificationStatus: 'pending',
  },
  services: [],
  metrics: {
    acceptanceRate: 0,
    completionRate: 0,
    overallRating: 0,
    avgResponseMinutes: 0,
    cancellationRate: 0,
    recentAssignmentsCount: 0,
  },
};

const INITIAL_WEEKLY_PAYOUTS = [];

function createPicture(uri) {
  const normalizedUri = typeof uri === 'string' ? uri : uri?.uri;
  return {
    id: `pic_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    uri: String(normalizedUri || '').trim(),
    objectPath: typeof uri === 'object' ? String(uri?.objectPath || '').trim() : '',
    uploadedAt: typeof uri === 'object' ? (uri?.uploadedAt || new Date().toISOString()) : new Date().toISOString(),
  };
}

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizePictureEntry(picture) {
  if (!picture) return null;
  if (typeof picture === 'string') {
    const normalizedUri = String(picture || '').trim();
    if (!normalizedUri) return null;
    return createPicture(normalizedUri);
  }

  const normalizedUri = String(picture.uri || picture.downloadUrl || '').trim();
  if (!normalizedUri) return null;

  return {
    id: String(picture.id || `pic_${slugify(normalizedUri).slice(0, 24)}`),
    uri: normalizedUri,
    objectPath: String(picture.objectPath || '').trim(),
    uploadedAt: picture.uploadedAt || new Date().toISOString(),
  };
}

function resolveSkillCatalogId(skill = {}) {
  return String(skill.catalogId || skill.serviceCatalogId || slugify(skill.name || '')).trim().toLowerCase();
}

function normalizeCatalogIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean),
  )];
}

function findExistingSkillEntry(existingSkills = [], skill = {}) {
  const targetId = String(skill.id || '').trim();
  const targetCatalogId = resolveSkillCatalogId(skill);
  const targetName = String(skill.name || '').trim();

  return (Array.isArray(existingSkills) ? existingSkills : []).find((entry) => (
    (targetId && String(entry?.id || '').trim() === targetId)
    || (targetCatalogId && resolveSkillCatalogId(entry) === targetCatalogId)
    || (targetName && String(entry?.name || '').trim() === targetName)
  )) || null;
}

function normalizeSkillEntry(skill = {}, serviceId = '', existingSkill = null) {
  const skillName = String(skill.name || '').trim();
  if (!skillName) return null;

  const explicitStatus = String(skill.status || '').trim().toLowerCase();
  const fallbackStatus = String(existingSkill?.status || '').trim().toLowerCase();

  return {
    id: String(skill.id || `skill_${serviceId}_${slugify(skillName)}`),
    catalogId: resolveSkillCatalogId(skill),
    name: skillName,
    status: explicitStatus || fallbackStatus || 'pending',
    active: typeof skill.active === 'boolean'
      ? skill.active
      : (typeof existingSkill?.active === 'boolean' ? existingSkill.active : true),
    verified: typeof skill.verified === 'boolean'
      ? skill.verified
      : (typeof existingSkill?.verified === 'boolean' ? existingSkill.verified : true),
    approvalSource: String(skill.approvalSource || existingSkill?.approvalSource || '').trim().toLowerCase(),
    derivedFromBundleIds: [...new Set((Array.isArray(skill.derivedFromBundleIds) ? skill.derivedFromBundleIds : [])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean))],
    derivedFromServiceIds: [...new Set((Array.isArray(skill.derivedFromServiceIds) ? skill.derivedFromServiceIds : [])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean))],
    createdAt: skill.createdAt || null,
    updatedAt: skill.updatedAt || skill.createdAt || null,
    pictures: (Array.isArray(skill.pictures) ? skill.pictures : [])
      .map(normalizePictureEntry)
      .filter(Boolean),
  };
}

function normalizeServiceEntry(entry = {}, existingEntry = null) {
  const serviceId = String(entry.serviceId || '').trim();
  if (!serviceId) return null;

  const serviceMeta = getServiceById(serviceId);
  return {
    ...entry,
    serviceId,
    serviceName: serviceMeta?.name || entry.serviceName || serviceId,
    description: serviceMeta?.description || entry.description || '',
    catalogId: String(entry.catalogId || '').trim().toLowerCase(),
    skills: (Array.isArray(entry.skills) ? entry.skills : [])
      .map((skill) => normalizeSkillEntry(skill, serviceId, findExistingSkillEntry(existingEntry?.skills || [], skill)))
      .filter(Boolean),
  };
}

function normalizeServices(services = [], existingServices = []) {
  return (Array.isArray(services) ? services : [])
    .map((entry) => normalizeServiceEntry(
      entry,
      (Array.isArray(existingServices) ? existingServices : []).find((service) => String(service?.serviceId || '').trim() === String(entry?.serviceId || '').trim()) || null,
    ))
    .filter(Boolean)
    .filter((entry) => Array.isArray(entry.skills) && entry.skills.length > 0);
}

function buildHelperSkillsList(services = []) {
  return normalizeServices(services).flatMap((service) => (
    (service.skills || []).map((skill) => ({
      ...skill,
      serviceId: service.serviceId,
      serviceName: service.serviceName,
      serviceDescription: service.description,
      catalogId: skill.catalogId || slugify(skill.name),
      categoryId: service.serviceId,
    }))
  ));
}

function withServiceMetadata(profile, existingProfile = null) {
  return {
    ...profile,
    services: normalizeServices(profile.services || [], existingProfile?.services || []),
  };
}

function normalizeProfile(user, existingProfile = null) {
  if (!user) return withServiceMetadata(FALLBACK_PROFILE, existingProfile);

  const fullName = String(user.fullName || user.displayName || '').trim();
  const firstName = String(user.firstName || '').trim();
  const lastName = String(user.lastName || '').trim();

  return withServiceMetadata({
    ...FALLBACK_PROFILE,
    ...user,
    fullName,
    firstName,
    lastName,
    payout: {
      ...FALLBACK_PROFILE.payout,
      ...(user.payout || {}),
    },
    agreement: {
      ...FALLBACK_PROFILE.agreement,
      ...(user.agreement || {}),
    },
    metrics: {
      ...FALLBACK_PROFILE.metrics,
      ...(user.metrics || {}),
    },
    services: Array.isArray(user.services) ? user.services : [],
  }, existingProfile);
}

function getStablePictureSignature(picture = {}) {
  return {
    id: String(picture?.id || '').trim(),
    uri: String(picture?.uri || picture?.downloadUrl || '').trim(),
    objectPath: String(picture?.objectPath || '').trim(),
  };
}

function getStableSkillSignature(skill = {}) {
  return {
    id: String(skill?.id || '').trim(),
    catalogId: String(skill?.catalogId || skill?.serviceCatalogId || '').trim().toLowerCase(),
    name: String(skill?.name || '').trim(),
    status: String(skill?.status || '').trim().toLowerCase(),
    active: skill?.active === true,
    verified: skill?.verified === true,
    approvalSource: String(skill?.approvalSource || '').trim().toLowerCase(),
    derivedFromBundleIds: normalizeCatalogIdList(skill?.derivedFromBundleIds),
    derivedFromServiceIds: normalizeCatalogIdList(skill?.derivedFromServiceIds),
    pictures: (Array.isArray(skill?.pictures) ? skill.pictures : []).map(getStablePictureSignature),
  };
}

function getStableServiceSignature(service = {}) {
  return {
    serviceId: String(service?.serviceId || '').trim(),
    serviceName: String(service?.serviceName || '').trim(),
    description: String(service?.description || '').trim(),
    catalogId: String(service?.catalogId || '').trim().toLowerCase(),
    skills: (Array.isArray(service?.skills) ? service.skills : []).map(getStableSkillSignature),
  };
}

function getServicesSignature(services = []) {
  return JSON.stringify(
    (Array.isArray(services) ? services : [])
      .map(getStableServiceSignature)
      .filter((service) => service.serviceId),
  );
}

function getHelperOnboardingStatus(profile, { serviceCatalog = [], serviceCatalogResolved = false } = {}) {
  const firstName = String(profile?.firstName || '').trim();
  const lastName = String(profile?.lastName || '').trim();
  const fullName = String(profile?.fullName || '').trim();
  const providerType = String(profile?.providerType || '').trim().toLowerCase();
  const businessName = String(profile?.businessName || '').trim();
  const hasAgreement = profile?.agreement?.acceptedVersion
    && profile?.agreement?.acceptedVersion === profile?.agreement?.requiredVersion
    && (
      profile?.agreement?.currentVersionAccepted === true
      || profile?.agreement?.acceptedCurrentVersion === true
      || profile?.agreement?.acceptedVersion === profile?.agreement?.requiredVersion
    );
  const payout = profile?.payout || {};
  const hasPayout = Boolean(
    payout.bankName
    && payout.accountHolder
    && payout.accountNumber
    && payout.recipientCode
    && payout.verificationStatus === 'verified'
  );
  const isVerified = profile?.verificationStatus === 'verified';
  const services = Array.isArray(profile?.services) ? profile.services : [];
  const helperSkills = buildHelperSkillsList(services);
  const hasAnyService = helperSkills.length > 0;
  const activeCatalogIds = new Set(
    (Array.isArray(serviceCatalog) ? serviceCatalog : [])
      .filter((entry) => entry.active !== false)
      .map((entry) => String(entry.id || '').trim().toLowerCase())
      .filter(Boolean),
  );
  const activeCatalogMap = new Map(
    (Array.isArray(serviceCatalog) ? serviceCatalog : [])
      .filter((entry) => entry.active !== false)
      .map((entry) => [String(entry.id || '').trim().toLowerCase(), entry]),
  );
  const hasQualifiedSkills = services.some((service) => (
    Array.isArray(service.skills)
    && service.skills.some((skill) => (
      skill.status === 'approved'
      && skill.active !== false
      && (serviceCatalogResolved ? activeCatalogIds.has(String(skill.catalogId || slugify(skill.name)).trim().toLowerCase()) : true)
      && (
        (Array.isArray(skill.pictures) && skill.pictures.length > 0)
        || Boolean(
          activeCatalogMap.get(String(skill.catalogId || slugify(skill.name)).trim().toLowerCase())?.kind === 'bundle'
          && activeCatalogMap.get(String(skill.catalogId || slugify(skill.name)).trim().toLowerCase())?.inheritBundleImages !== false
        )
      )
    ))
  ));
  const hasProfilePhoto = Boolean(String(profile?.profilePhoto || profile?.selfieUrl || '').trim());
  const hasName = Boolean(fullName || (firstName && lastName));
  const hasProviderType = providerType === 'individual' || providerType === 'business';
  const hasBusinessName = providerType !== 'business' || Boolean(businessName);

  if (!hasName) {
    return { complete: false, step: 'profile', message: 'Add the helper name before going online.' };
  }

  if (!hasProviderType) {
    return { complete: false, step: 'profile', message: 'Choose whether the helper profile is an individual or a business.' };
  }

  if (!hasBusinessName) {
    return { complete: false, step: 'profile', message: 'Add the business name before going online.' };
  }

  if (!hasProfilePhoto) {
    return { complete: false, step: 'profile', message: 'Capture a helper profile selfie before going online.' };
  }

  if (!hasAnyService) {
    return { complete: false, step: 'services', message: 'Add at least one helper skill before going online.' };
  }

  if (!serviceCatalogResolved) {
    return { complete: false, step: 'services', message: 'Loading the live service catalog...' };
  }

  if (!hasQualifiedSkills) {
      return { complete: false, step: 'services', message: 'Add at least one approved skill with a portfolio or an approved inherited bundle before going online.' };
  }

  if (!hasAgreement) {
    return { complete: false, step: 'agreement', message: 'Accept the latest Helper Agreement before going online.' };
  }

  if (!hasPayout) {
    return { complete: false, step: 'payout', message: 'Add verified payout details so Uncedo can pay your helper share.' };
  }

  if (!isVerified) {
    return { complete: false, step: 'verification', message: 'Your account must be verified before you can accept helper jobs.' };
  }

  return {
    complete: true,
    step: null,
    message: 'Helper profile complete. You can go online, accept jobs, and receive payouts.',
  };
}

export function HelpersAppProvider({ children }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState(() => normalizeProfile(user));
  const [jobOffers, setJobOffers] = useState([]);
  const [activeJob, setActiveJob] = useState(null);
  const [activeJobResolved, setActiveJobResolved] = useState(false);
  const [serviceRequests, setServiceRequests] = useState([]);
  const [weeklyPayouts, setWeeklyPayouts] = useState(INITIAL_WEEKLY_PAYOUTS);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [offerResponseState, setOfferResponseState] = useState({ offerId: '', action: '' });
  const [homeLocation, setHomeLocation] = useState(null);
  const [serviceCatalog, setServiceCatalog] = useState([]);
  const [serviceCatalogResolved, setServiceCatalogResolved] = useState(false);
  const helperLocationWatchRef = useRef(null);
  const activeJobCleanupPromiseRef = useRef(null);
  const pendingServicesSignatureRef = useRef('');

  useEffect(() => {
    setProfile((current) => {
      const normalizedUserProfile = normalizeProfile(user, current);
      const incomingServicesSignature = getServicesSignature(normalizedUserProfile.services || []);

      if (pendingServicesSignatureRef.current) {
        if (incomingServicesSignature === pendingServicesSignatureRef.current) {
          pendingServicesSignatureRef.current = '';
          return normalizedUserProfile;
        }

        return withServiceMetadata({
          ...normalizedUserProfile,
          services: current?.services || [],
        });
      }

      return normalizedUserProfile;
    });
  }, [user]);

  useEffect(() => {
    if (!user?.uid) {
      setJobOffers([]);
      setOfferResponseState({ offerId: '', action: '' });
      return () => {};
    }

    return subscribeToHelperAvailableServiceRequests(
      user.uid,
      (items) => {
        const mappedOffers = items.map(mapServiceRequestToOffer).filter(Boolean);
        logInfo('HelpersAppContext.jobOffers', 'Received helper job offers update.', {
          helperId: user.uid,
          rawCount: items.length,
          mappedCount: mappedOffers.length,
          requestIds: mappedOffers.map((offer) => offer.id),
          statuses: mappedOffers.map((offer) => offer.status),
        });
        setJobOffers(mappedOffers);
      },
      (error) => {
        logError('HelpersAppContext.jobOffers', error);
      },
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!offerResponseState.offerId) {
      return;
    }

    const stillPresent = jobOffers.some((item) => item.id === offerResponseState.offerId);
    if (!stillPresent) {
      setOfferResponseState({ offerId: '', action: '' });
    }
  }, [jobOffers, offerResponseState.offerId]);

  useEffect(() => {
    if (!user?.uid) {
      setHomeLocation(null);
    }
  }, [user?.uid]);

  useEffect(() => {
    const unsubscribe = subscribeToServiceCatalog(
      (items) => {
        setServiceCatalog(items);
        setServiceCatalogResolved(true);
      },
      (error) => {
        logError('HelpersAppContext.serviceCatalog', error);
        setServiceCatalog([]);
        setServiceCatalogResolved(true);
      },
    );

    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setActiveJob(null);
      setActiveJobResolved(false);
      return () => {};
    }

    setActiveJobResolved(false);

    return subscribeToHelperActiveServiceRequest(
      user.uid,
      (item) => {
        setActiveJob(item ? mapServiceRequestToActiveJob(item) : null);
        setActiveJobResolved(true);
      },
      (error) => {
        setActiveJobResolved(true);
        logError('HelpersAppContext.activeJob', error);
      },
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setServiceRequests([]);
      return () => {};
    }

    return subscribeToHelperServiceRequests(
      user.uid,
      (items) => {
        setServiceRequests(items.map(mapServiceRequestToHistoryItem).filter(Boolean));
      },
      (error) => {
        logError('HelpersAppContext.serviceRequests', error);
      },
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setWeeklyPayouts([]);
      return () => {};
    }

    return subscribeToHelperWeeklyPayouts(
      user.uid,
      (items) => {
        setWeeklyPayouts(items);
      },
      (error) => {
        logError('HelpersAppContext.weeklyPayouts', error);
      },
    );
  }, [user?.uid]);

  useEffect(() => {
    let active = true;

    const stopWatchingLocation = () => {
      helperLocationWatchRef.current?.remove?.();
      helperLocationWatchRef.current = null;
    };

    if (!user?.uid || profile.onlineStatus !== 'online') {
      stopWatchingLocation();
      return () => {
        active = false;
      };
    }

    const startLocationSharing = async () => {
      try {
        const granted = await requestHelperLocationPermission();
        if (!active) return;

        if (!granted) {
          setSaveError('Location permission is required to show this helper on the nearby customer map.');
          return;
        }

        setSaveError('');
        const initialLocation = await syncHelperCurrentLocation();
        if (!active) return;
        setHomeLocation(initialLocation);

        helperLocationWatchRef.current = await watchAndSyncHelperLocation((nextLocation) => {
          if (!active) {
            return;
          }
          setHomeLocation(nextLocation);
        });
      } catch (error) {
        logError('HelpersAppContext.locationSharing', error);
        if (active) {
          setSaveError(error.message || 'Unable to share helper location right now.');
        }
      }
    };

    startLocationSharing();

    return () => {
      active = false;
      stopWatchingLocation();
    };
  }, [profile.onlineStatus, user?.uid]);

  useEffect(() => {
    let cancelled = false;

    const stopStaleTrackingSession = async () => {
      if (user?.uid && !activeJobResolved) {
        return;
      }

      const session = await getStoredActiveTrackingSession();
      if (cancelled || !session?.requestId) {
        return;
      }

      const activeRequestId = String(activeJob?.requestId || '').trim();
      const hasTrackableActiveJob = Boolean(
        user?.uid
        && activeRequestId
        && activeJob?.location
        && isTrackableActiveJobStatus(activeJob?.status),
      );

      if (hasTrackableActiveJob && session.requestId === activeRequestId) {
        return;
      }

      await finalizeActiveJobCleanup(activeJob?.status || (!user?.uid ? 'signed_out' : 'inactive'))
        .catch((error) => logError('HelpersAppContext.stopStaleTrackingSession', error));
    };

    stopStaleTrackingSession();

    return () => {
      cancelled = true;
    };
  }, [activeJob?.location, activeJob?.requestId, activeJob?.status, activeJobResolved, profile.onlineStatus, user?.uid]);

  const persistProfileUpdate = async (updates, traceLabel = 'helpers:context:persistProfileUpdate') => {
    if (!user?.uid) {
      throw new Error('A helper session is required.');
    }

    setSaving(true);
    setSaveError('');

    try {
      await updateHelperProfile(user.uid, updates, traceLabel);
      return { success: true };
    } catch (error) {
      logError('HelpersAppContext.persistProfileUpdate', error);
      setSaveError(error.message || 'Unable to save helper profile changes.');
      return { success: false, message: error.message || 'Unable to save helper profile changes.' };
    } finally {
      setSaving(false);
    }
  };

  const finalizeActiveJobCleanup = async (finalStatus) => {
    if (activeJobCleanupPromiseRef.current) {
      return activeJobCleanupPromiseRef.current;
    }

    const cleanupPromise = stopActiveJobTracking({
      finalStatus,
      keepLocationSharingEnabled: profile.onlineStatus === 'online',
    }).catch((error) => {
      logError('HelpersAppContext.finalizeActiveJobCleanup', error);
      throw error;
    }).finally(() => {
      activeJobCleanupPromiseRef.current = null;
    });

    activeJobCleanupPromiseRef.current = cleanupPromise;
    return cleanupPromise;
  };

  const applyProfileUpdate = async (updater, traceLabel = 'helpers:context:applyProfileUpdate') => {
    const nextProfile = withServiceMetadata(updater(profile));
    const currentServicesSignature = getServicesSignature(profile.services || []);
    const nextServicesSignature = getServicesSignature(nextProfile.services || []);
    if (currentServicesSignature !== nextServicesSignature) {
      pendingServicesSignatureRef.current = nextServicesSignature;
    }
    setProfile(nextProfile);
    const result = await persistProfileUpdate(nextProfile, traceLabel);
    if (!result.success) {
      pendingServicesSignatureRef.current = '';
      setProfile((current) => normalizeProfile(user, current));
    }
    return result;
  };

  const onboardingStatus = useMemo(
    () => getHelperOnboardingStatus(profile, { serviceCatalog, serviceCatalogResolved }),
    [profile, serviceCatalog, serviceCatalogResolved],
  );
  const helperSkills = useMemo(() => buildHelperSkillsList(profile.services || []), [profile.services]);

  const completedJobs = useMemo(
    () => serviceRequests.filter((item) => shouldIncludeJobInPayouts(item)),
    [serviceRequests],
  );

  const weeklyGroups = useMemo(
    () => groupCompletedJobsByWeek(completedJobs, weeklyPayouts),
    [completedJobs, weeklyPayouts],
  );

  const paymentSummary = useMemo(() => {
    const lifetimeHelperEarnings = weeklyGroups.reduce((sum, item) => sum + Number(item.helperAmount || 0), 0);
    const paidAmount = weeklyGroups
      .filter((item) => item.status === 'paid')
      .reduce((sum, item) => sum + Number(item.helperAmount || 0), 0);
    const unpaidAmount = weeklyGroups
      .filter((item) => item.status !== 'paid')
      .reduce((sum, item) => sum + Number(item.helperAmount || 0), 0);

    return {
      lifetimeHelperEarnings,
      paidAmount,
      unpaidAmount,
      currentWeekAmount: Number(weeklyGroups[0]?.helperAmount || 0),
    };
  }, [weeklyGroups]);

  const toggleOnlineStatus = async () => {
    if (!onboardingStatus.complete) {
      return { success: false, message: onboardingStatus.message };
    }

    return applyProfileUpdate((current) => ({
      ...current,
      onlineStatus: current.onlineStatus === 'online' ? 'offline' : 'online',
      locationSharingEnabled: current.onlineStatus === 'online' ? false : current.locationSharingEnabled,
    }), 'helpers:context:toggleOnlineStatus');
  };

  const acceptOffer = async (offerId) => {
    const offer = jobOffers.find((item) => item.id === offerId);
    if (!offer || !user?.uid) return;

    setSaveError('');
    setOfferResponseState({ offerId, action: 'accept' });
    try {
      await acceptServiceRequestOffer({
        requestId: offer.requestId || offer.id,
        helperId: user.uid,
        helperName: user.fullName || user.displayName || user.email,
        helperEmail: user.email || '',
      });
    } catch (error) {
      logError('HelpersAppContext.acceptOffer', error);
      setSaveError(error.message || 'Unable to accept this helper offer right now.');
      setOfferResponseState({ offerId: '', action: '' });
    }
  };

  const declineOffer = async (offerId) => {
    const offer = jobOffers.find((item) => item.id === offerId);
    if (!offer || !user?.uid) return;

    setSaveError('');
    setOfferResponseState({ offerId, action: 'decline' });
    try {
      await declineServiceRequestOffer({
        requestId: offer.requestId || offer.id,
        helperId: user.uid,
      });
    } catch (error) {
      logError('HelpersAppContext.declineOffer', error);
      setSaveError(error.message || 'Unable to decline this helper offer right now.');
      setOfferResponseState({ offerId: '', action: '' });
    }
  };

  const updateActiveJobStatus = async (status) => {
    if (!activeJob?.requestId || !user?.uid) return false;

    const nextStatus = status === 'in_progress' ? 'en_route' : status;
    setSaveError('');
    try {
      await updateHelperActiveRequestStatus({
        requestId: activeJob.requestId,
        helperId: user.uid,
        status: nextStatus,
      });
      if (['completed', 'canceled', 'rejected', 'inactive'].includes(String(nextStatus || '').toLowerCase())) {
        await finalizeActiveJobCleanup(nextStatus);
      }
      return true;
    } catch (error) {
      logError('HelpersAppContext.updateActiveJobStatus', error);
      setSaveError(error.message || 'Unable to update this helper job.');
      return false;
    }
  };

  const completeActiveJob = async () => {
    if (!activeJob) return false;

    setSaveError('');
    try {
      if (activeJob.requestId && user?.uid) {
        await updateHelperActiveRequestStatus({
          requestId: activeJob.requestId,
          helperId: user.uid,
          status: 'completed',
        });
      }
    } catch (error) {
      logError('HelpersAppContext.completeActiveJob', error);
      setSaveError(error.message || 'Unable to complete this helper job.');
      return false;
    }

    await finalizeActiveJobCleanup('completed').catch((error) => logError('HelpersAppContext.completeActiveJob.stopTracking', error));

    return true;
  };

  const cancelActiveJob = async (reason) => {
    if (!activeJob?.requestId || !user?.uid) return false;
    setSaving(true);
    setSaveError('');
    try {
      await cancelServiceRequest({
        requestId: activeJob.requestId,
        helperId: user.uid,
        reason,
      });
      await finalizeActiveJobCleanup('canceled');
      return true;
    } catch (error) {
      logError('HelpersAppContext.cancelActiveJob', error);
      setSaveError(error.message || 'Unable to cancel this job.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const completeActiveJobWithBilling = async () => {
    if (!activeJob?.requestId) return false;
    setSaving(true);
    setSaveError('');
    try {
      const result = await finalizeServiceRequestBilling({
        requestId: activeJob.requestId,
      });
      await finalizeActiveJobCleanup('completed').catch((error) => logError('HelpersAppContext.completeActiveJobWithBilling.stopTracking', error));
      return result || true;
    } catch (error) {
      logError('HelpersAppContext.completeActiveJobWithBilling', error);
      setSaveError(error.message || 'Unable to finalize billing for this job.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addSkillPicture = async ({ serviceId, skillName, pictureUri }) => {
    const normalizedUri = String(pictureUri || '').trim();
    if (!serviceId || !skillName || !normalizedUri) {
      return { success: false, message: 'A service, skill, and work photo are required.' };
    }

    return applyProfileUpdate((current) => {
      const existingServices = Array.isArray(current.services) ? [...current.services] : [];
      const targetIndex = existingServices.findIndex((service) => service.serviceId === serviceId);
      const serviceMeta = getServiceById(serviceId);
      const nextService = targetIndex >= 0
        ? { ...existingServices[targetIndex], skills: [...(existingServices[targetIndex].skills || [])] }
        : {
            serviceId,
            serviceName: serviceMeta?.name || serviceId,
            description: serviceMeta?.description || '',
            skills: [],
          };

      const existingSkillIndex = nextService.skills.findIndex((skill) => skill.name === skillName);
      if (existingSkillIndex >= 0) {
        const currentSkill = nextService.skills[existingSkillIndex];
        nextService.skills[existingSkillIndex] = {
          ...currentSkill,
          pictures: [...(currentSkill.pictures || []), createPicture(normalizedUri)],
        };
      } else {
        nextService.skills.push({
          name: skillName,
          pictures: [createPicture(normalizedUri)],
        });
      }

      if (targetIndex >= 0) {
        existingServices[targetIndex] = nextService;
      } else {
        existingServices.push(nextService);
      }

      return { ...current, services: existingServices };
    }, 'helpers:context:addSkillPicture').then((result) => (
      result.success
        ? { success: true, message: `${skillName} added with a linked work photo.` }
        : result
    ));
  };

  const saveProfilePhoto = async ({ imageAsset, source = 'camera' }) => {
    if (!user?.uid || !imageAsset?.uri) {
      return { success: false, message: 'A captured profile image is required.' };
    }

    setSaving(true);
    setSaveError('');

    try {
      const upload = await uploadLocalFile({
        userId: user.uid,
        fileUri: imageAsset.uri,
        fileName: imageAsset.fileName || 'helper-selfie.jpg',
        mimeType: imageAsset.mimeType || 'image/jpeg',
        pathPrefix: 'helper-profile-photos',
      });

      const nextProfile = withServiceMetadata({
        ...profile,
        profilePhoto: upload.downloadUrl,
        selfieUrl: upload.downloadUrl,
        profilePhotoObjectPath: upload.objectPath,
        selfieCapturedAt: upload.uploadedAt,
        selfieCaptureSource: source,
      });

      setProfile(nextProfile);
      const result = await persistProfileUpdate(nextProfile, 'helpers:context:saveProfilePhoto');
      if (!result.success) {
        setProfile((current) => normalizeProfile(user, current));
        return result;
      }

      return { success: true, message: 'Profile selfie saved.' };
    } catch (error) {
      logError('HelpersAppContext.saveProfilePhoto', error);
      setSaveError(error.message || 'Unable to upload the profile selfie right now.');
      return { success: false, message: error.message || 'Unable to upload the profile selfie right now.' };
    } finally {
      setSaving(false);
    }
  };

  const addSkillWithPhoto = async ({ serviceId, skillName, catalogId, imageAsset, imageAssets }) => {
    const assets = [
      ...(Array.isArray(imageAssets) ? imageAssets : []),
      ...(imageAsset ? [imageAsset] : []),
    ].filter((asset) => asset?.uri).slice(0, 10);

    setSaving(true);
    setSaveError('');

    try {
      const normalizedCatalogId = String(catalogId || slugify(skillName)).trim().toLowerCase();
      const catalogEntry = (Array.isArray(serviceCatalog) ? serviceCatalog : []).find((entry) => String(entry.id || '').trim().toLowerCase() === normalizedCatalogId) || null;
      const allowsInheritedPortfolio = catalogEntry?.kind === 'bundle' && catalogEntry?.inheritBundleImages !== false;
      if (!user?.uid || !serviceId || !skillName || (!assets.length && !allowsInheritedPortfolio)) {
        return { success: false, message: 'A skill and uploaded work photo are required unless this bundle inherits its portfolio.' };
      }
      const nextTimestamp = new Date().toISOString();
      const uploads = [];

      for (const asset of assets) {
        const upload = await uploadLocalFile({
          userId: user.uid,
          fileUri: asset.uri,
          fileName: asset.fileName || `${slugify(skillName)}.jpg`,
          mimeType: asset.mimeType || 'image/jpeg',
          pathPrefix: `helper-skills/${serviceId}/${normalizedCatalogId || slugify(skillName)}`,
        });

        uploads.push(createPicture({
          uri: upload.downloadUrl,
          objectPath: upload.objectPath,
          uploadedAt: upload.uploadedAt,
        }));
      }

      const nextProfile = withServiceMetadata({
        ...profile,
        services: normalizeServices((profile.services || []).map((service) => ({ ...service }))),
      });
      const existingServices = [...nextProfile.services];
      const targetIndex = existingServices.findIndex((service) => service.serviceId === serviceId);
      const serviceMeta = getServiceById(serviceId);
      const targetService = targetIndex >= 0
        ? {
            ...existingServices[targetIndex],
            skills: [...(existingServices[targetIndex].skills || [])],
          }
        : {
            serviceId,
            serviceName: serviceMeta?.name || serviceId,
            description: serviceMeta?.description || '',
            skills: [],
          };

      const existingSkillIndex = targetService.skills.findIndex((skill) => (
        skill.name === skillName || slugify(skill.catalogId || skill.name) === normalizedCatalogId
      ));

      if (existingSkillIndex >= 0) {
        const currentSkill = targetService.skills[existingSkillIndex];
        const mergedPictures = [...(currentSkill.pictures || []), ...uploads].slice(0, 10);
        targetService.skills[existingSkillIndex] = normalizeSkillEntry({
          ...currentSkill,
          catalogId: normalizedCatalogId,
          status: currentSkill.status || 'pending',
          verified: currentSkill.verified === true,
          active: currentSkill.active === true && currentSkill.status === 'approved',
          updatedAt: nextTimestamp,
          pictures: mergedPictures,
        }, serviceId);
      } else {
        targetService.skills.push(normalizeSkillEntry({
          name: skillName,
          catalogId: normalizedCatalogId,
          status: 'pending',
          verified: false,
          active: false,
          createdAt: nextTimestamp,
          updatedAt: nextTimestamp,
          pictures: uploads,
        }, serviceId));
      }

      if (targetIndex >= 0) {
        existingServices[targetIndex] = targetService;
      } else {
        existingServices.push(targetService);
      }

      const persistedProfile = withServiceMetadata({
        ...nextProfile,
        services: existingServices,
      });
      pendingServicesSignatureRef.current = getServicesSignature(persistedProfile.services || []);

      setProfile(persistedProfile);
      const result = await persistProfileUpdate(persistedProfile, 'helpers:context:addSkillWithPhoto');
      if (!result.success) {
        pendingServicesSignatureRef.current = '';
        setProfile((current) => normalizeProfile(user, current));
        return result;
      }

      return { success: true, message: allowsInheritedPortfolio && !uploads.length ? `${skillName} submitted for approval with inherited bundle images.` : `${skillName} submitted for approval.` };
    } catch (error) {
      logError('HelpersAppContext.addSkillWithPhoto', error);
      setSaveError(error.message || 'Unable to upload this skill photo right now.');
      return { success: false, message: error.message || 'Unable to upload this skill photo right now.' };
    } finally {
      setSaving(false);
    }
  };

  const toggleSkillActive = async ({ serviceId, skillName, catalogId, active }) => {
    const normalizedCatalogId = String(catalogId || slugify(skillName)).trim().toLowerCase();
    return applyProfileUpdate((current) => ({
      ...current,
      services: normalizeServices((current.services || []).map((service) => {
        if (service.serviceId !== serviceId) return service;
        return {
          ...service,
          skills: (service.skills || []).map((skill) => (
            skill.name === skillName || resolveSkillCatalogId(skill) === normalizedCatalogId
              ? {
                  ...skill,
                  active: Boolean(active),
                  updatedAt: new Date().toISOString(),
                }
              : skill
          )),
        };
      })),
    }), 'helpers:context:toggleSkillActive');
  };

  const removeSkill = async ({ serviceId, skillName }) => {
    const targetService = (profile.services || []).find((service) => service.serviceId === serviceId);
    const targetSkill = (targetService?.skills || []).find((skill) => skill.name === skillName);
    const targetPictures = Array.isArray(targetSkill?.pictures) ? targetSkill.pictures : [];

    await Promise.all(
      targetPictures
        .map((picture) => picture?.objectPath)
        .filter(Boolean)
        .map((objectPath) => deleteUploadedFile(objectPath).catch((error) => {
          logError('HelpersAppContext.removeSkill.deleteUploadedFile', error);
        })),
    );

    return applyProfileUpdate((current) => ({
      ...current,
      services: (current.services || [])
        .map((service) => (
          service.serviceId === serviceId
            ? { ...service, skills: (service.skills || []).filter((skill) => skill.name !== skillName) }
            : service
        ))
        .filter((service) => (service.skills || []).length > 0),
    }), 'helpers:context:removeSkill');
  };

  const removeSkillPicture = async ({ serviceId, skillName, pictureId }) => {
    const targetService = (profile.services || []).find((service) => service.serviceId === serviceId);
    const targetSkill = (targetService?.skills || []).find((skill) => skill.name === skillName);
    const targetPicture = (targetSkill?.pictures || []).find((picture) => picture.id === pictureId);
    if (targetPicture?.objectPath) {
      await deleteUploadedFile(targetPicture.objectPath).catch((error) => {
        logError('HelpersAppContext.removeSkillPicture.deleteUploadedFile', error);
      });
    }

    return applyProfileUpdate((current) => ({
      ...current,
      services: (current.services || [])
        .map((service) => {
          if (service.serviceId !== serviceId) return service;
          return {
            ...service,
            skills: (service.skills || [])
              .map((skill) => {
                if (skill.name !== skillName) return skill;
                return {
                  ...skill,
                  pictures: (skill.pictures || []).filter((picture) => picture.id !== pictureId),
                };
              })
              .filter((skill) => (skill.pictures || []).length > 0),
          };
        })
        .filter((service) => (service.skills || []).length > 0),
    }), 'helpers:context:removeSkillPicture');
  };

  const acceptAgreement = async ({ typedSignatureName, checkboxAccepted = true } = {}) => {
    if (!user?.uid) {
      return { success: false, message: 'A helper session is required.' };
    }

    setSaving(true);
    setSaveError('');

    try {
      const result = await acceptHelperAgreementRequest({
        typedSignatureName,
        checkboxAccepted,
      });

      if (result?.agreement) {
        setProfile((current) => withServiceMetadata({
          ...current,
          agreement: {
            ...(current?.agreement || {}),
            ...result.agreement,
          },
        }));
      }

      return { success: true, ...result };
    } catch (error) {
      logError('HelpersAppContext.acceptAgreement', error);
      setSaveError(error.message || 'Unable to accept the Helper Agreement right now.');
      return { success: false, message: error.message || 'Unable to accept the Helper Agreement right now.' };
    } finally {
      setSaving(false);
    }
  };

  const setVerificationStatus = async (verificationStatus) => {
    return applyProfileUpdate((current) => ({ ...current, verificationStatus }), 'helpers:context:setVerificationStatus');
  };

  const updateProfileBasics = async (updates = {}) => {
    return applyProfileUpdate((current) => {
      const next = {
        ...current,
        ...updates,
      };
      const nextFirstName = String(next.firstName || '').trim();
      const nextLastName = String(next.lastName || '').trim();
      next.fullName = String(
        next.fullName
        || [nextFirstName, nextLastName].filter(Boolean).join(' ')
      ).trim();
      if (String(next.providerType || '').trim().toLowerCase() !== 'business') {
        next.businessName = '';
      }
      return next;
    }, 'helpers:context:updateProfileBasics');
  };

  const updatePayoutDetails = async (updates = {}) => {
    return applyProfileUpdate((current) => ({
      ...current,
      payout: {
        ...current.payout,
        ...updates,
      },
    }), 'helpers:context:updatePayoutDetails');
  };

  const value = useMemo(() => ({
    profile,
    homeLocation,
    helperSkills,
    onboardingStatus,
    jobOffers,
    offerResponseState,
    activeJob,
    serviceRequests,
    completedJobs,
    weeklyGroups,
    weeklyPayouts,
    paymentSummary,
    saving,
    saveError,
    serviceCatalog,
    payoutRates: {
      platform: PLATFORM_FEE_RATE,
      helper: HELPER_PAYOUT_RATE,
    },
    setHomeLocation,
    actions: {
      toggleOnlineStatus,
      acceptOffer,
      declineOffer,
      updateActiveJobStatus,
      completeActiveJob,
      cancelActiveJob,
      completeActiveJobWithBilling,
      saveProfilePhoto,
      addSkillPicture,
      addSkillWithPhoto,
      toggleSkillActive,
      removeSkill,
      removeSkillPicture,
      acceptAgreement,
      setVerificationStatus,
      updateProfileBasics,
      updatePayoutDetails,
    },
  }), [
    activeJob,
    helperSkills,
    homeLocation,
    jobOffers,
    offerResponseState,
    onboardingStatus,
    paymentSummary,
    profile,
    saveError,
    saving,
    serviceCatalog,
    serviceRequests,
    weeklyGroups,
    weeklyPayouts,
    setHomeLocation,
  ]);

  return (
    <HelpersAppContext.Provider value={value}>
      {children}
    </HelpersAppContext.Provider>
  );
}

export function useHelpersApp() {
  const context = useContext(HelpersAppContext);
  if (!context) {
    throw new Error('useHelpersApp must be used within HelpersAppProvider.');
  }
  return context;
}
