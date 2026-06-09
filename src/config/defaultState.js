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

export const defaultState = {
    chartMode: "ntpot",
    tputType: "output",
    costMode: "spot",
    latType: "e2e",
    selectedModels: new Set([]),
    modelsFilter: new Set([]),
    hwFilter: new Set([]),
    precFilter: new Set([]),
    tpFilter: new Set([]),
    islFilter: new Set([]),
    oslFilter: new Set([]),
    ratioFilter: new Set([]),
    sources: new Set([]),
    buckets: [],
    giqProjects: [],
    xAxisMax: 1590,
    showPerChip: false,
    showSelectedOnly: true,
    showPareto: false,
    showLabels: true,
    showDataLabels: false,
    enableLLMDResults: true
};