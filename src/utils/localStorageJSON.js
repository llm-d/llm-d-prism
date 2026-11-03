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

// Chrome caps localStorage at ~5 MB per origin, and a handful of BR v0.2 reports
// carrying results.observability time series exceed it, so setItem throws
// (QuotaExceededError in Chrome and Safari, NS_ERROR_DOM_QUOTA_REACHED in
// Firefox). Any throw counts as a failure, and the key is dropped so a stale
// earlier copy cannot be read back as if it were this one.
export const trySetLocalStorageJSON = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return { ok: true, error: null };
    } catch (error) {
        try {
            localStorage.removeItem(key);
        } catch { /* ignore */ }
        return { ok: false, error };
    }
};
