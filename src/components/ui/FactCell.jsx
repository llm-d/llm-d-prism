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

// The tiny label + mono value cell used throughout Benchmark scenario cards
// and hero configuration columns on well-lit path dashboards.
export function FactCell({ label, value, title, className }) {
    return (
        <div className={cn('min-w-0', className)}>
            <span className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">{label}</span>
            <span className="font-mono font-bold text-white truncate block" title={title}>{value}</span>
        </div>
    );
}
