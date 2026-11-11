'use strict';

const WHATSAPP_ONBOARDING_BUTTONS = Object.freeze({
  CUSTOMER: 'wa_onboard_customer',
  HELPER: 'wa_onboard_helper',
  CONTINUE_AS_GUEST: 'wa_onboard_guest',
  CREATE_ACCOUNT: 'wa_onboard_signup',
  LINK_EXISTING_ACCOUNT: 'wa_onboard_existing',
  CREATE_HELPER_ACCOUNT: 'wa_onboard_helper_signup',
  LINK_HELPER_ACCOUNT: 'wa_onboard_helper_existing',
  ADD_HOME_ADDRESS: 'wa_onboard_address_yes',
  SKIP_HOME_ADDRESS: 'wa_onboard_address_no',
  ADD_HELPER_SERVICE: 'wa_helper_service_add',
  DONE_HELPER_SERVICES: 'wa_helper_service_done',
  NEXT_HELPER_SERVICES: 'wa_helper_service_next',
});

function cleanOnboardingText(value, maximum = 240) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maximum);
}

function getWhatsAppAccountSetupMode(action) {
  const normalized = String(action || '').trim();
  if (['link-customer-account', 'link-helper-account'].includes(normalized)) return 'signin';
  if (['create-customer-signup-link', 'create-helper-signup-link'].includes(normalized)) return 'signup';
  return '';
}

function roleSelectionPrompt() {
  const text = 'Welcome to Uncedo. Are you looking for a service or joining as a helper?';
  return {
    text,
    interactive: {
      type: 'button',
      body: { text },
      action: { buttons: [
        { type: 'reply', reply: { id: WHATSAPP_ONBOARDING_BUTTONS.CUSTOMER, title: 'I need a service' } },
        { type: 'reply', reply: { id: WHATSAPP_ONBOARDING_BUTTONS.HELPER, title: "I'm a helper" } },
      ] },
    },
  };
}

function customerChoicePrompt() {
  const text = 'Would you like to create a Uncedo customer account, link an account you already have, or continue as a guest? Guests can explore services and make eligible bookings.';
  return {
    text,
    interactive: {
      type: 'button',
      body: { text },
      action: { buttons: [
        { type: 'reply', reply: { id: WHATSAPP_ONBOARDING_BUTTONS.CREATE_ACCOUNT, title: 'Create an account' } },
        { type: 'reply', reply: { id: WHATSAPP_ONBOARDING_BUTTONS.LINK_EXISTING_ACCOUNT, title: 'I have an account' } },
        { type: 'reply', reply: { id: WHATSAPP_ONBOARDING_BUTTONS.CONTINUE_AS_GUEST, title: 'Continue as guest' } },
      ] },
    },
  };
}

function helperAccountChoicePrompt() {
  const text = 'Helpers need a Uncedo account before joining. Create one with your email, or link your existing helper account.';
  return {
    text,
    interactive: {
      type: 'button',
      body: { text },
      action: { buttons: [
        { type: 'reply', reply: { id: WHATSAPP_ONBOARDING_BUTTONS.CREATE_HELPER_ACCOUNT, title: 'Create account' } },
        { type: 'reply', reply: { id: WHATSAPP_ONBOARDING_BUTTONS.LINK_HELPER_ACCOUNT, title: 'I have an account' } },
      ] },
    },
  };
}

function addressChoicePrompt() {
  const text = 'Would you like to save a home address to your Uncedo profile now? You can also provide a service address when booking.';
  return {
    text,
    interactive: {
      type: 'button',
      body: { text },
      action: { buttons: [
        { type: 'reply', reply: { id: WHATSAPP_ONBOARDING_BUTTONS.ADD_HOME_ADDRESS, title: 'Add home address' } },
        { type: 'reply', reply: { id: WHATSAPP_ONBOARDING_BUTTONS.SKIP_HOME_ADDRESS, title: 'Skip for now' } },
      ] },
    },
  };
}

function helperProviderTypePrompt() {
  const text = 'Are you joining Uncedo as an individual helper or as a business?';
  return {
    text,
    interactive: {
      type: 'button',
      body: { text },
      action: { buttons: [
        { type: 'reply', reply: { id: 'wa_helper_individual', title: 'Individual' } },
        { type: 'reply', reply: { id: 'wa_helper_business', title: 'Business' } },
      ] },
    },
  };
}

