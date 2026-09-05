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
import { KaaryaColors, Spacing, FontSizes, BorderRadius, Shadows } from '@/constants/theme';
import { Button, Badge } from '@/components/ui';
import { verificationApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { VerificationRequest } from '@/types';

type Tier = {
  id: number;
  label: string;
  subtitle: string;
  description: string;
  icon: string;
  badge: string;
  active: boolean;
  color: string;
};

const TIERS: Tier[] = [
  {
    id: 1,
    label: 'Nagarik App',
    subtitle: 'Government ID (Instant)',
    description: 'Verify instantly using Nepal\'s Nagarik App OAuth. Highest trust level.',
    icon: 'card-account-details',
    badge: 'Coming Soon',
    active: false,
    color: KaaryaColors.brand[500],
  },
  {
    id: 2,
    label: 'eSewa / Khalti',
    subtitle: 'Payment KYC (Instant)',
    description: 'Verify using your eSewa or Khalti KYC. Fast and trusted.',
    icon: 'wallet',
    badge: 'Coming Soon',
    active: false,
    color: KaaryaColors.brand[500],
  },
  {
    id: 3,
    label: 'Manual Review',
    subtitle: 'Citizenship Documents',
    description: 'Upload your citizenship card photos and a selfie. Reviewed within 12 hours.',
    icon: 'shield-account',
    badge: 'Available Now',
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

export default function VerificationScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { refreshUser } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1); // 4 = success

  // Dynamic header: step 1 back button shows "Profile", steps 2-3 show "Back"
  useLayoutEffect(() => {
    navigation.setOptions({
      headerBackTitle: step === 1 ? 'Profile' : 'Back',
    });
  }, [step, navigation]);
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [existingRequest, setExistingRequest] = useState<VerificationRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Document uploads
  const [selfie, setSelfie] = useState<UploadedImage | null>(null);
  const [citizenshipFront, setCitizenshipFront] = useState<UploadedImage | null>(null);
  const [citizenshipBack, setCitizenshipBack] = useState<UploadedImage | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    setLoading(true);
    try {
      const result = await verificationApi.getStatus();
      if (result.request) {
        setExistingRequest(result.request);
        if (result.request.status === 'pending') {
          setStep(4); // show success/pending screen
        } else if (result.request.status === 'approved') {
          setStep(4);
        } else {
          // rejected or more_info_needed — let them re-submit
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
      Alert.alert('Permission needed', 'Please grant photo library access to upload documents.');
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
    const uri = asset.uri;
    const base64 = asset.base64 ?? '';
    const filename = `${type}_${Date.now()}`;

    const uploaded: UploadedImage = { uri, base64, filename };

    if (type === 'selfie') setSelfie(uploaded);
    else if (type === 'front') setCitizenshipFront(uploaded);
    else setCitizenshipBack(uploaded);
  }

  async function takePhoto(type: 'selfie' | 'front' | 'back') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please grant camera access to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const uri = asset.uri;
    const base64 = asset.base64 ?? '';
    const filename = `${type}_${Date.now()}`;

    const uploaded: UploadedImage = { uri, base64, filename };

    if (type === 'selfie') setSelfie(uploaded);
    else if (type === 'front') setCitizenshipFront(uploaded);
    else setCitizenshipBack(uploaded);
  }

  function showImagePicker(type: 'selfie' | 'front' | 'back') {
    Alert.alert(
      'Add Photo',
      'Choose a source',
      [
        { text: 'Take Photo', onPress: () => takePhoto(type) },
        { text: 'Choose from Library', onPress: () => pickImage(type) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  function removeImage(type: 'selfie' | 'front' | 'back') {
    if (type === 'selfie') setSelfie(null);
    else if (type === 'front') setCitizenshipFront(null);
    else setCitizenshipBack(null);
  }

  async function handleSubmit() {
    if (!selectedTier || !selfie || !citizenshipFront || !citizenshipBack) return;

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
      const docType = 'citizenship_card';
      const request = await verificationApi.submit({
        level: selectedTier.id,
        documentType: docType,
        documents: uploadedUrls,
        notes: `Selfie: ${uploadedUrls[0] ?? 'N/A'}`,
      });

      // Update local user state
      await refreshUser?.();

      setExistingRequest(request);
      setStep(4);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Submission failed. Please try again.';
      Alert.alert('Verification Error', message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
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
                {s === 1 ? 'Tier' : s === 2 ? 'Documents' : 'Review'}
              </Text>
            </View>
          ))}
        </View>

        {/* Step 1: Tier Selection */}
        {step === 1 && (
          <View>
            <Text style={styles.stepTitle}>Choose Verification Method</Text>
            <Text style={styles.stepSubtitle}>
              Select a verification level. Higher tiers offer more trust badges.
            </Text>

            {TIERS.map((tier) => (
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
                    <Text style={[styles.tierLabel, !tier.active && styles.textMuted]}>{tier.label}</Text>
                    <Badge
                      label={tier.badge}
                      variant={tier.active ? 'success' : 'muted'}
                    />
                  </View>
                  <Text style={[styles.tierSubtitle, !tier.active && styles.textMuted]}>{tier.subtitle}</Text>
                  <Text style={styles.tierDescription}>{tier.description}</Text>
                </View>
                {selectedTier?.id === tier.id && tier.active && (
                  <MaterialCommunityIcons name="check-circle" size={22} color={KaaryaColors.success} />
                )}
              </Pressable>
            ))}

            <Button
              title="Continue"
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
            <Text style={styles.stepTitle}>Upload Documents</Text>
            <Text style={styles.stepSubtitle}>
              We'll use these to verify your identity. All documents are encrypted and stored securely.
            </Text>

            <Text style={styles.sectionLabel}>Required Documents</Text>

            {/* Selfie */}
            <DocumentUploadCard
              title="Selfie Photo"
              description="A clear photo of yourself"
              image={selfie}
              onPress={() => showImagePicker('selfie')}
              onRemove={() => removeImage('selfie')}
              required
            />

            {/* Citizenship Front */}
            <DocumentUploadCard
              title="Citizenship Card (Front)"
              description="Front side of your Nepali citizenship card"
              image={citizenshipFront}
              onPress={() => showImagePicker('front')}
              onRemove={() => removeImage('front')}
              required
            />

            {/* Citizenship Back */}
            <DocumentUploadCard
              title="Citizenship Card (Back)"
              description="Back side of your Nepali citizenship card"
              image={citizenshipBack}
              onPress={() => showImagePicker('back')}
              onRemove={() => removeImage('back')}
              required
            />

            <View style={styles.buttonRow}>
              <Button title="Back" variant="ghost" onPress={() => setStep(1)} style={{ flex: 1, marginRight: Spacing.sm }} />
              <Button
                title="Review"
                onPress={() => setStep(3)}
                disabled={!selfie || !citizenshipFront || !citizenshipBack}
                style={{ flex: 1, marginLeft: Spacing.sm }}
              />
            </View>
          </View>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <View>
            <Text style={styles.stepTitle}>Review & Submit</Text>
            <Text style={styles.stepSubtitle}>
              Please confirm the details below before submitting for review.
            </Text>

            <View style={[styles.reviewCard, Shadows.sm]}>
              <ReviewRow label="Verification Tier" value={selectedTier?.label ?? ''} />
              <ReviewRow label="Selfie" value={selfie ? 'Uploaded ✓' : 'Missing ✗'} valueColor={selfie ? KaaryaColors.success : KaaryaColors.danger} />
              <ReviewRow label="Citizenship (Front)" value={citizenshipFront ? 'Uploaded ✓' : 'Missing ✗'} valueColor={citizenshipFront ? KaaryaColors.success : KaaryaColors.danger} />
              <ReviewRow label="Citizenship (Back)" value={citizenshipBack ? 'Uploaded ✓' : 'Missing ✗'} valueColor={citizenshipBack ? KaaryaColors.success : KaaryaColors.danger} />
            </View>

            <View style={styles.disclaimer}>
              <MaterialCommunityIcons name="shield-check" size={18} color={KaaryaColors.muted} />
              <Text style={styles.disclaimerText}>
                By submitting, you confirm that all documents belong to you and are authentic.
                Kaarya will review your submission within 12 hours.
              </Text>
            </View>

            <View style={styles.buttonRow}>
              <Button title="Back" variant="ghost" onPress={() => setStep(2)} style={{ flex: 1, marginRight: Spacing.sm }} />
              <Button
                title="Submit for Review"
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
              {existingRequest?.status === 'approved' ? 'Verification Approved!' : 'Submission Received'}
            </Text>
            <Text style={styles.successSubtitle}>
              {existingRequest?.status === 'approved'
                ? 'Your account is now verified. Enjoy full access to Kaarya!'
                : 'We\'ve received your documents. Our team will review them within 12 hours. You\'ll be notified once the review is complete.'}
            </Text>

            {existingRequest && (
              <View style={[styles.statusCard, Shadows.sm]}>
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>Status</Text>
                  <Badge
                    label={existingRequest.status === 'pending' ? 'Under Review' : existingRequest.status === 'approved' ? 'Approved' : existingRequest.status === 'rejected' ? 'Rejected' : 'More Info Needed'}
                    variant={existingRequest.status === 'pending' ? 'warning' : existingRequest.status === 'approved' ? 'success' : 'danger'}
                  />
                </View>
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>Submitted</Text>
                  <Text style={styles.statusValue}>
                    {new Date(existingRequest.createdAt).toLocaleDateString('en-NP', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </Text>
                </View>
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>Tier</Text>
                  <Text style={styles.statusValue}>
                    {TIERS.find(t => t.id === existingRequest.level)?.label ?? `Tier ${existingRequest.level}`}
                  </Text>
                </View>
              </View>
            )}

            <Button title="Back to Profile" onPress={async () => { await refreshUser(); router.back(); }} fullWidth style={{ marginTop: Spacing.lg }} />
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
}: {
  title: string;
  description: string;
  image: UploadedImage | null;
  onPress: () => void;
  onRemove: () => void;
  required: boolean;
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
          <Text style={styles.uploadPlaceholderText}>Tap to add photo</Text>
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

  /* Shared */
  textMuted: { color: KaaryaColors.muted },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full, alignSelf: 'flex-start' },
  badgeText: { fontSize: FontSizes.xs, fontWeight: '600' },
});
