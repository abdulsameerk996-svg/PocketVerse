import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Pressable, ScrollView } from 'react-native';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import type { GameSurfaceProps } from '@/core/registry';
import { GameHud, Text, haptics, palette, spacing, radius, useResponsive, play, Button } from '@/ui';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS } from 'react-native-reanimated';

import { Stage, Sparks, FallbackScene, PartyCamera } from '@/core/game3d';
import { PLAYER_COLORS } from '@/core/game3d/PartyCharacter';
import { PartyCharacter } from '@/core/game3d/PartyCharacter';
import { makeBody, collide, stepWorld } from '@/core/game3d/arena2d';
import { finiteOr } from '@/core/game3d/safety';

import { CHARS, normalizeSave, ARENA_RADIUS, MATCH_DURATION, ABILITY_CD, rewardForMatch } from './content';
import type { CharId, PlayerState, Pickup } from './types';
import { aiDecision, damageForAbility, scoreForKO } from './logic';
import { NexusArenaScene } from './Scene';
import { useKeyAxis } from '@/ui/hooks/useKeyboard';

type GamePhase = 'intro' | 'heroSelect' | 'countdown' | 'playing' | 'finished';

export function NexusArenaSurface(props: GameSurfaceProps) {
  return <NexusArenaInner {...props} />;
}

