// The look plan, in one place: a foundry yard at dusk. Warm amber sun against a deep
// indigo dusk, teal steel for the Wardens, amber for Ember. The same names are the CSS
// custom properties in index.html.
export const PALETTE = {
  sky: '#1b1e2e',
  dusk: '#2b2f45',
  ground: '#2a2d33',
  concrete: '#3a3f4a',
  concreteDark: '#262a31',
  steel: '#4a5568',
  rust: '#b4552d',
  teal: '#2e8f86',
  tealDark: '#1f5f5a',
  ochre: '#c08a2d',
  crate: '#6b5a3e',
  ember: '#f0a830',
  emberDark: '#c47f1a',
  warden: '#39b3a8',
  ink: '#e9e6df',
  muted: '#98a0a8',
  danger: '#e5484d',
  health: '#7dc383',
};

export function shade(name) {
  return PALETTE[name];
}
