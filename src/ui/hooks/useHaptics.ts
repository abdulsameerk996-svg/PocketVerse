import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { useCallback } from 'react';
import { getSettings } from '@/core/state/settingsStore';

/**
 * Central haptics façade.
 *
 * Every call is settings-aware and no-ops on web, so call sites never need to
 * guard. Games should use the semantic verbs (`hit`, `fail`, `collect`) rather
 * than raw impact styles, so the feel can be retuned globally later.
 */

const enabled = () => Platform.OS !== 'web' && getSettings().haptics;

const safe = (fn: () => Promise<void>) => {
  if (!enabled()) return;
  fn().catch(() => {
    /* haptics are best-effort */
  });
};

export const haptics = {
  /** UI tap. */
  tap: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Meaningful press — start game, confirm purchase. */
  press: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Impact — crash, hit, land. */
  heavy: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  /** Rigid tick used for combo/rhythm hits. */
  tick: () =>
    safe(() =>
      Haptics.impactAsync(
        Platform.OS === 'ios' ? Haptics.ImpactFeedbackStyle.Rigid : Haptics.ImpactFeedbackStyle.Light,
      ),
    ),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warn: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  fail: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  select: () => safe(() => Haptics.selectionAsync()),
  /** Collect pickup — light and frequent, deliberately the cheapest. */
  collect: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)),
};

export function useHaptics() {
  return useCallback(() => haptics, [])();
}
