import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { Text } from './Text';
import { palette, radius, spacing } from '../theme';

/**
 * ============================================================================
 *  GAME ERROR BOUNDARY
 * ============================================================================
 *
 * A render error inside a game (a WebGL context failure, an R3F object that
 * rejects a prop, a NaN that reached a transform) must never leave the player
 * staring at a blank screen. This boundary catches the throw and shows a
 * readable error card with two exits — retry (remount the surface) and back.
 *
 * Errors are surfaced to the console (never swallowed) and the message is
 * shown verbatim so a real bug is diagnosable from the screen itself.
 */
export class ErrorBoundary extends React.Component<
  {
    children: React.ReactNode;
    /** Context label for the error card. */
    label?: string;
    onRetry?: () => void;
    onBack?: () => void;
  },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Never hide the failure — development needs this in the console.
    console.error('[game] surface crashed:', error, info?.componentStack ?? '');
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={styles.root}>
        <View style={styles.card}>
          <Text variant="micro" color={palette.coral} center>
            {this.props.label ?? 'GAME'} · RENDER ERROR
          </Text>
          <Text variant="heading" center style={{ marginTop: spacing.xs }}>
            This one got away
          </Text>
          <Text variant="caption" muted center style={{ marginTop: spacing.sm }}>
            The game surface hit an error and stopped rendering. Retry, or head
            back to the hub — nothing else is affected.
          </Text>
          <View style={styles.errorBox}>
            <Text variant="micro" color={palette.textFaint} numberOfLines={4}>
              {error.message || String(error)}
            </Text>
          </View>
          <View style={styles.actions}>
            <Button label="Back" variant="secondary" size="sm" onPress={this.props.onBack} style={{ flex: 1 }} />
            <Button label="Retry" size="sm" onPress={this.reset} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.void, padding: spacing.xl },
  card: {
    width: '100%',
    maxWidth: 360,
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
  },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
});
