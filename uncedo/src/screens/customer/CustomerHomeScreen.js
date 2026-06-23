import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CustomerCallToActionSheet } from '../../components/customer/CustomerCallToActionSheet';
import { ServiceSearchOverlay } from '../../components/customer/ServiceSearchOverlay';
import { ServiceShowcaseCarousel } from '../../components/customer/ServiceShowcaseCarousel';
import { useAuth } from '../../context/AuthContext';
import { subscribeToCustomerServiceShowcase } from '../../services/customerServiceDiscoveryService';
import {
  rankCustomerServiceItems,
  recordCustomerServiceEvent,
  subscribeToCustomerRecommendationProfile,
} from '../../services/customerRecommendationService';
import { getCustomerOnboardingStatus } from '../../utils/onboarding';

function scoreSearchMatch(item, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return 0;

  const fields = [
    item.title,
    item.categoryLabel,
    ...(Array.isArray(item.includedLabels) ? item.includedLabels : []),
    item.description,
  ]
    .map((value) => String(value || '').toLowerCase())
    .filter(Boolean);

  const exactStart = fields.some((value) => value.startsWith(normalizedQuery));
  if (exactStart) return 3;
  const wordHit = fields.some((value) => value.split(/\s+/).some((part) => part.startsWith(normalizedQuery)));
  if (wordHit) return 2;
  const partialHit = fields.some((value) => value.includes(normalizedQuery));
  return partialHit ? 1 : 0;
}

