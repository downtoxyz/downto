export const colors = {
  dt: '#e8ff5a',
  danger: '#ff6b6b',
  neutral: {
    925: '#111',
  },
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
