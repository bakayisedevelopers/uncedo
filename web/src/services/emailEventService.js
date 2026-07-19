import { getFirebaseClients } from '../firebase/config';

export const EMAIL_EVENT_TYPES = {
  WELCOME: 'welcome',
  CARD_ADDED: 'card_added',
  REFUND_PROCESSED: 'refund_processed',
  SESSION_INVOICE: 'session_invoice',
  TUTOR_PROFILE_COMPLETED: 'tutor_profile_completed',
  TUTOR_PAYOUT_DETAILS_SUBMITTED: 'tutor_payout_details_submitted',
  TUTOR_PAYOUT_STATUS: 'tutor_payout_status',
};

const APPROVED_EMAIL_EVENT_TYPES = new Set(Object.values(EMAIL_EVENT_TYPES));

export async function queueEmailEvent(eventType, payload) {
  const clients = await getFirebaseClients();

  if (!clients) {
    return;
  }

  if (!APPROVED_EMAIL_EVENT_TYPES.has(eventType)) {
    throw new Error(`Unsupported email event type: ${eventType}`);
  }

  const { db, firestoreModule } = clients;
  const { addDoc, collection, serverTimestamp } = firestoreModule;

  await addDoc(collection(db, 'emailEvents'), {
    eventType,
    payload,
    status: 'queued',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
