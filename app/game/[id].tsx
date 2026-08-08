import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';

import { getGame } from '@/core/registry';
import { useBackGuard } from '@/core/hooks/useBackGuard';
import type { GameSurfaceProps } from '@/core/registry';
import type { MetricDelta, RewardBundle, SessionResult } from '@/core/types';
import { usePlayerStore } from '@/core/state/playerStore';
import { useProgressStore } from '@/core/state/progressStore';
import { useGameSaveStore } from '@/core/state/gameSaveStore';
import { useUiStore } from '@/core/state/uiStore';
import { canStart, finishSession, sessionModifiers, startSession, type FinishedSession } from '@/core/services/session';
import { grantReward } from '@/core/services/rewards';
import { flush } from '@/core/save/saveService';
import {
  AvatarView,
  Button,
  Card,
  ErrorBoundary,
  PauseSheet,
  PressableScale,
  ResultsSheet,
  SpriteView,
  Text,
  gradients,
  haptics,
  palette,
  radius,
  spacing,
  spriteForGame,
  useResponsive,
} from '@/ui';

type Stage = 'gate' | 'playing' | 'results';

/**
 * ============================================================================
 *  THE GAME HOST
 * ============================================================================
 *
 * One screen hosts all ten games. It owns everything that is *not* gameplay:
 *
 *   · resolving the module from the registry by route param
 *   · the pre-run gate (level lock, energy cost, best score, cosmetics preview)
 *   · spending energy and starting the session
 *   · the `track` / `grant` / `setSave` channels handed to the surface
 *   · pause, hardware back, results, replay
 *
 * A game module therefore contains gameplay and nothing else, and any two games
 * behave identically around the edges — which is what makes ten modules feel
 * like one product rather than a launcher.
 */
