import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getServiceById } from '../constants/serviceCatalog';
import { useAuth } from './AuthContext';
import { updateHelperProfile } from '../services/userService';
import { logError } from '../services/logger';
import { deleteUploadedFile, uploadLocalFile } from '../services/storageService';
import { groupCompletedJobsByWeek, HELPER_PAYOUT_RATE, PLATFORM_FEE_RATE } from '../utils/payouts';
import { acceptHelperAgreement as acceptHelperAgreementRequest } from '../services/legalAgreementService';
import {
  requestHelperLocationPermission,
  syncHelperCurrentLocation,
  watchAndSyncHelperLocation,
} from '../services/helperLocationService';
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

const INITIAL_WEEKLY_PAYOUTS = [
  {
    weekKey: '2026-W23',
    status: 'processing',
    notes: 'Current week jobs batch on Friday.',
    paidAt: null,
  },
  {
    weekKey: '2026-W22',
    status: 'paid',
    notes: 'Paid to your verified FNB account.',
    paidAt: '2026-06-03T08:30:00.000Z',
  },
];

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

function normalizeSkillEntry(skill = {}, serviceId = '') {
  const skillName = String(skill.name || '').trim();
  if (!skillName) return null;

  return {
    id: String(skill.id || `skill_${serviceId}_${slugify(skillName)}`),
    name: skillName,
    status: String(skill.status || 'approved').trim().toLowerCase() || 'approved',
    active: skill.active !== false,
    verified: skill.verified !== false,
    createdAt: skill.createdAt || null,
    updatedAt: skill.updatedAt || skill.createdAt || null,
    pictures: (Array.isArray(skill.pictures) ? skill.pictures : [])
      .map(normalizePictureEntry)
      .filter(Boolean),
  };
}

function normalizeServiceEntry(entry = {}) {
  const serviceId = String(entry.serviceId || '').trim();
  if (!serviceId) return null;

  const serviceMeta = getServiceById(serviceId);
  return {
    ...entry,
    serviceId,
    serviceName: serviceMeta?.name || entry.serviceName || serviceId,
    description: serviceMeta?.description || entry.description || '',
    skills: (Array.isArray(entry.skills) ? entry.skills : [])
      .map((skill) => normalizeSkillEntry(skill, serviceId))
      .filter(Boolean),
  };
}

function normalizeServices(services = []) {
  return (Array.isArray(services) ? services : [])
    .map(normalizeServiceEntry)
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
      categoryId: service.serviceId,
    }))
  ));
}

function withServiceMetadata(profile) {
  return {
    ...profile,
    services: normalizeServices(profile.services || []),
  };
}

function normalizeProfile(user) {
  if (!user) return withServiceMetadata(FALLBACK_PROFILE);

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
  });
}

