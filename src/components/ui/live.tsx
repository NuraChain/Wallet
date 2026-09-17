/**
 * An announcement slot that is always in the tree.
 *
 * A live region inserted into the DOM at the same moment as its text is usually not announced at
 * all — the region has to already be there and then change. Every confirmation and error in this
 * app used to mount with its message and was silent for assistive tech because of it.
 *
 * `sr-only` positions this absolutely, so it is not a flex item and never adds a gap to the
 * column it sits in. That is what lets it stay mounted while rendering nothing.
 */
export default function Live({ text, assertive = false }: { text: string; assertive?: boolean }) {
    return (
        <div role={assertive ? 'alert' : 'status'} aria-live={assertive ? 'assertive' : 'polite'} className='sr-only'>
            {text}
        </div>
    );
}
