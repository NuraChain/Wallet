import { Loader } from 'lucide-react';

import { cn } from '../../utility/cn';

export default function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
    return <Loader size={size} className={cn('animate-spin', className)} />;
}
