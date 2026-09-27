/** A range, set by dragging; the value it reports is the one it shows. */
export default function Slider({
    value,
    min,
    max,
    step,
    onValue
}: {
    value: number;
    min: number;
    max: number;
    step: number;
    onValue: (value: number) => void;
}) {
    return (
        <input
            type='range'
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => {
                onValue(Number(event.target.value));
            }}
            className='h-6 w-full cursor-pointer accent-btn-primary'
        />
    );
}
