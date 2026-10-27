// The timeline's span of time. Kept apart from the 3D code so the page can use it without loading three.js.
export const Y0 = 799, Y1 = 847;   // the span the scene is built over
export const T0 = 800, T1 = 847;   // the span the present can move through: from the start of 800 to the end of 846

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Share (0–1) of the time bar at which `year` sits. */
export const barShare = (year: number) => clamp((year - T0) / (T1 - T0), 0, 1);
/** The year at a share (0–1) of the time bar. */
export const barYear = (share: number) => T0 + clamp(share, 0, 1) * (T1 - T0);
