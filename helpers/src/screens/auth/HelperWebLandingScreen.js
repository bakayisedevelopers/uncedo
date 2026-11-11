import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ProviderLoginScreen } from './ProviderLoginScreen';
import { WhatsAppAccountLinkScreen } from './WhatsAppAccountLinkScreen';

const palette = {
  background: '#101713',
  backgroundSoft: '#17211b',
  surface: '#202d24',
  line: '#34443a',
  text: '#f4f7f1',
  muted: '#b0bdb2',
  lime: '#c8f169',
  limeDark: '#18210f',
  orange: '#ff9b62',
};

function getPageFromPath() {
  if (typeof window === 'undefined') return 'home';
  if (window.location.pathname === '/sign-in') return 'login';
  if (window.location.pathname === '/sign-up') return 'signup';
  if (window.location.pathname === '/sign-agreement') return 'agreement';
  if (window.location.pathname === '/service-photos') return 'service-photos';
  if (window.location.pathname === '/whatsapp-link') return 'whatsapp-link';
  return 'home';
}

export function HelperWebEntryScreen() {
  const [page, setPage] = useState(getPageFromPath);

  useEffect(() => {
    const syncPage = () => setPage(getPageFromPath());
    window.addEventListener('popstate', syncPage);
    return () => window.removeEventListener('popstate', syncPage);
  }, []);

  const navigate = (path) => {
    if (Platform.OS === 'web' && window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setPage(getPageFromPath());
  };

  if (page === 'whatsapp-link') return <WhatsAppAccountLinkScreen />;

  if (page === 'login' || page === 'signup' || page === 'agreement' || page === 'service-photos') {
    return (
      <ProviderLoginScreen
        initialMode={page === 'signup' ? 'signup' : 'login'}
        disableSignupMode={page === 'agreement' || page === 'service-photos'}
        emailOnly={page === 'agreement' || page === 'service-photos'}
        onHome={page === 'agreement' || page === 'service-photos' ? undefined : () => navigate('/')}
        onRouteChange={navigate}
      />
    );
  }

  return (
    <HelperWebLandingScreen
      onSignIn={() => navigate('/sign-in')}
      onSignUp={() => navigate('/sign-up')}
    />
  );
}

function HelperWebLandingScreen({ onSignIn, onSignUp }) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const medium = width >= 620;

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.shell}>
          <View style={styles.navbar}>
            <View style={styles.brandLockup}>
              <View style={styles.brandMark}>
                <Ionicons color={palette.limeDark} name="flash" size={21} />
              </View>
              <View>
                <Text style={styles.brandName}>UNCEDO</Text>
                <Text style={styles.brandCaption}>HELPERS</Text>
              </View>
            </View>
            {wide ? (
              <View style={styles.navLinks}>
                <Pressable onPress={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>
                  <Text style={styles.navLink}>How it works</Text>
                </Pressable>
                <Pressable onPress={() => document.getElementById('why-uncedo')?.scrollIntoView({ behavior: 'smooth' })}>
                  <Text style={styles.navLink}>Why Uncedo</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.navActions}>
              <Pressable accessibilityRole="button" onPress={onSignIn} style={styles.navSignIn}>
                <Text style={styles.navSignInText}>Sign in</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={onSignUp} style={styles.navJoin}>
                <Text style={styles.navJoinText}>Join Uncedo</Text>
                <Ionicons color={palette.limeDark} name="arrow-forward" size={16} />
              </Pressable>
            </View>
          </View>

          <View style={[styles.hero, wide && styles.heroWide]}>
            <View style={[styles.heroCopy, wide && styles.heroCopyWide]}>
              <View style={styles.eyebrow}>
                <View style={styles.eyebrowDot} />
                <Text style={styles.eyebrowText}>A better way to build your service work</Text>
              </View>
              <Text style={[styles.heroTitle, medium && styles.heroTitleLarge]}>
                Your skills.{ '\n' }
                <Text style={styles.heroTitleAccent}>Your next opportunity.</Text>
              </Text>
              <Text style={styles.heroBody}>
                Set up your helper profile, choose the services you offer and manage requests, availability and completed work in one place.
              </Text>
              <View style={[styles.heroActions, !medium && styles.heroActionsStacked]}>
                <Pressable accessibilityRole="button" onPress={onSignUp} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Create a helper account</Text>
                  <Ionicons color={palette.limeDark} name="arrow-forward" size={18} />
                </Pressable>
                <Pressable accessibilityRole="button" onPress={onSignIn} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>I already have an account</Text>
                </Pressable>
              </View>
              <View style={styles.trustRow}>
                <Ionicons color={palette.lime} name="shield-checkmark" size={17} />
                <Text style={styles.trustText}>Helper profiles complete verification before accepting work.</Text>
              </View>
            </View>

            <View style={[styles.heroVisualWrap, wide && styles.heroVisualWrapWide]}>
              <View style={styles.heroGlow} />
              <View style={styles.workCard}>
                <View style={styles.workCardTop}>
                  <View>
                    <Text style={styles.cardEyebrow}>HELPER WORKSPACE</Text>
                    <Text style={styles.cardTitle}>Keep your work moving</Text>
                  </View>
                  <View style={styles.cardIcon}>
                    <Ionicons color={palette.lime} name="briefcase" size={21} />
                  </View>
                </View>
                <View style={styles.availabilityCard}>
                  <View style={styles.availabilityIcon}>
                    <Ionicons color={palette.lime} name="calendar-outline" size={18} />
                  </View>
                  <View style={styles.availabilityCopy}>
                    <Text style={styles.availabilityLabel}>YOUR PROFILE</Text>
                    <Text style={styles.availabilityValue}>Services & availability</Text>
                  </View>
                  <Ionicons color={palette.muted} name="chevron-forward" size={17} />
                </View>
                <View style={styles.offerCard}>
                  <View style={styles.offerHeader}>
                    <View style={styles.offerIcon}>
                      <Ionicons color={palette.background} name="notifications" size={17} />
                    </View>
                    <View style={styles.offerHeading}>
                      <Text style={styles.offerTitle}>New work offer</Text>
                      <Text style={styles.offerSub}>Review the offer in your app</Text>
                    </View>
                    <View style={styles.offerDot} />
                  </View>
                  <View style={styles.offerDivider} />
                  <View style={styles.offerMeta}>
                    <Ionicons color={palette.orange} name="location" size={16} />
                    <Text style={styles.offerMetaText}>Review and respond in the Helpers app</Text>
                  </View>
                </View>
                <View style={styles.cardFooter}>
                  <View style={styles.footerMetric}>
                    <Ionicons color={palette.lime} name="wallet-outline" size={17} />
                    <Text style={styles.footerMetricText}>Earnings overview</Text>
                  </View>
                  <Ionicons color={palette.muted} name="arrow-up-outline" size={19} />
                </View>
              </View>
              <View style={styles.floatingBadge}>
                <View style={styles.floatingBadgeIcon}>
                  <Ionicons color={palette.background} name="trending-up" size={18} />
                </View>
                <View>
                  <Text style={styles.floatingBadgeTitle}>Grow over time</Text>
                  <Text style={styles.floatingBadgeCopy}>Track work and rewards</Text>
                </View>
              </View>
            </View>
          </View>

          <View nativeID="why-uncedo" style={[styles.valueStrip, medium && styles.valueStripWide]}>
            <ValuePoint icon="construct-outline" title="Show your skills" copy="Build a service profile that reflects the work you do." />
            <ValuePoint icon="calendar-clear-outline" title="Manage your work" copy="Set availability and keep active jobs in view." />
            <ValuePoint icon="ribbon-outline" title="See your progress" copy="Review completed jobs, earnings and helper rewards." />
          </View>

          <View nativeID="how-it-works" style={styles.stepsSection}>
            <View style={styles.sectionIntro}>
              <Text style={styles.sectionKicker}>GET STARTED</Text>
              <Text style={styles.sectionTitle}>A clear path from profile to work.</Text>
            </View>
            <View style={[styles.stepsGrid, medium && styles.stepsGridWide]}>
              <StepCard number="01" icon="person-add-outline" title="Create your account" copy="Sign up and add the details needed for your helper profile." />
              <StepCard number="02" icon="checkmark-circle-outline" title="Complete verification" copy="Finish your profile and verification steps before accepting jobs." />
              <StepCard number="03" icon="briefcase-outline" title="Manage service work" copy="Choose offered services, review eligible requests and track your work." />
            </View>
          </View>

          <View style={[styles.bottomCallout, medium && styles.bottomCalloutWide]}>
            <View style={styles.bottomCalloutIcon}>
              <Ionicons color={palette.lime} name="sparkles-outline" size={22} />
            </View>
            <View style={styles.bottomCalloutCopy}>
              <Text style={styles.bottomCalloutTitle}>Ready to get started?</Text>
              <Text style={styles.bottomCalloutText}>Create your helper account and complete your profile to begin.</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={onSignUp} style={styles.bottomCalloutButton}>
              <Text style={styles.bottomCalloutButtonText}>Join Uncedo</Text>
              <Ionicons color={palette.limeDark} name="arrow-forward" size={16} />
            </Pressable>
          </View>

          <View style={styles.bottomBar}>
            <Text style={styles.bottomBrand}>UNCEDO <Text style={styles.bottomBrandMuted}>HELPERS</Text></Text>
            <Text style={styles.bottomNote}>A dedicated space for Uncedo service providers.</Text>
            <Pressable accessibilityRole="button" onPress={onSignIn}>
              <Text style={styles.bottomSignIn}>Helper sign in</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ValuePoint({ icon, title, copy }) {
  return (
    <View style={styles.valuePoint}>
      <View style={styles.valueIcon}><Ionicons color={palette.lime} name={icon} size={21} /></View>
      <View style={styles.valueCopy}>
        <Text style={styles.valueTitle}>{title}</Text>
        <Text style={styles.valueText}>{copy}</Text>
      </View>
    </View>
  );
}

function StepCard({ number, icon, title, copy }) {
  return (
    <View style={styles.stepCard}>
      <View style={styles.stepTop}>
        <View style={styles.stepIcon}><Ionicons color={palette.lime} name={icon} size={20} /></View>
        <Text style={styles.stepNumber}>{number}</Text>
      </View>
      <Text style={styles.stepTitle}>{title}</Text>
      <Text style={styles.stepCopy}>{copy}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.background },
  scrollContent: { flexGrow: 1 },
  shell: { width: '100%', maxWidth: 1200, alignSelf: 'center', paddingHorizontal: 24 },
  navbar: { minHeight: 92, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: palette.line, gap: 16 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: palette.lime, alignItems: 'center', justifyContent: 'center' },
  brandName: { color: palette.text, fontSize: 15, fontWeight: '900', letterSpacing: 1.4 },
  brandCaption: { color: palette.lime, fontSize: 9, fontWeight: '800', letterSpacing: 2.3, marginTop: 2 },
  navLinks: { flexDirection: 'row', gap: 32 },
  navLink: { color: palette.muted, fontSize: 13, fontWeight: '700' },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  navSignIn: { paddingVertical: 10, paddingHorizontal: 5 },
  navSignInText: { color: palette.text, fontSize: 13, fontWeight: '800' },
  navJoin: { minHeight: 42, borderRadius: 14, paddingHorizontal: 15, backgroundColor: palette.lime, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  navJoinText: { color: palette.limeDark, fontSize: 12, fontWeight: '900' },
  hero: { paddingTop: 62, paddingBottom: 64, gap: 56 },
  heroWide: { flexDirection: 'row', alignItems: 'center', minHeight: 590 },
  heroCopy: { flex: 1, maxWidth: 610 },
  heroCopyWide: { paddingVertical: 32 },
  eyebrow: { alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, borderColor: '#43533a', paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#1a2418' },
  eyebrowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.lime },
  eyebrowText: { color: '#d2e5b4', fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  heroTitle: { color: palette.text, fontSize: 43, fontWeight: '900', lineHeight: 49, letterSpacing: -1.5, marginTop: 24 },
  heroTitleLarge: { fontSize: 60, lineHeight: 66 },
  heroTitleAccent: { color: palette.lime },
  heroBody: { color: palette.muted, fontSize: 16, lineHeight: 26, maxWidth: 520, marginTop: 20 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 28 },
  heroActionsStacked: { flexDirection: 'column', alignItems: 'stretch' },
  primaryButton: { minHeight: 54, borderRadius: 16, backgroundColor: palette.lime, paddingHorizontal: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  primaryButtonText: { color: palette.limeDark, fontSize: 14, fontWeight: '900' },
  secondaryButton: { minHeight: 50, paddingHorizontal: 14, justifyContent: 'center' },
  secondaryButtonText: { color: palette.text, fontSize: 13, fontWeight: '800' },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 25 },
  trustText: { color: '#c1cdc3', fontSize: 12, lineHeight: 18, flexShrink: 1 },
  heroVisualWrap: { minHeight: 390, flex: 1, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  heroVisualWrapWide: { minHeight: 480, maxWidth: 500 },
  heroGlow: { width: 300, height: 300, borderRadius: 150, backgroundColor: '#42652b', opacity: 0.22, position: 'absolute' },
  workCard: { width: '100%', maxWidth: 420, borderRadius: 26, borderWidth: 1, borderColor: '#3b4a3e', backgroundColor: '#1a241e', padding: 22, shadowColor: '#000', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.28, shadowRadius: 34, elevation: 12 },
  workCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 21 },
  cardEyebrow: { color: palette.lime, fontSize: 9, fontWeight: '900', letterSpacing: 1.8 },
  cardTitle: { color: palette.text, fontSize: 17, fontWeight: '900', marginTop: 7 },
  cardIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#293725', alignItems: 'center', justifyContent: 'center' },
  availabilityCard: { minHeight: 66, flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, backgroundColor: '#253128', gap: 11 },
  availabilityIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#34452d', alignItems: 'center', justifyContent: 'center' },
  availabilityCopy: { flex: 1 },
  availabilityLabel: { color: '#9faf9d', fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  availabilityValue: { color: palette.text, fontSize: 12, fontWeight: '800', marginTop: 4 },
  offerCard: { borderWidth: 1, borderColor: '#435143', borderRadius: 17, backgroundColor: '#202d24', padding: 15, marginTop: 14 },
  offerHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  offerIcon: { width: 35, height: 35, borderRadius: 12, backgroundColor: palette.lime, alignItems: 'center', justifyContent: 'center' },
  offerHeading: { flex: 1 },
  offerTitle: { color: palette.text, fontSize: 12, fontWeight: '900' },
  offerSub: { color: palette.muted, fontSize: 10, marginTop: 4 },
  offerDot: { width: 8, height: 8, borderRadius: 5, backgroundColor: palette.orange },
  offerDivider: { height: 1, backgroundColor: palette.line, marginVertical: 13 },
  offerMeta: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  offerMetaText: { color: '#c0ccc1', fontSize: 9, fontWeight: '700', flexShrink: 1 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 17, paddingTop: 14, borderTopWidth: 1, borderTopColor: palette.line },
  footerMetric: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerMetricText: { color: palette.text, fontSize: 11, fontWeight: '800' },
  floatingBadge: { position: 'absolute', right: -6, bottom: 18, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f0f5e9', paddingVertical: 11, paddingHorizontal: 13, borderRadius: 17, shadowColor: '#000', shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.22, shadowRadius: 15, elevation: 8 },
  floatingBadgeIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: palette.lime, alignItems: 'center', justifyContent: 'center' },
  floatingBadgeTitle: { color: '#1b281a', fontSize: 10, fontWeight: '900' },
  floatingBadgeCopy: { color: '#52604f', fontSize: 9, marginTop: 3 },
  valueStrip: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: palette.line, paddingVertical: 25, gap: 24 },
  valueStripWide: { flexDirection: 'row' },
  valuePoint: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, flex: 1 },
  valueIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#273428', alignItems: 'center', justifyContent: 'center' },
  valueCopy: { flex: 1 },
  valueTitle: { color: palette.text, fontSize: 13, fontWeight: '900' },
  valueText: { color: palette.muted, fontSize: 11, lineHeight: 17, marginTop: 5, maxWidth: 260 },
  stepsSection: { paddingTop: 72, paddingBottom: 75 },
  sectionIntro: { maxWidth: 570, marginBottom: 27 },
  sectionKicker: { color: palette.lime, fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  sectionTitle: { color: palette.text, fontSize: 30, lineHeight: 37, fontWeight: '900', letterSpacing: -0.7, marginTop: 11 },
  stepsGrid: { gap: 13 },
  stepsGridWide: { flexDirection: 'row' },
  stepCard: { flex: 1, minHeight: 190, borderRadius: 19, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.backgroundSoft, padding: 19 },
  stepTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  stepIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#2b392b', alignItems: 'center', justifyContent: 'center' },
  stepNumber: { color: '#71806f', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  stepTitle: { color: palette.text, fontSize: 14, fontWeight: '900' },
  stepCopy: { color: palette.muted, fontSize: 11, lineHeight: 18, marginTop: 9 },
  bottomCallout: { borderRadius: 22, backgroundColor: '#202d22', borderWidth: 1, borderColor: '#405039', padding: 20, gap: 14 },
  bottomCalloutWide: { flexDirection: 'row', alignItems: 'center', padding: 24 },
  bottomCalloutIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#31412a', alignItems: 'center', justifyContent: 'center' },
  bottomCalloutCopy: { flex: 1 },
  bottomCalloutTitle: { color: palette.text, fontSize: 15, fontWeight: '900' },
  bottomCalloutText: { color: palette.muted, fontSize: 11, marginTop: 5, lineHeight: 17 },
  bottomCalloutButton: { minHeight: 44, alignSelf: 'flex-start', borderRadius: 14, backgroundColor: palette.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 15 },
  bottomCalloutButtonText: { color: palette.limeDark, fontSize: 12, fontWeight: '900' },
  bottomBar: { minHeight: 84, paddingVertical: 19, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  bottomBrand: { color: palette.text, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  bottomBrandMuted: { color: palette.lime },
  bottomNote: { color: '#859387', fontSize: 10 },
  bottomSignIn: { color: palette.lime, fontSize: 10, fontWeight: '900' },
});
