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

import type { PrismSubmissionState } from './api.ts';
import type { ListResultsOptions } from './gcs.ts';
import { isPlaygroundMode } from '../iam.ts';

/**
 * Builds the visibility predicate for Results Store listings. Shared by every storage
 * backend so they apply identical rules:
 *
 * 1. Non-admins see public/promoted runs, unlisted runs when they explicitly ask for
 *    status=unlisted, and their own runs.
 * 2. General listings (no status, own, or experimentId filter) exclude unlisted runs.
 * 3. status filter: exact state match.
 * 4. own filter: only runs owned by the caller.
 */
// eslint-disable-next-line no-unused-vars
export function buildListFilters(options: Omit<ListResultsOptions, 'limit' | 'pageToken'>): (state: PrismSubmissionState, user: string) => boolean {
    const { statusFilter, ownFilter, experimentId, username, permission } = options;
    const normalizedExperimentId = experimentId && experimentId.trim() ? experimentId.trim() : null;

    // eslint-disable-next-line no-unused-vars
    const filters: ((state: PrismSubmissionState, user: string) => boolean)[] = [];

    if (permission !== 'admin' && !isPlaygroundMode()) {
        filters.push((state, user) => {
            const isApproved = state === 'public' || state === 'promoted';
            const isExplicitUnlisted = state === 'unlisted' && statusFilter === 'unlisted';
            const isOwn = !!(username && user.toLowerCase() === username.toLowerCase());
            return isApproved || isExplicitUnlisted || isOwn;
        });
    }

    if (!statusFilter && !ownFilter && !normalizedExperimentId) {
        filters.push((state) => state !== 'unlisted');
    }

    if (statusFilter) {
        filters.push((state) => state === statusFilter);
    }

    if (ownFilter) {
        filters.push((_, user) => !!(username && user.toLowerCase() === username.toLowerCase()));
    }

    return (state, user) => filters.every(f => f(state, user));
}
