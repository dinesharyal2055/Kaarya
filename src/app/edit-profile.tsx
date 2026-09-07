/**
 * Edit Profile screen — update name, bio, avatar
 */
import { useRouter, Stack } from 'expo-router';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { KaaryaColors, Spacing, FontSizes, BorderRadius, Shadows } from '@/constants/theme';
import { Button, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { API_ROOT } from '@/lib/api';

export default function EditProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, updateProfile, refreshUser, uploadAvatar } = useAuth();

  const [name, setName] = useState(user?.name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; bio?: string }>({});

  // Show existing avatar if no local preview is set
  const avatarUri = avatarPreview
    ?? (user?.avatarUrl ? `${API_ROOT}${user.avatarUrl}` : null);

  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('editProfile.permissionTitle'), t('editProfile.photoLibraryMessage'));
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
    await handleAvatarUpload(asset);
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('editProfile.permissionTitle'), t('editProfile.cameraMessage'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await handleAvatarUpload(asset);
  }

  async function handleAvatarUpload(asset: ImagePicker.ImagePickerAsset) {
    if (!asset.base64) {
      Alert.alert(t('common.error'), t('editProfile.readImageError'));
      return;
    }
    setAvatarUploading(true);
    try {
      setAvatarPreview(asset.uri);
      await uploadAvatar({
        uri: asset.uri,
        base64: asset.base64,
        mimeType: asset.mimeType ?? 'image/jpeg',
        fileName: `avatar_${Date.now()}.jpg`,
      });
      await refreshUser();
    } catch (e: any) {
      setAvatarPreview(null);
      Alert.alert(t('editProfile.uploadFailed'), e.message ?? t('editProfile.uploadFailedMessage'));
    } finally {
      setAvatarUploading(false);
    }
  }

  function showImagePicker() {
    Alert.alert(
      t('editProfile.changePhoto'),
      t('editProfile.chooseSource'),
      [
        { text: t('editProfile.takePhoto'), onPress: takePhoto },
        { text: t('editProfile.chooseFromLibrary'), onPress: pickImage },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    );
  }

  function validate() {
    const newErrors: { name?: string; bio?: string } = {};
    if (!name.trim()) {
      newErrors.name = t('editProfile.nameRequired');
    } else if (name.trim().length < 2) {
      newErrors.name = t('editProfile.nameMinChars');
    }
    if (bio.length > 500) {
      newErrors.bio = t('editProfile.bioMaxChars');
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setLoading(true);
    try {
      await updateProfile({ name: name.trim(), bio: bio.trim() });
      await refreshUser();
      Alert.alert(t('common.success'), t('editProfile.profileUpdated'), [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message ?? t('editProfile.updateFailed'));
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
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={KaaryaColors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('editProfile.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            style={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Avatar section */}
            <Pressable style={styles.avatarSection} onPress={showImagePicker}>
              <View style={[styles.avatarRing, Shadows.md]}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                ) : (
                  <View style={[styles.avatarCircle, { backgroundColor: KaaryaColors.brand[500] }]}>
                    <Text style={styles.avatarText}>
                      {name ? name.charAt(0).toUpperCase() : '?'}
                    </Text>
                  </View>
                )}
                <Pressable style={styles.avatarEditBtn} onPress={showImagePicker}>
                  {avatarUploading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialCommunityIcons name="camera" size={14} color="#fff" />
                  )}
                </Pressable>
              </View>
              <Text style={styles.avatarHint}>
                {avatarUploading ? t('common.uploading') : t('editProfile.tapToChange')}
              </Text>
            </Pressable>

            {/* Name */}
            <View style={styles.section}>
              <Input
                label={t('editProfile.fullName')}
                placeholder={t('editProfile.enterName')}
                value={name}
                onChangeText={setName}
                error={errors.name}
                autoCapitalize="words"
                autoCorrect={false}
                leftIcon={
                  <MaterialCommunityIcons name="account-outline" size={20} color={KaaryaColors.muted} />
                }
              />
            </View>

            {/* Bio */}
            <View style={styles.section}>
              <Input
                label={t('editProfile.bio')}
                placeholder={t('editProfile.bioPlaceholder')}
                value={bio}
                onChangeText={setBio}
                error={errors.bio}
                multiline
                numberOfLines={4}
                containerStyle={{ marginBottom: 0 }}
              />
              <Text style={styles.bioCharCount}>{bio.length}/500</Text>
              <Text style={styles.bioHint}>
                {t('editProfile.bioHint')}
              </Text>
            </View>

            {/* Phone (read-only) */}
            <View style={styles.section}>
              <Text style={styles.readOnlyLabel}>{t('editProfile.phoneNumber')}</Text>
              <View style={[styles.readOnlyField, Shadows.sm]}>
                <MaterialCommunityIcons name="phone" size={20} color={KaaryaColors.muted} />
                <Text style={styles.readOnlyText}>{user?.phone ?? '—'}</Text>
                <View style={styles.lockedBadge}>
                  <MaterialCommunityIcons name="lock" size={12} color={KaaryaColors.muted} />
                  <Text style={styles.lockedText}>{t('editProfile.cannotChange')}</Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* CTA */}
          <View style={styles.cta}>
            <Button
              title={t('editProfile.saveChanges')}
              onPress={handleSave}
              loading={loading}
              disabled={loading}
              fullWidth
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: KaaryaColors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: KaaryaColors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '700', color: KaaryaColors.text },
  content: { flex: 1, paddingHorizontal: Spacing.lg },
  avatarSection: { alignItems: 'center', paddingVertical: Spacing.xl, gap: 8 },
  avatarRing: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: KaaryaColors.card,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: KaaryaColors.brand[500],
  },
  avatarCircle: {
    width: 86, height: 86, borderRadius: 43,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImage: {
    width: 86, height: 86, borderRadius: 43,
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: '#fff' },
  avatarEditBtn: {
    position: 'absolute', bottom: 2, right: 2,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: KaaryaColors.brand[500],
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  avatarHint: { fontSize: FontSizes.xs, color: KaaryaColors.muted },
  section: { marginTop: Spacing.lg },
  bioCharCount: { fontSize: FontSizes.xs, color: KaaryaColors.muted, textAlign: 'right', marginTop: 4 },
  bioHint: { fontSize: FontSizes.xs, color: KaaryaColors.muted, marginTop: 4, lineHeight: 18 },
  readOnlyLabel: { fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.text, marginBottom: Spacing.xs },
  readOnlyField: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: KaaryaColors.card, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4,
    borderWidth: 1.5, borderColor: KaaryaColors.border, gap: 10,
  },
  readOnlyText: { flex: 1, fontSize: FontSizes.base, color: KaaryaColors.text },
  lockedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockedText: { fontSize: FontSizes.xs, color: KaaryaColors.muted },
  cta: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderTopWidth: 1, borderTopColor: KaaryaColors.border },
});
