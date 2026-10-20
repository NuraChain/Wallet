/** Keep it mounted: a live region inserted together with its text is not announced. */
export default function Live({ text, assertive = false }: { text: string; assertive?: boolean }) {
    return (
        <div role={assertive ? 'alert' : 'status'} className='sr-only'>
            {text}
        </div>
    );
}
