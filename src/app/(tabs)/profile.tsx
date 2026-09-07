import { useRouter, useFocusEffect } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { KaaryaColors, Spacing, FontSizes, Shadows, BorderRadius } from '@/constants/theme';
import { Avatar, Badge, Button } from '@/components/ui';
import type { UserRole } from '@/types';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, logout, refreshUser, switchRole } = useAuth();
  const { language, setLanguage, languages } = useLanguage();
  const [switching, setSwitching] = useState(false);
  const [showLangSheet, setShowLangSheet] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshUser();
    }, [refreshUser])
  );

  const isSeeker = user?.role === 'seeker';
  const isVerified = user?.verificationStatus === 'verified';
  const currentLang = languages.find(l => l.code === language);

  async function handleRoleSwitch(newRole: UserRole) {
    const title = t('alerts.switchRole');
    const msg = newRole === 'provider'
      ? t('alerts.switchToProvider')
      : t('alerts.switchToSeeker');

    Alert.alert(
      title,
      msg,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('alerts.switch'),
          onPress: async () => {
            setSwitching(true);
            try {
              await switchRole(newRole);
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

  async function handleLanguageSwitch(code: string) {
    setShowLangSheet(false);
    await setLanguage(code);
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
            {user?.name ?? t('profile.guestUser')}
          </Text>
          <Text style={styles.phone} numberOfLines={1}>
            {user?.phone ?? t('profile.noPhone')}
          </Text>
          <View style={styles.badgeRow}>
            <Badge label={isSeeker ? t('profile.taskPoster') : t('profile.serviceProvider')} variant="brand" />
            {isVerified ? (
              <Badge label={t('profile.verified')} variant="success" />
            ) : (
              <Badge label={t('profile.unverified')} variant="warning" />
            )}
          </View>
        </View>

        {/* Role switcher */}
        <View style={[styles.roleSwitchCard, Shadows.sm]}>
          <Text style={styles.roleSwitchLabel}>{t('profile.activeMode')}</Text>
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
                {t('profile.taskPoster')}
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
                {t('profile.serviceProvider')}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.roleSwitchHint}>
            {t('profile.switchModeHint', {
              mode: isSeeker
                ? t('profile.findWorkBidTasks')
                : t('profile.postTasksHireProviders'),
            })}
          </Text>
        </View>

        {/* Stats (Providers only) */}
        {user?.role === 'provider' && (
          <View style={[styles.statsCard, Shadows.sm]}>
            <Stat label={t('review.starLabels.3')} value={user.rating ? user.rating.toFixed(1) : 'New'} icon="star" />
            <View style={styles.statDivider} />
            <Stat label={t('offers.myBids')} value={String(user.reviewCount ?? 0)} icon="message-text" />
            <View style={styles.statDivider} />
            <Stat label={t('jobs.status.completed')} value={`${user.completionRate ?? 0}%`} icon="check-circle" />
          </View>
        )}

        {/* Portfolio link — visible for both roles */}
        {(user?.reviewCount ?? 0) > 0 && (
          <Pressable style={[styles.portfolioBanner, Shadows.sm]} onPress={() => router.push('/portfolio')}>
            <View style={styles.portfolioIconWrap}>
              <MaterialCommunityIcons name="star-circle" size={28} color={KaaryaColors.brand[500]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.portfolioTitle}>{t('portfolio.viewPortfolio')}</Text>
              <Text style={styles.portfolioSub}>
                {user?.rating ? `${user.rating.toFixed(1)} ★ · ${user.reviewCount} ${user.reviewCount === 1 ? t('portfolio.review') : t('portfolio.reviews')}` : t('portfolio.seeReviews')}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={KaaryaColors.muted} />
          </Pressable>
        )}

        {/* Bio */}
        {user?.bio ? (
          <View style={[styles.bioCard, Shadows.sm]}>
            <Text style={styles.bioLabel}>{t('profile.aboutMe')}</Text>
            <Text style={styles.bioText}>{user.bio}</Text>
          </View>
        ) : null}

        {/* Menu Section 1: Account */}
        <Text style={styles.sectionHeader}>{t('profile.accountSecurity')}</Text>
        <View style={[styles.menuCard, Shadows.sm]}>
          <MenuItem
            icon="account-edit-outline"
            title={t('profile.editProfile')}
            subtitle={t('profile.editProfileSub')}
            onPress={() => router.push('/edit-profile')}
          />
          <View style={styles.menuDivider} />
          <MenuItem
            icon="shield-check-outline"
            title={t('profile.verificationTitle')}
            subtitle={isVerified ? t('profile.identityVerified') : t('profile.completeVerification')}
            onPress={() => router.push('/verification')}
            statusBadge={isVerified ? t('profile.verified') : t('profile.unverified')}
            statusVariant={isVerified ? 'success' : 'warning'}
          />
          <View style={styles.menuDivider} />
          <MenuItem
            icon="credit-card-outline"
            title={t('profile.paymentMethods')}
            subtitle={t('profile.paymentMethodsSub')}
            onPress={() => router.push('/payment-methods')}
          />
          <View style={styles.menuDivider} />
          <MenuItem
            icon="bell-outline"
            title={t('profile.notificationsSettings')}
            subtitle={t('profile.notificationsSub')}
            onPress={() => router.push('/notification-settings')}
          />
        </View>

        {/* Menu Section 2: Support & Info */}
        <Text style={styles.sectionHeader}>{t('profile.supportAbout')}</Text>
        <View style={[styles.menuCard, Shadows.sm]}>
          <MenuItem
            icon="translate"
            title={t('language.selectLanguage')}
            subtitle={currentLang?.nativeName ?? 'English'}
            onPress={() => setShowLangSheet(!showLangSheet)}
          />
          {showLangSheet && (
            <View style={styles.langSheet}>
              {languages.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={styles.langOption}
                  onPress={() => handleLanguageSwitch(lang.code)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.langOptionText, language === lang.code && styles.langOptionActive]}>
                    {lang.nativeName}
                  </Text>
                  <Text style={styles.langOptionSub}>{lang.name}</Text>
                  {language === lang.code && (
                    <MaterialCommunityIcons name="check" size={18} color={KaaryaColors.brand[500]} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={styles.menuDivider} />
          <MenuItem
            icon="help-circle-outline"
            title={t('profile.helpSupport')}
            subtitle={t('profile.helpSupportSub')}
            onPress={() => router.push('/help-support')}
          />
          <View style={styles.menuDivider} />
          <MenuItem
            icon="information-outline"
            title={t('profile.aboutKaarya')}
            subtitle={t('profile.aboutKaaryaSub')}
            onPress={() => router.push('/about-kaarya')}
          />
        </View>

        {/* Log Out Button */}
        <View style={styles.logoutWrap}>
          <Button title={t('profile.logOut')} variant="danger" onPress={logout} fullWidth />
        </View>

        <Text style={styles.version}>{t('profile.version', { version: '1.0.0' })}</Text>
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
  portfolioBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: KaaryaColors.brand[50],
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: KaaryaColors.brand[200],
    gap: 12,
  },
  portfolioIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: KaaryaColors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portfolioTitle: {
    fontSize: FontSizes.base,
    fontWeight: '700',
    color: KaaryaColors.brand[700],
  },
  portfolioSub: {
    fontSize: FontSizes.xs,
    color: KaaryaColors.brand[500],
    marginTop: 2,
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
    marginLeft: Spacing.md + 40 + 14,
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
  langSheet: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: 2,
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: 8,
  },
  langOptionText: {
    fontSize: FontSizes.base,
    color: KaaryaColors.text,
    fontWeight: '500',
    flex: 1,
  },
  langOptionActive: {
    color: KaaryaColors.brand[500],
    fontWeight: '700',
  },
  langOptionSub: {
    fontSize: FontSizes.xs,
    color: KaaryaColors.muted,
    marginRight: 8,
  },
});
