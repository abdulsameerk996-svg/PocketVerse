export type Plot = {
  cropId: string | null;
  plantedAt: number;
  /** Set when the crop was watered — shaves 15% off remaining time, once. */
  watered: boolean;
};

export type FarmSave = {
  plots: Plot[];
  plotCount: number;
  harvested: number;
  planted: number;
  /** Decoration item ids placed around the farm. */
  decorations: string[];
};

export const emptyPlot = (): Plot => ({ cropId: null, plantedAt: 0, watered: false });

/** Growth is a pure function of wall-clock time — nothing ticks, nothing drifts. */
export function growthOf(plot: Plot, minutes: number, now = Date.now()): number {
  if (!plot.cropId) return 0;
  const total = minutes * 60_000 * (plot.watered ? 0.85 : 1);
  return Math.max(0, Math.min(1, (now - plot.plantedAt) / total));
}
