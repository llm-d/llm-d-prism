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

// Chart chrome colors resolved from the CSS variables in src/index.css, so the
// grid/axis ink tracks the active theme. SVG presentation attributes can't
// consume var() directly, so values are read from the computed root style at
// render time, with dark-theme fallbacks for non-DOM contexts.

const FALLBACKS = {
    '--chart-grid': '#1e293b',
    '--chart-axis': '#64748b',
    '--text-secondary': '#94a3b8',
    '--text-primary': '#f8fafc',
};

function cssVar(name) {
    if (typeof window === 'undefined' || !document?.documentElement) return FALLBACKS[name];
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || FALLBACKS[name];
}

export function getChartTheme() {
    return {
        grid: cssVar('--chart-grid'),
        axis: cssVar('--chart-axis'),
        tick: cssVar('--text-secondary'),
        label: cssVar('--text-primary'),
    };
}

// Spread into <CartesianGrid {...gridProps()} />.
export function gridProps() {
    return { stroke: getChartTheme().grid, strokeDasharray: '3 3' };
}
