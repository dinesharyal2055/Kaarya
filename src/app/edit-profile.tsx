/**
 * Edit Profile screen — update name, bio, avatar
 */
import { useRouter, Stack } from 'expo-router';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { KaaryaColors, Spacing, FontSizes, BorderRadius, Shadows } from '@/constants/theme';
import { Button, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, updateProfile, refreshUser, uploadAvatar } = useAuth();

  const [name, setName] = useState(user?.name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; bio?: string }>({});

  const BASE_URL = 'http://192.168.1.79:5000';

  // Show existing avatar if no local preview is set
  const avatarUri = avatarPreview
    ?? (user?.avatarUrl ? `${BASE_URL}${user.avatarUrl}` : null);

  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please grant photo library access to change your profile photo.');
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
      Alert.alert('Permission needed', 'Please grant camera access to take a profile photo.');
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
      Alert.alert('Error', 'Could not read the selected image. Please try again.');
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
      Alert.alert('Upload failed', e.message ?? 'Could not upload your profile photo. Please try again.');
    } finally {
      setAvatarUploading(false);
    }
  }

  function showImagePicker() {
    Alert.alert(
      'Change Profile Photo',
      'Choose a source',
      [
        { text: 'Take Photo', onPress: takePhoto },
        { text: 'Choose from Library', onPress: pickImage },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  function validate() {
    const newErrors: { name?: string; bio?: string } = {};
    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }
    if (bio.length > 500) {
      newErrors.bio = 'Bio must be 500 characters or less';
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
      Alert.alert('Success', 'Profile updated successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to update profile. Please try again.');
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
          <Text style={styles.headerTitle}>Edit Profile</Text>
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
                {avatarUploading ? 'Uploading…' : 'Tap to change photo'}
              </Text>
            </Pressable>

            {/* Name */}
            <View style={styles.section}>
              <Input
                label="Full Name"
                placeholder="Enter your name"
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
                label="Bio"
                placeholder="Tell providers/seekers a bit about yourself..."
                value={bio}
                onChangeText={setBio}
                error={errors.bio}
                multiline
                numberOfLines={4}
                containerStyle={{ marginBottom: 0 }}
              />
              <Text style={styles.bioCharCount}>{bio.length}/500</Text>
              <Text style={styles.bioHint}>
                A good bio helps build trust. Mention your experience, skills, or what you're looking for.
              </Text>
            </View>

            {/* Phone (read-only) */}
            <View style={styles.section}>
              <Text style={styles.readOnlyLabel}>Phone Number</Text>
              <View style={[styles.readOnlyField, Shadows.sm]}>
                <MaterialCommunityIcons name="phone" size={20} color={KaaryaColors.muted} />
                <Text style={styles.readOnlyText}>{user?.phone ?? '—'}</Text>
                <View style={styles.lockedBadge}>
                  <MaterialCommunityIcons name="lock" size={12} color={KaaryaColors.muted} />
                  <Text style={styles.lockedText}>Cannot change</Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* CTA */}
          <View style={styles.cta}>
            <Button
              title="Save Changes"
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
