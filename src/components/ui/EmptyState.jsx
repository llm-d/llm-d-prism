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

export function EmptyState({ icon, title, message, action, className }) {
    return (
        <div className={cn('flex flex-col items-center justify-center text-center gap-2 py-12 px-6', className)}>
            {icon && <div className="text-slate-400 dark:text-slate-600 mb-2">{icon}</div>}
            {title && <div className="text-sm font-bold text-theme-text">{title}</div>}
            {message && <p className="text-xs text-theme-muted max-w-sm leading-relaxed">{message}</p>}
            {action && <div className="mt-3">{action}</div>}
        </div>
    );
}
