import { useEffect, useMemo, useState } from 'react';
import { Image, ImageBackground, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

const FALLBACK_RATIOS = [0.78, 1.18, 0.92, 1.28];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function resolveEstimatedHeight(columnWidth, ratio, index) {
  const safeRatio = Number(ratio || FALLBACK_RATIOS[index % FALLBACK_RATIOS.length] || 1);
  return clamp(columnWidth / safeRatio, 180, 320);
}

function buildColumns(cards, imageRatios, columnWidth) {
  const columns = [[], []];
  const heights = [0, 0];

  cards.forEach((card, index) => {
    const ratio = imageRatios[card.id] || FALLBACK_RATIOS[index % FALLBACK_RATIOS.length];
    const tileHeight = resolveEstimatedHeight(columnWidth, ratio, index);
    const nextColumnIndex = heights[0] <= heights[1] ? 0 : 1;
    columns[nextColumnIndex].push({
      ...card,
      __ratio: ratio,
      __tileHeight: tileHeight,
    });
    heights[nextColumnIndex] += tileHeight + 12;
  });

  return columns;
}

export function ServiceShowcaseCarousel({
  cards = [],
  onSelect,
}) {
  const { width } = useWindowDimensions();
  const [imageRatios, setImageRatios] = useState({});
  const [activeImageIndices, setActiveImageIndices] = useState({});
  const horizontalPadding = 16;
  const gutter = 12;
  const columnWidth = Math.max(140, (width - (horizontalPadding * 2) - gutter) / 2);

  useEffect(() => {
    let active = true;

    cards.forEach((card, index) => {
      const nextUri = (Array.isArray(card.imageUris) && card.imageUris.length ? card.imageUris[0] : card.imageUri) || '';
      if (!nextUri || imageRatios[card.id]) return;
      Image.getSize(
        nextUri,
        (imageWidth, imageHeight) => {
          if (!active || !imageWidth || !imageHeight) return;
          setImageRatios((current) => (
            current[card.id]
              ? current
              : { ...current, [card.id]: imageWidth / imageHeight }
          ));
        },
        () => {
          if (!active) return;
          setImageRatios((current) => (
            current[card.id]
              ? current
              : { ...current, [card.id]: FALLBACK_RATIOS[index % FALLBACK_RATIOS.length] }
          ));
        },
      );
    });

    return () => {
      active = false;
    };
  }, [cards, imageRatios]);

  useEffect(() => {
    if (!cards.length) return () => {};

    const timer = setInterval(() => {
      setActiveImageIndices((current) => {
        const next = { ...current };
        cards.forEach((card) => {
          const imageCount = Array.isArray(card.imageUris) && card.imageUris.length
            ? card.imageUris.length
            : card.imageUri ? 1 : 0;
          if (imageCount > 1) {
            next[card.id] = ((current[card.id] || 0) + 1) % imageCount;
          } else if (imageCount === 1) {
            next[card.id] = 0;
          }
        });
        return next;
      });
    }, 5000);

    return () => clearInterval(timer);
  }, [cards]);

  const columns = useMemo(
    () => buildColumns(cards, imageRatios, columnWidth),
    [cards, columnWidth, imageRatios],
  );

  if (!cards.length) {
    return (
      <View style={styles.emptyState}>
        <Ionicons color={colors.brand} name="images-outline" size={26} />
        <Text style={styles.emptyTitle}>No services to show yet</Text>
        <Text style={styles.emptyCopy}>Available helper services will appear here as soon as they are ready.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.grid, { paddingHorizontal: horizontalPadding }]}>
      {columns.map((column, columnIndex) => (
        <View key={`column-${columnIndex}`} style={[styles.column, { width: columnWidth }]}>
          {column.map((item) => (
            <Pressable
              accessibilityRole="button"
              key={item.id}
              onPress={() => onSelect?.(item)}
              style={({ pressed }) => [
                styles.tile,
                pressed && styles.tilePressed,
              ]}
            >
              {((Array.isArray(item.imageUris) && item.imageUris.length) || item.imageUri) ? (
                <ImageBackground
                  imageStyle={styles.tileImage}
                  source={{ uri: (Array.isArray(item.imageUris) && item.imageUris.length)
                    ? item.imageUris[(activeImageIndices[item.id] || 0) % item.imageUris.length]
                    : item.imageUri }}
                  style={[styles.tileMedia, { height: item.__tileHeight }]}
                >
                  <View style={styles.tileTint} />
                  <View style={styles.tileTopRow}>
                    <View style={styles.kindPill}>
                      <Text style={styles.kindPillText}>{item.kind === 'package' ? 'Package' : 'Service'}</Text>
                    </View>
                    <View style={styles.pricePill}>
                      <Text style={styles.pricePillText}>{item.priceLabel}</Text>
                    </View>
                  </View>

                  <View style={styles.tileBottomChip}>
                    <Text numberOfLines={1} style={styles.tileTitle}>{item.title}</Text>
                  </View>
                </ImageBackground>
              ) : (
                <View style={[styles.tileMedia, styles.fallbackTile, { height: item.__tileHeight }]}>
                  <View style={styles.fallbackBubbleOne} />
                  <View style={styles.fallbackBubbleTwo} />
                  <View style={styles.tileTopRow}>
                    <View style={styles.kindPill}>
                      <Text style={styles.kindPillText}>{item.kind === 'package' ? 'Package' : 'Service'}</Text>
                    </View>
                    <View style={styles.pricePill}>
                      <Text style={styles.pricePillText}>{item.priceLabel}</Text>
                    </View>
                  </View>

                  <View style={styles.tileBottomChip}>
                    <Text numberOfLines={2} style={styles.tileTitle}>{item.title}</Text>
                  </View>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    gap: 12,
  },
  column: {
    gap: 12,
  },
  tile: {
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 6,
  },
  tilePressed: {
    transform: [{ scale: 0.992 }],
  },
  tileMedia: {
    backgroundColor: '#f3d4ef',
    justifyContent: 'space-between',
    padding: 12,
  },
  tileImage: {
    borderRadius: 26,
  },
  tileTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.10)',
  },
  tileTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  kindPill: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: 'rgba(217,70,239,0.40)',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  kindPillText: {
    color: colors.brandDark,
    fontSize: 11,
    fontWeight: '800',
  },
  pricePill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: 'rgba(217,70,239,0.40)',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pricePillText: {
    color: colors.brandDark,
    fontSize: 11,
    fontWeight: '900',
  },
  tileBottomChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(217,70,239,0.20)',
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '92%',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tileTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  fallbackTile: {
    overflow: 'hidden',
  },
  fallbackBubbleOne: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 999,
    height: 140,
    position: 'absolute',
    right: -30,
    top: -24,
    width: 140,
  },
  fallbackBubbleTwo: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    bottom: 48,
    height: 110,
    left: -20,
    position: 'absolute',
    width: 110,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: 'rgba(217,70,239,0.12)',
    borderRadius: 26,
    borderWidth: 1,
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  emptyCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
