import clsx, { ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { colors, extendedTheme } from '../../tailwind.extendedConfig';

const customTwMerge = extendTailwindMerge({
  override: {
    theme: {
      color: Object.keys(colors),
    },
  },
  extend: {
    classGroups: {
      'font-size': [
        {
          text: Object.keys(extendedTheme.fontSize),
        },
      ],
    },
  },
});

const cn = (...classes: ClassValue[]) => {
  return customTwMerge(clsx(classes));
};

export default cn;
