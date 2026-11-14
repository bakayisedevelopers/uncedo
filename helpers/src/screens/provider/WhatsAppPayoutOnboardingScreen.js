import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionButton, Card, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { useAuth } from '../../context/AuthContext';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { getFirebaseClients } from '../../firebase/config';
import { getHelperPayoutBanks, verifyHelperPayout } from '../../services/payoutVerificationService';
import { colors } from '../../theme/colors';

const WHATSAPP_RETURN_URL = 'https://wa.me/27605239926';

export function WhatsAppPayoutOnboardingScreen() {
  const { user } = useAuth();
  const { profile } = useHelpersApp();
  const existingPayout = profile?.payout && typeof profile.payout === 'object' ? profile.payout : {};
  const isAlreadyVerified = String(existingPayout.verificationStatus || '').toLowerCase() === 'verified';

  const [banks, setBanks] = useState([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [banksError, setBanksError] = useState('');
  const [bankQuery, setBankQuery] = useState('');
  const [editing, setEditing] = useState(!isAlreadyVerified);

  const [accountType, setAccountType] = useState(
    ['personal', 'business'].includes(String(existingPayout.accountType || '').toLowerCase())
      ? String(existingPayout.accountType).toLowerCase()
      : 'personal',
  );
  const [bankCode, setBankCode] = useState(String(existingPayout.bankCode || ''));
  const [bankName, setBankName] = useState(String(existingPayout.bankName || ''));
  const [accountHolder, setAccountHolder] = useState(String(existingPayout.accountHolder || profile?.fullName || ''));
  const [accountNumber, setAccountNumber] = useState('');
  const [documentType, setDocumentType] = useState(
    existingPayout.accountType === 'business'
      ? 'businessRegistrationNumber'
      : ['identityNumber', 'passportNumber'].includes(String(existingPayout.documentType || ''))
        ? String(existingPayout.documentType)
        : 'identityNumber',
  );
  const [documentNumber, setDocumentNumber] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [returnUrl, setReturnUrl] = useState('');

  const loadBanks = useCallback(async () => {
    if (!user?.uid) return;
    setBanksLoading(true);
    setBanksError('');
    try {
      const list = await getHelperPayoutBanks();
      setBanks(list);
    } catch (error) {
      setBanksError(error?.message || 'Unable to load supported South African banks.');
    } finally {
      setBanksLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadBanks();
  }, [loadBanks]);

  useEffect(() => {
    if (isAlreadyVerified) {
      setEditing(false);
    }
  }, [isAlreadyVerified]);

  const filteredBanks = useMemo(() => {
    const query = String(bankQuery || '').trim().toLowerCase();
    const matched = query
      ? banks.filter((bank) => `${bank.name} ${bank.code}`.toLowerCase().includes(query))
      : banks;
    return matched.slice(0, 40);
  }, [bankQuery, banks]);

  const selectAccountType = (nextType) => {
    setAccountType(nextType);
    if (nextType === 'business') {
      setDocumentType('businessRegistrationNumber');
    } else if (!['identityNumber', 'passportNumber'].includes(documentType)) {
      setDocumentType('identityNumber');
    }
  };

  const openWhatsApp = () => {
    const target = returnUrl || WHATSAPP_RETURN_URL;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.assign(target);
      return;
    }
    Linking.openURL(target).catch(() => null);
  };

  const notifyWhatsAppPayoutComplete = async () => {
    const { functions, authProviders } = getFirebaseClients();
    const call = authProviders.httpsCallable(functions, 'completeWhatsAppHelperPayout');
    const response = await call({});
    const nextReturnUrl = String(response?.data?.returnUrl || WHATSAPP_RETURN_URL).trim();
    setReturnUrl(nextReturnUrl);
    return nextReturnUrl;
  };

  const continueVerified = async () => {
    setSubmitting(true);
    setErrorMessage('');
    setMessage('');
    try {
      await notifyWhatsAppPayoutComplete();
      setMessage('Your verified payout details are confirmed. Check your WhatsApp chat to continue.');
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to continue WhatsApp setup right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitPayout = async () => {
    setSubmitting(true);
    setErrorMessage('');
    setMessage('');
    try {
      await verifyHelperPayout({
        bankName,
        bankCode,
        accountNumber,
        accountHolder,
        accountType,
        documentType,
        documentNumber,
      });
      await notifyWhatsAppPayoutComplete().catch(() => null);
      setDocumentNumber('');
      setEditing(false);
      setMessage('Your payout account is verified and saved. Check WhatsApp for the next update.');
    } catch (error) {
      setErrorMessage(error?.message || 'We could not verify those bank payout details. Check all fields and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = Boolean(
    bankName.trim()
    && bankCode.trim()
    && accountHolder.trim()
    && accountNumber.replace(/\s+/g, '').trim().length >= 5
    && documentNumber.replace(/\s+/g, '').trim().length >= 4
    && !submitting,
  );

  if (!user?.uid) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Sign in to continue</Text>
        <Text style={styles.copy}>Use the helper email account linked to this WhatsApp number.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Text style={styles.eyebrow}>WhatsApp helper setup</Text>
      <Text style={styles.title}>Verify your payout details</Text>
      <Text style={styles.copy}>
        Add and verify the South African bank account where Uncedo should pay your helper earnings. Your details are verified securely via Paystack.
      </Text>

      {isAlreadyVerified && !editing ? (
        <Card>
          <SectionHeading
            title="Verified payout account"
            subtitle="This bank account is verified and ready for helper payouts."
            action={<StatusBadge label="Verified" tone="success" />}
          />
          <View style={styles.summaryList}>
            <Text style={styles.summaryRow}>Bank: {existingPayout.bankName || 'Saved bank'}</Text>
            <Text style={styles.summaryRow}>Account holder: {existingPayout.accountHolder || 'Saved holder'}</Text>
            {existingPayout.accountNumberLast4 ? (
              <Text style={styles.summaryRow}>Account ending in: •••• {existingPayout.accountNumberLast4}</Text>
            ) : null}
          </View>
          <View style={styles.actions}>
            <ActionButton
              label={submitting ? 'Continuing…' : 'Continue setup in WhatsApp'}
              onPress={continueVerified}
              disabled={submitting}
            />
            <ActionButton
              label="Update payout details"
              tone="secondary"
              onPress={() => setEditing(true)}
              disabled={submitting}
            />
          </View>
        </Card>
      ) : (
        <>
          <Card>
            <SectionHeading title="Account type" subtitle="Choose whether payouts go to a personal or registered business account." />
            <View style={styles.choiceRow}>
              {[
                { key: 'personal', label: 'Personal account' },
                { key: 'business', label: 'Business account' },
              ].map((option) => {
                const active = accountType === option.key;
                return (
                  <Pressable
                    key={option.key}
                    accessibilityRole="button"
                    onPress={() => selectAccountType(option.key)}
                    style={[styles.choicePill, active && styles.choicePillActive]}
                  >
                    <Text style={[styles.choiceLabel, active && styles.choiceLabelActive]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <Card>
            <SectionHeading
              title="Select bank"
              subtitle={bankName ? `Selected: ${bankName} (${bankCode})` : 'Choose your South African bank from the verified Paystack list.'}
              action={bankName ? <StatusBadge label="Selected" tone="success" /> : null}
            />
            <TextInput
              placeholder="Search bank name (e.g. FNB, Capitec, Standard Bank, Nedbank, Absa)"
              placeholderTextColor={colors.muted}
              value={bankQuery}
              onChangeText={setBankQuery}
              style={styles.input}
            />
            {banksLoading ? <Text style={styles.hint}>Loading supported banks…</Text> : null}
            {banksError ? (
              <View style={styles.bankErrorBox}>
                <Text style={styles.error}>{banksError}</Text>
                <ActionButton label="Retry bank list" tone="secondary" onPress={loadBanks} />
              </View>
            ) : null}
            {!banksLoading && !banksError ? (
              <View style={styles.bankList}>
                {filteredBanks.map((bank) => {
                  const selected = bank.code === bankCode;
                  return (
                    <Pressable
                      key={`${bank.code}-${bank.name}`}
                      accessibilityRole="button"
                      onPress={() => {
                        setBankCode(bank.code);
                        setBankName(bank.name);
                      }}
                      style={[styles.bankOption, selected && styles.bankOptionSelected]}
                    >
                      <Text style={[styles.bankOptionText, selected && styles.bankOptionTextSelected]}>{bank.name}</Text>
                      <Text style={[styles.bankCodeText, selected && styles.bankOptionTextSelected]}>{bank.code}</Text>
                    </Pressable>
                  );
                })}
                {!filteredBanks.length ? <Text style={styles.hint}>No matching banks found. Try another search term.</Text> : null}
              </View>
            ) : null}
          </Card>

          <Card>
            <SectionHeading title="Account & identity details" subtitle="Must match your bank account records for instant verification." />
            <Text style={styles.fieldLabel}>Account holder name</Text>
            <TextInput
              autoCapitalize="words"
              placeholder="Exact name on the bank account"
              placeholderTextColor={colors.muted}
              value={accountHolder}
              onChangeText={setAccountHolder}
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>Bank account number</Text>
            <TextInput
              keyboardType="number-pad"
              placeholder="Enter account number"
              placeholderTextColor={colors.muted}
              value={accountNumber}
              onChangeText={setAccountNumber}
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>Verification document type</Text>
            {accountType === 'business' ? (
              <View style={[styles.choicePill, styles.choicePillActive, styles.singleChoice]}>
                <Text style={[styles.choiceLabel, styles.choiceLabelActive]}>Business registration number</Text>
              </View>
            ) : (
              <View style={styles.choiceRow}>
                {[
                  { key: 'identityNumber', label: 'South African ID number' },
                  { key: 'passportNumber', label: 'Passport number' },
                ].map((option) => {
                  const active = documentType === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      accessibilityRole="button"
                      onPress={() => setDocumentType(option.key)}
                      style={[styles.choicePill, active && styles.choicePillActive]}
                    >
                      <Text style={[styles.choiceLabel, active && styles.choiceLabelActive]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Text style={styles.fieldLabel}>
              {documentType === 'businessRegistrationNumber'
                ? 'Business registration number'
                : documentType === 'passportNumber'
                  ? 'Passport number'
                  : 'South African ID number'}
            </Text>
            <TextInput
              autoCapitalize="characters"
              placeholder={documentType === 'identityNumber' ? '13-digit SA ID number' : 'Enter document number'}
              placeholderTextColor={colors.muted}
              value={documentNumber}
              onChangeText={setDocumentNumber}
              style={styles.input}
            />
          </Card>

          <ActionButton
            label={submitting ? 'Verifying with Paystack…' : 'Verify payout details'}
            onPress={submitPayout}
            disabled={!canSubmit}
          />
          {isAlreadyVerified ? (
            <ActionButton label="Cancel" tone="secondary" onPress={() => setEditing(false)} disabled={submitting} />
          ) : null}
        </>
      )}

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <ActionButton label="Return to WhatsApp" tone="secondary" onPress={openWhatsApp} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, width: '100%', maxWidth: 760, alignSelf: 'center', padding: 24, gap: 16, backgroundColor: colors.background },
  eyebrow: { color: colors.brand, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 30, fontWeight: '800' },
  copy: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  summaryList: { gap: 6, marginVertical: 12 },
  summaryRow: { color: colors.text, fontSize: 15, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  choicePill: {
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  singleChoice: { alignSelf: 'flex-start', marginTop: 8 },
  choicePillActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  choiceLabel: { color: colors.text, fontSize: 13, fontWeight: '800' },
  choiceLabelActive: { color: '#ffffff' },
  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  hint: { color: colors.muted, fontSize: 13, marginTop: 8 },
  bankErrorBox: { gap: 10, marginTop: 10 },
  bankList: {
    marginTop: 10,
    maxHeight: 220,
    overflow: 'scroll',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: '#ffffff',
  },
  bankOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  bankOptionSelected: { backgroundColor: colors.brand },
  bankOptionText: { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 },
  bankCodeText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  bankOptionTextSelected: { color: '#ffffff' },
  message: { color: colors.brandDark, fontWeight: '700', lineHeight: 22 },
  error: { color: colors.danger, fontWeight: '700', lineHeight: 22 },
});
