import { getLanguage } from './language';

export const shortAddress = (address: string, lead = 6, tail = 4) => {
    if (address.length <= lead + tail) {
        return address;
    }

    return `${address.slice(0, lead)}…${address.slice(-tail)}`;
};

export const formatUsd = (value: number) =>
    new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: value !== 0 && Math.abs(value) < 0.01 ? 6 : 2
    }).format(value);

export const formatDate = (timestamp: number) => {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '';
    }

    return new Intl.DateTimeFormat(getLanguage().code, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(timestamp * 1000));
};

const ageUnits: { unit: Intl.RelativeTimeFormatUnit; size: number }[] = [
    { unit: 'second', size: 60 },
    { unit: 'minute', size: 60 },
    { unit: 'hour', size: 24 },
    { unit: 'day', size: Number.POSITIVE_INFINITY }
];

export const formatAge = (at: number) => {
    if (!Number.isFinite(at) || at <= 0) {
        return '';
    }

    let amount = Math.max(0, Math.round((Date.now() - at) / 1000));

    for (const step of ageUnits) {
        if (amount < step.size) {
            return new Intl.RelativeTimeFormat(getLanguage().code, { numeric: 'auto' }).format(-amount, step.unit);
        }

        amount = Math.round(amount / step.size);
    }

    return '';
};

export const trimAmount = (amount: string, max = 6) => {
    if (!amount.includes('.')) {
        return amount;
    }

    const [whole, fraction] = amount.split('.');
    const cut = fraction.slice(0, max).replace(/0+$/, '');

    return cut.length > 0 ? `${whole}.${cut}` : whole;
};
