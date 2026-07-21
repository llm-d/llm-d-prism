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

import React from 'react';
import { MessageCircle } from 'lucide-react';
import { PageHeader, ShareLinkButton } from './PageHeader';
import { Badge } from './Badge';

// The canonical header for well-lit path dashboards (see skills/style.md):
// fixed at the top, llm-d logo + Prism wordmark, page title, "Guided path"
// badge, Contact us link, Share link. Pair with pt-16 on the page root so
// content clears the fixed bar. Do not hand-roll this per dashboard.
export function WellLitHeader({
    pageTitle,
    badgeLabel = 'Guided path',
    contactHref = 'https://llm-d.ai/community',
    getShareUrl,
    onNavigateBack,
    onToggleMobileNav,
    extraActions,
}) {
    return (
        <PageHeader
            className="fixed top-0 left-0 right-0 z-[49] h-16 px-6 border-slate-900/65 bg-slate-950/20 backdrop-blur-md"
            onNavigateBack={onNavigateBack}
            onToggleMobileNav={onToggleMobileNav}
            title={
                <span className="flex items-center gap-4 min-w-0">
                    <span className="flex items-center gap-2.5 border-r border-slate-800 pr-4 shrink-0">
                        <img
                            src="https://llm-d.ai/img/llm-d-logotype-and-icon.png"
                            alt="llm-d Logo"
                            className="h-6 object-contain"
                        />
                        <span className="text-lg font-bold tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 select-none hidden sm:inline">
                            Prism
                        </span>
                    </span>
                    <span className="text-sm font-semibold text-slate-200 tracking-wide select-none truncate">
                        {pageTitle}
                    </span>
                </span>
            }
            badge={
                <Badge tone="brand" size="sm" className="hidden sm:inline-flex font-mono">
                    {badgeLabel}
                </Badge>
            }
            actions={
                <>
                    <a
                        href={contactHref}
                        target="_blank"
                        rel="noreferrer"
                        title="Contact us"
                        className="px-3.5 py-1.5 text-xs font-semibold rounded-xl text-slate-300 bg-slate-900/40 hover:bg-slate-900/80 transition-all flex items-center border border-slate-800 hover:border-slate-700 cursor-pointer"
                    >
                        <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
                        <span className="hidden sm:inline">Contact us</span>
                    </a>
                    <ShareLinkButton getUrl={getShareUrl} />
                    {extraActions}
                </>
            }
        />
    );
}
