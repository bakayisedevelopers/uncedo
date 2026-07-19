import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PLACEHOLDER_THREAD_QUICK_REPLIES } from '../../constants/customer';
import { colors } from '../../theme/colors';

function MessageBubble({ item }) {
  const isCustomer = item.role === 'customer';
  return (
    <View style={[styles.messageRow, isCustomer && styles.messageRowRight]}>
      <View style={[styles.messageBubble, isCustomer ? styles.messageBubbleCustomer : styles.messageBubbleSystem]}>
        <Text style={[styles.messageAuthor, isCustomer && styles.messageAuthorCustomer]}>
          {isCustomer ? 'Customer' : (item.role === 'helper' || item.role === 'provider') ? 'Helper' : 'Uncedo'}
        </Text>
        <Text style={[styles.messageText, isCustomer && styles.messageTextCustomer]}>{item.text}</Text>
      </View>
    </View>
  );
}

export function JobRequestThreadScreen({ goBack, route, systemInsets = {} }) {
  const draftText = String(route?.params?.draftText || 'I need help with dishes.').trim();
  const draftAttachments = Array.isArray(route?.params?.draftAttachments) ? route.params.draftAttachments : [];
  const topInset = Math.max(0, Number(systemInsets?.top || 0));
  const bottomInset = Math.max(0, Number(systemInsets?.bottom || 0));
  const [composerText, setComposerText] = useState('');
  const [messages, setMessages] = useState([
    { id: 'm1', role: 'customer', text: draftText || 'I need help with dishes.' },
    { id: 'm2', role: 'system', text: 'Sure, I can help with that. Is this after an event or normal household dishes?' },
  ]);

  const statusCards = useMemo(() => ([
    { id: 'status', title: 'Status', value: 'Looking for a helper', icon: 'sparkles-outline' },
    { id: 'price', title: 'Estimate', value: 'Pricing card placeholder', icon: 'card-outline' },
    { id: 'track', title: 'Tracking', value: 'Map tracking card placeholder', icon: 'navigate-outline' },
  ]), []);

  const sendCustomerReply = (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return;

    setMessages((prev) => [
      ...prev,
      { id: `c-${prev.length + 1}`, role: 'customer', text: trimmed },
      { id: `u-${prev.length + 2}`, role: 'system', text: 'Placeholder follow-up saved. Full AI and helper chat will connect here later.' },
    ]);
    setComposerText('');
  };

  return (
    <View style={[styles.screen, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => goBack('CustomerHome')} style={styles.backButton}>
          <Ionicons color={colors.text} name="arrow-back" size={20} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Job Request</Text>
          <Text style={styles.headerSubtitle}>Conversation foundation</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 118 }]}>
        {draftAttachments.length ? (
          <Card style={styles.attachmentCard}>
            <Text style={styles.sectionTitle}>Photos you added</Text>
            <ScrollView contentContainerStyle={styles.imageRow} horizontal showsHorizontalScrollIndicator={false}>
              {draftAttachments.map((attachment, index) => (
                <View key={`${attachment.name || 'attachment'}-${index}`} style={styles.imageCard}>
                  {attachment.dataUrl ? (
                    <Image source={{ uri: attachment.dataUrl }} style={styles.imagePreview} />
                  ) : (
                    <View style={styles.imageFallback}>
                      <Ionicons color={colors.brandDark} name="image-outline" size={22} />
                    </View>
                  )}
                  <Text numberOfLines={1} style={styles.imageName}>{attachment.name || `Image ${index + 1}`}</Text>
                </View>
              ))}
            </ScrollView>
          </Card>
        ) : null}

        <Card style={styles.statusCard}>
          <Text style={styles.sectionTitle}>What this screen will support later</Text>
          <View style={styles.statusGrid}>
            {statusCards.map((card) => (
              <View key={card.id} style={styles.statusTile}>
                <Ionicons color={colors.brandDark} name={card.icon} size={18} />
                <Text style={styles.statusTileTitle}>{card.title}</Text>
                <Text style={styles.statusTileValue}>{card.value}</Text>
              </View>
            ))}
          </View>
        </Card>

        <View style={styles.messageList}>
          {messages.map((message) => <MessageBubble item={message} key={message.id} />)}
        </View>

        <Card style={styles.quickReplyCard}>
          <Text style={styles.sectionTitle}>Quick replies</Text>
          <View style={styles.quickReplyWrap}>
            {PLACEHOLDER_THREAD_QUICK_REPLIES.map((reply) => (
              <Pressable key={reply} accessibilityRole="button" onPress={() => sendCustomerReply(reply)} style={styles.quickReplyChip}>
                <Text style={styles.quickReplyText}>{reply}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <Card style={styles.providerPlaceholderCard}>
          <Text style={styles.sectionTitle}>Future helper card</Text>
          <Text style={styles.placeholderCopy}>Assigned helper details, helper chat messages, arrival updates, completion approval, and rating prompts will appear here later.</Text>
        </Card>
      </ScrollView>

      <View style={[styles.composer, { bottom: bottomInset }]}>
        <TextInput
          onChangeText={setComposerText}
          placeholder="Reply in this request thread"
          placeholderTextColor={colors.muted}
          style={styles.composerInput}
          value={composerText}
        />
        <Button
          disabled={!composerText.trim()}
          icon={<Ionicons color="#ffffff" name="send" size={16} />}
          onPress={() => sendCustomerReply(composerText)}
          style={styles.composerButton}
        >
          Send
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#f8fafc',
    flex: 1,
  },
  header: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#f4f4f5',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  headerSubtitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  content: {
    gap: 14,
    padding: 16,
  },
  attachmentCard: {
    gap: 10,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  imageRow: {
    gap: 10,
    paddingRight: 10,
  },
  imageCard: {
    gap: 6,
    width: 96,
  },
  imagePreview: {
    backgroundColor: '#e5e7eb',
    borderRadius: 20,
    height: 96,
    width: 96,
  },
  imageFallback: {
    alignItems: 'center',
    backgroundColor: '#fae8ff',
    borderRadius: 20,
    height: 96,
    justifyContent: 'center',
    width: 96,
  },
  imageName: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  statusCard: {
    gap: 12,
  },
  statusGrid: {
    gap: 10,
  },
  statusTile: {
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  statusTileTitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statusTileValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  messageList: {
    gap: 12,
  },
  messageRow: {
    alignItems: 'flex-start',
  },
  messageRowRight: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    borderRadius: 22,
    gap: 6,
    maxWidth: '86%',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  messageBubbleSystem: {
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderWidth: 1,
  },
  messageBubbleCustomer: {
    backgroundColor: colors.brand,
  },
  messageAuthor: {
    color: colors.brandDark,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  messageAuthorCustomer: {
    color: 'rgba(255,255,255,0.85)',
  },
  messageText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  messageTextCustomer: {
    color: '#ffffff',
  },
  quickReplyCard: {
    gap: 12,
  },
  quickReplyWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickReplyChip: {
    backgroundColor: '#f4f4f5',
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  quickReplyText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  providerPlaceholderCard: {
    gap: 8,
  },
  placeholderCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  composer: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    left: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
    position: 'absolute',
    right: 0,
  },
  composerInput: {
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 14,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  composerButton: {
    minWidth: 94,
  },
});
