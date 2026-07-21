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
import { cn } from '../../utils/cn';

// The section eyebrow used across well-lit path dashboards
// ("OVERVIEW", "BENCHMARK SCENARIO", "PRIMARY OUTCOMES", ...).
// Tones follow the established semantic mapping (see skills/style.md):
// overview/hero = cyan, scenario = sky, outcomes = emerald, roadmap = slate.
const TONES = {
    cyan: 'text-cyan-600 dark:text-cyan-400',
    sky: 'text-sky-600 dark:text-sky-400/90',
    emerald: 'text-emerald-600 dark:text-emerald-400/90',
    violet: 'text-violet-600 dark:text-violet-400/90',
    slate: 'text-slate-500',
};

export function SectionLabel({ tone = 'cyan', className, children }) {
    return (
        <div className={cn('text-[10px] font-extrabold uppercase tracking-widest mb-2', TONES[tone], className)}>
            {children}
        </div>
    );
}
