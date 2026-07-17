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

import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Compose Tailwind class lists with conflict resolution: later classes win
// (e.g. cn('p-4', condition && 'p-6') keeps only 'p-6' when the condition holds).
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
