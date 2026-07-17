// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React, { useState } from 'react';
import { ArrowLeft, Menu, Share2 } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from './Button';

// Standard dashboard header chrome: mobile nav toggle, back arrow, title block,
// and a right-hand action cluster (Share link, Export, etc.).
export function PageHeader({
    title,
    subtitle,
    badge,
    onNavigateBack,
    onToggleMobileNav,
    actions,
    className,
}) {
    return (
        <header
            className={cn(
                'sticky top-0 z-40 w-full border-b border-theme-border bg-theme-bg/80 backdrop-blur-xl',
                'flex items-center justify-between gap-4 px-4 sm:px-6 py-3',
                className
            )}
        >
            <div className="flex items-center gap-2 min-w-0">
                {onToggleMobileNav && (
                    <button
                        onClick={onToggleMobileNav}
                        aria-label="Toggle navigation"
                        className="p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors md:hidden"
                    >
                        <Menu className="h-5 w-5" />
                    </button>
                )}
                {onNavigateBack && (
                    <button
                        onClick={onNavigateBack}
                        aria-label="Back"
                        className="p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                )}
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h1 className="text-base sm:text-lg font-bold text-theme-text truncate">{title}</h1>
                        {badge}
                    </div>
                    {subtitle && <p className="text-xs text-theme-muted truncate">{subtitle}</p>}
                </div>
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
    );
}

// "Share link" button with the built-in "Link copied!" toast used across dashboards.
// Pass getUrl to share a constructed deep link instead of the current location.
export function ShareLinkButton({ label = 'Share link', getUrl, className }) {
    const [copied, setCopied] = useState(false);

    const handleShare = () => {
        navigator.clipboard.writeText(getUrl ? getUrl() : window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Button variant="secondary" size="sm" onClick={handleShare} className={cn('relative', className)}>
            <Share2 className="w-3.5 h-3.5" />
            <span>{label}</span>
            {copied && (
                <span className="absolute -bottom-10 right-0 bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded shadow-lg z-50 whitespace-nowrap">
                    Link copied!
                </span>
            )}
        </Button>
    );
}
