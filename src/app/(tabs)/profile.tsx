import { useRouter, useFocusEffect } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { KaaryaColors, Spacing, FontSizes, Shadows, BorderRadius } from '@/constants/theme';
import { Avatar, Badge, Button } from '@/components/ui';
import type { UserRole } from '@/types';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, refreshUser, switchRole } = useAuth();
  const [switching, setSwitching] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshUser();
    }, [refreshUser])
  );

  const isSeeker = user?.role === 'seeker';
  const isVerified = user?.verificationStatus === 'verified';

  async function handleRoleSwitch(newRole: UserRole) {
    Alert.alert(
      'Switch Role?',
      `Switch to ${newRole === 'provider' ? 'Service Provider' : 'Task Poster'} mode?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          onPress: async () => {
            setSwitching(true);
            try {
              await switchRole(newRole);
              await refreshUser();
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Failed to switch role');
            } finally {
              setSwitching(false);
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Profile header */}
        <View style={styles.header}>
          <View style={[styles.avatarRing, Shadows.sm]}>
            <Avatar name={user?.name ?? 'User'} size={84} />
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {user?.name ?? 'Guest User'}
          </Text>
          <Text style={styles.phone} numberOfLines={1}>
            {user?.phone ?? 'No phone number'}
          </Text>
          <View style={styles.badgeRow}>
            <Badge label={isSeeker ? 'Task Poster' : 'Service Provider'} variant="brand" />
            {isVerified ? (
              <Badge label="Verified" variant="success" />
            ) : (
              <Badge label="Unverified" variant="warning" />
            )}
          </View>
        </View>

        {/* Role switcher */}
        <View style={[styles.roleSwitchCard, Shadows.sm]}>
          <Text style={styles.roleSwitchLabel}>Active Mode</Text>
          <View style={styles.roleSwitchRow}>
            <TouchableOpacity
              style={[styles.roleBtn, isSeeker && styles.roleBtnActive]}
              onPress={() => !isSeeker && handleRoleSwitch('seeker')}
              disabled={switching || isSeeker}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="lightbulb-outline"
                size={20}
                color={isSeeker ? '#fff' : KaaryaColors.muted}
              />
              <Text style={[styles.roleBtnText, isSeeker && styles.roleBtnTextActive]}>
                Task Poster
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.roleBtn, !isSeeker && styles.roleBtnActive]}
              onPress={() => isSeeker && handleRoleSwitch('provider')}
              disabled={switching || !isSeeker}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="wrench"
                size={20}
                color={!isSeeker ? '#fff' : KaaryaColors.muted}
              />
              <Text style={[styles.roleBtnText, !isSeeker && styles.roleBtnTextActive]}>
                Service Provider
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.roleSwitchHint}>
            Switch mode to {isSeeker ? 'find work and bid on tasks' : 'post tasks and hire providers'}
          </Text>
        </View>

        {/* Stats (Providers only) */}
        {user?.role === 'provider' && (
          <View style={[styles.statsCard, Shadows.sm]}>
            <Stat label="Rating" value={user.rating ? user.rating.toFixed(1) : 'New'} icon="star" />
            <View style={styles.statDivider} />
            <Stat label="Reviews" value={String(user.reviewCount ?? 0)} icon="message-text" />
            <View style={styles.statDivider} />
            <Stat label="Complete" value={`${user.completionRate ?? 0}%`} icon="check-circle" />
          </View>
        )}

        {/* Bio */}
        {user?.bio ? (
          <View style={[styles.bioCard, Shadows.sm]}>
            <Text style={styles.bioLabel}>About Me</Text>
            <Text style={styles.bioText}>{user.bio}</Text>
          </View>
        ) : null}

        {/* Menu Section 1: Account */}
        <Text style={styles.sectionHeader}>ACCOUNT & SECURITY</Text>
        <View style={[styles.menuCard, Shadows.sm]}>
          <MenuItem
            icon="account-edit-outline"
            title="Edit Profile"
            subtitle="Name, bio, and profile photo"
            onPress={() => router.push('/edit-profile')}
          />
          <View style={styles.menuDivider} />
          <MenuItem
            icon="shield-check-outline"
            title="Verification"
            subtitle={isVerified ? 'Identity verified' : 'Complete verification for trust badge'}
            onPress={() => router.push('/verification')}
            statusBadge={isVerified ? 'Verified' : 'Pending'}
            statusVariant={isVerified ? 'success' : 'warning'}
          />
          <View style={styles.menuDivider} />
          <MenuItem
            icon="credit-card-outline"
            title="Payment Methods"
            subtitle="eSewa, Khalti, or Bank transfer"
            onPress={() => router.push('/payment-methods')}
          />
          <View style={styles.menuDivider} />
          <MenuItem
            icon="bell-outline"
            title="Notifications"
            subtitle="Alerts, sounds, and messages"
            onPress={() => router.push('/notification-settings')}
          />
        </View>

        {/* Menu Section 2: Support & Info */}
        <Text style={styles.sectionHeader}>SUPPORT & ABOUT</Text>
        <View style={[styles.menuCard, Shadows.sm]}>
          <MenuItem
            icon="help-circle-outline"
            title="Help & Support"
            subtitle="FAQs, contact support, guides"
            onPress={() => {}}
          />
          <View style={styles.menuDivider} />
          <MenuItem
            icon="information-outline"
            title="About Kaarya"
            subtitle="Terms, privacy policy, and licenses"
            onPress={() => {}}
          />
        </View>

        {/* Log Out Button */}
        <View style={styles.logoutWrap}>
          <Button title="Log Out" variant="danger" onPress={logout} fullWidth />
        </View>

        <Text style={styles.version}>Kaarya v1.0.0 · Nepal</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <View style={styles.stat}>
      <MaterialCommunityIcons name={icon as any} size={20} color={KaaryaColors.brand[500]} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

interface MenuItemProps {
  icon: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  statusBadge?: string;
  statusVariant?: 'brand' | 'success' | 'warning' | 'danger' | 'muted';
}

function MenuItem({ icon, title, subtitle, onPress, statusBadge, statusVariant }: MenuItemProps) {
  return (
    <TouchableOpacity
      style={styles.menuRow}
      onPress={onPress}
      activeOpacity={0.65}
    >
      <View style={styles.menuIconWrap}>
        <MaterialCommunityIcons name={icon as any} size={22} color={KaaryaColors.brand[500]} />
      </View>
      <View style={styles.menuContent}>
        <Text style={styles.menuTitle}>{title}</Text>
        {subtitle ? (
          <Text style={styles.menuSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {statusBadge ? (
        <View style={styles.menuBadgeWrap}>
          <Badge label={statusBadge} variant={statusVariant ?? 'brand'} />
        </View>
      ) : null}
      <MaterialCommunityIcons name="chevron-right" size={22} color={KaaryaColors.muted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: KaaryaColors.background,
  },
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: 110,
  },
  header: {
    alignItems: 'center',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  avatarRing: {
    padding: 3,
    backgroundColor: '#fff',
    borderRadius: 48,
    marginBottom: Spacing.sm,
  },
  name: {
    fontSize: FontSizes['2xl'],
    fontWeight: '800',
    color: KaaryaColors.text,
    textAlign: 'center',
    marginTop: 4,
  },
  phone: {
    fontSize: FontSizes.sm,
    color: KaaryaColors.muted,
    textAlign: 'center',
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: Spacing.sm + 2,
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleSwitchCard: {
    backgroundColor: KaaryaColors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  roleSwitchLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    color: KaaryaColors.muted,
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
  },
  roleSwitchRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  roleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Spacing.sm + 4,
    borderRadius: BorderRadius.md,
    backgroundColor: KaaryaColors.background,
    borderWidth: 1.5,
    borderColor: KaaryaColors.border,
  },
  roleBtnActive: {
    backgroundColor: KaaryaColors.brand[500],
    borderColor: KaaryaColors.brand[500],
  },
  roleBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: KaaryaColors.textSecondary,
  },
  roleBtnTextActive: {
    color: '#fff',
  },
  roleSwitchHint: {
    fontSize: FontSizes.xs,
    color: KaaryaColors.muted,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 16,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: KaaryaColors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: FontSizes.xl,
    fontWeight: '800',
    color: KaaryaColors.text,
  },
  statLabel: {
    fontSize: FontSizes.xs,
    color: KaaryaColors.muted,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: KaaryaColors.border,
  },
  bioCard: {
    backgroundColor: KaaryaColors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  bioLabel: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    color: KaaryaColors.muted,
    letterSpacing: 0.8,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  bioText: {
    fontSize: FontSizes.sm,
    color: KaaryaColors.textSecondary,
    lineHeight: 20,
  },
  sectionHeader: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
    color: KaaryaColors.muted,
    letterSpacing: 1,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs + 2,
    marginLeft: 4,
  },
  menuCard: {
    backgroundColor: KaaryaColors.card,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
  },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: KaaryaColors.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuContent: {
    flex: 1,
    justifyContent: 'center',
  },
  menuTitle: {
    fontSize: FontSizes.base,
    color: KaaryaColors.text,
    fontWeight: '600',
  },
  menuSubtitle: {
    fontSize: FontSizes.xs,
    color: KaaryaColors.muted,
    marginTop: 2,
  },
  menuBadgeWrap: {
    marginRight: 8,
  },
  menuDivider: {
    height: 1,
    backgroundColor: KaaryaColors.border,
    marginLeft: Spacing.md + 40 + 14, // Aligns divider with text start
  },
  logoutWrap: {
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  version: {
    textAlign: 'center',
    fontSize: FontSizes.xs,
    color: KaaryaColors.muted,
    marginTop: Spacing.md,
  },
});
