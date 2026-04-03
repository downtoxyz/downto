import clsx, { ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { colors, extendedTheme } from '../../tailwind.extendedConfig';

// Flatten color keys including nested ones like neutral.925
function flatColorKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, val]) => {
    const name = prefix ? `${prefix}-${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return flatColorKeys(val as Record<string, unknown>, name);
    }
    return [name];
  });
}

const customTwMerge = extendTailwindMerge({
  override: {
    theme: {
      color: flatColorKeys(colors),
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
