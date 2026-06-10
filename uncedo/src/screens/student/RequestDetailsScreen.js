import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { subscribeToRequestById } from '../../services/classRequestService';
import { subscribeToStudentSessions } from '../../services/sessionService';
import { colors } from '../../theme/colors';
import { formatRand } from '../../utils/pricing';
import { getRequestStatusMeta } from '../../utils/requestStatus';

function AttachmentRow({ attachment, index }) {
  const label = attachment?.fileName || `Attachment ${index + 1}`;

  const handleOpen = () => {
    if (attachment?.downloadUrl) {
      Linking.openURL(attachment.downloadUrl).catch(() => null);
    }
  };

  return (
    <Pressable accessibilityRole="button" disabled={!attachment?.downloadUrl} onPress={handleOpen} style={styles.attachmentRow}>
      <View style={styles.attachmentCopy}>
        <Text style={styles.attachmentTitle}>{label}</Text>
        <Text style={styles.attachmentSubtitle}>{attachment?.downloadUrl ? 'Open file' : 'File link unavailable'}</Text>
      </View>
      <Text style={styles.attachmentAction}>{attachment?.downloadUrl ? 'View' : 'Saved'}</Text>
    </Pressable>
  );
}

export function RequestDetailsScreen({ route, navigate, goBack }) {
  const { user } = useAuth();
  const requestId = route?.params?.requestId || '';
  const [request, setRequest] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => subscribeToRequestById(
    requestId,
    (item) => {
      setRequest(item);
      setLoading(false);
    },
    (nextError) => {
      setError(nextError.message || 'Unable to load this request right now.');
      setLoading(false);
    },
  ), [requestId]);

  useEffect(() => subscribeToStudentSessions(
    user?.uid,
    (items) => setSessions(items),
    () => setSessions([]),
  ), [user?.uid]);

  const relatedSession = useMemo(
    () => sessions.find((item) => item.requestId === requestId) || null,
    [requestId, sessions],
  );

  if (loading) {
    return <LoadingState label="Loading job request" />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!request) {
    return <ErrorState title="Request not found" message="We could not find the job request you are looking for." />;
  }

  const attachments = Array.isArray(request.attachments) && request.attachments.length
    ? request.attachments
    : request.attachment?.downloadUrl
      ? [request.attachment]
      : [];
  const extractionEntries = Array.isArray(request?.boardPreparationSource?.attachmentExtractions)
    ? request.boardPreparationSource.attachmentExtractions
    : [];
  const statusMeta = getRequestStatusMeta(request.status);

  return (
    <View style={styles.wrap}>
      <Card style={styles.heroCard}>
        <Text style={styles.kicker}>Job request</Text>
        <Text style={styles.heroTitle}>{request.topic || 'Service request'}</Text>
        <Text style={styles.heroCopy}>
          {request.description || 'No extra description provided for this job request.'}
        </Text>
        <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Quick details</Text>
        <View style={styles.metricList}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Request ID</Text>
            <Text style={styles.metricValue}>{request.id || 'N/A'}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Service category</Text>
            <Text style={styles.metricValue}>{request.subject || 'General help'}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Duration</Text>
            <Text style={styles.metricValue}>{request.duration || 'N/A'}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Helper</Text>
            <Text style={styles.metricValue}>{request.tutorName || 'Not assigned yet'}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Quoted total</Text>
            <Text style={styles.metricValue}>
              {request.pricingSnapshot?.totalAmount
                ? `Original ${formatRand(request.pricingSnapshot.originalPrice ?? request.pricingSnapshot.totalAmount)} | Discount ${formatRand(request.pricingSnapshot.discountApplied || 0)} | Pay ${formatRand(request.pricingSnapshot.finalPrice ?? request.pricingSnapshot.totalAmount)}`
                : 'Not quoted'}
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Job details</Text>
            <Text style={styles.metricValue}>
              {relatedSession
                ? `Status ${relatedSession.status || 'waiting_student'} | Length ${relatedSession.duration || request.duration || 'TBD'}`
                : 'Assigned job details will appear here once a helper accepts'}
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>OCR diagnostics</Text>
            <Text style={styles.metricValue}>
              {extractionEntries.length
                ? extractionEntries.map((entry) => `${entry.fileName || 'Attachment'}: ${entry.providerRoute || entry.extractionMethod || 'unknown'}`).join(' | ')
                : 'No OCR diagnostics saved'}
            </Text>
          </View>
        </View>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Request details</Text>
        <Text style={styles.descriptionCopy}>{request.description || 'No extra description provided.'}</Text>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Attachments</Text>
        {attachments.length ? (
          <View style={styles.attachmentList}>
            {attachments.map((attachment, index) => (
              <AttachmentRow attachment={attachment} index={index} key={`${attachment?.fileName || 'attachment'}-${index}`} />
            ))}
          </View>
        ) : (
          <Text style={styles.emptyCopy}>Any files you upload with a request will appear here.</Text>
        )}
      </Card>

      <View style={styles.actions}>
        {relatedSession?.id ? (
          <Button onPress={() => navigate({ key: 'SessionRoom', params: { sessionId: relatedSession.id, parentTab: 'Requests' } })}>
            Open job
          </Button>
        ) : null}
        <Button variant="secondary" onPress={() => navigate({ key: 'RequestStatus', params: { requestId, parentTab: 'Requests' } })}>
          View request status
        </Button>
        <Button variant="secondary" onPress={() => goBack('Requests')}>
          Back to My Job Requests
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
  },
  heroCard: {
    backgroundColor: '#ecfdf5',
    gap: 10,
  },
  kicker: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  heroCopy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  sectionCard: {
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  metricList: {
    gap: 10,
  },
  metric: {
    backgroundColor: '#fafafa',
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 6,
  },
  descriptionCopy: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 22,
  },
  attachmentList: {
    gap: 10,
  },
  attachmentRow: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 14,
  },
  attachmentCopy: {
    flex: 1,
    gap: 4,
  },
  attachmentTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  attachmentSubtitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  attachmentAction: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  emptyCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    gap: 10,
  },
});
