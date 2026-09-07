import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { KaaryaColors, Spacing, FontSizes, Shadows, BorderRadius } from '@/constants/theme';
import { Button } from '@/components/ui';

export default function PostScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const isProvider = user?.role === 'provider';
  const isVerified = user?.verificationStatus === 'verified';

  if (isProvider) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.screenTitle}>{t('post.findWork')}</Text>
        </View>
        <View style={styles.content}>
          <MaterialCommunityIcons name="briefcase-outline" size={64} color={KaaryaColors.muted} />
          <Text style={styles.title}>{t('post.browseBid')}</Text>
          <Text style={styles.subtitle}>{t('post.browseBidSub')}</Text>

          <View style={{ marginTop: Spacing.xl, width: '100%', gap: Spacing.sm }}>
            <Button title={t('post.browseTasks')} onPress={() => router.push('/(tabs)/browse')} fullWidth />
            <Button
              title={t('post.myBids')}
              variant="secondary"
              onPress={() => router.push('/offers')}
              fullWidth
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.screenTitle}>{t('post.manageTasks')}</Text>
      </View>
      <View style={styles.content}>
        <MaterialCommunityIcons name="clipboard-plus-outline" size={80} color={KaaryaColors.brand[200]} />
        <Text style={styles.title}>{t('post.whatDoYouNeed')}</Text>
        <Text style={styles.subtitle}>{t('post.postTaskSub')}</Text>

        <View style={{ marginTop: Spacing.xl, width: '100%', gap: Spacing.sm }}>
          <Button
            title={t('post.postTask')}
            onPress={() => {
              if (!isVerified) {
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
              router.push('/post-job');
            }}
            fullWidth
          />
          <Button
            title={t('post.receivedOffers')}
            variant="secondary"
            onPress={() => router.push('/offers')}
            fullWidth
          />
          <Button title={t('post.browseServices')} variant="ghost" onPress={() => router.push('/(tabs)/browse')} fullWidth />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: KaaryaColors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
  screenTitle: { fontSize: FontSizes['2xl'], fontWeight: '800', color: KaaryaColors.text },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  title: { fontSize: FontSizes.xl, fontWeight: '700', color: KaaryaColors.text, textAlign: 'center', marginTop: Spacing.md },
  subtitle: { fontSize: FontSizes.base, color: KaaryaColors.textSecondary, textAlign: 'center', marginTop: 8, paddingHorizontal: Spacing.lg },
});
