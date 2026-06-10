import { createContext, useContext, useMemo, useState } from 'react';
import { getServiceById } from '../constants/serviceCatalog';
import { groupCompletedJobsByWeek, HELPER_PAYOUT_RATE, PLATFORM_FEE_RATE } from '../utils/payouts';

const HelpersAppContext = createContext(null);

const INITIAL_PROFILE = {
  firstName: 'Nomsa',
  lastName: 'Dlamini',
  fullName: 'Nomsa Dlamini',
  providerType: 'individual',
  businessName: '',
  city: 'Johannesburg',
  rating: 4.87,
  onlineStatus: 'online',
  verificationStatus: 'verified',
  agreement: {
    acceptedVersion: '1.0.1',
    requiredVersion: '1.0.1',
    acceptedAt: '2026-05-18T10:20:00.000Z',
  },
  payout: {
    bankName: 'FNB',
    accountHolder: 'Nomsa Dlamini',
    accountNumber: '**** 1904',
    recipientCode: 'RCP_uncedo_helper_1904',
    verificationStatus: 'verified',
  },
  services: [
    {
      serviceId: 'laundry',
      skills: [
        {
          name: 'Hand wash',
          pictures: [
            { id: 'pic_1', uri: 'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?auto=format&fit=crop&w=600&q=80' },
            { id: 'pic_2', uri: 'https://images.unsplash.com/photo-1517677208171-0bc6725a3e60?auto=format&fit=crop&w=600&q=80' },
          ],
        },
        {
          name: 'Ironing',
          pictures: [
            { id: 'pic_3', uri: 'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?auto=format&fit=crop&w=600&q=80' },
          ],
        },
      ],
    },
    {
      serviceId: 'cleaning',
      skills: [
        {
          name: 'Kitchen cleaning',
          pictures: [
            { id: 'pic_4', uri: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=600&q=80' },
          ],
        },
      ],
    },
  ],
  metrics: {
    acceptanceRate: 0.92,
    completionRate: 0.96,
    overallRating: 4.87,
    avgResponseMinutes: 4,
    cancellationRate: 0.05,
    recentAssignmentsCount: 8,
  },
};

const INITIAL_OFFERS = [
  {
    id: 'offer_1',
    title: 'Family laundry refresh',
    description: 'Need same-day wash, iron, and folding for school uniforms and work shirts.',
    customerName: 'Amahle N.',
    serviceId: 'laundry',
    requestedSkills: ['Machine wash', 'Ironing', 'Folding'],
    payoutEstimate: 540,
    offerExpiresAt: Date.now() + 1000 * 60 * 18,
    area: 'Sandton',
  },
  {
    id: 'offer_2',
    title: 'Weekend deep clean',
    description: 'Kitchen and bathroom deep clean with dusting in the lounge.',
    customerName: 'Lerato P.',
    serviceId: 'cleaning',
    requestedSkills: ['Kitchen cleaning', 'Bathroom cleaning', 'Dusting'],
    payoutEstimate: 720,
    offerExpiresAt: Date.now() + 1000 * 60 * 32,
    area: 'Midrand',
  },
];

const INITIAL_ACTIVE_JOB = {
  id: 'job_live_1',
  title: 'Wardrobe reset and ironing',
  customerName: 'Thabiso M.',
  serviceId: 'laundry',
  requestedSkills: ['Ironing', 'Folding'],
  status: 'in_progress',
  totalAmount: 480,
  startedAt: '2026-06-10T07:30:00.000Z',
  address: 'Rosebank',
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

function getHelperOnboardingStatus(profile) {
  const firstName = String(profile?.firstName || '').trim();
  const lastName = String(profile?.lastName || '').trim();
  const fullName = String(profile?.fullName || '').trim();
  const providerType = String(profile?.providerType || '').trim().toLowerCase();
  const businessName = String(profile?.businessName || '').trim();
  const hasAgreement = profile?.agreement?.acceptedVersion && profile?.agreement?.acceptedVersion === profile?.agreement?.requiredVersion;
  const payout = profile?.payout || {};
  const hasPayout = Boolean(payout.bankName && payout.accountNumber && payout.recipientCode && payout.verificationStatus === 'verified');
  const isVerified = profile?.verificationStatus === 'verified';
  const services = Array.isArray(profile?.services) ? profile.services : [];
  const hasAnyService = services.length > 0;
  const hasQualifiedSkills = services.some((service) =>
    Array.isArray(service.skills)
    && service.skills.some((skill) => Array.isArray(skill.pictures) && skill.pictures.length > 0),
  );
  const hasName = Boolean(fullName || (firstName && lastName));
  const hasProviderType = providerType === 'individual' || providerType === 'business';
  const hasBusinessName = providerType !== 'business' || Boolean(businessName);

  if (!hasName) {
    return {
      complete: false,
      step: 'profile',
      message: 'Add the helper name before going online.',
    };
  }

  if (!hasProviderType) {
    return {
      complete: false,
      step: 'profile',
      message: 'Choose whether the helper profile is an individual or a business.',
    };
  }

  if (!hasBusinessName) {
    return {
      complete: false,
      step: 'profile',
      message: 'Add the business name before going online.',
    };
  }

  if (!hasAnyService) {
    return {
      complete: false,
      step: 'services',
      message: 'Select at least one service before going online.',
    };
  }

  if (!hasQualifiedSkills) {
    return {
      complete: false,
      step: 'services',
      message: 'Add at least one skill with a linked work photo before going online.',
    };
  }

  if (!hasAgreement) {
    return {
      complete: false,
      step: 'agreement',
      message: 'Accept the latest Helper Agreement before going online.',
    };
  }

  if (!hasPayout) {
    return {
      complete: false,
      step: 'payout',
      message: 'Add verified payout details so Uncedo can pay your helper share.',
    };
  }

  if (!isVerified) {
    return {
      complete: false,
      step: 'verification',
      message: 'Your account must be verified before you can accept helper jobs.',
    };
  }

  return {
    complete: true,
    step: null,
    message: 'Helper profile complete. You can go online, accept jobs, and receive payouts.',
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

export function HelpersAppProvider({ children }) {
  const [profile, setProfile] = useState(() => withServiceMetadata(INITIAL_PROFILE));
  const [jobOffers, setJobOffers] = useState(INITIAL_OFFERS);
  const [activeJob, setActiveJob] = useState(INITIAL_ACTIVE_JOB);
  const [completedJobs, setCompletedJobs] = useState(INITIAL_COMPLETED_JOBS);
  const [weeklyPayouts, setWeeklyPayouts] = useState(INITIAL_WEEKLY_PAYOUTS);

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

  const toggleOnlineStatus = () => {
    if (!onboardingStatus.complete) return;
    setProfile((current) => ({
      ...current,
      onlineStatus: current.onlineStatus === 'online' ? 'offline' : 'online',
    }));
  };

  const acceptOffer = (offerId) => {
    const offer = jobOffers.find((item) => item.id === offerId);
    if (!offer) return;

    setJobOffers((current) => current.filter((item) => item.id !== offerId));
    setActiveJob({
      id: `active_${offer.id}`,
      title: offer.title,
      customerName: offer.customerName,
      serviceId: offer.serviceId,
      requestedSkills: offer.requestedSkills,
      status: 'accepted',
      totalAmount: offer.payoutEstimate,
      startedAt: new Date().toISOString(),
      address: offer.area,
    });
    setProfile((current) => ({
      ...current,
      metrics: {
        ...current.metrics,
        recentAssignmentsCount: Number(current.metrics.recentAssignmentsCount || 0) + 1,
      },
    }));
  };

  const declineOffer = (offerId) => {
    setJobOffers((current) => current.filter((item) => item.id !== offerId));
  };

  const updateActiveJobStatus = (status) => {
    setActiveJob((current) => (current ? { ...current, status } : current));
  };

  const completeActiveJob = () => {
    if (!activeJob) return;
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
    setActiveJob(null);
  };

  const addSkillPicture = ({ serviceId, skillName, pictureUri }) => {
    const normalizedUri = String(pictureUri || '').trim();
    if (!serviceId || !skillName || !normalizedUri) {
      return { success: false, message: 'A service, skill, and work photo are required.' };
    }

    setProfile((current) => {
      const existingServices = Array.isArray(current.services) ? [...current.services] : [];
      const targetIndex = existingServices.findIndex((service) => service.serviceId === serviceId);
      const serviceMeta = getServiceById(serviceId);
      const nextService = targetIndex >= 0
        ? { ...existingServices[targetIndex], skills: [...existingServices[targetIndex].skills] }
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
          pictures: [...currentSkill.pictures, createPicture(normalizedUri)],
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
    });

    return { success: true, message: `${skillName} added with a linked work photo.` };
  };

  const removeSkill = ({ serviceId, skillName }) => {
    setProfile((current) => ({
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

  const removeSkillPicture = ({ serviceId, skillName, pictureId }) => {
    setProfile((current) => ({
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

  const acceptAgreement = () => {
    setProfile((current) => ({
      ...current,
      agreement: {
        ...current.agreement,
        acceptedVersion: current.agreement.requiredVersion,
        acceptedAt: new Date().toISOString(),
      },
    }));
  };

  const setVerificationStatus = (verificationStatus) => {
    setProfile((current) => ({ ...current, verificationStatus }));
  };

  const updateProfileBasics = (updates = {}) => {
    setProfile((current) => {
      const next = {
        ...current,
        ...updates,
      };
      const nextFirstName = String(next.firstName || '').trim();
      const nextLastName = String(next.lastName || '').trim();
      if (!String(next.fullName || '').trim()) {
        next.fullName = [nextFirstName, nextLastName].filter(Boolean).join(' ').trim();
      }
      if (String(next.providerType || '').trim().toLowerCase() !== 'business') {
        next.businessName = '';
      }
      return next;
    });
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
    },
  }), [
    activeJob,
    completedJobs,
    jobOffers,
    onboardingStatus,
    paymentSummary,
    profile,
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
