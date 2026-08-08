import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ============================================================================
 *  MATCH FLOW — the state machine every duel game shares
 * ============================================================================
 *
 * countdown → playing → (point → countdown)* → over
 *
 * Written once here because the sequencing is where turn-based arcade games
 * usually rot: a timer that fires after unmount, a point scored twice because
 * two collisions landed in the same frame, a rematch that keeps the old score.
 * Each of those is handled once, and every game inherits the fix.
 */

export type Side = 'p1' | 'p2';
export type MatchPhase = 'countdown' | 'playing' | 'point' | 'over';

export type MatchOptions = {
  /** Score needed to win the match. */
  target: number;
  /** Seconds of "3… 2… 1… GO" before each serve. 0 skips it. */
  countdown?: number;
  /** Beat spent showing who scored before the next countdown. */
  pointPause?: number;
  /** Fired once when the match is decided. */
  onOver?: (winner: Side, score: Record<Side, number>) => void;
  /** Fired when a new round starts, after the countdown. */
  onServe?: () => void;
};

export type Match = {
  phase: MatchPhase;
  score: Record<Side, number>;
  /** Whole seconds left on the countdown, 0 when not counting. */
  count: number;
  /** Who took the last point — drives the banner. */
  lastScorer: Side | null;
  winner: Side | null;
  /** True only while the simulation should advance. */
  live: boolean;
  /** Award a point. Ignores repeat calls inside the same stopped round. */
  awardPoint: (side: Side) => void;
  /** Full reset, same options. */
  rematch: () => void;
};

export function useMatch(options: MatchOptions): Match {
  const { target, countdown = 3, pointPause = 1.1, onOver, onServe } = options;

  const [phase, setPhase] = useState<MatchPhase>(countdown > 0 ? 'countdown' : 'playing');
  const [score, setScore] = useState<Record<Side, number>>({ p1: 0, p2: 0 });
  const [count, setCount] = useState(countdown);
  const [lastScorer, setLastScorer] = useState<Side | null>(null);
  const [winner, setWinner] = useState<Side | null>(null);

  // The loop reads phase through a ref; React state lags a frame behind and a
  // point can land in that gap.
  const phaseRef = useRef<MatchPhase>(phase);
  const scoreRef = useRef(score);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const overFired = useRef(false);

  const cbs = useRef({ onOver, onServe });
  useEffect(() => {
    cbs.current = { onOver, onServe };
  }, [onOver, onServe]);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
  }, []);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const setPhaseNow = useCallback((next: MatchPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  /** Run the 3-2-1 then hand control to the game. */
  const startCountdown = useCallback(() => {
    if (countdown <= 0) {
      setPhaseNow('playing');
      cbs.current.onServe?.();
      return;
    }
    setPhaseNow('countdown');
    setCount(countdown);
    for (let i = 1; i <= countdown; i++) {
      later(() => setCount(countdown - i), i * 1000);
    }
    later(() => {
      setPhaseNow('playing');
      cbs.current.onServe?.();
    }, countdown * 1000);
  }, [countdown, later, setPhaseNow]);

  useEffect(() => {
    startCountdown();
    // Intentionally once per mount; rematch drives subsequent rounds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const awardPoint = useCallback(
    (side: Side) => {
      // Two hazards landing in one frame must not both score.
      if (phaseRef.current !== 'playing') return;
      phaseRef.current = 'point';

      const next = { ...scoreRef.current, [side]: scoreRef.current[side] + 1 };
      scoreRef.current = next;
      setScore(next);
      setLastScorer(side);
      setPhase('point');

      if (next[side] >= target) {
        if (overFired.current) return;
        overFired.current = true;
        later(() => {
          phaseRef.current = 'over';
          setPhaseNow('over');
          setWinner(side);
          cbs.current.onOver?.(side, next);
        }, pointPause * 1000);
        return;
      }

      later(startCountdown, pointPause * 1000);
    },
    [later, pointPause, setPhaseNow, startCountdown, target],
  );

  const rematch = useCallback(() => {
    clearTimers();
    overFired.current = false;
    scoreRef.current = { p1: 0, p2: 0 };
    setScore({ p1: 0, p2: 0 });
    setWinner(null);
    setLastScorer(null);
    startCountdown();
  }, [clearTimers, startCountdown]);

  return {
    phase,
    score,
    count,
    lastScorer,
    winner,
    live: phase === 'playing',
    awardPoint,
    rematch,
  };
}

/**
 * A countdown-to-zero match clock, for the timed games (Color Clash, Dodge
 * Duel). Ticks on a real interval rather than the frame loop so it stays
 * honest when the renderer stalls.
 */
export function useMatchClock(seconds: number, running: boolean, onExpire: () => void) {
  const [left, setLeft] = useState(seconds);
  const fired = useRef(false);
  const cb = useRef(onExpire);
  useEffect(() => {
    cb.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setLeft((v) => {
        const next = Math.max(0, v - 0.1);
        if (next <= 0 && !fired.current) {
          fired.current = true;
          cb.current();
        }
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [running]);

  const reset = useCallback(() => {
    fired.current = false;
    setLeft(seconds);
  }, [seconds]);

  return { left, reset };
}
