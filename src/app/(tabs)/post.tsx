import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { KaaryaColors, Spacing, FontSizes, Shadows, BorderRadius } from '@/constants/theme';
import { Button } from '@/components/ui';

export default function PostScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isProvider = user?.role === 'provider';

  if (isProvider) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.screenTitle}>Find Work</Text>
        </View>
        <View style={styles.content}>
          <MaterialCommunityIcons name="briefcase-outline" size={64} color={KaaryaColors.muted} />
          <Text style={styles.title}>Browse & Bid</Text>
          <Text style={styles.subtitle}>Browse available tasks and submit your best offer</Text>

          <View style={{ marginTop: Spacing.xl, width: '100%', gap: Spacing.sm }}>
            <Button title="Browse Available Tasks" onPress={() => router.push('/(tabs)/browse')} fullWidth />
            <Button
              title="My Bids"
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
        <Text style={styles.screenTitle}>Manage Tasks</Text>
      </View>
      <View style={styles.content}>
        <MaterialCommunityIcons name="clipboard-plus-outline" size={80} color={KaaryaColors.brand[200]} />
        <Text style={styles.title}>What do you need help with?</Text>
        <Text style={styles.subtitle}>Post a task and receive offers from verified providers in your area</Text>

        <View style={{ marginTop: Spacing.xl, width: '100%', gap: Spacing.sm }}>
          <Button title="Post a Task" onPress={() => router.push('/post-job')} fullWidth />
          <Button
            title="Received Offers"
            variant="secondary"
            onPress={() => router.push('/offers')}
            fullWidth
          />
          <Button title="Browse Services" variant="ghost" onPress={() => router.push('/(tabs)/browse')} fullWidth />
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
