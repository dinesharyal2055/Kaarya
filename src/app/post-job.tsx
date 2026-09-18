/**
 * Post Job screen — wizard to create a new task posting
 */

import { useRouter, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import MapView, { Marker } from 'react-native-maps';
import { KaaryaColors, Spacing, FontSizes, Shadows, BorderRadius } from '@/constants/theme';
import { CATEGORIES, KATHMANDU_AREAS } from '@/constants/categories';
import { Button, Input } from '@/components/ui';
import { JobDateTimeField } from '@/components/JobDateTimeField';
import { createJob, uploadJobImage } from '@/services/jobs';
import { useAuth } from '@/context/AuthContext';
import { buildScheduledIso, defaultSelection, formatScheduledDate, formatScheduledTime } from '@/lib/jobDateTime';
import type { JobDateTimeResult } from '@/components/JobDateTimeField';
import type { NegotiationMode } from '@/types';

type Step = 'category' | 'details' | 'photos' | 'budget' | 'confirm';

type UploadedImage = {
  uri: string;
  base64: string;
  filename: string;
  uploadedUrl?: string;
};

const UPLOAD_MAX_DIMENSION = 1000;
const UPLOAD_JPEG_QUALITY = 0.6;

async function prepareJobPhoto(asset: ImagePicker.ImagePickerAsset): Promise<UploadedImage> {
  const filename = `job_photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const longestSide = Math.max(asset.width || 0, asset.height || 0);
  const actions: ImageManipulator.Action[] = [];
  if (longestSide > UPLOAD_MAX_DIMENSION) {
    const scale = UPLOAD_MAX_DIMENSION / longestSide;
    actions.push({
      resize: {
        width: Math.max(1, Math.round((asset.width || 0) * scale)),
        height: Math.max(1, Math.round((asset.height || 0) * scale)),
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

export default function PostJobScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, switchRole, refreshUser } = useAuth();
  const [step, setStep] = useState<Step>('category');
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [area, setArea] = useState('');
  const [manualArea, setManualArea] = useState('');
  const [photos, setPhotos] = useState<UploadedImage[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [negotiation, setNegotiation] = useState<NegotiationMode>('negotiable');
  const [loading, setLoading] = useState(false);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [switching, setSwitching] = useState(false);
  const dtResultRef = useRef<JobDateTimeResult | null>(null);
  const [scheduledIso, setScheduledIso] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);

  async function handleSwitchToTaskPoster() {
    Alert.alert(
      t('alerts.switchRole'),
      t('alerts.switchToSeeker'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('alerts.switch'),
          onPress: async () => {
            setSwitching(true);
            try {
              await switchRole('seeker');
              await refreshUser();
            } catch (e: any) {
              Alert.alert(t('common.error'), e.message ?? t('alerts.failedToSwitch'));
            } finally {
              setSwitching(false);
            }
          },
        },
      ]
    );
  }

  function updatePreciseLocation(lat: number, lng: number) {
    setLatitude(lat);
    setLongitude(lng);
    mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 200);
  }

  async function captureLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('postJob.locationDenied'), t('postJob.locationDeniedHint'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLatitude(pos.coords.latitude);
      setLongitude(pos.coords.longitude);
      mapRef.current?.animateToRegion(
        {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        200
      );
      Alert.alert(t('postJob.locationSaved'), t('postJob.locationSavedHint'));
    } catch {
      Alert.alert(t('postJob.locationError'), t('postJob.locationErrorHint'));
    } finally {
      setLocating(false);
    }
  }

  const steps: Step[] = ['category', 'details', 'photos', 'budget', 'confirm'];
  const stepIndex = steps.indexOf(step);

  function next() {
    if (step === 'category' && !category) { Alert.alert(t('postJob.selectCategory'), t('postJob.chooseCategory')); return; }
    if (step === 'details' && (!title.trim() || !description.trim())) { Alert.alert(t('postJob.missingDetails'), t('postJob.fillDetails')); return; }
    if (step === 'details' && !area) { Alert.alert(t('postJob.selectLocation'), t('postJob.chooseArea')); return; }
    if (step === 'details' && (latitude === null || longitude === null)) {
      Alert.alert(t('postJob.locationRequiredTitle'), t('postJob.locationRequiredMessage'));
      return;
    }
    if (step === 'photos') {
      const scheduled = buildScheduledIso(dtResultRef.current?.selection ?? defaultSelection());
      if (scheduled.error) {
        Alert.alert(t('postJob.invalidScheduled'), t(`jobDateTime.${scheduled.error}`));
        return;
      }
    }
    if (step === 'budget' && negotiation === 'open_offers') {
      const n = parseFloat(budgetMin || '');
      if (!budgetMin || isNaN(n) || n < 300) {
        Alert.alert(t('postJob.startingPriceTooLow'), t('postJob.startingPriceMin'));
        return;
      }
    }
    const idx = steps.indexOf(step);
    if (idx < steps.length - 1) setStep(steps[idx + 1]);
  }

  function back() {
    const idx = steps.indexOf(step);
    if (idx > 0) setStep(steps[idx - 1]);
    else router.back();
  }

  const catData = CATEGORIES.find((c) => c.id === category);

  // ─── Image handling ───────────────────────────────────────────────
  async function pickImages() {
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
      allowsMultipleSelection: true,
      selectionLimit: 5 - photos.length,
      allowsEditing: false,
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || result.assets.length === 0) return;

    // Prepare the accepted batch, skipping images already in the list and
    // stopping once the existing 5-photo cap is reached.
    const seenBase64 = new Set(photos.filter((p) => !!p.base64).map((p) => p.base64));
    const additions: UploadedImage[] = [];
    let droppedForLimit = false;
    for (const asset of result.assets) {
      if (photos.length + additions.length >= 5) { droppedForLimit = true; break; }
      const prepared = await prepareJobPhoto(asset);
      if (prepared.base64 && seenBase64.has(prepared.base64)) continue;
      if (prepared.base64) seenBase64.add(prepared.base64);
      additions.push(prepared);
    }
    if (additions.length === 0) return;

    setPhotos((prev) => {
      const have = new Set(prev.filter((p) => !!p.base64).map((p) => p.base64));
      const merged = [...prev];
      for (const prepared of additions) {
        if (prepared.base64 && have.has(prepared.base64)) continue;
        if (prepared.base64) have.add(prepared.base64);
        if (merged.length >= 5) break;
        merged.push(prepared);
      }
      return merged;
    });

    if (droppedForLimit) {
      Alert.alert(t('postJob.limitReached'), t('postJob.photoLimit'));
    }
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
    const prepared = await prepareJobPhoto(asset);
    setPhotos(prev => [...prev, prepared]);
  }

  function removePhoto(index: number) {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  }

  function showImagePicker() {
    Alert.alert(
      t('postJob.addPhoto'),
      t('postJob.chooseSource'),
      [
        { text: t('postJob.takePhoto'), onPress: takePhoto },
        { text: t('postJob.chooseFromLibrary'), onPress: pickImages },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    );
  }

  // ─── Submit ──────────────────────────────────────────────────────
  async function handlePostTask() {
    if (user?.verificationStatus !== 'verified') {
      Alert.alert(
        t('alerts.verificationRequiredTitle'),
        t('alerts.verificationRequiredBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('alerts.goVerify'), onPress: () => router.push('/verification') },
        ]
      );
      return;
    }

    const scheduled = buildScheduledIso(dtResultRef.current?.selection ?? defaultSelection());
    if (scheduled.error) {
      Alert.alert(t('postJob.invalidScheduled'), t(`jobDateTime.${scheduled.error}`));
      return;
    }
    const scheduledIsoValue = scheduled.iso;

    setLoading(true);
    try {
      // Upload each photo first
      const uploadedUrls: string[] = [];
      if (photos.length > 0) {
        setUploadingPhotos(true);
        for (const photo of photos) {
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

      const bMin = budgetMin ? parseFloat(budgetMin) : undefined;
      const bMax = negotiation === 'negotiable'
        ? (budgetMax ? parseFloat(budgetMax) : undefined)
        : negotiation === 'fixed' && bMin
          ? bMin
          : undefined;

      await createJob({
        title: title.trim(),
        description: description.trim(),
        category,
        location: area,
        budgetMin: bMin,
        budgetMax: bMax,
        negotiationMode: negotiation,
        photoUrls: uploadedUrls,
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
        scheduledDate: scheduledIsoValue,
      });

      Alert.alert(t('postJob.successTitle'), t('postJob.successMessage'), [
        { text: t('common.ok'), onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (e: any) {
      setUploadingPhotos(false);
      Alert.alert(t('common.error'), e.message ?? t('postJob.postFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={back} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={KaaryaColors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('postJob.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Progress */}
        {user?.role === 'provider' ? (
          <View style={styles.restrictedWrap}>
            <View style={[styles.restrictedCard, Shadows.sm]}>
              <MaterialCommunityIcons name="shield-lock-outline" size={40} color={KaaryaColors.warning} />
              <Text style={styles.restrictedTitle}>{t('postJob.posterOnlyTitle')}</Text>
              <Text style={styles.restrictedMessage}>{t('postJob.posterOnlyMessage')}</Text>
              <View style={{ marginTop: Spacing.lg, width: '100%' }}>
                <Button
                  title={t('postJob.switchToTaskPoster')}
                  onPress={handleSwitchToTaskPoster}
                  loading={switching}
                  disabled={switching}
                  fullWidth
                />
              </View>
            </View>
          </View>
        ) : (
        <>
        <View style={styles.progress}>
          {steps.map((s, i) => (
            <View key={s} style={[styles.progressDot, i <= stepIndex && styles.progressDotActive]} />
          ))}
        </View>

        {/* Step: Category */}
        {step === 'category' && (
          <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.stepTitle}>{t('postJob.stepCategoryTitle')}</Text>
            <Text style={styles.stepSubtitle}>{t('postJob.stepCategorySubtitle')}</Text>
            <View style={styles.catGrid}>
              {CATEGORIES.map((cat) => (
                <Pressable key={cat.id} style={[styles.catItem, category === cat.id && styles.catItemSelected]} onPress={() => setCategory(cat.id)}>
                  <View style={[styles.catIconWrap, { backgroundColor: cat.color + '20' }]}>
                    <MaterialCommunityIcons name={cat.icon as any} size={28} color={cat.color} />
                  </View>
                  <Text style={[styles.catLabel, category === cat.id && styles.catLabelSelected]}>{cat.name}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}

        {/* Step: Details */}
        {step === 'details' && (
          <ScrollView style={styles.stepContent} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
            <Text style={styles.stepTitle}>{t('postJob.stepDetailsTitle')}</Text>
            <Text style={styles.stepSubtitle}>{t('postJob.stepDetailsSubtitle')}</Text>
            <View style={{ marginTop: Spacing.lg, gap: Spacing.md }}>
              <Input label={t('postJob.taskTitle')} placeholder={t('postJob.taskTitlePlaceholder')} value={title} onChangeText={setTitle} />
              <Input label={t('postJob.description')} placeholder={t('postJob.descriptionPlaceholder')} value={description} onChangeText={setDescription} multiline numberOfLines={4} containerStyle={{ marginBottom: 0 }} />
              <View>
                <Text style={styles.fieldLabel}>{t('postJob.areaLocation')}</Text>
                <View style={styles.areaGrid}>
                  {KATHMANDU_AREAS.map((a) => (
                    <Pressable key={a} style={[styles.areaPill, area === a && styles.areaPillSelected]} onPress={() => { setArea(a); setManualArea(''); }}>
                      <Text style={[styles.areaPillText, area === a && styles.areaPillTextSelected]}>{a}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.orDivider}>
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>{t('postJob.orTypeArea')}</Text>
                  <View style={styles.orLine} />
                </View>
                <Input
                  placeholder={t('postJob.areaPlaceholder')}
                  value={manualArea}
                  onChangeText={(text) => { setManualArea(text); setArea(text); }}
                  containerStyle={{ marginBottom: 0 }}
                />
              </View>

              {/* GPS Location */}
              <View>
                <Text style={styles.fieldLabel}>{t('postJob.preciseLocation')}</Text>
                <Pressable
                  style={[styles.locationBtn, latitude !== null && styles.locationBtnActive]}
                  onPress={captureLocation}
                  disabled={locating}
                >
                  <MaterialCommunityIcons
                    name={latitude !== null ? 'map-marker-check' : 'crosshairs-gps'}
                    size={20}
                    color={latitude !== null ? KaaryaColors.success : KaaryaColors.brand[500]}
                  />
                  <Text style={[styles.locationBtnText, latitude !== null && styles.locationBtnTextActive]}>
                    {locating ? t('postJob.gettingLocation') : latitude !== null ? t('postJob.locationConfirmed') : t('postJob.useCurrentLocation')}
                  </Text>
                </Pressable>
                {latitude !== null && longitude !== null && (
                  <Text style={styles.locationCoords}>
                    {latitude.toFixed(5)}° N, {longitude.toFixed(5)}° E
                  </Text>
                )}
                <Text style={styles.locationHint}>{t('postJob.locationPrivacyNote')}</Text>
                {latitude !== null && longitude !== null && (
                  <View style={styles.preciseMapCard}>
                    <MapView
                      ref={mapRef}
                      style={styles.preciseMap}
                      initialRegion={{
                        latitude,
                        longitude,
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                      }}
                      onPress={(e) => updatePreciseLocation(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
                    >
                      <Marker
                        draggable
                        coordinate={{ latitude, longitude }}
                        onDragEnd={(e) => updatePreciseLocation(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
                      />
                    </MapView>
                    <Text style={styles.locationHint}>{t('postJob.dragPinHint')}</Text>
                  </View>
                )}
              </View>
            </View>
          </ScrollView>
        )}

        {/* Step: Photos */}
        {step === 'photos' && (
          <ScrollView style={styles.stepContent} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
            <Text style={styles.stepTitle}>{t('postJob.stepPhotosTitle')}</Text>
            <Text style={styles.stepSubtitle}>
              {t('postJob.stepPhotosSubtitle')}{' '}
              <Text style={{ fontWeight: '700' }}>{photos.length}/5</Text>
            </Text>

            {/* Photo grid */}
            <View style={styles.photoGrid}>
              {photos.map((photo, index) => (
                <View key={photo.uri} style={styles.photoItem}>
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

            {photos.length === 0 && (
              <View style={styles.photosHint}>
                <MaterialCommunityIcons name="image-multiple-outline" size={32} color={KaaryaColors.brand[300]} />
                <Text style={styles.photosHintText}>
                  {t('postJob.photosHint')}
                </Text>
              </View>
            )}

            <View style={styles.scheduleDivider} />

            {/* Job Date & Time */}
            <View style={[styles.summaryCard, Shadows.sm]}>
              <View style={styles.scheduleHeader}>
                <MaterialCommunityIcons name="calendar-clock" size={20} color={KaaryaColors.brand[500]} />
                <Text style={styles.scheduleTitle}>{t('jobDateTime.sectionTitle')}</Text>
              </View>
              <JobDateTimeField
                onResult={(r) => {
                  dtResultRef.current = r;
                  setScheduledIso(r.iso);
                }}
              />
            </View>
          </ScrollView>
        )}

        {/* Step: Budget */}
        {step === 'budget' && (
          <ScrollView style={styles.stepContent} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
            <Text style={styles.stepTitle}>{t('postJob.stepBudgetTitle')}</Text>
            <View style={{ marginTop: Spacing.lg, gap: Spacing.md }}>
              <Text style={styles.fieldLabel}>{t('postJob.negotiationStyle')}</Text>
              {([
                { value: 'negotiable', label: t('postJob.negotiable'), icon: 'swap-horizontal', desc: t('postJob.negotiableDesc') },
                { value: 'open_offers', label: t('postJob.openOffers'), icon: 'format-list-bulleted', desc: t('postJob.openOffersDesc') },
                { value: 'fixed', label: t('postJob.fixedPrice'), icon: 'lock', desc: t('postJob.fixedPriceDesc') },
              ] as { value: NegotiationMode; label: string; icon: string; desc: string }[]).map((opt) => (
                <Pressable key={opt.value} style={[styles.negCard, Shadows.sm, negotiation === opt.value && styles.negCardSelected]} onPress={() => setNegotiation(opt.value)}>
                  <MaterialCommunityIcons name={opt.icon as any} size={24} color={negotiation === opt.value ? KaaryaColors.brand[500] : KaaryaColors.muted} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.negLabel, negotiation === opt.value && styles.negLabelSelected]}>{opt.label}</Text>
                    <Text style={styles.negDesc}>{opt.desc}</Text>
                  </View>
                  {negotiation === opt.value && <MaterialCommunityIcons name="check-circle" size={20} color={KaaryaColors.brand[500]} />}
                </Pressable>
              ))}

              {negotiation === 'negotiable' && (
                <>
                  <Text style={styles.inlineHint}>{t('postJob.budgetNegotiableHint')}</Text>
                  <View style={styles.budgetRow}>
                    <View style={{ flex: 1 }}>
                      <Input label={t('postJob.minBudget')} placeholder="500" value={budgetMin} onChangeText={setBudgetMin} keyboardType="numeric" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Input label={t('postJob.maxBudget')} placeholder="3000" value={budgetMax} onChangeText={setBudgetMax} keyboardType="numeric" />
                    </View>
                  </View>
                </>
              )}

              {negotiation === 'open_offers' && (
                <>
                  <Text style={styles.inlineHint}>{t('postJob.budgetOpenOffersHint')}</Text>
                  <Text style={styles.inlineExample}>{t('postJob.budgetOpenOffersExample')}</Text>
                  <Input
                    label={t('postJob.startingPrice')}
                    placeholder="1000"
                    value={budgetMin}
                    onChangeText={setBudgetMin}
                    keyboardType="numeric"
                    helper={t('postJob.startingPriceMin')}
                  />
                </>
              )}

              {negotiation === 'fixed' && (
                <>
                  <Text style={styles.inlineHint}>{t('postJob.budgetFixedHint')}</Text>
                  <Input
                    label={t('postJob.fixedPriceLabel')}
                    placeholder="1500"
                    value={budgetMin}
                    onChangeText={setBudgetMin}
                    keyboardType="numeric"
                    leftIcon={<MaterialCommunityIcons name="lock" size={18} color={KaaryaColors.muted} />}
                  />
                </>
              )}
            </View>
          </ScrollView>
        )}

        {/* Step: Confirm */}
        {step === 'confirm' && (
          <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.stepTitle}>{t('postJob.stepConfirmTitle')}</Text>
            <Text style={styles.stepSubtitle}>{t('postJob.stepConfirmSubtitle')}</Text>
            <View style={[styles.summaryCard, Shadows.sm]}>
              {catData && <SummaryRow icon={catData.icon as any} iconColor={catData.color} label={t('postJob.category')} value={catData.name} />}
              <SummaryRow icon="text" iconColor={KaaryaColors.brand[500]} label={t('postJob.title')} value={title} />
              <SummaryRow icon="map-marker" iconColor={KaaryaColors.brand[500]} label={t('postJob.area')} value={area} />
              {photos.length > 0 && <SummaryRow icon="camera" iconColor={KaaryaColors.brand[500]} label={t('postJob.photos')} value={t('postJob.photosAttached', { count: photos.length })} />}
              {scheduledIso && <SummaryRow icon="calendar-clock" iconColor={KaaryaColors.brand[500]} label={t('jobDateTime.sectionTitle')} value={`${formatScheduledDate(scheduledIso)} · ${formatScheduledTime(scheduledIso)}`} />}
              {negotiation === 'negotiable' && budgetMin && budgetMax && <SummaryRow icon="currency-npr" iconColor={KaaryaColors.brand[500]} label={t('postJob.budget')} value={`Rs. ${budgetMin} – ${budgetMax}`} />}
              {negotiation === 'open_offers' && budgetMin && <SummaryRow icon="currency-npr" iconColor={KaaryaColors.brand[500]} label={t('postJob.startingPrice')} value={`Rs. ${budgetMin}`} />}
              {negotiation === 'fixed' && budgetMin && <SummaryRow icon="currency-npr" iconColor={KaaryaColors.brand[500]} label={t('postJob.fixedPriceLabel')} value={`Rs. ${budgetMin}`} />}
              <SummaryRow icon="swap-horizontal" iconColor={KaaryaColors.brand[500]} label={t('postJob.negotiation')} value={negotiation.charAt(0).toUpperCase() + negotiation.slice(1)} />
            </View>
            <Text style={styles.note}>{t('postJob.addressNote')}</Text>
          </ScrollView>
        )}

        {/* CTA */}
        <View style={styles.cta}>
          {step === 'confirm' ? (
            <Button
              title={uploadingPhotos ? t('postJob.uploadingPhotos') : t('postJob.postTask')}
              onPress={handlePostTask}
              loading={loading || uploadingPhotos}
              disabled={loading || uploadingPhotos}
              fullWidth
            />
          ) : (
            <Button title={t('common.continue')} onPress={next} fullWidth />
          )}
        </View>
        </>
        )}
      </SafeAreaView>
    </>
  );
}

function SummaryRow({ icon, iconColor, label, value }: { icon: any; iconColor: string; label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <MaterialCommunityIcons name={icon} size={18} color={iconColor} />
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: KaaryaColors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: KaaryaColors.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: KaaryaColors.text },
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: KaaryaColors.border },
  progressDotActive: { backgroundColor: KaaryaColors.brand[500] },
  restrictedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg },
  restrictedCard: { width: '100%', backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg, padding: Spacing.lg, alignItems: 'center' },
  restrictedTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: KaaryaColors.text, marginTop: Spacing.md, textAlign: 'center' },
  restrictedMessage: { fontSize: FontSizes.sm, color: KaaryaColors.textSecondary, marginTop: 4, textAlign: 'center', lineHeight: 20 },
  stepContent: { flex: 1, paddingHorizontal: Spacing.lg },
  stepTitle: { fontSize: FontSizes['2xl'], fontWeight: '800', color: KaaryaColors.text, marginTop: Spacing.md },
  stepSubtitle: { fontSize: FontSizes.base, color: KaaryaColors.textSecondary, marginTop: 4, marginBottom: Spacing.lg },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  catItem: { width: '31%', backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  catItemSelected: { borderColor: KaaryaColors.brand[500], backgroundColor: KaaryaColors.brand[50] },
  catIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  catLabel: { fontSize: 11, fontWeight: '600', color: KaaryaColors.text, textAlign: 'center' },
  catLabelSelected: { color: KaaryaColors.brand[600] },
  fieldLabel: { fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.text, marginBottom: 8 },
  inlineHint: { fontSize: FontSizes.sm, color: KaaryaColors.textSecondary, lineHeight: 20 },
  inlineExample: { fontSize: FontSizes.xs, color: KaaryaColors.muted, lineHeight: 18 },
  areaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  areaPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: KaaryaColors.card, borderWidth: 1.5, borderColor: KaaryaColors.border },
  areaPillSelected: { borderColor: KaaryaColors.brand[500], backgroundColor: KaaryaColors.brand[50] },
  areaPillText: { fontSize: FontSizes.xs, fontWeight: '500', color: KaaryaColors.textSecondary },
  areaPillTextSelected: { color: KaaryaColors.brand[600], fontWeight: '600' },
  orDivider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: Spacing.md },
  orLine: { flex: 1, height: 1, backgroundColor: KaaryaColors.border },
  orText: { fontSize: FontSizes.xs, color: KaaryaColors.muted },
  locationBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: KaaryaColors.brand[50],
    borderRadius: BorderRadius.md, padding: Spacing.md,
    borderWidth: 1.5, borderColor: KaaryaColors.brand[200],
  },
  locationBtnActive: {
    backgroundColor: KaaryaColors.success + '15',
    borderColor: KaaryaColors.success,
  },
  locationBtnText: { fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.brand[600] },
  locationBtnTextActive: { color: KaaryaColors.success },
  locationCoords: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 4, marginLeft: 30 },
  locationHint: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 4 },
  preciseMapCard: { marginTop: Spacing.md, borderRadius: BorderRadius.lg, overflow: 'hidden' },
  preciseMap: { width: '100%', height: 220 },

  // Photo styles
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  photoItem: { width: '31%', aspectRatio: 1, borderRadius: BorderRadius.md, overflow: 'hidden', position: 'relative' },
  photoThumb: { width: '100%', height: '100%' },
  photoRemove: { position: 'absolute', top: 4, right: 4 },
  photoAdd: {
    width: '31%', aspectRatio: 1, borderRadius: BorderRadius.md,
    borderWidth: 2, borderColor: KaaryaColors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  photoAddText: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 4, fontWeight: '600' },
  photosHint: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    backgroundColor: KaaryaColors.brand[50], borderRadius: BorderRadius.md,
    padding: Spacing.lg, marginTop: Spacing.md,
  },
  photosHintText: { flex: 1, fontSize: FontSizes.sm, color: KaaryaColors.brand[600], lineHeight: 20 },

  scheduleDivider: { height: 1, backgroundColor: KaaryaColors.border, marginVertical: Spacing.lg },
  scheduleHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scheduleTitle: { fontSize: FontSizes.base, fontWeight: '700', color: KaaryaColors.text },

  budgetRow: { flexDirection: 'row', gap: Spacing.md },
  negCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 2, borderColor: 'transparent' },
  negCardSelected: { borderColor: KaaryaColors.brand[500] },
  negLabel: { fontSize: FontSizes.base, fontWeight: '600', color: KaaryaColors.text },
  negLabelSelected: { color: KaaryaColors.brand[600] },
  negDesc: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 2 },
  summaryCard: { backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginTop: Spacing.md },
  summaryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: KaaryaColors.border },
  summaryLabel: { fontSize: FontSizes.sm, color: KaaryaColors.muted, flex: 1 },
  summaryValue: { fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.text, flex: 2, textAlign: 'right' },
  note: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: Spacing.md, textAlign: 'center' },
  cta: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderTopWidth: 1, borderTopColor: KaaryaColors.border },
});
