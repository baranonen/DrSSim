export const PALETTE = Object.freeze({ yellow: '#ffe98b', green: '#91e3ab', red: '#fa7561', white: '#fff0b3', off: '#30332d' });

// Warm halogen center with slightly darker edges; unlit windows retain a flat color.
export const LAMP_GRADIENTS = Object.freeze({
  yellow: Object.freeze([PALETTE.yellow, '#f8de81', '#e8ce75']),
  white: Object.freeze([PALETTE.white, '#f9e7aa', '#ecd899']),
  green: Object.freeze([PALETTE.green, '#88d9a2', '#7ac893']),
  red: Object.freeze([PALETTE.red, '#f0705c', '#df6352']),
});
