import { FiLoader } from 'react-icons/fi';

import { cn } from '../../utility/cn';

export default function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
    return <FiLoader size={size} className={cn('animate-spin', className)} />;
}
