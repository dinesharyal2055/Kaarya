/**
 * Edit Job screen — allows seekers to edit their open jobs before any bids arrive
 */

import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { KaaryaColors, Spacing, FontSizes, Shadows, BorderRadius } from '@/constants/theme';
import { CATEGORIES, KATHMANDU_AREAS } from '@/constants/categories';
import { Button, Input } from '@/components/ui';
import { updateJob, uploadJobImage } from '@/services/jobs';
import { fetchJob } from '@/services/jobs';
import type { Job, NegotiationMode } from '@/types';

type UploadedImage = {
  uri: string;
  base64: string;
  filename: string;
  uploadedUrl?: string;
};

export default function EditJobScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [job, setJob] = useState<Job | null>(null);

  // Form fields (category is locked after creation)
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [area, setArea] = useState('');
  const [photos, setPhotos] = useState<UploadedImage[]>([]);
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [negotiation, setNegotiation] = useState<NegotiationMode>('negotiable');

  // Load job data on mount
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await fetchJob(id);
        setJob(data);
        setTitle(data.title);
        setDescription(data.description ?? '');
        setArea(data.area ?? '');
        setBudgetMin(data.budgetMin?.toString() ?? '');
        setBudgetMax(data.budgetMax?.toString() ?? '');
        setNegotiation((data.negotiationMode as NegotiationMode) ?? 'negotiable');

        // Load existing photo URLs as local UploadedImage entries
        if (data.photoUrls && data.photoUrls.length > 0) {
          const existing: UploadedImage[] = data.photoUrls.map((url) => ({
            uri: `http://192.168.1.79:5000${url}`,
            base64: '',
            filename: url.split('/').pop() ?? 'photo.jpg',
            uploadedUrl: url,
          }));
          setPhotos(existing);
        }
      } catch (e: any) {
        Alert.alert(t('common.error'), e.message ?? t('editJob.loadFailed'));
        router.back();
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // ─── Image handling ───────────────────────────────────────────────
  async function pickImage() {
    if (photos.length >= 5) {
      Alert.alert(t('postJob.limitReached'), t('postJob.photoLimit'));
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('postJob.permissionTitle'), t('postJob.photoLibraryMessage'));
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
    setPhotos((prev) => [
      ...prev,
      {
        uri: asset.uri,
        base64: asset.base64 ?? '',
        filename: `job_photo_${Date.now()}.jpg`,
      },
    ]);
  }

  async function takePhoto() {
    if (photos.length >= 5) {
      Alert.alert(t('postJob.limitReached'), t('postJob.photoLimit'));
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('postJob.permissionTitle'), t('postJob.cameraMessage'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPhotos((prev) => [
      ...prev,
      {
        uri: asset.uri,
        base64: asset.base64 ?? '',
        filename: `job_photo_${Date.now()}.jpg`,
      },
    ]);
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function showImagePicker() {
    Alert.alert(
      t('postJob.addPhoto'),
      t('postJob.chooseSource'),
      [
        { text: t('postJob.takePhoto'), onPress: takePhoto },
        { text: t('postJob.chooseFromLibrary'), onPress: pickImage },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    );
  }

  // ─── Submit ──────────────────────────────────────────────────────
  async function handleSave() {
    if (!title.trim()) {
      Alert.alert(t('postJob.missingDetails'), t('postJob.fillDetails'));
      return;
    }
    if (!area) {
      Alert.alert(t('postJob.selectLocation'), t('postJob.chooseArea'));
      return;
    }

    setSubmitting(true);
    try {
      // Upload any new photos (skip existing ones that already have uploadedUrl)
      const uploadedUrls: string[] = [];
      const newPhotos = photos.filter((p) => p.uploadedUrl);
      newPhotos.forEach((p) => {
        if (p.uploadedUrl) uploadedUrls.push(p.uploadedUrl);
      });

      if (photos.some((p) => !p.uploadedUrl)) {
        setUploadingPhotos(true);
        for (const photo of photos) {
          if (photo.uploadedUrl) continue;
          try {
            const url = await uploadJobImage({
              uri: photo.uri,
              base64: photo.base64,
              mimeType: 'image/jpeg',
              fileName: photo.filename,
            });
            uploadedUrls.push(url);
          } catch (e) {
            console.warn('Photo upload failed, skipping:', e);
          }
        }
        setUploadingPhotos(false);
      }

      const updated = await updateJob(id, {
        title: title.trim(),
        description: description.trim(),
        location: area,
        budgetMin: budgetMin ? parseFloat(budgetMin) : undefined,
        budgetMax: budgetMax ? parseFloat(budgetMax) : undefined,
        negotiationMode: negotiation,
        photoUrls: uploadedUrls,
      });

      Alert.alert(t('editJob.successTitle'), t('editJob.successMessage'), [
        { text: t('common.ok'), onPress: () => router.replace(`/job/${id}`) },
      ]);
    } catch (e: any) {
      setUploadingPhotos(false);
      const code = (e as any).code;
      if (code === 'BID_EXISTS') {
        Alert.alert(
          t('editJob.bidsExistTitle'),
          t('editJob.bidsExistMessage'),
          [{ text: t('common.ok'), onPress: () => router.back() }]
        );
      } else {
        Alert.alert(t('common.error'), e.message ?? t('editJob.saveFailed'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const catData = job ? CATEGORIES.find((c) => c.id === job.category) : null;
  const catColor = catData?.color ?? KaaryaColors.brand[500];

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerState}>
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={KaaryaColors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('editJob.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Category (locked — shown for context) */}
          {catData && (
            <View style={styles.categoryBanner}>
              <View style={[styles.catIconWrap, { backgroundColor: catColor + '20' }]}>
                <MaterialCommunityIcons name={catData.icon as any} size={20} color={catColor} />
              </View>
              <Text style={styles.catName}>{catData.name}</Text>
              <Text style={styles.catLocked}>{t('editJob.categoryLocked')}</Text>
            </View>
          )}

          {/* Title */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('editJob.taskTitle')}</Text>
            <Input
              placeholder={t('postJob.taskTitlePlaceholder')}
              value={title}
              onChangeText={setTitle}
            />
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('editJob.description')}</Text>
            <Input
              placeholder={t('postJob.descriptionPlaceholder')}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              containerStyle={{ marginBottom: 0 }}
            />
          </View>

          {/* Area */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('editJob.areaLocation')}</Text>
            <View style={styles.areaGrid}>
              {KATHMANDU_AREAS.map((a) => (
                <Pressable
                  key={a}
                  style={[styles.areaPill, area === a && styles.areaPillSelected]}
                  onPress={() => setArea(a)}
                >
                  <Text style={[styles.areaPillText, area === a && styles.areaPillTextSelected]}>
                    {a}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Photos */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('editJob.photos')}</Text>
            <View style={styles.photoGrid}>
              {photos.map((photo, index) => (
                <View key={photo.uri + index} style={styles.photoItem}>
                  <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
                  <Pressable style={styles.photoRemove} onPress={() => removePhoto(index)}>
                    <MaterialCommunityIcons name="close-circle" size={22} color={KaaryaColors.danger} />
                  </Pressable>
                </View>
              ))}
              {photos.length < 5 && (
                <Pressable style={styles.photoAdd} onPress={showImagePicker}>
                  <MaterialCommunityIcons name="camera-plus" size={32} color={KaaryaColors.muted} />
                  <Text style={styles.photoAddText}>{t('postJob.addPhoto')}</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Budget */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('editJob.budget')}</Text>
            <View style={styles.budgetRow}>
              <View style={{ flex: 1 }}>
                <Input
                  label={t('postJob.minBudget')}
                  placeholder="500"
                  value={budgetMin}
                  onChangeText={setBudgetMin}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label={t('postJob.maxBudget')}
                  placeholder="3000"
                  value={budgetMax}
                  onChangeText={setBudgetMax}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>

          {/* Negotiation style */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('editJob.negotiationStyle')}</Text>
            <View style={{ gap: Spacing.sm }}>
              {([
                {
                  value: 'negotiable',
                  label: t('postJob.negotiable'),
                  icon: 'swap-horizontal',
                  desc: t('postJob.negotiableDesc'),
                },
                {
                  value: 'open_offers',
                  label: t('postJob.openOffers'),
                  icon: 'format-list-bulleted',
                  desc: t('postJob.openOffersDesc'),
                },
                {
                  value: 'fixed',
                  label: t('postJob.fixedPrice'),
                  icon: 'lock',
                  desc: t('postJob.fixedPriceDesc'),
                },
              ] as { value: NegotiationMode; label: string; icon: string; desc: string }[]).map(
                (opt) => (
                  <Pressable
                    key={opt.value}
                    style={[
                      styles.negCard,
                      Shadows.sm,
                      negotiation === opt.value && styles.negCardSelected,
                    ]}
                    onPress={() => setNegotiation(opt.value)}
                  >
                    <MaterialCommunityIcons
                      name={opt.icon as any}
                      size={24}
                      color={negotiation === opt.value ? KaaryaColors.brand[500] : KaaryaColors.muted}
                    />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text
                        style={[
                          styles.negLabel,
                          negotiation === opt.value && styles.negLabelSelected,
                        ]}
                      >
                        {opt.label}
                      </Text>
                      <Text style={styles.negDesc}>{opt.desc}</Text>
                    </View>
                    {negotiation === opt.value && (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={20}
                        color={KaaryaColors.brand[500]}
                      />
                    )}
                  </Pressable>
                )
              )}
            </View>
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Save CTA */}
        <View style={styles.cta}>
          <Button
            title={t('editJob.saveChanges')}
            onPress={handleSave}
            loading={submitting || uploadingPhotos}
            disabled={submitting || uploadingPhotos}
            fullWidth
          />
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: KaaryaColors.background },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: FontSizes.base, color: KaaryaColors.muted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: KaaryaColors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: KaaryaColors.text },
  content: { flex: 1, paddingHorizontal: Spacing.lg },
  categoryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: KaaryaColors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    gap: 12,
  },
  catIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  catName: { fontSize: FontSizes.base, fontWeight: '600', color: KaaryaColors.text, flex: 1 },
  catLocked: { fontSize: FontSizes.xs, color: KaaryaColors.muted },
  section: { marginTop: Spacing.lg },
  sectionTitle: { fontSize: FontSizes.sm, fontWeight: '700', color: KaaryaColors.text, marginBottom: 10 },
  areaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  areaPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: KaaryaColors.card,
    borderWidth: 1.5,
    borderColor: KaaryaColors.border,
  },
  areaPillSelected: { borderColor: KaaryaColors.brand[500], backgroundColor: KaaryaColors.brand[50] },
  areaPillText: { fontSize: FontSizes.xs, fontWeight: '500', color: KaaryaColors.textSecondary },
  areaPillTextSelected: { color: KaaryaColors.brand[600], fontWeight: '600' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  photoItem: { width: '31%', aspectRatio: 1, borderRadius: BorderRadius.md, overflow: 'hidden', position: 'relative' },
  photoThumb: { width: '100%', height: '100%' },
  photoRemove: { position: 'absolute', top: 4, right: 4 },
  photoAdd: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: KaaryaColors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAddText: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 4, fontWeight: '600' },
  budgetRow: { flexDirection: 'row', gap: Spacing.md },
  negCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: KaaryaColors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  negCardSelected: { borderColor: KaaryaColors.brand[500] },
  negLabel: { fontSize: FontSizes.base, fontWeight: '600', color: KaaryaColors.text },
  negLabelSelected: { color: KaaryaColors.brand[600] },
  negDesc: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 2 },
  cta: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: KaaryaColors.border,
  },
});
