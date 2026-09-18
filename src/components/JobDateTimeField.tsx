/**
 * JobDate & Time selection — shared by the Post-a-Task wizard (photos step)
 * and the Edit Task screen.
 *
 * The date supports Today / Tomorrow / a specific date, where a specific date
 * can be typed manually (YYYY-MM-DD or DD/MM/YYYY) or chosen from the native
 * calendar. The time is a 12-hour hour:minute entry with AM/PM toggle.
 *
 * The component owns the sub-state and reports the resulting ISO timestamp
 * (Nepal offset +05:45), the selection snapshot and the current validation
 * state to the parent through `onResult`.
 */

import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { KaaryaColors, Spacing, FontSizes, BorderRadius } from '@/constants/theme';
import { Input } from '@/components/ui';
import {
  buildScheduledIso,
  dateToKeyNp,
  formatDateKey,
  nepalMidnightDate,
  parseDateText,
  scheduledIsoToSelection,
  todayKeyNp,
  tomorrowKeyNp,
} from '@/lib/jobDateTime';
import type { JobDateTimeError, JobDateTimeSelection } from '@/lib/jobDateTime';

export interface JobDateTimeResult {
  selection: JobDateTimeSelection;
  iso: string | null;
  errorKey: JobDateTimeError | null;
}

interface Props {
  initial?: string | null;
  onResult?: (result: JobDateTimeResult) => void;
}

function errorMessage(t: (key: string) => string, errorKey: JobDateTimeError | null): string | null {
  if (!errorKey) return null;
  return t(`jobDateTime.${errorKey}`);
}

