import { useId, type ReactNode } from 'react';

const artSize = 'h-56 max-h-[56%] w-auto max-w-full sm:h-64 md:h-72';

// The theme's own colours, read where the art is drawn, so both themes paint it without a copy of their own.
const accent = { stopColor: 'var(--color-txt-accent)' };
const primary = { stopColor: 'var(--color-btn-primary)' };
const deep = { stopColor: 'var(--color-btn-primary-active)' };
const light = { stopColor: 'var(--color-txt-on-primary)' };

const ink = 'var(--color-txt-on-primary)';

// A gradient's id is looked up across the whole document, and two slides are on screen at once while they swap.
const useArtId = () => `art${useId().replaceAll(/[^\w-]/gu, '')}`;

/** What every scene is painted with: the logo's cyan-to-blue, a darker side for depth, a glow behind and a sheen on top. */
function ArtDefs({ id }: { id: string }) {
    return (
        <defs>
            <radialGradient id={`${id}-halo`} cx='50%' cy='50%' r='50%'>
                <stop offset='0%' stopOpacity='0.22' style={primary} />
                <stop offset='70%' stopOpacity='0.06' style={accent} />
                <stop offset='100%' stopOpacity='0' style={accent} />
            </radialGradient>

            <linearGradient id={`${id}-fill`} x1='0' y1='0' x2='1' y2='1'>
                <stop offset='0%' style={accent} />
                <stop offset='100%' style={primary} />
            </linearGradient>

            <linearGradient id={`${id}-side`} x1='0' y1='0' x2='0' y2='1'>
                <stop offset='0%' style={primary} />
                <stop offset='100%' style={deep} />
            </linearGradient>

            <radialGradient id={`${id}-sheen`} cx='30%' cy='25%' r='60%'>
                <stop offset='0%' stopOpacity='0.55' style={light} />
                <stop offset='100%' stopOpacity='0' style={light} />
            </radialGradient>
        </defs>
    );
}

function Backdrop({ id }: { id: string }) {
    return (
        <>
            <circle cx='100' cy='100' r='96' fill={`url(#${id}-halo)`} />

            <circle cx='100' cy='100' r='88' strokeWidth='1' className='stroke-btn-primary/10' />

            <circle cx='100' cy='100' r='72' strokeWidth='1' strokeDasharray='2 6' strokeLinecap='round' className='stroke-btn-primary/20' />
        </>
    );
}

function Sparkle({ x, y, size }: { x: number; y: number; size: number }) {
    const s = size;

    return (
        <path
            d={`M${x} ${y - s} Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s} Z`}
            className='fill-txt-accent/70'
        />
    );
}

function Tile({ x, y, children }: { x: number; y: number; children: ReactNode }) {
    return (
        <g transform={`translate(${x - 14} ${y - 14})`}>
            <rect x='1' y='3' width='28' height='28' rx='9' className='fill-txt-normal/10' />

            <rect width='28' height='28' rx='9' strokeWidth='1' className='fill-base-2 stroke-line' />

            {children}
        </g>
    );
}

export function IntroArtConnect() {
    const id = useArtId();

    return (
        <svg fill='none' viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg' className={artSize}>
            <ArtDefs id={id} />

            <clipPath id={`${id}-globe`}>
                <circle cx='100' cy='100' r='44' />
            </clipPath>

            <Backdrop id={id} />

            <ellipse cx='100' cy='156' rx='30' ry='4' className='fill-txt-normal/8' />

            {/* The orbit's far half, behind the globe. */}
            <path
                d='M20 100 A80 28 0 0 1 180 100'
                transform='rotate(-20 100 100)'
                strokeWidth='1.5'
                strokeDasharray='3 5'
                strokeLinecap='round'
                className='stroke-txt-accent/50'
            />

            <circle cx='100' cy='100' r='44' fill={`url(#${id}-fill)`} />

            <g clipPath={`url(#${id}-globe)`} stroke={ink} strokeOpacity='0.35' strokeWidth='1.5'>
                <ellipse cx='100' cy='100' rx='18' ry='44' />
                <ellipse cx='100' cy='100' rx='34' ry='44' />
                <path d='M56 100 H144' />
                <path d='M60 80 Q100 88 140 80' />
                <path d='M60 120 Q100 112 140 120' />
            </g>

            <circle cx='100' cy='100' r='44' fill={`url(#${id}-sheen)`} />

            <circle cx='100' cy='100' r='43.25' strokeWidth='1.5' stroke={ink} strokeOpacity='0.25' />

            {/* The orbit's near half, over the globe, carrying what it connects to. */}
            <path d='M20 100 A80 28 0 0 0 180 100' transform='rotate(-20 100 100)' strokeWidth='2' strokeLinecap='round' className='stroke-txt-accent' />

            <Tile x={26} y={117}>
                <circle cx='14' cy='14' r='7' strokeWidth='2' className='stroke-btn-primary' />
                <path
                    d='M14 10.5 V17.5 M11.5 12.5 H15.5 A1.5 1.5 0 0 1 15.5 15.5 H12.5'
                    strokeWidth='1.6'
                    strokeLinecap='round'
                    className='stroke-btn-primary'
                />
            </Tile>

            <Tile x={167} y={65}>
                <path d='M8 19 V15 M12.5 19 V11 M17 19 V13 M21 19 V8' strokeWidth='2.4' strokeLinecap='round' className='stroke-btn-primary' />
            </Tile>

            <Tile x={104} y={150}>
                <path d='M8 11 H19 L16 8 M20 17 H9 L12 20' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' className='stroke-btn-primary' />
            </Tile>

            <Sparkle x={160} y={140} size={5} />

            <Sparkle x={46} y={52} size={6} />

            <Sparkle x={150} y={34} size={3.5} />
        </svg>
    );
}

