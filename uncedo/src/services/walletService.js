import { subscribeToUserProfile } from './userService';

export function subscribeToCustomerWallet(customerId, callback, onError) {
  return subscribeToUserProfile(
    customerId,
    (profile) => callback(profile?.wallet || { balance: 0, currency: 'ZAR' }),
    onError,
  );
}

export const subscribeToStudentWallet = subscribeToCustomerWallet;
