// How scrolling maps to time on /timeline. Kept apart from the 3D code so the page can use it
// without loading three.js.
export const Y0 = 799, Y1 = 847;   // the span the camera travels
export const FLY_END = 0.84;       // share of the scroll spent flying; the rest pulls back to the side view

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Scroll share (0–1) at which the camera reaches `year`. */
export const progressFor = (year: number) => clamp((year - Y0) / (Y1 - Y0), 0, 1) * FLY_END;
