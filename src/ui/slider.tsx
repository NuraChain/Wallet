/** A range, set by dragging; the value it reports is the one it shows. */
export default function Slider({
    value,
    min,
    max,
    step,
    labelledBy,
    onValue
}: {
    value: number;
    min: number;
    max: number;
    step: number;
    /** The id of the text that names it. */
    labelledBy: string;
    onValue: (value: number) => void;
}) {
    return (
        <input
            type='range'
            min={min}
            max={max}
            step={step}
            value={value}
            aria-labelledby={labelledBy}
            onChange={(event) => {
                onValue(Number(event.target.value));
            }}
            className='h-6 w-full cursor-pointer accent-btn-primary'
        />
    );
}
