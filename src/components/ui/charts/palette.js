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

// The single categorical palette for every chart in Prism.
//
// Validated (OKLCH lightness band, chroma floor, CVD adjacent-pair separation,
// normal-vision floor, WCAG contrast) against both the light (#ffffff) and dark
// (#0f172a) chart surfaces. Do not add, reorder, or substitute steps without
// re-running the validation.
//
// Rules (see skills/style.md):
//  - Assign hues in this fixed order; never cycle or randomize.
//  - Color follows the entity: a series keeps its color when filters change.
//  - More than 5 series? Fold the tail into "Other" or split into small
//    multiples; do not invent a 6th hue.
export const CHART_SERIES = [
    '#059669', // emerald — brand; baseline / primary series
    '#0284c7', // sky
    '#d97706', // amber
    '#7c3aed', // violet
    '#db2777', // pink
];

export function seriesColor(index) {
    return CHART_SERIES[index % CHART_SERIES.length];
}

// Status colors for chart marks that encode state (pass/fail bands, threshold
// lines). Reserved for state — never used as "series 6". Always pair with a
// label or icon; never state by color alone.
export const CHART_STATUS = {
    good: '#059669',
    warning: '#d97706',
    critical: '#dc2626',
    neutral: '#64748b',
};
