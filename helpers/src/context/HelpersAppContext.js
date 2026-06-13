import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getServiceById } from '../constants/serviceCatalog';
import { useAuth } from './AuthContext';
import { updateHelperProfile } from '../services/userService';
import { logError } from '../services/logger';
import { groupCompletedJobsByWeek, HELPER_PAYOUT_RATE, PLATFORM_FEE_RATE } from '../utils/payouts';
import {
  requestHelperLocationPermission,
  syncHelperCurrentLocation,
  watchAndSyncHelperLocation,
} from '../services/helperLocationService';
import {
  acceptServiceRequestOffer,
  declineServiceRequestOffer,
  mapServiceRequestToActiveJob,
  mapServiceRequestToOffer,
  subscribeToHelperActiveServiceRequest,
  subscribeToHelperAvailableServiceRequests,
  updateHelperActiveRequestStatus,
} from '../services/serviceRequestService';

const HelpersAppContext = createContext(null);

const FALLBACK_PROFILE = {
  firstName: '',
  lastName: '',
  fullName: '',
  providerType: '',
  businessName: '',
  city: 'Johannesburg',
  rating: 0,
  onlineStatus: 'offline',
  locationSharingEnabled: false,
  liveLocation: null,
  verificationStatus: 'pending',
  agreement: {
    acceptedVersion: '',
    requiredVersion: '1.0.1',
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

const INITIAL_COMPLETED_JOBS = [
  {
    id: 'job_1',
    title: 'Household laundry collection',
    customerName: 'Mpho K.',
    serviceId: 'laundry',
    requestedSkills: ['Hand wash', 'Folding'],
    totalAmount: 650,
    completedAt: '2026-06-08T15:10:00.000Z',
    status: 'completed',
  },
  {
    id: 'job_2',
    title: 'Kitchen and scullery reset',
    customerName: 'Anele S.',
    serviceId: 'cleaning',
    requestedSkills: ['Kitchen cleaning', 'Floor care'],
    totalAmount: 880,
    completedAt: '2026-06-05T12:45:00.000Z',
    status: 'completed',
  },
  {
    id: 'job_3',
    title: 'Garden tidy-up before guests',
    customerName: 'Nandi T.',
    serviceId: 'gardening',
    requestedSkills: ['Pruning', 'Garden tidy-up'],
    totalAmount: 740,
    completedAt: '2026-05-29T10:05:00.000Z',
    status: 'completed',
  },
];

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
  return {
    id: `pic_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    uri: String(uri || '').trim(),
  };
}

function withServiceMetadata(profile) {
  return {
    ...profile,
    services: (profile.services || []).map((entry) => ({
      ...entry,
      serviceName: getServiceById(entry.serviceId)?.name || entry.serviceId,
      description: getServiceById(entry.serviceId)?.description || '',
    })),
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
    && profile?.agreement?.acceptedVersion === profile?.agreement?.requiredVersion;
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
  const hasAnyService = services.length > 0;
  const hasQualifiedSkills = services.some((service) => (
    Array.isArray(service.skills)
    && service.skills.some((skill) => Array.isArray(skill.pictures) && skill.pictures.length > 0)
  ));
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

  if (!hasAnyService) {
    return { complete: false, step: 'services', message: 'Select at least one service before going online.' };
  }

  if (!hasQualifiedSkills) {
    return { complete: false, step: 'services', message: 'Add at least one skill with a linked work photo before going online.' };
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
  const [completedJobs, setCompletedJobs] = useState(INITIAL_COMPLETED_JOBS);
  const [weeklyPayouts, setWeeklyPayouts] = useState(INITIAL_WEEKLY_PAYOUTS);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
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
      setActiveJob(null);
      return () => {};
    }

    return subscribeToHelperActiveServiceRequest(
      user.uid,
      (item) => {
        setActiveJob(item ? mapServiceRequestToActiveJob(item) : null);
      },
      (error) => {
        logError('HelpersAppContext.activeJob', error);
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
    if (!activeJob?.requestId || !user?.uid) return;

    const nextStatus = status === 'in_progress' ? 'en_route' : status;
    setSaveError('');
    try {
      await updateHelperActiveRequestStatus({
        requestId: activeJob.requestId,
        helperId: user.uid,
        status: nextStatus,
      });
    } catch (error) {
      logError('HelpersAppContext.updateActiveJobStatus', error);
      setSaveError(error.message || 'Unable to update this helper job.');
    }
  };

  const completeActiveJob = async () => {
    if (!activeJob) return;

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
      return;
    }

    const completedAt = new Date().toISOString();
    const completedJob = {
      ...activeJob,
      status: 'completed',
      completedAt,
    };

    setCompletedJobs((current) => [completedJob, ...current]);
    setWeeklyPayouts((current) => {
      const weekKey = groupCompletedJobsByWeek([completedJob], [])[0]?.weekKey;
      if (!weekKey || current.some((item) => item.weekKey === weekKey)) return current;
      return [{ weekKey, status: 'unpaid', notes: 'Awaiting payout batch.', paidAt: null }, ...current];
    });
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

  const removeSkill = async ({ serviceId, skillName }) => {
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

  const acceptAgreement = async () => {
    return applyProfileUpdate((current) => ({
      ...current,
      agreement: {
        ...current.agreement,
        acceptedVersion: current.agreement.requiredVersion,
        acceptedAt: new Date().toISOString(),
      },
    }));
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
    onboardingStatus,
    jobOffers,
    activeJob,
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
    actions: {
      toggleOnlineStatus,
      acceptOffer,
      declineOffer,
      updateActiveJobStatus,
      completeActiveJob,
      addSkillPicture,
      removeSkill,
      removeSkillPicture,
      acceptAgreement,
      setVerificationStatus,
      updateProfileBasics,
      updatePayoutDetails,
    },
  }), [
    activeJob,
    completedJobs,
    jobOffers,
    onboardingStatus,
    paymentSummary,
    profile,
    saveError,
    saving,
    weeklyGroups,
    weeklyPayouts,
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
