import { colors, extendedTheme } from './tailwind.extendedConfig';

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    colors,
    extend: extendedTheme,
  },
};