export default function GameHost() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { s: sc } = useResponsive();

  const module = getGame(id ?? '');
  const player = usePlayerStore((s) => s.player);
  const setInGame = useUiStore((s) => s.setInGame);
  const track = useProgressStore((s) => s.track);
  const saves = useGameSaveStore((s) => s.saves);
  const setGameSave = useGameSaveStore((s) => s.set);

  const ambient = module?.meta.kind === 'ambient';
  const [stage, setStage] = useState<Stage>(ambient ? 'playing' : 'gate');
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<FinishedSession | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [startedAt, setStartedAt] = useState(Date.now());

  const modifiers = useMemo(() => sessionModifiers(), [player.avatar.equipped, runKey]);

  useEffect(() => {
    setInGame(true);
    return () => {
      setInGame(false);
      void flush();
    };
  }, [setInGame]);

  /* ------------------------------------- back / escape while playing */
  const onBack = useCallback(() => {
    if (stage === 'playing' && !ambient) {
      setPaused(true);
      return true;
    }
    return false;
  }, [ambient, stage]);

  // Android's back button; Escape in a browser. See `useBackGuard.web.ts` for
  // why the browser's own Back button is left alone.
  useBackGuard(true, onBack);

  /* ------------------------------------------------------- lifecycle */

  const begin = useCallback(() => {
    if (!module) return;
    const outcome = startSession(module.id);
    if (!outcome.ok) {
      haptics.warn();
      return;
    }
    setStartedAt(Date.now());
    setRunKey((k) => k + 1);
    setResult(null);
    setStage('playing');
    haptics.press();
  }, [module]);

  const handleFinish = useCallback<GameSurfaceProps['onFinish']>(
    async (partial) => {
      if (!module) return;
      const full: SessionResult = {
        ...partial,
        gameId: module.id,
        durationMs: Date.now() - startedAt,
      };
      const finished = await finishSession(full);
      setResult(finished);
      setStage('results');
    },
    [module, startedAt],
  );

  const handleTrack = useCallback(
    (metrics: MetricDelta) => {
      if (!module) return;
      track(metrics, module.id);
    },
    [module, track],
  );

  const handleGrant = useCallback(
    (reward: RewardBundle, label?: string) => {
      if (!module) return;
      grantReward(reward, { label, gameId: module.id, icon: module.meta.glyph, silent: !label });
    },
    [module],
  );

  const handleSetSave = useCallback(
    (updater: unknown) => {
      if (!module) return;
      setGameSave(module.id, updater);
    },
    [module, setGameSave],
  );

  const exit = useCallback(() => {
    void flush();
    router.back();
  }, [router]);

  /* ------------------------------------------------------- rendering */

  if (!module) {
    return (
      <View style={styles.missing}>
        <Text variant="heading">Unknown game</Text>
        <Button label="Back to hub" onPress={() => router.replace('/(hub)/play')} style={{ marginTop: spacing.lg }} />
      </View>
    );
  }

  const Surface = module.Surface;
  const gate = canStart(module.id);
  const accent = module.meta.accent;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={gradients[module.meta.gradient]}
        style={[StyleSheet.absoluteFill, { opacity: 0.18 }]}
      />
      <View style={styles.dim} />

      {stage === 'gate' ? (
        <Animated.View entering={FadeIn.duration(220)} style={styles.gate}>
          <View style={styles.gateHeader}>
            <PressableScale onPress={exit} style={styles.closeBtn} scaleTo={0.9}>
              <Text size={16}>✕</Text>
            </PressableScale>
          </View>

          <View style={styles.gateBody}>
            <SpriteView
              sprite={spriteForGame(module.id, accent, module.meta.title)}
              size={sc(72)}
              label={module.meta.title}
            />
            <Text variant="display" center>
              {module.meta.title}
            </Text>
            <Text variant="body" muted center style={{ maxWidth: 300 }}>
              {module.meta.tagline}
            </Text>

            <View style={styles.tagRow}>
              {module.meta.tags.map((t) => (
                <View key={t} style={[styles.tag, { borderColor: `${accent}66` }]}>
                  <Text variant="micro" color={accent}>
                    {t.toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>

            <Card variant="glass" padding={spacing.lg} style={styles.loadout}>
              <Text variant="micro" muted>
                YOUR LOADOUT
              </Text>
              <View style={styles.loadoutRow}>
                <AvatarView avatar={player.avatar} size={sc(56)} level={player.level} showPet />
                <View style={{ flex: 1, gap: 3 }}>
                  {modifierRows(modifiers).map((row) => (
                    <Text key={row} variant="caption" color={palette.mint}>
                      {row}
                    </Text>
                  ))}
                  {modifierRows(modifiers).length === 0 ? (
                    <Text variant="caption" muted>
                      No bonuses equipped — buy cosmetics to boost every game.
                    </Text>
                  ) : null}
                </View>
              </View>
            </Card>
          </View>

          <View style={styles.gateFooter}>
            {gate.ok ? (
              <Button
                label="Start"
                icon="▶"
                trailing={module.meta.energyCost > 0 ? `${module.meta.energyCost} ⚡` : undefined}
                size="lg"
                full
                shine
                onPress={begin}
              />
            ) : (
              <Button
                label={
                  gate.reason === 'locked'
                    ? `Unlocks at level ${module.meta.minLevel}`
                    : gate.reason === 'energy'
                      ? `Need ${gate.needed} more energy`
                      : 'Unavailable'
                }
                size="lg"
                full
                disabled
              />
            )}
            <Text variant="caption" faint center style={{ marginTop: spacing.sm }}>
              ⚡ {player.energy}/{player.energyMax} · refills over real time, even when closed
            </Text>
          </View>
        </Animated.View>
      ) : null}

      {stage !== 'gate' ? (
        <View style={styles.surface}>
          <ErrorBoundary label={module.meta.title} onRetry={begin} onBack={exit}>
            <Surface
              key={runKey}
              onFinish={handleFinish}
              track={handleTrack}
              grant={handleGrant}
              modifiers={modifiers}
              paused={paused || stage === 'results'}
              requestPause={() => setPaused(true)}
              level={player.level}
              save={saves[module.id] ?? module.defaultSave?.() ?? {}}
              setSave={handleSetSave}
            />
          </ErrorBoundary>
        </View>
      ) : null}

      {/* ambient games get a lightweight exit affordance instead of a gate */}
      {ambient && stage === 'playing' ? (
        <PressableScale onPress={exit} style={[styles.closeBtn, styles.floatingClose]} scaleTo={0.9}>
          <Text size={16}>✕</Text>
        </PressableScale>
      ) : null}

      <PauseSheet
        visible={paused}
        title={module.meta.title}
        onResume={() => setPaused(false)}
        onRestart={
          module.meta.kind === 'session'
            ? () => {
                setPaused(false);
                begin();
              }
            : undefined
        }
        onQuit={() => {
          setPaused(false);
          exit();
        }}
      />

      <ResultsSheet
        session={stage === 'results' ? result : null}
        replayCost={module.meta.energyCost}
        canReplay={canStart(module.id).ok}
        onReplay={begin}
        onExit={exit}
      />
    </View>
  );
}

function modifierRows(m: ReturnType<typeof sessionModifiers>) {
  const rows: string[] = [];
  if (m.coinBonus) rows.push(`+${Math.round(m.coinBonus * 100)}% coins`);
  if (m.xpBonus) rows.push(`+${Math.round(m.xpBonus * 100)}% XP`);
  if (m.speed) rows.push(`+${Math.round(m.speed * 100)}% speed`);
  if (m.armor) rows.push(`+${m.armor} armour`);
  if (m.luck) rows.push(`+${Math.round(m.luck * 100)}% luck`);
  if (m.energyRegen) rows.push(`+${Math.round(m.energyRegen * 100)}% energy regen`);
  return rows;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,12,0.82)' },
  surface: { flex: 1 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.void },
  gate: { flex: 1, padding: spacing.lg },
  gateHeader: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: spacing.xxl },
  gateBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  tagRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  tag: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.xs, borderWidth: 1 },
  loadout: { width: '100%', marginTop: spacing.xl },
  loadoutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.sm },
  gateFooter: { paddingBottom: spacing.xxl },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  floatingClose: { position: 'absolute', left: spacing.lg, top: spacing.huge, zIndex: 60 },
});
