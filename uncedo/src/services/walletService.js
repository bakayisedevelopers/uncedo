import { subscribeToUserProfile } from './userService';

export function subscribeToStudentWallet(studentId, callback, onError) {
  return subscribeToUserProfile(
    studentId,
    (profile) => callback(profile?.wallet || { balance: 0, currency: 'ZAR' }),
    onError,
  );
}
