export const colors = {
  // Brand / accent
  dt: '#e8ff5a',
  danger: '#ff6b6b',
  pool: '#00d4ff',

  // Surfaces
  bg: '#0a0a0a',
  card: '#111',
  surface: '#1a1a1a',
  deep: '#0d0d0d',

  // Text hierarchy
  primary: '#fff',
  muted: '#888',
  dim: '#666',
  faint: '#444',

  // Borders
  border: '#1a1a1a',
  'border-light': '#2a2a2a',
  'border-mid': '#333',

  // Tailwind neutral for one-offs
  neutral: {
    925: '#111',
  },

  // Preserve defaults needed by Tailwind utilities
  transparent: 'transparent',
  current: 'currentColor',
  white: '#fff',
  black: '#000',
};

export const extendedTheme = {
  fontSize: {
    tiny: ['0.625rem'],
  },
  keyframes: {
    fadeIn: {
      from: { opacity: '0', transform: 'translateY(8px)' },
      to: { opacity: '1', transform: 'translateY(0)' },
    },
    slideUp: {
      from: {
        transform: 'translateY(100%)',
        opacity: '0',
      },
      to: {
        transform: 'translateY(0)',
        opacity: '1',
      },
    },
  },
  animations: {
    'fade-in': 'fadeIn 0.3s ease',
    'slide-up': 'slideUp 0.3s ease-out',
  },
};
