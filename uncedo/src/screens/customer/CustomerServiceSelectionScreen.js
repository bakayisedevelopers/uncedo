import { useEffect, useMemo, useState } from 'react';
import {
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/States';
import {
  buildMissingRequiredFields,
  getQuestionDefinitionById,
  getRequiredQuestionDefinitions,
} from '../../constants/customerIntakeQuestions';
import { useAuth } from '../../context/AuthContext';
import {
  buildServicePricingSnapshot,
  createCustomerServiceRequest,
  fetchServicePricingQuote,
  finalizeCustomerServiceRequest,
} from '../../services/customerServiceRequestService';
import { updateUserProfile } from '../../services/userService';
import { colors } from '../../theme/colors';

function formatCurrency(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 'R0.00';
  return `R${amount.toFixed(2)}`;
}

function normalizeAnswerMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value).reduce((acc, [key, entry]) => {
    const normalized = Array.isArray(entry)
      ? entry.filter(Boolean)
      : String(entry || '').trim();
    if ((Array.isArray(normalized) && normalized.length) || (!Array.isArray(normalized) && normalized)) {
      acc[key] = normalized;
    }
    return acc;
  }, {});
}

function QuestionField({ question, value, onChange }) {
  if (!question) return null;

  const finalValue = Array.isArray(value) ? value : String(value || '');
  if (question.answerType === 'enum' && Array.isArray(question.options) && question.options.length) {
    return (
      <View style={styles.questionBlock}>
        <Text style={styles.questionLabel}>{question.prompt}</Text>
        <View style={styles.optionWrap}>
          {question.options.map((option) => {
            const isActive = finalValue === option;
            return (
              <Pressable
                accessibilityRole="button"
                key={option}
                onPress={() => onChange(option)}
                style={({ pressed }) => [
                  styles.optionChip,
                  isActive && styles.optionChipActive,
                  pressed && styles.optionChipPressed,
                ]}
              >
                <Text style={[styles.optionChipText, isActive && styles.optionChipTextActive]}>
                  {option.replace(/_/g, ' ')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.questionBlock}>
      <Text style={styles.questionLabel}>{question.prompt}</Text>
      <TextInput
        multiline={question.answerType === 'text'}
        onChangeText={onChange}
        placeholder={question.answerHint || 'Type your answer'}
        placeholderTextColor="#d8b4fe"
        style={[styles.input, question.answerType === 'text' && styles.inputTall]}
        textAlignVertical="top"
        value={String(finalValue || '')}
      />
    </View>
  );
}

export function CustomerServiceSelectionScreen({ route, navigate, goBack, systemInsets = {} }) {
  const { setUser, user, homeLocation } = useAuth();
  const item = route?.params?.item || null;
  const parentTab = route?.params?.parentTab || 'CustomerHome';
  const topInset = Platform.OS === 'ios' ? 54 : Math.max(24, Number(systemInsets?.top || 0) + 18);
  const [structuredAnswers, setStructuredAnswers] = useState(() => normalizeAnswerMap(route?.params?.initialStructuredAnswers) || {});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pricePreview, setPricePreview] = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);

  const categoryId = String(item?.categoryId || '').trim();
  const serviceIds = Array.isArray(item?.serviceIds) ? item.serviceIds : [];
  const selectedPackageId = ['package', 'bundle'].includes(String(item?.kind || '').trim().toLowerCase())
    ? String(item?.packageId || item?.entityId || '').trim()
    : '';
  const isFixedPrice = String(item?.pricing?.pricingMode || '').trim().toLowerCase() === 'fixed';

  useEffect(() => {
    if (!user?.uid || !categoryId) return;

    const currentCategories = Array.isArray(user?.customerProfile?.preferredServiceCategories)
      ? user.customerProfile.preferredServiceCategories.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [];

    if (currentCategories.includes(categoryId)) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const nextCategories = [...new Set([...currentCategories, categoryId])];
        const profile = await updateUserProfile(user.uid, {
          customerProfile: {
            ...(user?.customerProfile || {}),
            preferredServiceCategories: nextCategories,
          },
        });

        if (!cancelled && profile) {
          setUser((prev) => ({ ...prev, ...profile }));
        }
      } catch (_error) {
        // Keep the flow moving if profile persistence fails here.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [categoryId, setUser, user?.customerProfile, user?.uid]);

  const requiredQuestions = useMemo(() => {
    if (!categoryId || !serviceIds.length) return [];
    return getRequiredQuestionDefinitions({ categoryId, serviceIds, selectedPackageId });
  }, [categoryId, selectedPackageId, serviceIds]);

  const renderQuestions = useMemo(() => {
    if (!requiredQuestions.length) return [];
    const questions = [...requiredQuestions];
    if (String(structuredAnswers?.timing_preference || '').trim().toLowerCase() === 'later') {
      const scheduledQuestion = getQuestionDefinitionById({
        categoryId,
        serviceIds,
        selectedPackageId,
        questionId: 'scheduled_for_text',
      });
      if (scheduledQuestion) {
        questions.push(scheduledQuestion);
      }
    }
    return questions;
  }, [categoryId, requiredQuestions, selectedPackageId, serviceIds, structuredAnswers?.timing_preference]);

  const missingRequired = useMemo(
    () => buildMissingRequiredFields({ categoryId, serviceIds, selectedPackageId, structuredAnswers }),
    [categoryId, selectedPackageId, serviceIds, structuredAnswers],
  );

  useEffect(() => {
    let cancelled = false;

    if (!categoryId || !serviceIds.length || missingRequired.length) {
      setPricePreview(null);
      setPriceLoading(false);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      setPriceLoading(true);
      try {
        const quote = await fetchServicePricingQuote({
          categoryId,
          serviceIds,
          structuredAnswers,
        });
        if (!cancelled) {
          setPricePreview(quote);
          setPriceLoading(false);
        }
      } catch (_error) {
        if (!cancelled) {
          setPricePreview(buildServicePricingSnapshot({
            categoryId,
            serviceIds,
            structuredAnswers,
          }));
          setPriceLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [categoryId, missingRequired.length, serviceIds, structuredAnswers]);

  const handleAnswerChange = (questionId, nextValue) => {
    setStructuredAnswers((current) => ({
      ...current,
      [questionId]: nextValue,
    }));
  };

  const handleRequest = async () => {
    if (!item || !categoryId || !serviceIds.length || submitting) return;

    setSubmitting(true);
    setError('');

    try {
      if (isFixedPrice && !missingRequired.length) {
        const requestId = await createCustomerServiceRequest({
          user,
          location: homeLocation || route?.params?.location || null,
          initialDraft: {
            categoryId,
            serviceIds,
            selectedPackageId,
            structuredAnswers,
            serviceAddress: String(user?.customerProfile?.serviceAddress || '').trim(),
            serviceAddressTarget: String(structuredAnswers?.service_address_target || '').trim(),
          },
        });

        await finalizeCustomerServiceRequest({
          requestId,
          callId: '',
          categoryId,
          serviceIds,
          structuredAnswers,
        });

        navigate({
          key: 'ServiceRequestTracking',
          params: {
            requestId,
            parentTab,
          },
        });
        return;
      }

      navigate({
        key: 'CustomerServiceCall',
        params: {
          parentTab,
          categoryId,
          serviceIds,
          selectedPackageId,
          initialStructuredAnswers: structuredAnswers,
        },
      });
    } catch (nextError) {
      setError(nextError.message || 'Unable to continue with this service.');
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
  };

  if (!item) {
    return <ErrorState message="Service details are missing." title="Unable to open service" />;
  }

  const shouldWaitForPrice = !missingRequired.length;
  const buttonLabel = submitting
    ? 'Preparing request...'
    : shouldWaitForPrice && priceLoading
      ? 'Calculating price...'
      : shouldWaitForPrice && pricePreview
        ? `${isFixedPrice ? 'Request now' : 'Continue'} - ${formatCurrency(pricePreview.total)}`
        : 'Continue in chat';

  const buttonDisabled = submitting || (shouldWaitForPrice && (priceLoading || !pricePreview));

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: topInset, paddingBottom: 36 }]} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" onPress={() => goBack(parentTab)} style={styles.backButton}>
          <Ionicons color={colors.text} name="chevron-back" size={18} />
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>

        <View style={styles.heroCard}>
          {item.imageUri ? (
            <ImageBackground imageStyle={styles.heroImage} source={{ uri: item.imageUri }} style={styles.heroMedia}>
              <View style={styles.heroTint} />
              <View style={styles.heroOverlay}>
                <View style={styles.heroPill}>
                  <Text style={styles.heroPillText}>{item.kind === 'bundle' || item.kind === 'package' ? 'Bundle' : 'Service'}</Text>
                </View>
                <View style={styles.heroFooter}>
                  <Text style={styles.heroTitle}>{item.title}</Text>
                  <View style={styles.heroMetaRow}>
                    <Text style={styles.heroMeta}>{item.categoryLabel}</Text>
                    <Text style={styles.heroPrice}>{pricePreview ? formatCurrency(pricePreview.total) : item.priceLabel}</Text>
                  </View>
                </View>
              </View>
            </ImageBackground>
          ) : (
            <View style={[styles.heroMedia, styles.heroFallback]}>
              <Ionicons color={colors.brand} name="sparkles-outline" size={28} />
              <Text style={styles.heroFallbackTitle}>{item.title}</Text>
              <Text style={styles.heroFallbackPrice}>{item.priceLabel}</Text>
            </View>
          )}

          <View style={styles.heroBody}>
            <Text style={styles.description}>{item.description}</Text>
            <View style={styles.quickMeta}>
              <View style={styles.quickMetaPill}>
                <Ionicons color={colors.brand} name="people-outline" size={14} />
                <Text style={styles.quickMetaText}>{item.helperCount} helpers</Text>
              </View>
              <View style={styles.quickMetaPill}>
                <Ionicons color={colors.brand} name="pricetag-outline" size={14} />
                <Text style={styles.quickMetaText}>{item.priceLabel}</Text>
              </View>
            </View>
          </View>
        </View>

        {item.includedLabels?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Included</Text>
            <View style={styles.tagWrap}>
              {item.includedLabels.map((label) => (
                <View key={label} style={styles.tag}>
                  <Text style={styles.tagText}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick details</Text>
          <Text style={styles.sectionCopy}>
            {isFixedPrice
              ? 'Complete the essentials here. If nothing else is needed, Uncedo can request the helper immediately.'
              : 'Add what you know now. The chat will only collect whatever is still missing.'}
          </Text>
        </View>

        <View style={styles.formCard}>
          {renderQuestions.map((question) => (
            <QuestionField
              key={question.id}
              onChange={(value) => handleAnswerChange(question.id, value)}
              question={question}
              value={structuredAnswers?.[question.id]}
            />
          ))}
        </View>

        {error ? (
          <View style={styles.inlineError}>
            <Ionicons color="#b91c1c" name="alert-circle-outline" size={16} />
            <Text style={styles.inlineErrorText}>{error}</Text>
          </View>
        ) : null}

        <Button disabled={buttonDisabled} onPress={handleRequest} style={styles.requestButton}>
          {buttonLabel}
        </Button>

        {!!missingRequired.length && !submitting ? (
          <Text style={styles.footerNote}>
            Missing: {missingRequired.join(', ').replace(/_/g, ' ')}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#fff7fd',
    flex: 1,
  },
  content: {
    gap: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(217,70,239,0.14)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderColor: 'rgba(217,70,239,0.12)',
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  heroMedia: {
    height: 340,
    justifyContent: 'flex-end',
  },
  heroImage: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  heroTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.18)',
  },
  heroOverlay: {
    gap: 14,
    padding: 16,
  },
  heroPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,250,245,0.92)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  heroPillText: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '800',
  },
  heroFooter: {
    backgroundColor: 'rgba(255,250,245,0.92)',
    borderRadius: 22,
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  heroMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroMeta: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '700',
  },
  heroPrice: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  heroFallback: {
    alignItems: 'center',
    backgroundColor: 'rgba(217,70,239,0.08)',
    gap: 8,
    justifyContent: 'center',
  },
  heroFallbackTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  heroFallbackPrice: {
    color: colors.brandDark,
    fontSize: 15,
    fontWeight: '800',
  },
  heroBody: {
    gap: 12,
    padding: 16,
  },
  description: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  quickMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickMetaPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(217,70,239,0.08)',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickMetaText: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '700',
  },
  section: {
    gap: 5,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: 'rgba(217,70,239,0.08)',
    borderColor: 'rgba(217,70,239,0.14)',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tagText: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '700',
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderColor: 'rgba(217,70,239,0.12)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 16,
    padding: 16,
  },
  questionBlock: {
    gap: 10,
  },
  questionLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    backgroundColor: '#f8ecff',
    borderColor: 'rgba(217,70,239,0.14)',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionChipActive: {
    backgroundColor: colors.brandDark,
    borderColor: colors.brandDark,
  },
  optionChipPressed: {
    transform: [{ scale: 0.99 }],
  },
  optionChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  optionChipTextActive: {
    color: '#ffffff',
  },
  input: {
    backgroundColor: '#f9fafb',
    borderColor: 'rgba(217,70,239,0.12)',
    borderRadius: 18,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputTall: {
    minHeight: 94,
  },
  priceCard: {
    backgroundColor: 'rgba(217,70,239,0.08)',
    borderColor: 'rgba(217,70,239,0.14)',
    borderRadius: 22,
    borderWidth: 1,
    gap: 4,
    padding: 16,
  },
  priceCardLabel: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  priceCardValue: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
  priceCardCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  inlineError: {
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  inlineErrorText: {
    color: '#991b1b',
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  requestButton: {
    borderRadius: 22,
    minHeight: 58,
  },
  footerNote: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
});