function getHelperOnboardingStatus(profile) {
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
  const hasQualifiedSkills = services.some((service) => (
    Array.isArray(service.skills)
    && service.skills.some((skill) => skill.active !== false && Array.isArray(skill.pictures) && skill.pictures.length > 0)
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

  if (!hasQualifiedSkills) {
    return { complete: false, step: 'services', message: 'Add at least one active skill with an uploaded work photo before going online.' };
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
  const [homeLocation, setHomeLocation] = useState(null);
  const helperLocationWatchRef = useRef(null);

  useEffect(() => {
    setProfile(normalizeProfile(user));
  }, [user]);

  useEffect(() => {
    if (!user?.uid) {
      setJobOffers([]);
      return () => {};
    }

    return subscribeToHelperAvailableServiceRequests(
      user.uid,
      (items) => {
        setJobOffers(items.map(mapServiceRequestToOffer).filter(Boolean));
      },
      (error) => {
        logError('HelpersAppContext.jobOffers', error);
      },
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setHomeLocation(null);
    }
  }, [user?.uid]);

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
        await syncHelperCurrentLocation();
        if (!active) return;

        helperLocationWatchRef.current = await watchAndSyncHelperLocation();
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

      await stopActiveJobTracking({
        finalStatus: activeJob?.status || (!user?.uid ? 'signed_out' : 'inactive'),
        keepLocationSharingEnabled: profile.onlineStatus === 'online',
      }).catch((error) => logError('HelpersAppContext.stopStaleTrackingSession', error));
    };

    stopStaleTrackingSession();

    return () => {
      cancelled = true;
    };
  }, [activeJob?.location, activeJob?.requestId, activeJob?.status, activeJobResolved, profile.onlineStatus, user?.uid]);

  const persistProfileUpdate = async (updates) => {
    if (!user?.uid) {
      throw new Error('A helper session is required.');
    }

    setSaving(true);
    setSaveError('');

    try {
      await updateHelperProfile(user.uid, updates);
      return { success: true };
    } catch (error) {
      logError('HelpersAppContext.persistProfileUpdate', error);
      setSaveError(error.message || 'Unable to save helper profile changes.');
      return { success: false, message: error.message || 'Unable to save helper profile changes.' };
    } finally {
      setSaving(false);
    }
  };

  const applyProfileUpdate = async (updater) => {
    const nextProfile = withServiceMetadata(updater(profile));
    setProfile(nextProfile);
    const result = await persistProfileUpdate(nextProfile);
    if (!result.success) {
      setProfile(normalizeProfile(user));
    }
    return result;
  };

  const onboardingStatus = useMemo(() => getHelperOnboardingStatus(profile), [profile]);
  const helperSkills = useMemo(() => buildHelperSkillsList(profile.services || []), [profile.services]);

  const completedJobs = useMemo(
    () => serviceRequests.filter((item) => ['completed', 'canceled'].includes(String(item.status || '').toLowerCase())),
    [serviceRequests],
  );

  const weeklyGroups = useMemo(
    () => groupCompletedJobsByWeek(completedJobs.filter((item) => String(item.status || '').toLowerCase() === 'completed'), weeklyPayouts),
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
    }));
  };

  const acceptOffer = async (offerId) => {
    const offer = jobOffers.find((item) => item.id === offerId);
    if (!offer || !user?.uid) return;

    setSaveError('');
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
    }
  };

  const declineOffer = async (offerId) => {
    const offer = jobOffers.find((item) => item.id === offerId);
    if (!offer || !user?.uid) return;

    setSaveError('');
    try {
      await declineServiceRequestOffer({
        requestId: offer.requestId || offer.id,
        helperId: user.uid,
      });
    } catch (error) {
      logError('HelpersAppContext.declineOffer', error);
      setSaveError(error.message || 'Unable to decline this helper offer right now.');
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
        await stopActiveJobTracking({
          finalStatus: nextStatus,
          keepLocationSharingEnabled: profile.onlineStatus === 'online',
        });
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

    await stopActiveJobTracking({
      finalStatus: 'completed',
      keepLocationSharingEnabled: profile.onlineStatus === 'online',
    }).catch((error) => logError('HelpersAppContext.completeActiveJob.stopTracking', error));

    const completedAt = new Date().toISOString();
    setWeeklyPayouts((current) => {
      const completedJob = { ...activeJob, status: 'completed', completedAt };
      const weekKey = groupCompletedJobsByWeek([completedJob], [])[0]?.weekKey;
      if (!weekKey || current.some((item) => item.weekKey === weekKey)) return current;
      return [{ weekKey, status: 'unpaid', notes: 'Awaiting payout batch.', paidAt: null }, ...current];
    });
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
      await stopActiveJobTracking({
        finalStatus: 'canceled',
        keepLocationSharingEnabled: profile.onlineStatus === 'online',
      });
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
      await stopActiveJobTracking({
        finalStatus: 'completed',
        keepLocationSharingEnabled: profile.onlineStatus === 'online',
      }).catch((error) => logError('HelpersAppContext.completeActiveJobWithBilling.stopTracking', error));
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
    }).then((result) => (
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
      const result = await persistProfileUpdate(nextProfile);
      if (!result.success) {
        setProfile(normalizeProfile(user));
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

  const addSkillWithPhoto = async ({ serviceId, skillName, imageAsset }) => {
    if (!user?.uid || !serviceId || !skillName || !imageAsset?.uri) {
      return { success: false, message: 'A skill and uploaded work photo are required.' };
    }

    setSaving(true);
    setSaveError('');

    try {
      const upload = await uploadLocalFile({
        userId: user.uid,
        fileUri: imageAsset.uri,
        fileName: imageAsset.fileName || `${slugify(skillName)}.jpg`,
        mimeType: imageAsset.mimeType || 'image/jpeg',
        pathPrefix: `helper-skills/${serviceId}`,
      });

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

      const existingSkillIndex = targetService.skills.findIndex((skill) => skill.name === skillName);
      const picture = createPicture({
        uri: upload.downloadUrl,
        objectPath: upload.objectPath,
        uploadedAt: upload.uploadedAt,
      });
      const nextTimestamp = new Date().toISOString();

      if (existingSkillIndex >= 0) {
        const currentSkill = targetService.skills[existingSkillIndex];
        targetService.skills[existingSkillIndex] = normalizeSkillEntry({
          ...currentSkill,
          status: 'approved',
          verified: true,
          active: currentSkill.active !== false,
          updatedAt: nextTimestamp,
          pictures: [...(currentSkill.pictures || []), picture],
        }, serviceId);
      } else {
        targetService.skills.push(normalizeSkillEntry({
          name: skillName,
          status: 'approved',
          verified: true,
          active: true,
          createdAt: nextTimestamp,
          updatedAt: nextTimestamp,
          pictures: [picture],
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

      setProfile(persistedProfile);
      const result = await persistProfileUpdate(persistedProfile);
      if (!result.success) {
        setProfile(normalizeProfile(user));
        return result;
      }

      return { success: true, message: `${skillName} saved and approved.` };
    } catch (error) {
      logError('HelpersAppContext.addSkillWithPhoto', error);
      setSaveError(error.message || 'Unable to upload this skill photo right now.');
      return { success: false, message: error.message || 'Unable to upload this skill photo right now.' };
    } finally {
      setSaving(false);
    }
  };

  const toggleSkillActive = async ({ serviceId, skillName, active }) => {
    return applyProfileUpdate((current) => ({
      ...current,
      services: normalizeServices((current.services || []).map((service) => {
        if (service.serviceId !== serviceId) return service;
        return {
          ...service,
          skills: (service.skills || []).map((skill) => (
            skill.name === skillName
              ? {
                  ...skill,
                  active: Boolean(active),
                  updatedAt: new Date().toISOString(),
                }
              : skill
          )),
        };
      })),
    }));
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
    }));
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
    }));
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
    return applyProfileUpdate((current) => ({ ...current, verificationStatus }));
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
    });
  };

  const updatePayoutDetails = async (updates = {}) => {
    return applyProfileUpdate((current) => ({
      ...current,
      payout: {
        ...current.payout,
        ...updates,
      },
    }));
  };

  const value = useMemo(() => ({
    profile,
    homeLocation,
    helperSkills,
    onboardingStatus,
    jobOffers,
    activeJob,
    serviceRequests,
    completedJobs,
    weeklyGroups,
    weeklyPayouts,
    paymentSummary,
    saving,
    saveError,
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
    onboardingStatus,
    paymentSummary,
    profile,
    saveError,
    saving,
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
