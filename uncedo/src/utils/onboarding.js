export const STUDENT_PROFILE_STEPS = {
  PROFILE: 'customer_profile',
  PAYMENT: 'payment_setup',
};

export function getStudentOnboardingStatus(user) {
  const studentProfile = user?.studentProfile || {};
  const customerProfile = user?.customerProfile || {};
  const paymentMethods = Array.isArray(user?.paymentMethods) ? user.paymentMethods : [];

  const hasBasicProfile = Boolean(
    String(user?.fullName || user?.displayName || '').trim()
      && String(user?.phoneNumber || '').trim()
      && String(customerProfile.customerType || '').trim()
      && String(customerProfile.serviceAddress || '').trim()
      && String(customerProfile.discoverySource || studentProfile.discoverySource || '').trim(),
  );
  const hasPayment = paymentMethods.length > 0;

  if (hasBasicProfile && hasPayment) {
    return {
      complete: true,
      step: null,
      title: 'Customer profile complete',
      message: 'You can request help instantly.',
    };
  }

  if (!hasBasicProfile) {
    return {
      complete: false,
      step: STUDENT_PROFILE_STEPS.PROFILE,
      title: 'Complete your customer profile',
      message: 'Add your phone number, customer type, service location, and discovery source to continue.',
    };
  }

  return {
    complete: false,
    step: STUDENT_PROFILE_STEPS.PAYMENT,
    title: 'Add a payment method',
    message: 'Add and verify at least one card before requesting help.',
  };
}
