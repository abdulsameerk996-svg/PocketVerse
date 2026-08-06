import React, { memo, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { gradients, palette, spacing, type Gradient } from '../theme/tokens';
import { Starfield } from '../fx/Starfield';

export type ScreenProps = {
  children: ReactNode;
  /** Background gradient; defaults to the hub's deep violet-black. */
  gradient?: Gradient;
  /** Adds the ambient drifting starfield behind content. */
  ambient?: boolean;
  /** Apply top safe-area padding (off for screens with their own header). */
  edges?: { top?: boolean; bottom?: boolean };
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** Extra bottom padding to clear the floating tab bar. */
  tabBarPadding?: boolean;
};

export const TAB_BAR_HEIGHT = 66;

/**
 * Every screen's root. Owns the background treatment so no screen invents its
 * own — which is how "one interconnected world" survives contact with 15 files.
 */
export const Screen = memo(function Screen({
  children,
  gradient = gradients.hub,
  ambient = true,
  edges,
  style,
  contentStyle,
  tabBarPadding,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const top = edges?.top === false ? 0 : insets.top;
  const bottom = edges?.bottom === false ? 0 : insets.bottom;

  return (
    <View style={[styles.root, style]}>
      <LinearGradient colors={gradient} style={StyleSheet.absoluteFill} />
      {ambient ? <Starfield /> : null}
      <View
        style={[
          styles.content,
          {
            paddingTop: top,
            paddingBottom: bottom + (tabBarPadding ? TAB_BAR_HEIGHT + spacing.lg : 0),
          },
          contentStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },
  content: { flex: 1 },
});
