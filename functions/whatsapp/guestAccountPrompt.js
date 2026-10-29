'use strict';

const GUEST_ACCOUNT_BUTTONS = Object.freeze({
  CREATE_ACCOUNT: 'wa_guest_create_account',
  LINK_ACCOUNT: 'wa_guest_link_account',
  CONTINUE_AS_GUEST: 'wa_guest_continue',
});

function buildGuestAccountPrompt(matchStatus = 'unavailable') {
  const status = String(matchStatus || '').trim().toLowerCase();
  if (status === 'not-found') {
    const text = 'You are using Uncedo as a guest. I could not find a customer account registered with this WhatsApp number, so there are no linked account details to show. Would you like to create a customer account and link it to this WhatsApp chat?';
    return {
      status,
      action: 'create-account',
      text,
      interactive: {
        type: 'button',
        body: { text },
        action: { buttons: [
          { type: 'reply', reply: { id: GUEST_ACCOUNT_BUTTONS.CREATE_ACCOUNT, title: 'Create Account' } },
          { type: 'reply', reply: { id: GUEST_ACCOUNT_BUTTONS.CONTINUE_AS_GUEST, title: 'Continue as guest' } },
        ] },
      },
    };
  }

  if (status === 'found') {
    const text = 'You are using Uncedo as a guest. I found one customer account registered with this WhatsApp number. Would you like to link that account to this WhatsApp chat?';
    return {
      status,
      action: 'link-account',
      text,
      interactive: {
        type: 'button',
        body: { text },
        action: { buttons: [
          { type: 'reply', reply: { id: GUEST_ACCOUNT_BUTTONS.LINK_ACCOUNT, title: 'Link Account' } },
          { type: 'reply', reply: { id: GUEST_ACCOUNT_BUTTONS.CONTINUE_AS_GUEST, title: 'Continue as guest' } },
        ] },
      },
    };
  }

  const text = status === 'ambiguous' || status === 'unsupported'
    ? 'You are using Uncedo as a guest. I could not safely identify one customer account to link. Please contact Uncedo support if you want help linking an account, or continue as a guest.'
    : 'You are using Uncedo as a guest. I could not check account availability right now. Please try again later, or continue as a guest.';
  return {
    status: status || 'unavailable',
    action: 'continue-as-guest',
    text,
    interactive: {
      type: 'button',
      body: { text },
      action: { buttons: [
        { type: 'reply', reply: { id: GUEST_ACCOUNT_BUTTONS.CONTINUE_AS_GUEST, title: 'Continue as guest' } },
      ] },
    },
  };
}

module.exports = { GUEST_ACCOUNT_BUTTONS, buildGuestAccountPrompt };