export function JobDateTimeField({ initial, onResult }: Props) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<JobDateTimeSelection>(() =>
    scheduledIsoToSelection(initial ?? null)
  );
  const [errorKey, setErrorKey] = useState<JobDateTimeError | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);

  function emit(next: JobDateTimeSelection) {
    const built = buildScheduledIso(next);
    setErrorKey(built.error);
    onResult?.({ selection: next, iso: built.iso, errorKey: built.error });
  }

  function update(next: JobDateTimeSelection) {
    setSelection(next);
    emit(next);
  }

  // Report the initial state once so the parent always has a value.
  useEffect(() => {
    const built = buildScheduledIso(selection);
    onResult?.({ selection, iso: built.iso, errorKey: built.error });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setPreset(preset: JobDateTimeSelection['preset']) {
    update({ ...selection, preset });
    if (preset === 'custom') {
      if (Platform.OS === 'android') {
        openAndroidDatePicker();
      } else if (Platform.OS === 'ios') {
        setShowCalendar(true);
      }
    }
  }

  function openAndroidDatePicker() {
    DateTimePickerAndroid.open({
      value: nepalMidnightDate(selection.customDateKey ?? todayKeyNp()),
      mode: 'date',
      minimumDate: nepalMidnightDate(todayKeyNp()),
      onChange: (event, date) => {
        if (event.type !== 'dismissed' && date) {
          const key = dateToKeyNp(date);
          update({ ...selection, preset: 'custom', customDateKey: key, customDateText: key });
        }
      },
    });
  }

  function onManualDateChange(text: string) {
    const parsed = parseDateText(text);
    update({
      ...selection,
      preset: 'custom',
      customDateText: text,
      customDateKey: parsed ?? selection.customDateKey,
    });
  }

  function handleCalendarChange(event: { type: string }, date?: Date) {
    if (Platform.OS === 'ios') setShowCalendar(false);
    if (event.type !== 'dismissed' && date) {
      const key = dateToKeyNp(date);
      update({ ...selection, preset: 'custom', customDateKey: key, customDateText: key });
    }
  }

  const resolvedDateKey =
    selection.preset === 'today'
      ? todayKeyNp()
      : selection.preset === 'tomorrow'
        ? tomorrowKeyNp()
        : selection.preset === 'custom'
          ? (selection.customDateKey ?? parseDateText(selection.customDateText))
          : null;

  const resolvedTime = (() => {
    const hour = parseInt(selection.hourText, 10);
    const minute = parseInt(selection.minuteText || '0', 10);
    if (hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59) {
      return `${selection.hourText}:${selection.minuteText || '00'} ${selection.period}`;
    }
    return null;
  })();

  const inlineError = errorMessage(t, errorKey);

  return (
    <View style={styles.wrap}>
      <Text style={styles.fieldLabel}>{t('jobDateTime.dateLabel')}</Text>
      <View style={styles.presetRow}>
        {([
          { value: 'today', label: t('jobDateTime.today') },
          { value: 'tomorrow', label: t('jobDateTime.tomorrow') },
          { value: 'custom', label: t('jobDateTime.chooseDate') },
        ] as { value: JobDateTimeSelection['preset']; label: string }[]).map((opt) => (
          <Pressable
            key={opt.value}
            style={[styles.presetPill, selection.preset === opt.value && styles.presetPillSelected]}
            onPress={() => setPreset(opt.value)}
          >
            <Text style={[styles.presetPillText, selection.preset === opt.value && styles.presetPillTextSelected]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {selection.preset === 'custom' && (
        <View style={styles.customRow}>
          <View style={{ flex: 1 }}>
            <Input
              placeholder={t('jobDateTime.manualDatePlaceholder')}
              value={selection.customDateText}
              onChangeText={onManualDateChange}
              keyboardType="default"
              autoCapitalize="none"
              containerStyle={{ marginBottom: 0 }}
            />
          </View>
          <Pressable
            style={styles.calendarBtn}
            onPress={() => {
              setSelection({ ...selection, preset: 'custom' });
              if (Platform.OS === 'android') openAndroidDatePicker();
              else setShowCalendar((s) => !s);
            }}
          >
            <MaterialCommunityIcons name="calendar-month" size={20} color={KaaryaColors.brand[600]} />
            <Text style={styles.calendarBtnText}>{t('jobDateTime.pickFromCalendar')}</Text>
          </Pressable>
        </View>
      )}

      {showCalendar && Platform.OS === 'ios' && (
        <DateTimePicker
          value={nepalMidnightDate(selection.customDateKey ?? todayKeyNp())}
          mode="date"
          display="inline"
          minimumDate={nepalMidnightDate(todayKeyNp())}
          onChange={handleCalendarChange}
        />
      )}

      <View style={styles.chosenRow}>
        <MaterialCommunityIcons name="calendar-check" size={16} color={KaaryaColors.brand[500]} />
        <Text style={[styles.chosenText, !resolvedDateKey && styles.chosenTextEmpty]}>
          {resolvedDateKey ? formatDateKey(resolvedDateKey) : t('jobDateTime.noDateSelected')}
        </Text>
      </View>

      <Text style={[styles.fieldLabel, { marginTop: Spacing.sm }]}>{t('jobDateTime.timeLabel')}</Text>
      <View style={styles.timeRow}>
        <View style={styles.timeInputWrap}>
          <Input
            placeholder="HH"
            value={selection.hourText}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9]/g, '').slice(0, 2);
              update({ ...selection, hourText: cleaned });
            }}
            keyboardType="number-pad"
            maxLength={2}
            containerStyle={{ marginBottom: 0 }}
          />
        </View>
        <Text style={styles.timeColon}>:</Text>
        <View style={styles.timeInputWrap}>
          <Input
            placeholder="mm"
            value={selection.minuteText}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9]/g, '').slice(0, 2);
              update({ ...selection, minuteText: cleaned });
            }}
            keyboardType="number-pad"
            maxLength={2}
            containerStyle={{ marginBottom: 0 }}
          />
        </View>
        <View style={styles.periodGroup}>
          {(['AM', 'PM'] as const).map((period) => (
            <Pressable
              key={period}
              style={[styles.periodPill, selection.period === period && styles.periodPillSelected]}
              onPress={() => update({ ...selection, period })}
            >
              <Text style={[styles.periodPillText, selection.period === period && styles.periodPillTextSelected]}>
                {t(`jobDateTime.period${period}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.chosenRow}>
        <MaterialCommunityIcons name="clock-outline" size={16} color={KaaryaColors.brand[500]} />
        <Text style={[styles.chosenText, !resolvedTime && styles.chosenTextEmpty]}>
          {resolvedTime ?? t('jobDateTime.noTimeSet')}
        </Text>
      </View>

      {inlineError && (
        <View style={styles.errorRow}>
          <MaterialCommunityIcons name="alert-circle" size={16} color={KaaryaColors.danger} />
          <Text style={styles.errorText}>{inlineError}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: Spacing.lg },
  fieldLabel: { fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.text, marginBottom: 8 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: KaaryaColors.card,
    borderWidth: 1.5,
    borderColor: KaaryaColors.border,
  },
  presetPillSelected: { borderColor: KaaryaColors.brand[500], backgroundColor: KaaryaColors.brand[50] },
  presetPillText: { fontSize: FontSizes.xs, fontWeight: '500', color: KaaryaColors.textSecondary },
  presetPillTextSelected: { color: KaaryaColors.brand[600], fontWeight: '600' },
  customRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginTop: Spacing.sm },
  calendarBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: KaaryaColors.brand[50],
    borderColor: KaaryaColors.brand[200], borderWidth: 1.5,
    borderRadius: BorderRadius.md, paddingHorizontal: 12, paddingVertical: 12,
  },
  calendarBtnText: { fontSize: FontSizes.xs, fontWeight: '600', color: KaaryaColors.brand[600] },
  chosenRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.sm },
  chosenText: { fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.text },
  chosenTextEmpty: { color: KaaryaColors.muted, fontWeight: '400' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInputWrap: { width: 72 },
  timeColon: { fontSize: FontSizes.lg, fontWeight: '700', color: KaaryaColors.text },
  periodGroup: {
    flexDirection: 'row',
    marginLeft: 'auto',
    backgroundColor: KaaryaColors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: KaaryaColors.border,
    overflow: 'hidden',
  },
  periodPill: { paddingHorizontal: 16, paddingVertical: 10 },
  periodPillSelected: { backgroundColor: KaaryaColors.brand[500] },
  periodPillText: { fontSize: FontSizes.sm, fontWeight: '600', color: KaaryaColors.textSecondary },
  periodPillTextSelected: { color: '#FFFFFF' },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: Spacing.sm },
  errorText: { flex: 1, fontSize: FontSizes.xs, color: KaaryaColors.danger, lineHeight: 18 },
});