import type { LucideIcon } from 'lucide-react';

export interface SidebarItem {
    key: string;
    label: string;
    icon: LucideIcon;
    active?: boolean;
    primary?: boolean;

    destructive?: boolean;
    onClick: () => void;
}

export type MouseAction = 'click' | 'double';

export type MouseIcon = 'logo' | 'browser';

export type LanguageType = 'en' | 'fa' | 'ar' | 'es' | 'pt' | 'hi' | 'zh' | 'ru' | 'fr' | 'tr';
