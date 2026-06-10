import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { subscribeToStudentSessions } from '../../services/sessionService';
import { colors } from '../../theme/colors';
import { getSessionStatusMeta } from '../../utils/sessionStatus';

function getMeetingProviderLabel(session) {
  const meetingProvider = String(
    session?.meetingProvider
    || session?.sessionProvider
    || '',
  ).toLowerCase();

  if (meetingProvider === 'gemini_live') return 'Gemini Live';
  if (meetingProvider === 'webrtc_human') return 'Parakleo WebRTC';
  if (meetingProvider === 'webrtc') return 'In-app call';
  if (meetingProvider) return meetingProvider.replace(/_/g, ' ');
  return 'Not set';
}

function getSessionScheduleLine(session) {
  const date = session?.scheduledDate || 'Live';
  const time = session?.scheduledTime || 'Now';
  const duration = session?.duration || `${session?.durationMinutes || 60} mins`;
  return `${date} - ${time} - ${duration}`;
}

export function SessionsScreen({ navigate }) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    return subscribeToStudentSessions(
      user?.uid,
      (items) => {
        setSessions(items);
        setLoading(false);
      },
      (nextError) => {
        setError(nextError.message);
        setLoading(false);
      },
    );
  }, [user?.uid]);

  const openSession = (sessionId) => {
    navigate({ key: 'SessionRoom', params: { sessionId, parentTab: 'Sessions' } });
  };

  if (loading) return <LoadingState label="Loading classes" />;
  if (error) return <ErrorState message={error} />;
  if (!sessions.length) {
    return (
      <View style={styles.wrap}>
        <View style={styles.headerCard}>
          <Text style={styles.title}>My Sessions</Text>
          <Text style={styles.subtitle}>Track scheduled, in-progress, and completed classes in real time.</Text>
        </View>
        <Card style={styles.sectionCard}>
          <EmptyState title="No sessions yet" message="Accepted requests automatically become sessions." />
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headerCard}>
        <Text style={styles.title}>My Sessions</Text>
        <Text style={styles.subtitle}>Track scheduled, in-progress, and completed classes in real time.</Text>
      </View>

      <Card style={styles.sectionCard}>
        {sessions.map((session) => (
          <Pressable
            key={session.id}
            accessibilityRole="button"
            onPress={() => openSession(session.id)}
            style={({ pressed }) => [
              styles.sessionCard,
              pressed && styles.sessionCardPressed,
            ]}
          >
            <View style={styles.sessionHeader}>
              <View style={styles.sessionTitleWrap}>
                <Text style={styles.subjectLabel}>{session.subject || 'Session'}</Text>
                <Text style={styles.cardTitle}>{session.topic || 'Class session'}</Text>
              </View>
              <StatusBadge {...getSessionStatusMeta(session.status)} />
            </View>

            <View style={styles.metaGrid}>
              <View style={styles.metaItem}>
                <Ionicons name="calendar-outline" size={16} color="#a1a1aa" />
                <Text style={styles.metaText}>{getSessionScheduleLine(session)}</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="person-outline" size={16} color="#a1a1aa" />
                <Text style={styles.metaText}>{session.tutorName || session.tutorId || 'Tutor pending'}</Text>
              </View>
            </View>

            <Text style={styles.providerText}>Provider: {getMeetingProviderLabel(session)}</Text>
            {session.meetingLink ? (
              <Pressable accessibilityRole="button" onPress={() => openSession(session.id)}>
                <Text style={styles.linkText}>Open meeting link</Text>
              </Pressable>
            ) : (
              <Text style={styles.providerText}>Meeting link not added yet.</Text>
            )}

            <View style={styles.actionsRow}>
              <Button onPress={() => openSession(session.id)} style={styles.actionButton}>
                {session.status === 'in_progress' ? 'Rejoin Call' : 'Open Session Room'}
              </Button>
            </View>
          </Pressable>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  headerCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: '#52525b',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 24,
    gap: 16,
    padding: 16,
  },
  sessionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 26,
    borderWidth: 1,
    gap: 12,
    padding: 20,
  },
  sessionCardPressed: {
    backgroundColor: '#fffbff',
    borderColor: '#6ee7b7',
  },
  sessionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  sessionTitleWrap: {
    flex: 1,
    gap: 2,
  },
  subjectLabel: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  cardTitle: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 34,
  },
  metaGrid: {
    gap: 8,
  },
  metaItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  metaText: {
    color: '#3f3f46',
    fontSize: 14,
  },
  providerText: {
    color: '#71717a',
    fontSize: 14,
    lineHeight: 20,
  },
  linkText: {
    color: '#047857',
    fontSize: 14,
    fontWeight: '700',
  },
  actionsRow: {
    marginTop: 4,
  },
  actionButton: {
    alignSelf: 'flex-start',
    borderRadius: 16,
    minHeight: 42,
    paddingHorizontal: 16,
  },
});
