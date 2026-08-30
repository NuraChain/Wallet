export function IntroArtConnect({ className = '' }: { className?: string }) {
    return (
        <svg fill='none' aria-hidden='true' viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg' className={className}>
            <circle cx='100' cy='100' r='86' className='fill-btn-primary/10' />

            <circle cx='100' cy='100' r='62' strokeWidth='2' className='fill-btn-primary/10 stroke-btn-primary/40' />

            <ellipse cx='100' cy='100' rx='26' ry='62' strokeWidth='2' className='stroke-txt-normal/25' />

            <path d='M45 80 H155' strokeWidth='2' strokeLinecap='round' className='stroke-txt-normal/25' />

            <path d='M45 120 H155' strokeWidth='2' strokeLinecap='round' className='stroke-txt-normal/25' />

            <path
                d='M62 72 L100 100 L142 76 M100 100 L130 144 M100 100 L58 132'
                strokeWidth='2'
                strokeDasharray='5 7'
                strokeLinecap='round'
                className='stroke-btn-primary/70'
            />

            <circle cx='62' cy='72' r='8' strokeWidth='3' className='fill-btn-primary stroke-base-2' />

            <circle cx='142' cy='76' r='8' strokeWidth='3' className='fill-btn-primary stroke-base-2' />

            <circle cx='130' cy='144' r='8' strokeWidth='3' className='fill-btn-primary stroke-base-2' />

            <circle cx='58' cy='132' r='8' strokeWidth='3' className='fill-btn-primary stroke-base-2' />

            <circle cx='100' cy='100' r='11' strokeWidth='4' className='fill-btn-primary stroke-base-2' />
        </svg>
    );
}

export function IntroArtDecentralized({ className = '' }: { className?: string }) {
    return (
        <svg fill='none' aria-hidden='true' viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg' className={className}>
            <circle cx='100' cy='100' r='86' className='fill-btn-primary/10' />

            <path d='M100 32 L158 66 V134 L100 168 L42 134 V66 Z' strokeWidth='2' strokeLinejoin='round' className='stroke-txt-normal/25' />

            <path
                d='M100 32 V78 M158 66 L128 88 M158 134 L128 116 M100 168 V126 M42 134 L72 116 M42 66 L72 88'
                strokeWidth='2'
                strokeDasharray='5 7'
                strokeLinecap='round'
                className='stroke-btn-primary/60'
            />

            <circle cx='100' cy='32' r='8' className='fill-btn-primary' />

            <circle cx='158' cy='66' r='8' className='fill-btn-primary/45' />

            <circle cx='158' cy='134' r='8' className='fill-btn-primary' />

            <circle cx='100' cy='168' r='8' className='fill-btn-primary/45' />

            <circle cx='42' cy='134' r='8' className='fill-btn-primary' />

            <circle cx='42' cy='66' r='8' className='fill-btn-primary/45' />

            <rect x='64' y='76' width='72' height='48' rx='14' strokeWidth='2' className='fill-base-2 stroke-btn-primary/50' />

            <rect x='76' y='90' width='34' height='6' rx='3' className='fill-txt-normal/40' />

            <rect x='76' y='104' width='22' height='6' rx='3' className='fill-txt-normal/25' />

            <circle cx='120' cy='107' r='9' className='fill-btn-primary' />
        </svg>
    );
}

export function IntroArtSecure({ className = '' }: { className?: string }) {
    return (
        <svg fill='none' aria-hidden='true' viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg' className={className}>
            <circle cx='100' cy='100' r='86' className='fill-btn-primary/10' />

            <path
                d='M100 24 L160 50 V102 C160 138 134 165 100 177 C66 165 40 138 40 102 V50 Z'
                strokeWidth='2'
                strokeLinejoin='round'
                className='fill-base-2 stroke-btn-primary/50'
            />

            <path
                d='M100 42 L146 62 V102 C146 129 127 150 100 160 C73 150 54 129 54 102 V62 Z'
                strokeWidth='2'
                strokeLinejoin='round'
                className='stroke-txt-normal/15'
            />

            <path d='M84 98 V84 A16 16 0 0 1 116 84 V98' strokeWidth='7' strokeLinecap='round' className='stroke-btn-primary' />

            <rect x='72' y='96' width='56' height='46' rx='14' className='fill-btn-primary' />

            <circle cx='100' cy='114' r='6' className='fill-txt-reverse' />

            <path d='M100 118 V128' strokeWidth='5' strokeLinecap='round' className='stroke-txt-reverse' />

            <path d='M32 58 V72 M25 65 H39' strokeWidth='3' strokeLinecap='round' className='stroke-btn-primary/60' />

            <path d='M168 118 V130 M162 124 H174' strokeWidth='3' strokeLinecap='round' className='stroke-btn-primary/60' />
        </svg>
    );
}
