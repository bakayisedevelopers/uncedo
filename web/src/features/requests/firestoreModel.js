// Firestore collection blueprint for Parakleo MVP.
// users/{uid}
// {
//   displayName: string,
//   email: string,
//   role: 'student' | 'tutor',
//   createdAt: Timestamp,
//   updatedAt: Timestamp,
// }
//
// classRequests/{requestId}
// {
//   studentId: string,
//   studentName: string,
//   subject: string,
//   topic: string,
//   description: string,
//   preferredDate: string,
//   preferredTime: string,
//   duration: string,
//   mode: 'online',
//   tutorPreference: string | null,
//   budget: string | null,
//   status: 'pending' | 'accepted' | 'in_progress' | 'completed',
//   tutorId: string | null,
//   tutorName: string | null,
//   createdAt: Timestamp,
//   updatedAt: Timestamp,
// }
//
// sessions/{sessionId}
// {
//   classRequestId: string,
//   studentId: string,
//   tutorId: string,
//   startsAt: Timestamp,
//   endsAt: Timestamp,
//   meetingUrl: string,
//   status: 'scheduled' | 'live' | 'done' | 'canceled',
//   createdAt: Timestamp,
//   updatedAt: Timestamp,
// }

export const firestoreModel = {
  users: 'users/{uid}',
  classRequests: 'classRequests/{requestId}',
  sessions: 'sessions/{sessionId}',
};
