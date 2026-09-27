import { Loader } from 'lucide-react';

import { cn } from '../utility/cn';
import { placement, type Placement } from './place';

export default function Spinner({ size = 16, muted = false, ...place }: { size?: number; muted?: boolean } & Placement) {
    return <Loader size={size} className={cn('animate-spin', muted && 'text-txt-muted', placement(place))} />;
}
