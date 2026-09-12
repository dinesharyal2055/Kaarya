/**
 * Kaarya Verification Flow Screen
 * Multi-step: tier selection → document upload → review & submit
 */

import { useState, useEffect, useLayoutEffect } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useTranslation } from 'react-i18next';
import { KaaryaColors, Spacing, FontSizes, BorderRadius, Shadows } from '@/constants/theme';
import { Button, Badge } from '@/components/ui';
import { verificationApi } from '@/lib/api';
import { parseServerTime, formatNepalLong } from '@/lib/time';
import { useAuth } from '@/context/AuthContext';
import type { VerificationRequest } from '@/types';

type Tier = {
  id: number;
  labelKey: string;
  subtitleKey: string;
  descriptionKey: string;
  icon: string;
  badgeKey: string;
  active: boolean;
  color: string;
};

const TIERS = (t: (k: string) => string): Tier[] => [
  {
    id: 1,
    labelKey: 'verification.nagarikApp',
    subtitleKey: 'verification.nagarikAppSub',
    descriptionKey: 'verification.nagarikAppDesc',
    icon: 'card-account-details',
    badgeKey: 'verification.comingSoon',
    active: false,
    color: KaaryaColors.brand[500],
  },
  {
    id: 2,
    labelKey: 'verification.esewaKhalti',
    subtitleKey: 'verification.esewaKhaltiSub',
    descriptionKey: 'verification.esewaKhaltiDesc',
    icon: 'wallet',
    badgeKey: 'verification.comingSoon',
    active: false,
    color: KaaryaColors.brand[500],
  },
  {
    id: 3,
    labelKey: 'verification.manualReview',
    subtitleKey: 'verification.manualReviewSub',
    descriptionKey: 'verification.manualReviewDesc',
    icon: 'shield-account',
    badgeKey: 'verification.availableNow',
    active: true,
    color: KaaryaColors.success,
  },
];

type UploadedImage = {
  uri: string;
  base64: string;
  filename: string;
  uploadedUrl?: string;
};

const UPLOAD_MAX_DIMENSION = 1000;
const UPLOAD_JPEG_QUALITY = 0.6;