// Round the ring clockwise from twelve o'clock, as on a clock face.
const peers = Array.from({ length: 6 }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI) / 3;

    return { x: Math.round((100 + Math.cos(angle) * 70) * 10) / 10, y: Math.round((100 + Math.sin(angle) * 70) * 10) / 10, big: index % 2 === 0 };
});

export function IntroArtDecentralized() {
    const id = useArtId();

    const ring = `${peers.map((peer, index) => `${index === 0 ? 'M' : 'L'}${peer.x} ${peer.y}`).join(' ')} Z`;

    return (
        <svg fill='none' viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg' className={artSize}>
            <ArtDefs id={id} />

            <Backdrop id={id} />

            <path d={ring} strokeWidth='1.5' strokeLinejoin='round' className='stroke-btn-primary/30' />

            {peers.map((peer) => (
                <path
                    key={`${peer.x}-${peer.y}`}
                    d={`M100 100 L${peer.x} ${peer.y}`}
                    strokeWidth='1.5'
                    strokeDasharray='3 5'
                    strokeLinecap='round'
                    className='stroke-txt-accent/60'
                />
            ))}

            {/* Data on its way along three of the links. */}
            <circle cx='100' cy='54' r='2.5' className='fill-txt-accent' />

            <circle cx='139' cy='122' r='2.5' className='fill-txt-accent' />

            <circle cx='61' cy='122' r='2.5' className='fill-txt-accent' />

            <ellipse cx='100' cy='146' rx='30' ry='4' className='fill-txt-normal/8' />

            {/* A block, drawn as a cube: the lit top, the two shaded sides, and the edges catching the light. */}
            <path d='M100 60 L135 80 L100 100 L65 80 Z' fill={`url(#${id}-fill)`} />

            <path d='M65 80 L100 100 V140 L65 120 Z' fill={`url(#${id}-side)`} />

            <path d='M100 100 L135 80 V120 L100 140 Z' fill={`url(#${id}-side)`} fillOpacity='0.8' />

            <path d='M100 60 L135 80 L100 100 L65 80 Z' fill={`url(#${id}-sheen)`} />

            <path d='M65 80 L100 100 L135 80 M100 100 V140' stroke={ink} strokeOpacity='0.45' strokeWidth='1.2' strokeLinejoin='round' />

            <path d='M100 71 L115 80 L100 89 L85 80 Z' stroke={ink} strokeOpacity='0.7' strokeWidth='1.5' strokeLinejoin='round' />

            {peers.map((peer) => {
                const r = peer.big ? 11 : 8;

                return (
                    <g key={`${peer.x}-${peer.y}`}>
                        <circle cx={peer.x} cy={peer.y} r={r + 3} className='fill-base-2' />

                        <circle cx={peer.x} cy={peer.y} r={r} fill={`url(#${id}-fill)`} />

                        <circle cx={peer.x} cy={peer.y} r={r} fill={`url(#${id}-sheen)`} />

                        <circle cx={peer.x} cy={peer.y} r={r + 3} strokeWidth='1' className='stroke-line' />
                    </g>
                );
            })}

            <Sparkle x={160} y={176} size={4} />

            <Sparkle x={36} y={30} size={5} />
        </svg>
    );
}

export function IntroArtSecure() {
    const id = useArtId();

    const shield = 'M100 26 L156 49 V100 C156 136 132 162 100 175 C68 162 44 136 44 100 V49 Z';

    return (
        <svg fill='none' viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg' className={artSize}>
            <ArtDefs id={id} />

            <clipPath id={`${id}-shield`}>
                <path d={shield} />
            </clipPath>

            <Backdrop id={id} />

            <ellipse cx='100' cy='186' rx='34' ry='4' className='fill-txt-normal/8' />

            {/* A second shield behind, for depth. */}
            <path d={shield} transform='translate(8 6)' className='fill-btn-primary/15' />

            <path d={shield} fill={`url(#${id}-fill)`} />

            {/* The left half lit, as if from the upper left. */}
            <g clipPath={`url(#${id}-shield)`}>
                <path d='M100 20 V180 H40 V20 Z' fill={ink} fillOpacity='0.12' />

                <circle cx='72' cy='52' r='60' fill={`url(#${id}-sheen)`} />
            </g>

            <path
                d='M100 40 L143 58 V100 C143 128 125 149 100 160 C75 149 57 128 57 100 V58 Z'
                stroke={ink}
                strokeOpacity='0.35'
                strokeWidth='1.5'
                strokeLinejoin='round'
            />

            <path d='M86 96 V84 A14 14 0 0 1 114 84 V96' stroke={ink} strokeWidth='7' strokeLinecap='round' />

            <rect x='74' y='93' width='52' height='42' rx='12' fill={ink} />

            <rect x='74' y='93' width='52' height='14' rx='7' className='fill-txt-accent/15' />

            <circle cx='100' cy='110' r='6' className='fill-btn-primary' />

            <path d='M100 113 V123' strokeWidth='4.5' strokeLinecap='round' className='stroke-btn-primary' />

            <Sparkle x={34} y={62} size={6} />

            <Sparkle x={168} y={128} size={5} />

            <Sparkle x={160} y={44} size={3.5} />
        </svg>
    );
}