function transitionWhatsAppOnboarding({ state = {}, buttonId = '', text = '', inboundType = 'text' } = {}) {
  const role = ['customer', 'helper'].includes(String(state.role || '').trim().toLowerCase())
    ? String(state.role).trim().toLowerCase()
    : '';
  const savedOnboardingPath = String(state.onboardingPath || '').trim().toLowerCase();
  const current = {
    stage: String(state.stage || '').trim(),
    role,
    accountMode: String(state.accountMode || '').trim(),
    accountMatchMode: ['profile-match', 'auth-phone'].includes(String(state.accountMatchMode || '').trim())
      ? String(state.accountMatchMode).trim() : '',
    // Older signup/link completion flows may have saved a role without the
    // explicit path. Preserve that helper/customer intent during transitions.
    onboardingPath: ['customer', 'helper'].includes(savedOnboardingPath) ? savedOnboardingPath : role,
    homeAddressExists: state.homeAddressExists === true,
    signupLinkExpiresAtMs: Number(state.signupLinkExpiresAtMs || 0),
    agreementLinkExpiresAtMs: Number(state.agreementLinkExpiresAtMs || 0),
    agreementLinkChallengeHash: String(state.agreementLinkChallengeHash || ''),
    selectedServiceIds: Array.isArray(state.selectedServiceIds) ? state.selectedServiceIds.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 10) : [],
    servicePage: Math.max(0, Number(state.servicePage || 0)),
  };
  const button = String(buttonId || '').trim();
  const input = cleanOnboardingText(text);

  if (current.stage === 'awaiting_role') {
    const selectedRole = button === WHATSAPP_ONBOARDING_BUTTONS.CUSTOMER || /^(customer|i need a service|customer service)$/i.test(input)
      ? 'customer'
      : button === WHATSAPP_ONBOARDING_BUTTONS.HELPER || /^(helper|i am a helper|i'm a helper)$/i.test(input)
        ? 'helper'
        : '';
    if (!selectedRole) return { state: current, ...roleSelectionPrompt(), action: 'reask-role' };
    if (selectedRole === 'helper') return {
      state: { ...current, role: 'helper', stage: 'awaiting_helper_account_choice', onboardingPath: 'helper' },
      ...helperAccountChoicePrompt(),
      action: 'choose-helper-account-mode',
    };
    return {
      state: { ...current, role: 'customer', stage: 'awaiting_customer_choice', onboardingPath: 'customer' },
      ...customerChoicePrompt(),
      action: 'choose-customer-mode',
    };
  }

  if (current.stage === 'awaiting_customer_choice') {
    if (button === WHATSAPP_ONBOARDING_BUTTONS.CONTINUE_AS_GUEST || /^(guest|continue as guest|stay as guest)$/i.test(input)) {
      return {
        state: { ...current, stage: 'awaiting_preferred_name', accountMode: 'guest' },
        reply: 'You can continue as a guest. What name would you like Uncedo to use when speaking with you?',
        action: 'ask-preferred-name',
      };
    }
    if (button === WHATSAPP_ONBOARDING_BUTTONS.CREATE_ACCOUNT || /^(create account|sign up|register)$/i.test(input)) {
      return {
        state: { ...current, stage: 'awaiting_account_signup', accountMode: 'account' },
        action: 'create-customer-signup-link',
      };
    }
    if (button === WHATSAPP_ONBOARDING_BUTTONS.LINK_EXISTING_ACCOUNT || /^(i have an account|link account|sign in)$/i.test(input)) {
      return {
        state: { ...current, stage: 'awaiting_account_signup', accountMode: 'link-existing' },
        action: 'link-customer-account',
      };
    }
    return { state: current, ...customerChoicePrompt(), action: 'reask-customer-mode' };
  }

  if (current.stage === 'awaiting_helper_account_choice') {
    if (button === WHATSAPP_ONBOARDING_BUTTONS.CREATE_HELPER_ACCOUNT || /^(create account|sign up|register)$/i.test(input)) {
      return { state: { ...current, stage: 'awaiting_account_signup', accountMode: 'account' }, action: 'create-helper-signup-link' };
    }
    if (button === WHATSAPP_ONBOARDING_BUTTONS.LINK_HELPER_ACCOUNT || /^(i have an account|link account|sign in)$/i.test(input)) {
      return { state: { ...current, stage: 'awaiting_account_signup', accountMode: 'link-existing' }, action: 'link-helper-account' };
    }
    return { state: current, ...helperAccountChoicePrompt(), action: 'reask-helper-account-mode' };
  }

  if (current.stage === 'awaiting_account_signup') {
    if (/^(resend|send|new) (the )?(account )?link$/i.test(input)) {
      return { state: current, action: current.role === 'helper'
        ? current.accountMode === 'link-existing' ? 'link-helper-account' : 'create-helper-signup-link'
        : current.accountMode === 'link-existing' ? 'link-customer-account' : 'create-customer-signup-link' };
    }
    return {
      state: current,
      reply: 'Please use the secure Uncedo account link sent in this chat. Your email remains your sign-in method; the link connects this WhatsApp conversation to your account.',
      action: 'await-signup-link',
    };
  }

  if (current.stage === 'awaiting_preferred_name') {
    const preferredName = cleanOnboardingText(input, 100);
    if (!preferredName) {
      return { state: current, reply: 'Please send the name you would like Uncedo to use.', action: 'reask-preferred-name' };
    }
    return {
      state: {
        ...current,
        stage: current.homeAddressExists
          ? (current.role === 'helper' ? 'helper_readiness' : 'complete')
          : current.accountMode === 'guest' ? 'awaiting_address_choice' : 'awaiting_home_address',
        preferredName,
      },
      ...(current.homeAddressExists
        ? { reply: current.role === 'helper' ? 'Thanks. I’ve saved the name you prefer. I’ll check what remains before your helper profile is ready.' : 'Thanks. I’ve saved the name you prefer. You can now ask about Uncedo services or start a service enquiry.' }
        : current.accountMode === 'guest' ? addressChoicePrompt() : { reply: 'Thanks. Please send the home address you want saved to your Uncedo profile.' }),
      action: 'save-preferred-name',
      preferredName,
    };
  }

  if (current.stage === 'awaiting_address_choice') {
    if (button === WHATSAPP_ONBOARDING_BUTTONS.ADD_HOME_ADDRESS || /^(yes|add address|home address)$/i.test(input)) {
      return { state: { ...current, stage: 'awaiting_home_address' }, reply: 'Please send the home address you want saved to your Uncedo profile.', action: 'ask-home-address' };
    }
    if (button === WHATSAPP_ONBOARDING_BUTTONS.SKIP_HOME_ADDRESS || /^(no|skip|skip for now)$/i.test(input)) {
      return {
        state: { ...current, stage: current.role === 'helper' ? 'helper_readiness' : 'complete' },
        action: current.role === 'helper' ? 'check-helper-readiness' : 'complete-customer-onboarding',
      };
    }
    return { state: current, ...addressChoicePrompt(), action: 'reask-address-choice' };
  }

  if (current.stage === 'awaiting_home_address') {
    const homeAddress = cleanOnboardingText(input, 500);
    if (current.accountMode === 'guest' && /^(skip|skip for now|no)$/i.test(input)) {
      return { state: { ...current, stage: 'complete' }, action: 'complete-customer-onboarding' };
    }
    if (homeAddress.length < 5) {
      const optional = current.accountMode === 'guest';
      return { state: current, reply: optional
        ? 'Please send a fuller address, or type “skip for now” if you do not want to save one.'
        : 'Please send a fuller home address to complete your Uncedo profile.', action: 'reask-home-address' };
    }
    return {
      state: { ...current, stage: current.role === 'helper' ? 'helper_readiness' : 'complete', homeAddress },
      action: current.role === 'helper' ? 'check-helper-readiness' : 'complete-customer-onboarding',
      homeAddress,
    };
  }

  if (current.stage === 'awaiting_helper_full_name') {
    const fullName = cleanOnboardingText(input, 180).replace(/\s+/g, ' ');
    if (fullName.length < 2) return { state: current, reply: 'Please send your first and last name for your helper profile.', action: 'reask-helper-full-name' };
    return { state: { ...current, stage: 'awaiting_helper_provider_type', fullName }, reply: helperProviderTypePrompt().text, interactive: helperProviderTypePrompt().interactive, action: 'save-helper-full-name', fullName };
  }

  if (current.stage === 'awaiting_helper_provider_type') {
    const providerType = button === 'wa_helper_individual' || /^individual$/i.test(input)
      ? 'individual'
      : button === 'wa_helper_business' || /^business$/i.test(input)
        ? 'business'
        : '';
    if (!providerType) return { state: current, ...helperProviderTypePrompt(), action: 'reask-helper-provider-type' };
    return {
      state: { ...current, providerType, stage: providerType === 'business' ? 'awaiting_helper_business_name' : 'helper_readiness' },
      reply: providerType === 'business' ? 'Please send the registered or trading name of your business.' : 'Thanks. I’ll check your helper profile requirements now.',
      action: 'save-helper-provider-type',
      providerType,
    };
  }

  if (current.stage === 'awaiting_helper_business_name') {
    const businessName = cleanOnboardingText(input, 120);
    if (!businessName) return { state: current, reply: 'Please send the business name you want on your helper profile.', action: 'reask-helper-business-name' };
    return { state: { ...current, stage: 'helper_readiness', businessName }, reply: 'Thanks. I’ll check your helper profile requirements now.', action: 'save-helper-business-name', businessName };
  }

  if (current.stage === 'awaiting_helper_agreement') {
    if (/^(new|resend|send) (the )?(helper )?agreement link$/i.test(input)) {
      return { state: current, action: 'create-helper-agreement-link' };
    }
    return { state: current, action: 'await-helper-agreement' };
  }

  if (current.stage === 'awaiting_helper_service_photos') {
    return { state: current, action: 'await-helper-service-photos' };
  }

  if (current.stage === 'awaiting_helper_police_clearance') {
    if (['document', 'image'].includes(String(inboundType || '').trim().toLowerCase())) {
      return { state: { ...current, stage: 'awaiting_helper_police_clearance_review' }, action: 'submit-helper-police-clearance' };
    }
    return {
      state: current,
      reply: 'Please upload your police-clearance document here as a PDF or a clear JPG/PNG image. It will be kept private and sent to Uncedo for review. Do not send identity or banking documents in this step.',
      action: 'await-helper-police-clearance',
    };
  }

  if (current.stage === 'awaiting_helper_police_clearance_review') {
    return {
      state: current,
      reply: 'Your police-clearance document is awaiting Uncedo review. I will update the helper setup status after an administrator reviews it.',
      action: 'await-helper-police-clearance-review',
    };
  }

  if (current.stage === 'helper_readiness') {
    return { state: current, action: 'check-helper-readiness' };
  }

  if (current.stage === 'awaiting_helper_services') {
    if (button === WHATSAPP_ONBOARDING_BUTTONS.NEXT_HELPER_SERVICES) {
      return { state: { ...current, servicePage: current.servicePage + 1 }, action: 'show-helper-services' };
    }
    const match = button.match(/^wa_helper_service_([A-Za-z0-9_-]{1,120})$/);
    if (!match) return { state: current, action: 'show-helper-services' };
    if (current.selectedServiceIds.includes(match[1])) return { state: current, action: 'show-helper-services' };
    const selectedServiceIds = [...current.selectedServiceIds, match[1]].slice(0, 10);
    return { state: { ...current, selectedServiceIds, servicePage: 0, stage: 'awaiting_helper_service_more' }, action: 'select-helper-service', serviceId: match[1] };
  }

  if (current.stage === 'awaiting_helper_service_more') {
    if (button === WHATSAPP_ONBOARDING_BUTTONS.ADD_HELPER_SERVICE || /^(add another|another service|add service)$/i.test(input)) {
      return { state: { ...current, stage: 'awaiting_helper_services', servicePage: 0 }, action: 'show-helper-services' };
    }
    if (button === WHATSAPP_ONBOARDING_BUTTONS.DONE_HELPER_SERVICES || /^(done|finish|no more|submit)$/i.test(input)) {
      return { state: { ...current, stage: 'awaiting_helper_service_photos' }, action: 'submit-helper-services', requestedServiceIds: current.selectedServiceIds };
    }
    return { state: current, action: 'ask-helper-service-more' };
  }

  return { state: current, action: 'not-in-onboarding' };
}

module.exports = {
  WHATSAPP_ONBOARDING_BUTTONS,
  addressChoicePrompt,
  cleanOnboardingText,
  customerChoicePrompt,
  getWhatsAppAccountSetupMode,
  helperAccountChoicePrompt,
  helperProviderTypePrompt,
  roleSelectionPrompt,
  transitionWhatsAppOnboarding,
};