async function prepareUploadImage(
  type: 'selfie' | 'front' | 'back',
  asset: ImagePicker.ImagePickerAsset
): Promise<UploadedImage> {
  const filename = `${type}_${Date.now()}`;
  const longestSide = Math.max(asset.width || 0, asset.height || 0);
  const actions: ImageManipulator.Action[] = [];
  if (longestSide > UPLOAD_MAX_DIMENSION) {
    const scale = UPLOAD_MAX_DIMENSION / longestSide;
    actions.push({
      resize: {
        width: Math.max(1, Math.round(asset.width * scale)),
        height: Math.max(1, Math.round(asset.height * scale)),
      },
    });
  }
  try {
    const result = await ImageManipulator.manipulateAsync(asset.uri, actions, {
      compress: UPLOAD_JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    return { uri: result.uri, base64: result.base64 ?? '', filename };
  } catch {
    return { uri: asset.uri, base64: asset.base64 ?? '', filename };
  }
}

export default function VerificationScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { refreshUser } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1); // 4 = success, 5 = rejected/resubmit

  useLayoutEffect(() => {
    navigation.setOptions({
      headerBackTitle: step === 1 ? t('verification.backToProfile') : t('common.back'),
    });
  }, [step, navigation, t]);

  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [existingRequest, setExistingRequest] = useState<VerificationRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Document uploads
  const [selfie, setSelfie] = useState<UploadedImage | null>(null);
  const [citizenshipFront, setCitizenshipFront] = useState<UploadedImage | null>(null);
  const [citizenshipBack, setCitizenshipBack] = useState<UploadedImage | null>(null);

  const [documentType, setDocumentType] = useState<'nid' | 'citizenship' | null>(null);
  const [docTypeOpen, setDocTypeOpen] = useState(false);

  const tiers = TIERS(t);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    setLoading(true);
    try {
      const result = await verificationApi.getStatus();
      if (result.request) {
        setExistingRequest(result.request);
        if (result.request.status === 'pending' || result.request.status === 'approved') {
          setStep(4);
        } else if (result.request.status === 'rejected' || result.request.status === 'more_info_needed') {
          setStep(5);
        } else {
          setStep(1);
        }
      }
    } catch (err) {
      // No existing request — stay on step 1
    } finally {
      setLoading(false);
    }
  }

  async function pickImage(type: 'selfie' | 'front' | 'back') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('verification.permissionTitle'), t('verification.photoLibraryMessage'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const uploaded = await prepareUploadImage(type, asset);

    if (type === 'selfie') setSelfie(uploaded);
    else if (type === 'front') setCitizenshipFront(uploaded);
    else setCitizenshipBack(uploaded);
  }

  async function takePhoto(type: 'selfie' | 'front' | 'back') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('verification.permissionTitle'), t('verification.cameraMessage'));
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const uploaded = await prepareUploadImage(type, asset);

    if (type === 'selfie') setSelfie(uploaded);
    else if (type === 'front') setCitizenshipFront(uploaded);
    else setCitizenshipBack(uploaded);
  }

  function showImagePicker(type: 'selfie' | 'front' | 'back') {
    Alert.alert(
      t('verification.addPhoto'),
      t('verification.chooseSource'),
      [
        { text: t('verification.takePhoto'), onPress: () => takePhoto(type) },
        { text: t('verification.chooseFromLibrary'), onPress: () => pickImage(type) },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    );
  }

  function removeImage(type: 'selfie' | 'front' | 'back') {
    if (type === 'selfie') setSelfie(null);
    else if (type === 'front') setCitizenshipFront(null);
    else setCitizenshipBack(null);
  }

  async function handleSubmit() {
    if (!selectedTier || !documentType || !selfie || !citizenshipFront || !citizenshipBack) return;

    setSubmitting(true);
    try {
      // Upload each image
      const uploadedUrls: string[] = [];

      for (const img of [selfie, citizenshipFront, citizenshipBack].filter(Boolean) as UploadedImage[]) {
        const result = await verificationApi.uploadDocument({
          uri: img.uri,
          base64: img.base64,
          mimeType: 'image/jpeg',
          fileName: img.filename,
        });
        uploadedUrls.push(result.url);
      }

      // Submit verification request
      const request = await verificationApi.submit({
        level: selectedTier.id,
        documentType,
        documents: uploadedUrls,
        notes: `Selfie: ${uploadedUrls[0] ?? 'N/A'}`,
      });

      await refreshUser?.();

      setExistingRequest(request);
      setStep(4);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('verification.submissionFailed');
      Alert.alert(t('verification.verificationError'), message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleResubmit() {
    const previousTier = existingRequest ? tiers.find((tier) => tier.id === existingRequest.level) : null;
    setSelectedTier(previousTier ?? null);
    setDocumentType(existingRequest && existingRequest.documentType === 'nid' ? 'nid' : 'citizenship');
    setDocTypeOpen(false);
    setSelfie(null);
    setCitizenshipFront(null);
    setCitizenshipBack(null);
    setStep(2);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Step indicator */}
        <View style={styles.stepIndicator}>
          {[1, 2, 3].map((s) => (
            <View key={s} style={styles.stepItem}>
              <View style={[styles.stepCircle, step === s && styles.stepCircleActive, step > s && styles.stepCircleDone]}>
                {step > s ? (
                  <MaterialCommunityIcons name="check" size={14} color="#fff" />
                ) : (
                  <Text style={[styles.stepNum, step === s && styles.stepNumActive]}>{s}</Text>
                )}
              </View>
              <Text style={[styles.stepLabel, step === s && styles.stepLabelActive]}>
                {s === 1 ? t('verification.stepTier') : s === 2 ? t('verification.stepDocuments') : t('verification.stepReview')}
              </Text>
            </View>
          ))}
        </View>

        {/* Step 1: Tier Selection */}
        {step === 1 && (
          <View>
            <Text style={styles.stepTitle}>{t('verification.chooseMethod')}</Text>
            <Text style={styles.stepSubtitle}>
              {t('verification.chooseMethodSubtitle')}
            </Text>

            {tiers.map((tier) => (
              <Pressable
                key={tier.id}
                style={[
                  styles.tierCard,
                  Shadows.sm,
                  selectedTier?.id === tier.id && styles.tierCardSelected,
                  !tier.active && styles.tierCardInactive,
                ]}
                onPress={() => tier.active && setSelectedTier(tier)}
              >
                <View style={[styles.tierIcon, { backgroundColor: tier.active ? tier.color + '15' : KaaryaColors.border }]}>
                  <MaterialCommunityIcons
                    name={tier.icon as any}
                    size={28}
                    color={tier.active ? tier.color : KaaryaColors.muted}
                  />
                </View>
                <View style={styles.tierContent}>
                  <View style={styles.tierHeader}>
                    <Text style={[styles.tierLabel, !tier.active && styles.textMuted]}>{t(tier.labelKey)}</Text>
                    <Badge
                      label={t(tier.badgeKey)}
                      variant={tier.active ? 'success' : 'muted'}
                    />
                  </View>
                  <Text style={[styles.tierSubtitle, !tier.active && styles.textMuted]}>{t(tier.subtitleKey)}</Text>
                  <Text style={styles.tierDescription}>{t(tier.descriptionKey)}</Text>
                </View>
                {selectedTier?.id === tier.id && tier.active && (
                  <MaterialCommunityIcons name="check-circle" size={22} color={KaaryaColors.success} />
                )}
              </Pressable>
            ))}

            <Button
              title={t('common.continue')}
              onPress={() => setStep(2)}
              disabled={!selectedTier || !selectedTier.active}
              fullWidth
              style={{ marginTop: Spacing.lg }}
            />
          </View>
        )}

        {/* Step 2: Document Upload */}
        {step === 2 && (
          <View>
            <Text style={styles.stepTitle}>{t('verification.uploadDocuments')}</Text>
            <Text style={styles.stepSubtitle}>
              {t('verification.uploadDocumentsSubtitle')}
            </Text>

            <Text style={styles.sectionLabel}>{t('verification.requiredDocuments')}</Text>

            {/* Identity document type dropdown */}
            <View style={styles.dropdownWrap}>
              <Pressable
                style={[styles.dropdownTrigger, docTypeOpen && styles.dropdownTriggerOpen]}
                onPress={() => setDocTypeOpen(o => !o)}
              >
                <View>
                  <Text style={styles.dropdownLabel}>
                    {t('verification.documentTypeLabel')}
                    <Text style={styles.required}> *</Text>
                  </Text>
                  <View style={styles.dropdownInner}>
                    <Text style={documentType ? styles.dropdownValue : styles.dropdownPlaceholder}>
                      {documentType === 'nid'
                        ? t('verification.documentTypeNid')
                        : documentType === 'citizenship'
                          ? t('verification.documentTypeCitizenship')
                          : t('verification.selectDocumentType')}
                    </Text>
                    <MaterialCommunityIcons name={docTypeOpen ? 'chevron-up' : 'chevron-down'} size={20} color={KaaryaColors.muted} />
                  </View>
                </View>
              </Pressable>

              {docTypeOpen && (
                <View style={styles.dropdownMenu}>
                  {(['nid', 'citizenship'] as const).map((opt, i) => {
                    const selected = documentType === opt;
                    return (
                      <Pressable
                        key={opt}
                        style={[styles.dropdownOption, i === 0 && styles.dropdownOptionBorder]}
                        onPress={() => { setDocumentType(opt); setDocTypeOpen(false); }}
                      >
                        <View style={styles.dropdownOptionLeft}>
                          <MaterialCommunityIcons
                            name={opt === 'nid' ? 'card-account-details-outline' : 'card-account-details'}
                            size={18}
                            color={selected ? KaaryaColors.brand[500] : KaaryaColors.muted}
                          />
                          <Text style={[styles.dropdownOptionText, selected && styles.dropdownOptionTextSelected]}>
                            {opt === 'nid' ? t('verification.documentTypeNid') : t('verification.documentTypeCitizenship')}
                          </Text>
                        </View>
                        {selected && <MaterialCommunityIcons name="check" size={18} color={KaaryaColors.brand[500]} />}
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <Text style={styles.dropdownHint}>{t('verification.documentTypeDescription')}</Text>
            </View>

            {/* Selfie */}
            <DocumentUploadCard
              title={t('verification.selfiePhoto')}
              description={t('verification.selfieDescription')}
              image={selfie}
              onPress={() => showImagePicker('selfie')}
              onRemove={() => removeImage('selfie')}
              required
              t={t}
            />

            {/* Citizenship Front */}
            <DocumentUploadCard
              title={t('verification.citizenshipFront')}
              description={t('verification.citizenshipFrontDescription')}
              image={citizenshipFront}
              onPress={() => showImagePicker('front')}
              onRemove={() => removeImage('front')}
              required
              t={t}
            />

            {/* Citizenship Back */}
            <DocumentUploadCard
              title={t('verification.citizenshipBack')}
              description={t('verification.citizenshipBackDescription')}
              image={citizenshipBack}
              onPress={() => showImagePicker('back')}
              onRemove={() => removeImage('back')}
              required
              t={t}
            />

            <View style={styles.buttonRow}>
              <Button title={t('common.back')} variant="ghost" onPress={() => setStep(1)} style={{ flex: 1, marginRight: Spacing.sm }} />
              <Button
                title={t('verification.review')}
                onPress={() => setStep(3)}
                disabled={!selfie || !citizenshipFront || !citizenshipBack || !documentType}
                style={{ flex: 1, marginLeft: Spacing.sm }}
              />
            </View>
          </View>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <View>
            <Text style={styles.stepTitle}>{t('verification.reviewSubmit')}</Text>
            <Text style={styles.stepSubtitle}>
              {t('verification.reviewSubmitSubtitle')}
            </Text>

            <View style={[styles.reviewCard, Shadows.sm]}>
              <ReviewRow label={t('verification.verificationTier')} value={selectedTier ? t(selectedTier.labelKey) : ''} />
              <ReviewRow
                label={t('verification.documentTypeLabel')}
                value={documentType === 'nid' ? t('verification.documentTypeNid') : t('verification.documentTypeCitizenship')}
              />
              <ReviewRow label={t('verification.selfiePhoto')} value={selfie ? t('verification.uploaded') : t('verification.missing')} valueColor={selfie ? KaaryaColors.success : KaaryaColors.danger} />
              <ReviewRow label={t('verification.citizenshipFront')} value={citizenshipFront ? t('verification.uploaded') : t('verification.missing')} valueColor={citizenshipFront ? KaaryaColors.success : KaaryaColors.danger} />
              <ReviewRow label={t('verification.citizenshipBack')} value={citizenshipBack ? t('verification.uploaded') : t('verification.missing')} valueColor={citizenshipBack ? KaaryaColors.success : KaaryaColors.danger} />
            </View>

            <View style={styles.disclaimer}>
              <MaterialCommunityIcons name="shield-check" size={18} color={KaaryaColors.muted} />
              <Text style={styles.disclaimerText}>
                {t('verification.disclaimer')}
              </Text>
            </View>

            <View style={styles.buttonRow}>
              <Button title={t('common.back')} variant="ghost" onPress={() => setStep(2)} style={{ flex: 1, marginRight: Spacing.sm }} />
              <Button
                title={t('verification.submitForReview')}
                onPress={handleSubmit}
                loading={submitting}
                disabled={submitting}
                style={{ flex: 2, marginLeft: Spacing.sm }}
              />
            </View>
          </View>
        )}

        {/* Step 4: Success */}
        {step === 4 && (
          <View style={styles.successContainer}>
            <View style={[styles.successIcon, Shadows.lg]}>
              <MaterialCommunityIcons
                name={existingRequest?.status === 'approved' ? 'check-circle' : 'clock-outline'}
                size={64}
                color={existingRequest?.status === 'approved' ? KaaryaColors.success : KaaryaColors.warning}
              />
            </View>
            <Text style={styles.successTitle}>
              {existingRequest?.status === 'approved' ? t('verification.approvedTitle') : t('verification.submittedTitle')}
            </Text>
            <Text style={styles.successSubtitle}>
              {existingRequest?.status === 'approved'
                ? t('verification.approvedMessage')
                : t('verification.submittedMessage')}
            </Text>

            {existingRequest && (
              <View style={[styles.statusCard, Shadows.sm]}>
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>{t('verification.status')}</Text>
                  <Badge
                    label={existingRequest.status === 'pending' ? t('verification.underReview') : existingRequest.status === 'approved' ? t('verification.approved') : existingRequest.status === 'rejected' ? t('verification.rejected') : t('verification.moreInfoNeeded')}
                    variant={existingRequest.status === 'pending' ? 'warning' : existingRequest.status === 'approved' ? 'success' : 'danger'}
                  />
                </View>
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>{t('verification.submitted')}</Text>
                  <Text style={styles.statusValue}>
                    {formatNepalLong(parseServerTime(existingRequest.createdAt))}
                  </Text>
                </View>
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>{t('verification.tier')}</Text>
                  <Text style={styles.statusValue}>
                    {tiers.find(tier => tier.id === existingRequest.level)?.labelKey ? t(tiers.find(tier => tier.id === existingRequest.level)!.labelKey) : `${t('verification.tier')} ${existingRequest.level}`}
                  </Text>
                </View>
              </View>
            )}

            <Button title={t('verification.backToProfile')} onPress={async () => { await refreshUser(); router.back(); }} fullWidth style={{ marginTop: Spacing.lg }} />
          </View>
        )}

        {/* Step 5: Rejected — show reason and allow resubmission */}
        {step === 5 && (
          <View style={styles.successContainer}>
            <View style={[styles.successIcon, Shadows.lg]}>
              <MaterialCommunityIcons
                name={existingRequest?.status === 'more_info_needed' ? 'information-outline' : 'alert-circle'}
                size={64}
                color={KaaryaColors.danger}
              />
            </View>
            <Text style={styles.successTitle}>
              {existingRequest?.status === 'more_info_needed' ? t('verification.moreInfoNeededTitle') : t('verification.rejectedTitle')}
            </Text>
            <Text style={styles.successSubtitle}>
              {existingRequest?.status === 'more_info_needed' ? t('verification.moreInfoNeededMessage') : t('verification.rejectedMessage')}
            </Text>

            {existingRequest && (
              <View style={[styles.statusCard, Shadows.sm]}>
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>{t('verification.status')}</Text>
                  <Badge
                    label={existingRequest.status === 'more_info_needed' ? t('verification.moreInfoNeeded') : t('verification.rejected')}
                    variant="danger"
                  />
                </View>
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>{t('verification.rejectionReasonLabel')}</Text>
                  <Text style={styles.rejectionReason}>
                    {existingRequest.adminNotes || t('verification.noRejectionReason')}
                  </Text>
                </View>
              </View>
            )}

            <Button
              title={t('verification.resubmitDocuments')}
              onPress={handleResubmit}
              fullWidth
              style={{ marginTop: Spacing.lg }}
            />
            <Button
              title={t('verification.backToProfile')}
              variant="ghost"
              onPress={async () => { await refreshUser(); router.back(); }}
              fullWidth
              style={{ marginTop: Spacing.sm }}
            />
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

/* ─── Sub-components ──────────────────────────────────────────────────────────── */

function DocumentUploadCard({
  title,
  description,
  image,
  onPress,
  onRemove,
  required,
  t,
}: {
  title: string;
  description: string;
  image: UploadedImage | null;
  onPress: () => void;
  onRemove: () => void;
  required: boolean;
  t: (key: string) => string;
}) {
  return (
    <View style={[styles.uploadCard, Shadows.sm]}>
      <View style={styles.uploadHeader}>
        <View>
          <Text style={styles.uploadTitle}>
            {title}
            {required && <Text style={styles.required}> *</Text>}
          </Text>
          <Text style={styles.uploadDesc}>{description}</Text>
        </View>
      </View>

      {image ? (
        <View style={styles.uploadPreview}>
          <Image source={{ uri: image.uri }} style={styles.previewImage} />
          <View style={styles.previewOverlay}>
            <Pressable style={styles.previewBtn} onPress={onPress}>
              <MaterialCommunityIcons name="camera" size={18} color="#fff" />
            </Pressable>
            <Pressable style={[styles.previewBtn, { backgroundColor: KaaryaColors.danger }]} onPress={onRemove}>
              <MaterialCommunityIcons name="close" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable style={styles.uploadPlaceholder} onPress={onPress}>
          <MaterialCommunityIcons name="camera-plus" size={32} color={KaaryaColors.muted} />
          <Text style={styles.uploadPlaceholderText}>{t('verification.tapToAddPhoto')}</Text>
        </Pressable>
      )}
    </View>
  );
}

function ReviewRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={[styles.reviewValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: KaaryaColors.background },
  scroll: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg, paddingBottom: 120 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: FontSizes.base, color: KaaryaColors.muted },

  /* Step indicator */
  stepIndicator: { flexDirection: 'row', justifyContent: 'center', marginBottom: Spacing.xl, gap: Spacing.xl },
  stepItem: { alignItems: 'center', gap: 6 },
  stepCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: KaaryaColors.border, alignItems: 'center', justifyContent: 'center',
  },
  stepCircleActive: { backgroundColor: KaaryaColors.brand[500] },
  stepCircleDone: { backgroundColor: KaaryaColors.success },
  stepNum: { fontSize: FontSizes.xs, fontWeight: '700', color: KaaryaColors.muted },
  stepNumActive: { color: '#fff' },
  stepLabel: { fontSize: FontSizes.xs, color: KaaryaColors.muted },
  stepLabelActive: { color: KaaryaColors.brand[500], fontWeight: '600' },

  /* Step content */
  stepTitle: { fontSize: FontSizes['2xl'], fontWeight: '700', color: KaaryaColors.text, marginBottom: Spacing.xs },
  stepSubtitle: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginBottom: Spacing.lg, lineHeight: 20 },

  /* Tier cards */
  tierCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 2, borderColor: 'transparent',
  },
  tierCardSelected: { borderColor: KaaryaColors.brand[500], backgroundColor: KaaryaColors.brand[50] },
  tierCardInactive: { opacity: 0.6 },
  tierIcon: { width: 52, height: 52, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  tierContent: { flex: 1 },
  tierHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  tierLabel: { fontSize: FontSizes.base, fontWeight: '600', color: KaaryaColors.text },
  tierSubtitle: { fontSize: FontSizes.sm, fontWeight: '500', color: KaaryaColors.brand[500], marginBottom: 4 },
  tierDescription: { fontSize: FontSizes.xs, color: KaaryaColors.muted, lineHeight: 18 },

  /* Section labels */
  sectionLabel: { fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.textSecondary, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },

  /* Upload cards */
  uploadCard: { backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.md },

  /* Document type dropdown */
  dropdownWrap: { marginBottom: Spacing.md },
  dropdownTrigger: {
    backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 2, borderColor: 'transparent',
  },
  dropdownTriggerOpen: { borderColor: KaaryaColors.brand[500] },
  dropdownLabel: { fontSize: FontSizes.xs, fontWeight: '600', color: KaaryaColors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  dropdownInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropdownValue: { fontSize: FontSizes.base, fontWeight: '600', color: KaaryaColors.text },
  dropdownPlaceholder: { fontSize: FontSizes.base, color: KaaryaColors.muted },
  dropdownMenu: {
    backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.md, marginTop: 6,
    overflow: 'hidden', borderWidth: 1, borderColor: KaaryaColors.border,
  },
  dropdownOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  dropdownOptionBorder: { borderBottomWidth: 1, borderBottomColor: KaaryaColors.border },
  dropdownOptionLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dropdownOptionText: { fontSize: FontSizes.sm, color: KaaryaColors.text },
  dropdownOptionTextSelected: { color: KaaryaColors.brand[500], fontWeight: '600' },
  dropdownHint: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 6 },
  uploadHeader: { marginBottom: Spacing.sm },
  uploadTitle: { fontSize: FontSizes.base, fontWeight: '600', color: KaaryaColors.text },
  required: { color: KaaryaColors.danger },
  uploadDesc: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 2 },
  uploadPlaceholder: {
    height: 120, borderRadius: BorderRadius.md, borderWidth: 2, borderColor: KaaryaColors.border,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center',
  },
  uploadPlaceholderText: { fontSize: FontSizes.sm, color: KaaryaColors.muted, marginTop: 6 },
  uploadPreview: { height: 160, borderRadius: BorderRadius.md, overflow: 'hidden' },
  previewImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  previewOverlay: { position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', gap: 8 },
  previewBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: KaaryaColors.brand[500],
    alignItems: 'center', justifyContent: 'center',
  },

  /* Buttons */
  buttonRow: { flexDirection: 'row', marginTop: Spacing.lg },

  /* Review */
  reviewCard: { backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg, padding: Spacing.md },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: KaaryaColors.border },
  reviewLabel: { fontSize: FontSizes.sm, color: KaaryaColors.muted },
  reviewValue: { fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.text },
  disclaimer: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginTop: Spacing.md, padding: Spacing.md, backgroundColor: KaaryaColors.brand[50], borderRadius: BorderRadius.md },
  disclaimerText: { flex: 1, fontSize: FontSizes.xs, color: KaaryaColors.muted, lineHeight: 18 },

  /* Success */
  successContainer: { alignItems: 'center', paddingTop: Spacing.xl },
  successIcon: { width: 120, height: 120, borderRadius: 60, backgroundColor: KaaryaColors.card, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg },
  successTitle: { fontSize: FontSizes['2xl'], fontWeight: '700', color: KaaryaColors.text, textAlign: 'center', marginBottom: Spacing.sm },
  successSubtitle: { fontSize: FontSizes.sm, color: KaaryaColors.muted, textAlign: 'center', lineHeight: 20, paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  statusCard: { width: '100%', backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg, padding: Spacing.md },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: KaaryaColors.border },
  statusLabel: { fontSize: FontSizes.sm, color: KaaryaColors.muted },
  statusValue: { fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.text },
  rejectionReason: { flex: 1, fontSize: FontSizes.sm, color: KaaryaColors.text, textAlign: 'right', marginLeft: Spacing.sm, lineHeight: 20 },

  /* Shared */
  textMuted: { color: KaaryaColors.muted },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full, alignSelf: 'flex-start' },
  badgeText: { fontSize: FontSizes.xs, fontWeight: '600' },
});
