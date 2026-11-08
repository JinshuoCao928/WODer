// Pure logic for WODer: no DOM, no runtime capabilities. Tested with `npm test`.

export const MOVEMENT_ALIASES = {
  'fs': 'Front squat',
  'bs': 'Back squat',
  'ohs': 'Overhead squat',
  'dl': 'Deadlift',
  'c&j': 'Clean and jerk',
  't2b': 'Toes to bar',
  'ttb': 'Toes to bar',
  'hspu': 'Handstand push-up',
  'du': 'Double under',
  'pu': 'Pull-up',
};

const LB_PER_KG = 2.20462;

export function normalizeMovementName(name) {
  let s = String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (MOVEMENT_ALIASES[s]) return MOVEMENT_ALIASES[s];
  s = s.replace(/([^s])s$/, '$1');
  if (MOVEMENT_ALIASES[s]) return MOVEMENT_ALIASES[s];
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function convertLoad(load, from, to) {
  if (load == null) return null;
  if (!from || from === to) return load;
  const raw = from === 'kg' ? load * LB_PER_KG : load / LB_PER_KG;
  return Math.round(raw * 2) / 2;
}
