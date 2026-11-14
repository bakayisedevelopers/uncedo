import { useEffect, useMemo, useState } from 'react';
import {
  Image,
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
import { getCurrentCustomerLocation, requestCustomerLocationPermission } from '../../services/nearbyHelpersMapService';
import { updateLiveTracking } from '../../services/liveTrackingRealtimeService';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/States';
import {
  buildMissingRequiredFields,
  getQuestionDefinitionById,
  getQuestionIdsForSelection,
  getRequiredQuestionDefinitions,
} from '../../constants/customerIntakeQuestions';
import { getCustomerServiceById } from '../../constants/serviceCatalog';
import { useAuth } from '../../context/AuthContext';
import {
  createCustomerServiceRequest,
  fetchServicePricingQuote,
  finalizeCustomerServiceRequest,
} from '../../services/customerServiceRequestService';
import { updateUserProfile } from '../../services/userService';
import { StickyScreenHeader } from '../../components/ui/StickyScreenHeader';
import { colors } from '../../theme/colors';

function formatCurrency(value) {
  const amount = Math.round(Number(value || 0));
  if (!Number.isFinite(amount)) return 'R0';
  return `R${amount}`;
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
            const optionValue = typeof option === 'string' ? option : String(option?.value || option?.id || '').trim();
            const optionLabel = typeof option === 'string'
              ? option.replace(/_/g, ' ')
              : String(option?.label || optionValue).trim();
            const isActive = finalValue === optionValue;
            return (
              <Pressable
                accessibilityRole="button"
                key={optionValue}
                onPress={() => onChange(optionValue)}
                style={({ pressed }) => [
                  styles.optionChip,
                  isActive && styles.optionChipActive,
                  pressed && styles.optionChipPressed,
                ]}
              >
                <Text style={[styles.optionChipText, isActive && styles.optionChipTextActive]}>
                  {optionLabel}
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
  const { setHomeLocation, setUser, user } = useAuth();
  const item = route?.params?.item || null;
  const parentTab = route?.params?.parentTab || 'CustomerHome';
  const topInset = Platform.OS === 'ios' ? 54 : Math.max(24, Number(systemInsets?.top || 0) + 18);
  const [structuredAnswers, setStructuredAnswers] = useState(() => normalizeAnswerMap(route?.params?.initialStructuredAnswers) || {});
  const [selectedOptionId, setSelectedOptionId] = useState(() => String(route?.params?.selectedOptionId || item?.selectedOptionId || '').trim());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pricePreview, setPricePreview] = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);

  const categoryId = String(item?.categoryId || '').trim();
  const serviceIds = useMemo(() => (Array.isArray(item?.serviceIds) ? item.serviceIds : []), [item?.serviceIds]);
  const selectedPackageId = ['package', 'bundle'].includes(String(item?.type || '').trim().toLowerCase())
    ? String(item?.packageId || item?.entityId || '').trim()
    : '';
  const primaryServiceId = selectedPackageId || serviceIds[0] || item?.entityId || '';
  const liveService = primaryServiceId ? getCustomerServiceById(primaryServiceId) : null;

  const serviceOptions = useMemo(() => {
    const itemOptions = Array.isArray(item?.options) ? item.options : [];
    const catalogOptions = Array.isArray(liveService?.options) ? liveService.options : [];
    const baseOptions = catalogOptions.length ? catalogOptions : itemOptions;
    if (!baseOptions.length) return [];

    const itemCountMap = new Map(
      itemOptions.map((opt) => [String(opt?.id || '').trim().toLowerCase(), opt?.onlineHelperCount]),
    );
    return baseOptions.map((opt) => {
      const normalizedId = String(opt?.id || '').trim().toLowerCase();
      const onlineCount = itemCountMap.has(normalizedId) ? itemCountMap.get(normalizedId) : opt?.onlineHelperCount;
      return {
        ...opt,
        onlineHelperCount: typeof onlineCount === 'number' ? onlineCount : undefined,
      };
    });
  }, [item?.options, liveService?.options]);

  const selectedOption = useMemo(
    () => serviceOptions.find((opt) => String(opt?.id || '').trim().toLowerCase() === String(selectedOptionId || '').trim().toLowerCase()) || null,
    [selectedOptionId, serviceOptions],
  );

  useEffect(() => {
    if (!serviceOptions.length) {
      if (selectedOptionId) setSelectedOptionId('');
      return;
    }
    if (selectedOption) return;
    const availableOptions = serviceOptions.filter((opt) => opt.onlineHelperCount === undefined || opt.onlineHelperCount > 0);
    if (availableOptions.length === 1) {
      setSelectedOptionId(availableOptions[0].id);
    } else if (serviceOptions.length === 1) {
      setSelectedOptionId(serviceOptions[0].id);
    }
  }, [selectedOption, selectedOptionId, serviceOptions]);

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
    return getRequiredQuestionDefinitions({
      categoryId,
      serviceIds,
      selectedPackageId,
      selectedOptionId,
      structuredAnswers,
    });
  }, [categoryId, selectedOptionId, selectedPackageId, serviceIds, structuredAnswers]);

  const renderQuestions = useMemo(() => {
    if (!requiredQuestions.length) return [];
    const questions = [...requiredQuestions];
    if (String(structuredAnswers?.timing_preference || '').trim().toLowerCase() === 'later') {
      const scheduledQuestion = getQuestionDefinitionById({
        categoryId,
        serviceIds,
        selectedPackageId,
        selectedOptionId,
        structuredAnswers,
        questionId: 'scheduled_for_text',
      });
      if (scheduledQuestion && !questions.some((q) => q.id === scheduledQuestion.id)) {
        questions.push(scheduledQuestion);
      }
    }
    return questions;
  }, [categoryId, requiredQuestions, selectedOptionId, selectedPackageId, serviceIds, structuredAnswers]);

  const missingRequired = useMemo(
    () => buildMissingRequiredFields({
      categoryId,
      serviceIds,
      selectedPackageId,
      selectedOptionId,
      structuredAnswers,
    }),
    [categoryId, selectedOptionId, selectedPackageId, serviceIds, structuredAnswers],
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
          selectedPackageId,
          selectedOptionId,
          structuredAnswers,
        });
        if (!cancelled) {
          setPricePreview(quote);
          setError('');
          setPriceLoading(false);
        }
      } catch (nextError) {
        if (!cancelled) {
          setPricePreview(null);
          setError(nextError.message || 'Unable to calculate the live service price right now.');
          setPriceLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [categoryId, missingRequired.length, selectedOptionId, selectedPackageId, serviceIds, structuredAnswers]);

  const handleSelectOption = (option) => {
    if (!option?.id) return;
    if (option.onlineHelperCount === 0) return;

    const nextOptionId = String(option.id || '').trim();
    const allowedQuestionIds = new Set(
      getQuestionIdsForSelection({
        categoryId,
        serviceIds,
        selectedPackageId,
        selectedOptionId: nextOptionId,
      }),
    );

    setSelectedOptionId(nextOptionId);
    setError('');
    setStructuredAnswers((current) => Object.entries(current || {}).reduce((acc, [key, val]) => {
      if (allowedQuestionIds.has(key) || key === 'scheduled_for_text') {
        acc[key] = val;
      }
      return acc;
    }, {}));
  };

  const handleAnswerChange = (questionId, nextValue) => {
    setStructuredAnswers((current) => ({
      ...current,
      [questionId]: nextValue,
    }));
  };

  const handleRequest = async () => {
    if (!item || !categoryId || !serviceIds.length || submitting) return;
    if (serviceOptions.length > 0 && !selectedOption) {
      setError('Choose a service option before continuing.');
      return;
    }
    if (missingRequired.length) {
      setError('Complete the required details before continuing.');
      return;
    }
    if (!pricePreview) {
      setError('Wait for the price to finish loading before continuing.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const serviceAddressTarget = String(structuredAnswers?.service_address_target || '').trim().toLowerCase();
      let requestLocation = null;

      if (serviceAddressTarget === 'current_location') {
        const permissionGranted = await requestCustomerLocationPermission().catch(() => false);
        if (!permissionGranted) {
          throw new Error('Location access is required to use your current location. Please allow it or choose your saved address.');
        }

        requestLocation = await getCurrentCustomerLocation().catch(() => null);
        if (!requestLocation) {
          throw new Error('Unable to read your current location. Please try again.');
        }

        setHomeLocation(requestLocation);
      }

      const requestId = await createCustomerServiceRequest({
        user,
        location: requestLocation,
        initialDraft: {
          categoryId,
          serviceIds,
          selectedPackageId,
          selectedOptionId: selectedOption?.id || selectedOptionId,
          selectedOptionTitle: selectedOption?.title || '',
          structuredAnswers,
          serviceAddress: String(user?.customerProfile?.serviceAddress || '').trim(),
          serviceAddressTarget,
        },
      });

      await finalizeCustomerServiceRequest({
        requestId,
        callId: '',
        categoryId,
        serviceIds,
        selectedPackageId,
        selectedOptionId: selectedOption?.id || selectedOptionId,
        approvedQuote: pricePreview,
        structuredAnswers,
      });

      if (requestLocation) {
        await updateLiveTracking(requestId, {
          requestId,
          customerLocation: requestLocation,
          updatedAtMs: Date.now(),
        }).catch((trackingError) => {
          console.warn('[uncedo:request-location]', trackingError?.message || trackingError);
        });
      }

      navigate({
        key: 'ServiceRequestTracking',
        params: {
          requestId,
          parentTab,
        },
      });
    } catch (nextError) {
      if (nextError?.quote) setPricePreview(nextError.quote);
      setError(nextError.message || 'Unable to continue with this service.');
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
  };

  if (!item) {
    return <ErrorState message="Service details are missing." title="Unable to open service" />;
  }

  const heroImageUri = selectedOption?.imageUrl || item.imageUri;
  const heroPriceText = pricePreview
    ? formatCurrency(pricePreview.total)
    : selectedOption
      ? formatCurrency(selectedOption.price)
      : item.priceLabel;
  const heroMetaSubtitle = selectedOption
    ? `${item.categoryLabel} · ${selectedOption.title}`
    : item.categoryLabel;

  const shouldWaitForPrice = !missingRequired.length;
  const buttonLabel = submitting
    ? 'Preparing request...'
    : serviceOptions.length > 0 && !selectedOption
      ? 'Select an option'
      : shouldWaitForPrice && priceLoading
        ? 'Calculating price...'
        : shouldWaitForPrice && pricePreview
          ? `Request now - ${formatCurrency(pricePreview.total)}`
          : 'Complete required details';

  const buttonDisabled = submitting || missingRequired.length > 0 || priceLoading || !pricePreview;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topInset, paddingBottom: 36 }]}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
      >
        <StickyScreenHeader
          backLabel="Back"
          onBack={() => goBack(parentTab)}
          style={styles.stickyHeader}
          subtitle={item.categoryLabel || 'Select a service'}
          title={item.title}
        />

        <View style={styles.heroCard}>
          {heroImageUri ? (
            <ImageBackground imageStyle={styles.heroImage} source={{ uri: heroImageUri }} style={styles.heroMedia}>
              <View style={styles.heroTint} />
              <View style={styles.heroOverlay}>
                <View style={styles.heroPill}>
                  <Text style={styles.heroPillText}>{item.type === 'bundle' || item.type === 'package' ? 'Bundle' : 'Service'}</Text>
                </View>
                <View style={styles.heroFooter}>
                  <Text style={styles.heroTitle}>{selectedOption ? selectedOption.title : item.title}</Text>
                  <View style={styles.heroMetaRow}>
                    <Text style={styles.heroMeta}>{heroMetaSubtitle}</Text>
                    <Text style={styles.heroPrice}>{heroPriceText}</Text>
                  </View>
                </View>
              </View>
            </ImageBackground>
          ) : (
            <View style={[styles.heroMedia, styles.heroFallback]}>
              <Ionicons color={colors.brand} name="sparkles-outline" size={28} />
              <Text style={styles.heroFallbackTitle}>{selectedOption ? selectedOption.title : item.title}</Text>
              <Text style={styles.heroFallbackPrice}>{heroPriceText}</Text>
            </View>
          )}

          <View style={styles.heroBody}>
            <Text style={styles.description}>{selectedOption?.description || item.description}</Text>
            <View style={styles.quickMeta}>
              <View style={styles.quickMetaPill}>
                <Ionicons color={colors.brand} name="people-outline" size={14} />
                <Text style={styles.quickMetaText}>
                  {selectedOption && typeof selectedOption.onlineHelperCount === 'number'
                    ? `${selectedOption.onlineHelperCount} helper${selectedOption.onlineHelperCount === 1 ? '' : 's'} online`
                    : `${item.helperCount} helpers`}
                </Text>
              </View>
              <View style={styles.quickMetaPill}>
                <Ionicons color={colors.brand} name="pricetag-outline" size={14} />
                <Text style={styles.quickMetaText}>{heroPriceText}</Text>
              </View>
            </View>
          </View>
        </View>

        {serviceOptions.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Choose an option</Text>
            <Text style={styles.sectionCopy}>
              Pick one option for this request. Its price sets your starting service rate and tailors the questions below.
            </Text>
            <View style={styles.serviceOptionsList}>
              {serviceOptions.map((option) => {
                const isSelected = selectedOption?.id === option.id;
                const noHelperOnline = option.onlineHelperCount === 0;
                return (
                  <Pressable
                    accessibilityRole="button"
                    disabled={noHelperOnline}
                    key={option.id}
                    onPress={() => handleSelectOption(option)}
                    style={({ pressed }) => [
                      styles.serviceOptionCard,
                      isSelected && styles.serviceOptionCardActive,
                      noHelperOnline && styles.serviceOptionCardDisabled,
                      pressed && !noHelperOnline && styles.optionChipPressed,
                    ]}
                  >
                    {option.imageUrl ? (
                      <Image source={{ uri: option.imageUrl }} style={styles.serviceOptionThumb} />
                    ) : (
                      <View style={[styles.serviceOptionThumb, styles.serviceOptionThumbFallback]}>
                        <Ionicons color={isSelected ? colors.brandDark : colors.brand} name="sparkles-outline" size={18} />
                      </View>
                    )}
                    <View style={styles.serviceOptionInfo}>
                      <View style={styles.serviceOptionHeaderRow}>
                        <Text numberOfLines={2} style={[styles.serviceOptionTitle, isSelected && styles.serviceOptionTitleActive]}>
                          {option.title}
                        </Text>
                        <Text style={[styles.serviceOptionPrice, isSelected && styles.serviceOptionPriceActive]}>
                          {formatCurrency(option.price)}
                        </Text>
                      </View>
                      {option.description ? (
                        <Text numberOfLines={2} style={styles.serviceOptionDescription}>{option.description}</Text>
                      ) : null}
                      {noHelperOnline ? (
                        <Text style={styles.serviceOptionUnavailable}>No helpers online for this option right now</Text>
                      ) : typeof option.onlineHelperCount === 'number' ? (
                        <Text style={styles.serviceOptionAvailability}>
                          {option.onlineHelperCount} {option.onlineHelperCount === 1 ? 'helper' : 'helpers'} online
                        </Text>
                      ) : null}
                    </View>
                    <View style={[styles.serviceOptionRadio, isSelected && styles.serviceOptionRadioActive]}>
                      {isSelected ? <View style={styles.serviceOptionRadioDot} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

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

        {serviceOptions.length === 0 || selectedOption ? (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Quick details</Text>
              <Text style={styles.sectionCopy}>
                Complete the essentials here. Once the price is ready, Uncedo will submit the request directly and start helper matching.
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
          </>
        ) : null}

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
  stickyHeader: {
    backgroundColor: '#fff7fd',
    borderBottomColor: 'rgba(217,70,239,0.10)',
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
  serviceOptionsList: {
    gap: 10,
    marginTop: 6,
  },
  serviceOptionCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: 'rgba(217,70,239,0.16)',
    borderRadius: 20,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  serviceOptionCardActive: {
    backgroundColor: 'rgba(217,70,239,0.06)',
    borderColor: colors.brandDark,
  },
  serviceOptionCardDisabled: {
    opacity: 0.55,
  },
  serviceOptionThumb: {
    borderRadius: 14,
    height: 54,
    width: 54,
  },
  serviceOptionThumbFallback: {
    alignItems: 'center',
    backgroundColor: 'rgba(217,70,239,0.08)',
    justifyContent: 'center',
  },
  serviceOptionInfo: {
    flex: 1,
    gap: 3,
  },
  serviceOptionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  serviceOptionTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  serviceOptionTitleActive: {
    color: colors.brandDark,
  },
  serviceOptionPrice: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  serviceOptionPriceActive: {
    color: colors.brandDark,
  },
  serviceOptionDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  serviceOptionAvailability: {
    color: colors.brandDark,
    fontSize: 11,
    fontWeight: '700',
  },
  serviceOptionUnavailable: {
    color: '#b91c1c',
    fontSize: 11,
    fontWeight: '700',
  },
  serviceOptionRadio: {
    alignItems: 'center',
    borderColor: 'rgba(217,70,239,0.35)',
    borderRadius: 999,
    borderWidth: 2,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  serviceOptionRadioActive: {
    borderColor: colors.brandDark,
  },
  serviceOptionRadioDot: {
    backgroundColor: colors.brandDark,
    borderRadius: 999,
    height: 11,
    width: 11,
  },
});