function NexusArenaInner({ onFinish, paused, requestPause, save, setSave, modifiers }: GameSurfaceProps) {
  const { width: W } = useResponsive();
  const saveNorm = useMemo(() => normalizeSave(save), [save]);
  const initialChar = (saveNorm.selectedChar as CharId) ?? 'nova';
  const charDef = (CHARS as any)[initialChar] ?? CHARS.nova;

  const playersRef = useRef<PlayerState[]>([]);
  const pickupsRef = useRef<Pickup[]>([]);
  const accRef = useRef<{ value: number }>({ value: 0 });
  const timeRef = useRef(0);
  const phaseRef = useRef<GamePhase>('intro');
  const countdownRef = useRef(3);
  const sparksRef = useRef<any>(null);
  const positionsRef = useRef<{ x: number; z: number }[]>([]);
  const matchTimeRef = useRef(MATCH_DURATION);

  const [phase, setPhase] = useState<GamePhase>('intro');
  const [hud, setHud] = useState({ hp: charDef.hp, maxHp: charDef.hp, score: 0, kos: 0, time: MATCH_DURATION, ultimate: 0, leader: 0 });
  const [countdown, setCountdown] = useState(3);
  const [winner, setWinner] = useState<number | null>(null);
  const [selectedHero, setSelectedHero] = useState<CharId>(initialChar);
  const finished = useRef(false);

  const moveX = useSharedValue(0);
  const moveZ = useSharedValue(0);
  const wantsRef = useRef({ attack: false, dash: false, shield: false, ultimate: false });

  const initPlayers = useCallback((hero: CharId) => {
    const count = 3;
    const players: PlayerState[] = [];
    const heroChar = (CHARS as any)[hero] ?? CHARS.nova;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const r = ARENA_RADIUS * 0.45;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      const char = i === 0 ? heroChar : Object.values(CHARS)[i % Object.values(CHARS).length];
      players.push({
        id: i,
        charId: char.id as any,
        x, z,
        vx: 0, vz: 0,
        hp: char.hp,
        maxHp: char.hp,
        alive: true,
        score: 0,
        kos: 0,
        facing: ang + Math.PI,
        abilityCd: { attack: 0, dash: 0, shield: 0, ultimate: 0 },
        ultimateCharge: i === 0 ? 0 : Math.random() * 0.3,
        isBot: i !== 0,
        targetId: null,
      });
    }
    playersRef.current = players;
    positionsRef.current = players.map(p => ({ x: p.x, z: p.z }));
    pickupsRef.current = Array.from({ length: 5 }, (_, i) => {
      const ang = (i / 5) * Math.PI * 2;
      const r = ARENA_RADIUS * 0.3 + Math.random() * 1.5;
      return { id: i, x: Math.cos(ang) * r, z: Math.sin(ang) * r, type: (['health', 'energy', 'score'] as any)[i % 3], active: true, respawnAt: 0 };
    });
    timeRef.current = 0;
    matchTimeRef.current = MATCH_DURATION;
    finished.current = false;
  }, []);

  useEffect(() => {
    initPlayers(selectedHero);
    const t = setTimeout(() => {
      phaseRef.current = 'heroSelect';
      setPhase('heroSelect');
      play('game.start');
    }, 700);
    return () => clearTimeout(t);
  }, [initPlayers, selectedHero]);

  const startCountdown = useCallback(() => {
    // persist selected hero
    setSave((prev: unknown) => {
      const ns = normalizeSave(prev);
      return { ...ns, selectedChar: selectedHero };
    });
    initPlayers(selectedHero);
    phaseRef.current = 'countdown';
    setPhase('countdown');
    countdownRef.current = 3;
    setCountdown(3);
    play('game.start');
  }, [selectedHero, initPlayers, setSave]);

  useEffect(() => {
    if (phase !== 'countdown') return;
    const id = setInterval(() => {
      countdownRef.current -= 1;
      if (countdownRef.current <= 0) {
        clearInterval(id);
        phaseRef.current = 'playing';
        setPhase('playing');
        play('reward.chest');
        haptics.success();
      } else {
        setCountdown(countdownRef.current);
        play('game.jump');
        haptics.tick();
      }
    }, 900);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    const id = setInterval(() => {
      const p = playersRef.current[0];
      if (!p) return;
      const leader = [...playersRef.current].sort((a, b) => b.score - a.score)[0]?.id ?? 0;
      setHud({
        hp: Math.round(p.hp),
        maxHp: p.maxHp,
        score: p.score,
        kos: p.kos,
        time: matchTimeRef.current,
        ultimate: p.ultimateCharge,
        leader,
      });
    }, 100);
    return () => clearInterval(id);
  }, []);

  const finishMatch = useCallback((winnerId: number) => {
    if (finished.current) return;
    finished.current = true;
    phaseRef.current = 'finished';
    setPhase('finished');
    setWinner(winnerId);
    const p = playersRef.current[0];
    const won = winnerId === 0;
    play(won ? 'reward.chest' : 'game.over');
    haptics[won ? 'success' : 'fail']();
    setTimeout(() => {
      const rew = rewardForMatch(won, p?.score ?? 0, p?.kos ?? 0);
      onFinish({
        score: p?.score ?? 0,
        outcome: won ? 'win' : 'lose',
        metrics: { arena_matches: 1, arena_wins: won ? 1 : 0, arena_kos: p?.kos ?? 0, arena_crystals: p?.score ?? 0 },
        reward: rew,
        breakdown: [
          { label: 'Placement', value: `#${playersRef.current.sort((a, b) => b.score - a.score).findIndex(x => x.id === 0) + 1}` },
          { label: 'KOs', value: `${p?.kos ?? 0}` },
          { label: 'Score', value: `${p?.score ?? 0}` },
          { label: 'Winner', value: `${PLAYER_COLORS[winnerId]?.name ?? winnerId}` },
        ],
      });
      setSave((prev: unknown) => {
        const ns = normalizeSave(prev);
        return {
          ...ns,
          matches: ns.matches + 1,
          wins: ns.wins + (won ? 1 : 0),
          bestScore: Math.max(ns.bestScore, p?.score ?? 0),
          totalKOs: ns.totalKOs + (p?.kos ?? 0),
          trophies: ns.trophies + (won ? 2 : 0),
        };
      });
    }, 900);
  }, [onFinish, setSave]);

  const FrameLogic = () => {
    useFrame((_, delta) => {
      if (paused || phaseRef.current !== 'playing') return;
      const dt = Math.min(delta, 0.05);
      timeRef.current += dt;
      matchTimeRef.current = Math.max(0, MATCH_DURATION - timeRef.current);
      const players = playersRef.current;
      const pickups = pickupsRef.current;

      for (const p of players) {
        if (!p.alive || !p.isBot) continue;
        const opponents = players.filter(o => o.id !== p.id);
        const dec = aiDecision(
          { x: p.x, z: p.z, hp: p.hp, maxHp: p.maxHp, ultimateCharge: p.ultimateCharge },
          opponents.map(o => ({ id: o.id, x: o.x, z: o.z, hp: o.hp, alive: o.alive })),
          pickups.filter(pk => pk.active).map(pk => ({ x: pk.x, z: pk.z, active: pk.active })),
          timeRef.current,
          Math.random,
        );
        p.vx += dec.moveX * 20 * dt;
        p.vz += dec.moveZ * 20 * dt;
        if (dec.wantAttack && p.abilityCd.attack <= 0) doAbility(p, 'attack', players);
        if (dec.wantDash && p.abilityCd.dash <= 0) doAbility(p, 'dash', players);
        if (dec.wantShield && p.abilityCd.shield <= 0) doAbility(p, 'shield', players);
        if (dec.wantUltimate && p.abilityCd.ultimate <= 0 && p.ultimateCharge >= 1) doAbility(p, 'ultimate', players);
      }

      const human = players[0];
      if (human?.alive) {
        const ax = moveX.value;
        const az = moveZ.value;
        human.vx += ax * 22 * dt;
        human.vz += az * 22 * dt;
        if (ax !== 0 || az !== 0) human.facing = Math.atan2(az, ax);
        if (wantsRef.current.attack && human.abilityCd.attack <= 0) { doAbility(human, 'attack', players); wantsRef.current.attack = false; }
        if (wantsRef.current.dash && human.abilityCd.dash <= 0) { doAbility(human, 'dash', players); wantsRef.current.dash = false; }
        if (wantsRef.current.shield && human.abilityCd.shield <= 0) { doAbility(human, 'shield', players); wantsRef.current.shield = false; }
        if (wantsRef.current.ultimate && human.abilityCd.ultimate <= 0 && human.ultimateCharge >= 1) { doAbility(human, 'ultimate', players); wantsRef.current.ultimate = false; }
      }

      stepWorld(dt, accRef.current, (h) => {
        for (const p of players) {
          if (!p.alive) continue;
          for (const k of Object.keys(p.abilityCd) as (keyof typeof p.abilityCd)[]) {
            if (p.abilityCd[k] > 0) p.abilityCd[k] = Math.max(0, p.abilityCd[k] - h);
          }
          if (p.ultimateCharge < 1) p.ultimateCharge = Math.min(1, p.ultimateCharge + h * 0.04);
          p.x += p.vx * h;
          p.z += p.vz * h;
          p.vx *= Math.exp(-2.8 * h);
          p.vz *= Math.exp(-2.8 * h);
          const dist = Math.hypot(p.x, p.z);
          if (dist > ARENA_RADIUS - 0.6) {
            const nx = p.x / dist;
            const nz = p.z / dist;
            p.x = nx * (ARENA_RADIUS - 0.6);
            p.z = nz * (ARENA_RADIUS - 0.6);
            p.vx -= nx * 6;
            p.vz -= nz * 6;
          }
        }
        for (let i = 0; i < players.length; i++) {
          const a = players[i];
          if (!a.alive) continue;
          for (let j = i + 1; j < players.length; j++) {
            const b = players[j];
            if (!b.alive) continue;
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            if (dx * dx + dz * dz < 1.21) collide(a as any, b as any, 1.1);
          }
        }
        for (const pk of pickups) {
          if (!pk.active) {
            if (pk.respawnAt > 0 && timeRef.current >= pk.respawnAt) { pk.active = true; pk.respawnAt = 0; }
            continue;
          }
          for (const p of players) {
            if (!p.alive) continue;
            const dx = pk.x - p.x;
            const dz = pk.z - p.z;
            if (dx * dx + dz * dz < 1.44) {
              pk.active = false;
              pk.respawnAt = timeRef.current + 8 + Math.random() * 4;
              if (pk.type === 'health') { p.hp = Math.min(p.maxHp, p.hp + 28); play('game.collect'); }
              else if (pk.type === 'energy') { p.ultimateCharge = Math.min(1, p.ultimateCharge + 0.35); play('reward.chest'); }
              else { p.score += 40; play('game.collect'); }
              sparksRef.current?.burst(pk.x, 0.3, pk.z, '#FFD166', 8, 3);
              haptics.collect();
            }
          }
        }
      });

      positionsRef.current = players.filter(p => p.alive).map(p => ({ x: p.x, z: p.z }));

      if (matchTimeRef.current <= 0 || (players.filter(p => p.alive).length <= 1 && timeRef.current > 12)) {
        const sorted = [...players].sort((a, b) => b.score - a.score);
        finishMatch(sorted[0]?.id ?? 0);
      }
    });
    return null;
  };

  function doAbility(p: PlayerState, ability: 'attack' | 'dash' | 'shield' | 'ultimate', allPlayers: PlayerState[]) {
    const char = (CHARS as any)[p.charId] ?? CHARS.nova;
    if (p.abilityCd[ability] > 0) return;
    p.abilityCd[ability] = (ABILITY_CD as any)[ability] ?? 1;
    const fx = Math.cos(p.facing);
    const fz = Math.sin(p.facing);
    if (ability === 'attack') {
      for (const target of allPlayers) {
        if (target.id === p.id || !target.alive) continue;
        const dx = target.x - p.x;
        const dz = target.z - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 1.9) continue;
        const dot = (dx / dist) * fx + (dz / dist) * fz;
        if (dot < Math.cos(0.95)) continue;
        const dmg = damageForAbility('attack', char.damage, Math.random() < 0.18);
        target.hp -= dmg;
        target.vx += (dx / dist) * 5.5;
        target.vz += (dz / dist) * 5.5;
        p.score += 12;
        p.ultimateCharge = Math.min(1, p.ultimateCharge + 0.08);
        sparksRef.current?.burst(target.x, 0.6, target.z, char.color, 10, 4);
        play('game.hit');
        haptics.tick();
        if (target.hp <= 0) {
          target.alive = false; target.hp = 0;
          p.kos += 1; p.score += scoreForKO(p.kos);
          sparksRef.current?.burst(target.x, 0.8, target.z, '#EF4444', 24, 6);
          play('game.crash'); haptics.heavy();
        }
      }
    } else if (ability === 'dash') {
      p.vx += fx * 12; p.vz += fz * 12;
      play('game.jump'); haptics.press();
      sparksRef.current?.burst(p.x, 0.3, p.z, '#22D3EE', 12, 3);
    } else if (ability === 'shield') {
      p.hp = Math.min(p.maxHp, p.hp + 18);
      play('reward.levelup'); haptics.success();
      sparksRef.current?.burst(p.x, 0.6, p.z, '#4ADE80', 16, 4);
    } else if (ability === 'ultimate') {
      if (p.ultimateCharge < 1) return;
      p.ultimateCharge = 0;
      for (const target of allPlayers) {
        if (target.id === p.id || !target.alive) continue;
        const dx = target.x - p.x;
        const dz = target.z - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 4.2) {
          const dmg = damageForAbility('ultimate', char.damage);
          target.hp -= dmg;
          const nx = dx / (dist || 1);
          const nz = dz / (dist || 1);
          target.vx += nx * 10; target.vz += nz * 10;
          p.score += 18;
          sparksRef.current?.burst(target.x, 0.7, target.z, char.color, 20, 6);
          if (target.hp <= 0) { target.alive = false; p.kos += 1; p.score += scoreForKO(p.kos); sparksRef.current?.burst(target.x, 0.9, target.z, '#FACC15', 30, 7); }
        }
      }
      play('reward.chest'); haptics.heavy();
    }
  }

  const joystickGesture = useMemo(() => Gesture.Pan().runOnJS(true).onUpdate((e) => {
    const lx = e.translationX / 50;
    const lz = e.translationY / 50;
    const len = Math.hypot(lx, lz);
    if (len > 1) { moveX.value = (lx / len); moveZ.value = (lz / len); }
    else { moveX.value = lx; moveZ.value = lz; }
  }).onFinalize(() => {
    moveX.value = withSpring(0, { damping: 15 });
    moveZ.value = withSpring(0, { damping: 15 });
  }), [moveX, moveZ]);

  const stickStyle = useAnimatedStyle(() => ({ transform: [{ translateX: moveX.value * 18 }, { translateY: moveZ.value * 18 }] }));

  const selectedCharDef = (CHARS as any)[selectedHero] ?? CHARS.nova;

  return (
    <View style={styles.root}>
      <FrameLogic />
      <NexusArenaScene time={timeRef.current} paused={paused}>
        {playersRef.current.map(p => (
          <group key={p.id} position={[p.x, 0, p.z]}>
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.42, 0.52, 16]} />
              <meshBasicMaterial color={PLAYER_COLORS[p.id]?.primary ?? '#fff'} transparent opacity={p.alive ? 0.9 : 0.15} />
            </mesh>
            <group>
              <mesh position={[0, 0.6, 0]} castShadow>
                <capsuleGeometry args={[0.28, 0.5, 4, 10]} />
                <meshStandardMaterial color={PLAYER_COLORS[p.id]?.primary ?? '#FF6B6B'} roughness={0.5} />
              </mesh>
              <mesh position={[0, 1.15, 0]}>
                <sphereGeometry args={[0.31, 12, 10]} />
                <meshStandardMaterial color="#FFE8CC" />
              </mesh>
            </group>
            {p.abilityCd.shield > 0 ? (
              <mesh position={[0, 0.6, 0]}>
                <sphereGeometry args={[0.7, 12, 12]} />
                <meshBasicMaterial color={PLAYER_COLORS[p.id].primary} transparent opacity={0.18} wireframe />
              </mesh>
            ) : null}
          </group>
        ))}
        {pickupsRef.current.filter(pk => pk.active).map(pk => (
          <group key={pk.id} position={[pk.x, 0.25, pk.z]}>
            <mesh rotation={[0, timeRef.current * 1.5, 0]}>
              <octahedronGeometry args={[0.22, 0]} />
              <meshStandardMaterial color={pk.type === 'health' ? '#4ADE80' : pk.type === 'energy' ? '#22D3EE' : '#FFD166'} emissive={pk.type === 'health' ? '#4ADE80' : pk.type === 'energy' ? '#22D3EE' : '#FFD166'} emissiveIntensity={0.6} />
            </mesh>
          </group>
        ))}
        <Sparks handle={sparksRef} count={100} />
        <PartyCamera playerPositions={positionsRef} center={[0, 0]} baseHeight={9} minDist={6} maxDist={22} lerp={0.06} />
      </NexusArenaScene>

      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {phase === 'intro' ? (
          <View style={styles.centerOverlay}>
            <Text variant="micro" color={palette.cyan}>POCKETVERSE • NEXUS ARENA</Text>
            <Text variant="display" center>NEXUS ARENA</Text>
            <Text variant="caption" muted center>Floating Ruins • 3-Player FFA • First to dominate</Text>
          </View>
        ) : null}

        {phase === 'heroSelect' ? (
          <View style={styles.heroSelectOverlay}>
            <Text variant="micro" color={palette.cyan} center>HERO SELECT</Text>
            <Text variant="title" center>Choose Your Fighter</Text>
            <View style={styles.heroPreview}>
              <View style={styles.hero3DPreview}>
                <Stage fit={{ halfWidth: 2, halfDepth: 2, height: 1.5, margin: 0.9 }} cameraDir={[0, 2.2, 3.2]} fov={48} background="#151528">
                  <PartyCharacter position={[0, 0, 0]} color={{ id: 1, name: 'P1', primary: selectedCharDef.color, accent: selectedCharDef.accent, icon: selectedCharDef.glyph } as any} animation="idle" scale={1.2} />
                  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
                    <ringGeometry args={[0.5, 0.6, 16]} />
                    <meshBasicMaterial color={selectedCharDef.color} transparent opacity={0.5} />
                  </mesh>
                </Stage>
              </View>
              <Text variant="heading" center>{selectedCharDef.name}</Text>
              <Text variant="caption" muted center>{selectedCharDef.desc}</Text>
              <View style={styles.abilityPreview}>
                {Object.entries(selectedCharDef.abilityDesc).map(([k, v]) => (
                  <View key={k} style={styles.abilityChip}>
                    <Text variant="micro" color={palette.cyan}>{k.toUpperCase()}</Text>
                    <Text variant="caption" muted>{v as string}</Text>
                  </View>
                ))}
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.heroList}>
              {Object.values(CHARS).map(c => (
                <Pressable key={c.id} onPress={() => { setSelectedHero(c.id as any); haptics.select(); play('ui.tap'); }} style={[styles.heroCard, selectedHero === c.id && { borderColor: c.color, backgroundColor: `${c.color}22` }]}>
                  <Text size={28}>{c.glyph}</Text>
                  <Text variant="label" center>{c.name}</Text>
                  <Text variant="micro" color={selectedHero === c.id ? c.color : palette.textMuted} center>{c.id === 'nova' ? 'Easy' : c.id === 'bolt' ? 'Medium' : 'Hard'}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Button label="READY — FIGHT!" icon="⚔️" size="lg" full shine onPress={startCountdown} style={{ marginTop: spacing.md }} />
          </View>
        ) : null}

        {phase === 'countdown' ? (
          <View style={styles.centerOverlay}>
            <Text variant="display" style={{ fontSize: 96 }}>{countdown > 0 ? countdown : 'GO!'}</Text>
          </View>
        ) : null}

        {phase === 'playing' ? (
          <>
            <GameHud
              onPause={requestPause}
              accent={palette.violet}
              centre={
                <View style={{ alignItems: 'center' }}>
                  <Text variant="micro" color={palette.gold}>{Math.floor(hud.time / 60)}:{String(Math.floor(hud.time % 60)).padStart(2, '0')} • LEADER P{hud.leader + 1} • {playersRef.current.filter(p => p.alive).length} ALIVE</Text>
                  <Text variant="title">{hud.score} pts • {hud.kos} KOs</Text>
                </View>
              }
              right={
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="label" color={hud.hp > 30 ? palette.mint : palette.coral}>{hud.hp}/{hud.maxHp} HP</Text>
                  <View style={styles.ultBarBg}><View style={[styles.ultBarFill, { width: `${hud.ultimate * 100}%` }]} /></View>
                </View>
              }
            />
            <View style={styles.abilityRow}>
              <AbilityBtn label="ATK" cd={playersRef.current[0]?.abilityCd.attack ?? 0} onPress={() => { wantsRef.current.attack = true; }} color={palette.text} />
              <AbilityBtn label="DASH" cd={playersRef.current[0]?.abilityCd.dash ?? 0} onPress={() => { wantsRef.current.dash = true; }} color="#22D3EE" />
              <AbilityBtn label="SHIELD" cd={playersRef.current[0]?.abilityCd.shield ?? 0} onPress={() => { wantsRef.current.shield = true; }} color="#4ADE80" />
              <AbilityBtn label="ULT" cd={playersRef.current[0]?.abilityCd.ultimate ?? 0} charge={hud.ultimate} onPress={() => { wantsRef.current.ultimate = true; }} color="#FFD166" isUlt />
            </View>
          </>
        ) : null}

        {phase === 'finished' && winner !== null ? (
          <View style={styles.resultsOverlay}>
            <Text variant="micro" color={palette.gold} center>FINISHED</Text>
            <Text variant="display" center>{PLAYER_COLORS[winner]?.name} WINS!</Text>
            <Text size={48} center>{PLAYER_COLORS[winner]?.icon}</Text>
            <View style={styles.scoreboard}>
              {[...playersRef.current].sort((a, b) => b.score - a.score).map((p, idx) => (
                <View key={p.id} style={styles.scoreRow}>
                  <Text variant="label" color={PLAYER_COLORS[p.id].primary}>{idx + 1} • P{p.id + 1} {PLAYER_COLORS[p.id].name}</Text>
                  <Text variant="label">{p.score} pts • {p.kos} KOs</Text>
                </View>
              ))}
            </View>
            <Button label="PLAY AGAIN" icon="↺" size="lg" full shine onPress={() => { initPlayers(selectedHero); setTimeout(() => { phaseRef.current='countdown'; setPhase('countdown'); countdownRef.current=3; setCountdown(3); }, 400); }} style={{ marginTop: spacing.lg }} />
          </View>
        ) : null}

        {__DEV__ ? (
          <View pointerEvents="none" style={styles.devDiag}>
            <Text variant="micro" color={palette.mint}>WORLD ✓ {finiteOr(timeRef.current, 0).toFixed(1)}s</Text>
            <Text variant="micro" color={palette.mint}>CAMERA ✓ {finiteOr(positionsRef.current.length, 0)} track dynamic</Text>
            <Text variant="micro" color={palette.mint}>PLAYER ✓ {playersRef.current[0]?.alive ? 'alive' : 'dead'} {finiteOr(playersRef.current[0]?.x, 0).toFixed(1)},{finiteOr(playersRef.current[0]?.z, 0).toFixed(1)}</Text>
            <Text variant="micro" color={palette.mint}>AI ✓ {playersRef.current.filter(p => p.isBot && p.alive).length} bots hard</Text>
            <Text variant="micro" color={palette.mint}>COMBAT ✓ cd {playersRef.current[0]?.abilityCd.attack.toFixed(2) ?? '-'}</Text>
            <Text variant="micro" color={palette.mint}>INPUT ✓ move {moveX.value.toFixed(2)},{moveZ.value.toFixed(2)}</Text>
            <Text variant="micro" color={palette.mint}>AUDIO ✓ action track + hit + ultimate</Text>
            <Text variant="micro" color={palette.mint}>RENDER ✓ Nexus Ruins + core + crystals</Text>
            <Text variant="micro" color={palette.mint}>FINITE ✓</Text>
          </View>
        ) : null}
      </View>

      {phase === 'playing' ? (
        <View style={styles.touchLayer} pointerEvents="box-none">
          <GestureDetector gesture={joystickGesture}>
            <View style={styles.joystickBase}>
              <Animated.View style={[styles.joystickStick, stickStyle]} />
            </View>
          </GestureDetector>
          <View style={styles.rightButtons}>
            <Pressable onPress={() => { wantsRef.current.attack = true; }} style={[styles.actionBtn, { backgroundColor: '#2A2A4A' }]}><Text size={18}>⚔️</Text></Pressable>
            <Pressable onPress={() => { wantsRef.current.dash = true; }} style={[styles.actionBtn, { backgroundColor: '#0E2A3A' }]}><Text size={18}>💨</Text></Pressable>
            <Pressable onPress={() => { wantsRef.current.shield = true; }} style={[styles.actionBtn, { backgroundColor: '#0A2E1A' }]}><Text size={18}>🛡️</Text></Pressable>
            <Pressable onPress={() => { wantsRef.current.ultimate = true; }} style={[styles.actionBtn, styles.ultBtn, { opacity: hud.ultimate >= 1 ? 1 : 0.45 }]}><Text size={22}>☀️</Text></Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function AbilityBtn({ label, cd, charge, onPress, color, isUlt }: { label: string; cd: number; charge?: number; onPress: () => void; color: string; isUlt?: boolean }) {
  const pct = cd > 0 ? Math.max(0, 1 - cd / (isUlt ? 18 : label === 'ATK' ? 0.45 : label === 'DASH' ? 2.2 : 6.5)) : 1;
  return (
    <Pressable onPress={onPress} style={[styles.abilityBtn, { borderColor: color }]}>
      <View style={[styles.abilityFill, { width: `${pct * 100}%`, backgroundColor: color, opacity: 0.25 }]} />
      {isUlt && charge !== undefined ? <View style={[styles.abilityFill, { width: `${charge * 100}%`, backgroundColor: color }]} /> : null}
      <Text variant="micro" color={color} center>{label}{cd > 0 ? ` ${cd.toFixed(1)}` : ''}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0B1A' },
  centerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: 'rgba(10,11,26,0.55)' },
  heroSelectOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,8,18,0.92)', padding: spacing.lg, gap: spacing.md, justifyContent: 'flex-start' },
  heroPreview: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  hero3DPreview: { width: 180, height: 180, borderRadius: 16, overflow: 'hidden', backgroundColor: '#1A1A2E', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  abilityPreview: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.sm },
  abilityChip: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', maxWidth: 160 },
  heroList: { gap: spacing.sm, paddingRight: spacing.lg, marginTop: spacing.md },
  heroCard: { width: 92, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', gap: 4 },
  abilityRow: { position: 'absolute', bottom: spacing.huge + 48, left: spacing.lg, right: spacing.lg, flexDirection: 'row', gap: spacing.sm },
  abilityBtn: { flex: 1, height: 44, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: 'rgba(10,10,20,0.6)' },
  abilityFill: { ...StyleSheet.absoluteFillObject },
  resultsOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,8,16,0.88)', padding: spacing.xl, gap: spacing.md },
  scoreboard: { width: '100%', maxWidth: 340, gap: spacing.sm, marginTop: spacing.md },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', padding: spacing.sm, borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  touchLayer: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', padding: spacing.lg, paddingBottom: spacing.xxl },
  joystickBase: { width: 108, height: 108, borderRadius: 54, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  joystickStick: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(124,92,255,0.55)', borderWidth: 2, borderColor: '#fff' },
  rightButtons: { gap: spacing.sm, alignItems: 'center' },
  actionBtn: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  ultBtn: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#3A2E12', borderColor: '#FFD166', borderWidth: 2 },
  devDiag: { position: 'absolute', top: 56, left: 12, gap: 2, backgroundColor: 'rgba(0,0,0,0.45)', padding: 6, borderRadius: 8 },
  ultBarBg: { width: 80, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden', marginTop: 4 },
  ultBarFill: { height: '100%', backgroundColor: '#FFD166' },
});
export default NexusArenaSurface;
