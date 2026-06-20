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
import { getRequestStatusMeta } from '../../utils/requestStatus';

function formatDateTime(value) {
  if (!value) return 'Not available';

  const date = typeof value?.toDate === 'function'
    ? value.toDate()
    : typeof value === 'number'
      ? new Date(value)
      : new Date(value);

  if (Number.isNaN(date.getTime())) return 'Not available';

  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

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

  useEffect(() => {
    setLoading(true);
    setError('');

    return subscribeToRequestById(
      requestId,
      (item) => {
        setRequest(item);
        setLoading(false);
      },
      (nextError) => {
        setError(nextError.message || 'Unable to load this service right now.');
        setLoading(false);
      },
    );
  }, [requestId]);

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
    return <LoadingState label="Loading service details" />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!request) {
    return <ErrorState title="Service not found" message="We could not find the service you are looking for." />;
  }

  const attachments = Array.isArray(request.attachments) && request.attachments.length
    ? request.attachments
    : request.attachment?.downloadUrl
      ? [request.attachment]
      : [];
  const statusMeta = getRequestStatusMeta(request.status);
  const statusDetail = request.statusDetail || relatedSession?.statusDetail || '';
  const details = [
    { label: 'Service', value: request.subject || request.topic || 'General help' },
    { label: 'Requested by', value: request.studentName || 'You' },
    { label: 'Requested on', value: formatDateTime(request.createdAt) },
    { label: 'Current status', value: statusMeta.label },
    { label: 'Helper', value: request.tutorName || 'Not assigned yet' },
    { label: 'Session time', value: relatedSession?.duration || request.duration || 'Not available' },
  ];

  return (
    <View style={styles.wrap}>
      <Card style={styles.heroCard}>
        <Text style={styles.kicker}>Service details</Text>
        <Text style={styles.heroTitle}>{request.subject || request.topic || 'Service request'}</Text>
        <Text style={styles.heroCopy}>{request.description || 'No extra description provided for this service.'}</Text>
        <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>At a glance</Text>
        <View style={styles.detailList}>
          {details.map((item) => (
            <View style={styles.detailRow} key={item.label}>
              <Text style={styles.detailLabel}>{item.label}</Text>
              <Text style={styles.detailValue}>{item.value}</Text>
            </View>
          ))}
        </View>
      </Card>

      {statusDetail ? (
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Status note</Text>
          <Text style={styles.descriptionCopy}>{statusDetail}</Text>
        </Card>
      ) : null}

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Description</Text>
        <Text style={styles.descriptionCopy}>{request.description || 'No extra description provided.'}</Text>
      </Card>

      {attachments.length ? (
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Attachments</Text>
          <View style={styles.attachmentList}>
            {attachments.map((attachment, index) => (
              <AttachmentRow attachment={attachment} index={index} key={`${attachment?.fileName || 'attachment'}-${index}`} />
            ))}
          </View>
        </Card>
      ) : null}

      <View style={styles.actions}>
        <Button
          onPress={() => navigate({
            key: 'CustomerHome',
            params: {
              parentTab: 'CustomerHome',
              draftText: request.description || request.topic || request.subject || '',
            },
          })}
        >
          Re-request this service
        </Button>
        <Button variant="secondary" onPress={() => goBack('Requests')}>
          Back to Services
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
    backgroundColor: '#fdf4ff',
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
  detailList: {
    gap: 10,
  },
  detailRow: {
    backgroundColor: '#fafafa',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  detailValue: {
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
  actions: {
    gap: 10,
  },
});
