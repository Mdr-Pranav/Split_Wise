import Icon from './Icon';
import { bucketStyle } from '../lib/buckets';

const sizes = {
  sm: ['h-7 w-7 rounded-lg', 'h-4 w-4'],
  md: ['h-10 w-10 rounded-xl', 'h-5 w-5'],
};

export default function BucketIcon({ name, size = 'md', className = '' }) {
  const { icon, tint } = bucketStyle(name);
  const [box, glyph] = sizes[size];
  return (
    <span className={`flex flex-shrink-0 items-center justify-center ${box} ${tint} ${className}`}>
      <Icon name={icon} className={glyph} />
    </span>
  );
}