export function CustomerHomeScreen({
  navigate,
  bottomInset = 0,
  bottomNavVisible = true,
  onBottomNavVisibilityChange,
  activeRequest,
  systemInsets = {},
}) {
  const { user } = useAuth();
  const onboardingStatus = getCustomerOnboardingStatus(user);
  const [cards, setCards] = useState([]);
  const [recommendationProfile, setRecommendationProfile] = useState(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const lastImpressionKeyRef = useRef('');

  const preferredCategoryIds = useMemo(() => (
    Array.isArray(user?.customerProfile?.preferredServiceCategories)
      ? user.customerProfile.preferredServiceCategories.filter(Boolean)
      : []
  ), [user?.customerProfile?.preferredServiceCategories]);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const topInset = Platform.OS === 'ios'
    ? 54
    : Math.max(20, Number(systemInsets?.top || 0) + 12);

  useEffect(() => {
    if (!user?.uid) {
      setCards([]);
      return () => {};
    }

    return subscribeToCustomerServiceShowcase({
      preferredCategoryIds,
      callback: setCards,
      onError: () => setCards([]),
    });
  }, [preferredCategoryIds, user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setRecommendationProfile(null);
      return () => {};
    }

    return subscribeToCustomerRecommendationProfile(
      user.uid,
      (profile) => {
        setRecommendationProfile(profile);
      },
      () => {
        setRecommendationProfile(null);
      },
    );
  }, [user?.uid]);

  const rankedCards = useMemo(() => (
    rankCustomerServiceItems(cards, {
      customerId: user?.uid || '',
      recommendationProfile: recommendationProfile || {},
      preferredCategoryIds,
    })
  ), [cards, preferredCategoryIds, recommendationProfile, user?.uid]);

  useEffect(() => {
    if (typeof onBottomNavVisibilityChange === 'function' && !bottomNavVisible) {
      onBottomNavVisibilityChange(true);
    }
  }, [bottomNavVisible, onBottomNavVisibilityChange]);

  useEffect(() => {
    if (!user?.uid || !rankedCards.length) return;

    const visibleIds = rankedCards
      .slice(0, 6)
      .map((item) => `${item.id}:${item.rankScore || 0}`)
      .join('|');

    if (lastImpressionKeyRef.current === visibleIds) {
      return;
    }

    lastImpressionKeyRef.current = visibleIds;

    rankedCards.slice(0, 6).forEach((item, index) => {
      recordCustomerServiceEvent({
        customerId: user.uid,
        eventType: 'feed_impression',
        serviceId: item.entityId || item.id,
        categoryId: item.categoryId,
        serviceIds: item.serviceIds || [item.entityId || item.id],
        source: 'customer_home',
        metadata: {
          position: index + 1,
          totalShown: Math.min(6, rankedCards.length),
          rankScore: item.rankScore || 0,
        },
      }).catch(() => {});
    });
  }, [rankedCards, user?.uid]);

  const isTrackingActive = !!activeRequest && activeRequest.status !== 'collecting_details';
  const canUseServices = onboardingStatus.complete;
  const filteredResults = useMemo(() => {
    const ranked = rankedCards
      .map((item) => ({ item, score: scoreSearchMatch(item, deferredSearchQuery) }))
      .filter(({ score }) => !deferredSearchQuery.trim() || score > 0)
      .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title));
    return ranked.map(({ item }) => item);
  }, [deferredSearchQuery, rankedCards]);

  const openSelection = (item, source = 'home_feed') => {
    if (user?.uid) {
      recordCustomerServiceEvent({
        customerId: user.uid,
        eventType: source === 'search' ? 'search_select' : 'service_open',
        serviceId: item.entityId || item.id,
        categoryId: item.categoryId,
        serviceIds: item.serviceIds || [item.entityId || item.id],
        source,
        metadata: {
          rankScore: item.rankScore || 0,
          searchQuery: source === 'search' ? deferredSearchQuery : '',
        },
      }).catch(() => {});
    }

    if (!canUseServices) {
      navigate('Onboarding');
      return;
    }

    navigate({
      key: 'CustomerServiceSelection',
      params: {
        item,
        parentTab: 'CustomerHome',
      },
    });
  };

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.backdropLayer}>
        <View style={styles.backdropGlowOne} />
        <View style={styles.backdropGlowTwo} />
      </View>

      <View style={[styles.searchShell, { top: topInset }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (user?.uid) {
        recordCustomerServiceEvent({
          customerId: user.uid,
          eventType: 'search_open',
          serviceId: rankedCards[0]?.entityId || rankedCards[0]?.id || '',
          categoryId: rankedCards[0]?.categoryId || '',
          source: 'customer_home',
          metadata: {
            topServiceId: rankedCards[0]?.entityId || rankedCards[0]?.id || '',
            topCategoryId: rankedCards[0]?.categoryId || '',
          },
        }).catch(() => {});
      }
            setSearchVisible(true);
          }}
          style={styles.searchBar}
        >
          <Ionicons color="#d946ef" name="search-outline" size={18} />
          <Text style={styles.searchPlaceholder}>Search for a service or package</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: bottomInset + 172,
          paddingTop: topInset + 70,
        }}
        showsVerticalScrollIndicator={false}
      >
        <ServiceShowcaseCarousel cards={rankedCards} onSelect={openSelection} />
      </ScrollView>

      <View style={[styles.bottomSheetWrap, { bottom: bottomInset + 12 }]}>
        <CustomerCallToActionSheet
          disabled={!onboardingStatus.complete}
          hasActiveRequest={isTrackingActive}
          label={isTrackingActive ? 'Track Active Request' : 'Describe what you want'}
          onPress={() => {
            if (activeRequest) {
              if (activeRequest.status === 'collecting_details') {
                navigate({
                  key: 'CustomerServiceCall',
                  params: { requestId: activeRequest.id, parentTab: 'CustomerHome' },
                });
              } else {
                navigate({
                  key: 'ServiceRequestTracking',
                  params: { requestId: activeRequest.id, parentTab: 'CustomerHome' },
                });
              }
              return;
            }

            navigate({
              key: 'CustomerServiceCall',
              params: { parentTab: 'CustomerHome' },
            });
          }}
        />
      </View>

      <ServiceSearchOverlay
        onChangeText={setSearchQuery}
        onClose={() => {
          setSearchVisible(false);
          setSearchQuery('');
        }}
        onSelect={(item) => {
          setSearchVisible(false);
          setSearchQuery('');
          openSelection(item, 'search');
        }}
        results={filteredResults}
        value={searchQuery}
        visible={searchVisible}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#fff7fd',
    flex: 1,
  },
  backdropLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  backdropGlowOne: {
    backgroundColor: 'rgba(217,70,239,0.16)',
    borderRadius: 999,
    height: 280,
    position: 'absolute',
    right: -90,
    top: -40,
    width: 280,
  },
  backdropGlowTwo: {
    backgroundColor: 'rgba(236,72,153,0.12)',
    borderRadius: 999,
    bottom: 110,
    height: 220,
    left: -70,
    position: 'absolute',
    width: 220,
  },
  searchShell: {
    left: 16,
    position: 'absolute',
    right: 16,
    zIndex: 18,
  },
  searchBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(217,70,239,0.12)',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 16,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 10,
  },
  searchPlaceholder: {
    color: '#a21caf',
    fontSize: 15,
    fontWeight: '700',
  },
  bottomSheetWrap: {
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 18,
  },
});
