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

/** The S3 Results Store instance (RESULTS_STORE_BACKEND=s3), cached so its caches survive requests. */

import { S3ResultsStore } from './s3.ts';
import { resolveS3ResultsStore, ResultsStoreError } from '../backend.ts';

let cached: S3ResultsStore | null = null;
let override: S3ResultsStore | null = null;

export function getS3ResultsStore(): S3ResultsStore {
    if (override) return override;
    const resolved = resolveS3ResultsStore();
    if (!resolved.ok) throw new ResultsStoreError(`Results Store is not configured: ${resolved.reason}`, 503);
    return (cached ??= new S3ResultsStore(resolved.location));
}

/** Test hook: force a specific store instance (null restores normal resolution). */
export function setS3ResultsStoreForTesting(store: S3ResultsStore | null): void {
    override = store;
}
