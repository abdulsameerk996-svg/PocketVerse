import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { Text } from './Text';
import { palette, radius, spacing } from '../theme';

/**
 * ============================================================================
 *  GAME ERROR BOUNDARY — robust, recovery-oriented
 * ============================================================================
 *
 * Captures:
 * - error message
 * - component/game label
 * - stack
 * - browser/platform (Platform.OS, userAgent if web)
 * - renderer state (via console, but we surface what we can)
 *
 * Recovery:
 * - renderer init protection (in GameCanvas)
 * - safe camera/material/geometry defaults (in Stage / safety layer)
 * - cleanup on unmount (R3F disposes)
 * - retry button (remounts children)
 * - restart scene button (same as retry but explicit)
 * - fallback visible scene (simple plane+mesh via FallbackScene can be rendered by caller,
 *   but this boundary itself guarantees a View is visible, never blank)
 *
 * Production shows:
 *   GAME COULD NOT START
 *   Restart Game
 *   Return to PocketVerse
 * Dev adds stack + platform + hint.
 */
export class ErrorBoundary extends React.Component<
  {
    children: React.ReactNode;
    label?: string;
    onRetry?: () => void;
    onBack?: () => void;
    /** Optional fallback to render when error occurs (e.g., <FallbackScene />) */
    fallback3D?: React.ReactNode;
  },
  { error: Error | null; info: React.ErrorInfo | null; showFallback: boolean }
> {
  state = { error: null as Error | null, info: null as React.ErrorInfo | null, showFallback: false };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ info });
    const platform = Platform.OS;
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'no-navigator';
    const mem = (performance as any)?.memory ? ` jsHeap ${(performance as any).memory.usedJSHeapSize / 1048576 | 0}MB` : '';
    console.error(
      `[game] surface crashed: label=${this.props.label ?? 'unknown'} platform=${platform} ua=${ua}${mem}`,
      error,
      info?.componentStack ?? '',
    );
  }

  reset = () => {
    this.setState({ error: null, info: null, showFallback: false });
    this.props.onRetry?.();
  };

  toggleFallback = () => {
    this.setState(s => ({ showFallback: !s.showFallback }));
  };

  render() {
    const { error, info, showFallback } = this.state;
    if (!error) return this.props.children;

    const platform = Platform.OS;
    const isWeb = platform === 'web';
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : 'native';

    // If caller provided a 3D fallback and user asked for it, render it behind the error card
    // so that even if 3D fails again, the View card is still visible.
    return (
      <View style={styles.root}>
        {showFallback && this.props.fallback3D ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {this.props.fallback3D}
          </View>
        ) : null}
        <View style={styles.card}>
          <Text variant="micro" color={palette.coral} center>
            {this.props.label ?? 'GAME'} · RENDER ERROR
          </Text>
          <Text variant="heading" center style={{ marginTop: spacing.xs }}>
            GAME COULD NOT START
          </Text>
          <Text variant="caption" muted center style={{ marginTop: spacing.sm }}>
            The game surface hit an error and stopped rendering. Your progress is safe — nothing else is affected.
            {isWeb ? ' If you see this repeatedly, try reloading the page.' : ''}
          </Text>

          <View style={styles.errorBox}>
            <Text variant="micro" color={palette.textFaint} numberOfLines={2}>
              {error.message || String(error)}
            </Text>
            <Text variant="micro" color={palette.textFaint} style={styles.errorStack}>
              Platform: {platform} · {ua}
            </Text>
            {__DEV__ && error.stack ? (
              <Text variant="micro" color={palette.textFaint} numberOfLines={12} style={styles.errorStack}>
                {error.stack.split('\n').slice(0, 12).join('\n')}
              </Text>
            ) : null}
            {__DEV__ && info?.componentStack ? (
              <Text variant="micro" color={palette.textFaint} numberOfLines={10} style={styles.errorStack}>
                {info.componentStack.split('\n').slice(0, 10).join('\n')}
              </Text>
            ) : null}
            <Text variant="micro" color={palette.textFaint} style={styles.errorStack}>
              Recovery: retry remounts the surface, fallback shows guaranteed plane+mesh. If fallback also fails, Canvas/renderer itself failed — check GameCanvas onCreated guards, parent dimensions, fog near/far, camera finite, material validity, zero-scale.
            </Text>
          </View>

          <View style={styles.actions}>
            <Button label="Return to PocketVerse" variant="secondary" size="sm" onPress={this.props.onBack} style={{ flex: 1 }} />
            <Button label="Restart Game" size="sm" onPress={this.reset} style={{ flex: 1 }} />
          </View>
          <View style={[styles.actions, { marginTop: spacing.sm }]}>
            <Button label={showFallback ? 'Hide Fallback' : 'Show Fallback Arena'} variant="secondary" size="sm" onPress={this.toggleFallback} full />
          </View>
          <Text variant="caption" faint center style={{ marginTop: spacing.sm }}>
            Safe defaults: camera [0,13.5,11] finite, lights ambient 0.55 + hemi + directional, materials MeshStandardMaterial, geometries Box/Sphere/Plane, no textures, cleanup on unmount, frameloop never when paused.
          </Text>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.void, padding: spacing.xl },
  card: {
    width: '100%',
    maxWidth: 380,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.35)',
    gap: spacing.xs,
  },
  errorBox: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: palette.hairline,
    gap: spacing.xs,
  },
  errorStack: { marginTop: spacing.xs, borderTopWidth: 1, borderTopColor: palette.hairline, paddingTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
});
