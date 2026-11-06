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

/**
 * Dedicated persistence & handoff store for staged benchmark bundles.
 *
 * Uses its own IndexedDB database (`PrismStagingDB`) + a synchronous in-memory
 * cache so multi-run BR v0.2 bundles (with dense observability time-series and
 * manifests exceeding localStorage's ~5 MB ceiling) survive wizard handoffs,
 * browser refreshes, and GitHub OAuth redirects without hitting QuotaExceededError,
 * while remaining isolated from `CacheManager.clearAll()` cache invalidations.
 */

import { trySetLocalStorageJSON } from './localStorageJSON';

const DB_NAME = 'PrismStagingDB';
const STORE_NAME = 'staged_state';
const DB_VERSION = 1;

const ACTIVE_STAGED_KEY = 'active_staged_bundles';
const UPLOAD_CACHE_KEY = 'staged_upload_cache';
const BRV02_RUNS_KEY = 'brv02_runs';

export const LEGACY_ACTIVE_STAGED_LS = 'prism_active_staged_bundles';
export const LEGACY_UPLOAD_CACHE_LS = 'prism_staged_upload_cache';
export const LEGACY_BRV02_RUNS_LS = 'prism_brv02_runs';

export const HAS_ACTIVE_STAGED_LS = 'prism_has_active_staged_bundles';
export const HAS_UPLOAD_CACHE_LS = 'prism_has_staged_upload_cache';
export const HAS_BRV02_RUNS_LS = 'prism_has_brv02_runs';
export const STAGED_META_LS = 'prism_staged_meta';

export const WIZARD_STEP_LS = 'prism_upload_wizard_step';
export const SUBMIT_INTENT_LS = 'prism_submit_intent';
export const TRIGGER_RESUME_LS = 'prism_trigger_resume_upload';

const memoryStore = new Map();
let memoryWizardMeta = { step: null, intent: null };

const getIndexedDBFactory = () => {
    if (typeof indexedDB !== 'undefined' && indexedDB) return indexedDB;
    if (typeof window !== 'undefined' && window.indexedDB) return window.indexedDB;
    return null;
};

export const hasIndexedDB = () => Boolean(getIndexedDBFactory());

const safeLsGet = (key) => {
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

const safeLsSet = (key, value) => {
    try {
        if (typeof localStorage === 'undefined') return false;
        localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
};

const safeLsRemove = (key) => {
    try {
        if (typeof localStorage === 'undefined') return;
        localStorage.removeItem(key);
    } catch {
        /* ignore */
    }
};

export const isQuotaExceededError = (err) => {
    if (!err) return false;
    if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        return true;
    }
    if (err.code === 22 || err.code === 1014) {
        return true;
    }
    const msg = typeof err.message === 'string' ? err.message.toLowerCase() : '';
    return msg.includes('quota') || msg.includes('exceeded');
};

export const formatStorageError = (err) => {
    if (isQuotaExceededError(err)) {
        return 'Browser storage quota exceeded. Free up browser storage or stage fewer runs.';
    }
    return err?.message || String(err || 'Browser storage unavailable');
};

export const formatWizardHandoffError = (err, count = 1) => {
    if (isQuotaExceededError(err)) {
        return count === 1
            ? 'Browser storage quota exceeded: this run is too large for browser storage, so it cannot be opened in the upload wizard.'
            : `Browser storage quota exceeded: these ${count} runs are too large for browser storage to open in the upload wizard together. Select fewer runs at once.`;
    }
    return `Failed to open selected benchmarks: ${formatStorageError(err)}`;
};

const normalizeFileDescriptor = (fileObj) => {
    if (!fileObj || typeof fileObj !== 'object') return fileObj;
    return {
        name: fileObj.name || '',
        webkitRelativePath: typeof fileObj.webkitRelativePath === 'string' ? fileObj.webkitRelativePath : ''
    };
};

/**
 * Converts any DOM `File` instances attached to bundle metadata/stage descriptors
 * into plain serializable objects safe for both IndexedDB structured cloning
 * and JSON fallback serialization.
 */
export const toCloneableBundles = (bundles) => {
    if (!Array.isArray(bundles)) return [];
    return bundles.map((bundle) => {
        if (!bundle || typeof bundle !== 'object') return bundle;
        const clone = { ...bundle };

        if (Array.isArray(bundle.stageFiles)) {
            clone.stageFiles = bundle.stageFiles.map((sf) => {
                if (!sf || typeof sf !== 'object') return sf;
                return sf.file ? { ...sf, file: normalizeFileDescriptor(sf.file) } : { ...sf };
            });
        }

        if (bundle.metadataFiles && typeof bundle.metadataFiles === 'object') {
            const metaCopy = { ...bundle.metadataFiles };
            for (const metaKey of Object.keys(metaCopy)) {
                const entry = metaCopy[metaKey];
                if (entry && typeof entry === 'object' && entry.file) {
                    metaCopy[metaKey] = { ...entry, file: normalizeFileDescriptor(entry.file) };
                }
            }
            clone.metadataFiles = metaCopy;
        }

        if (Array.isArray(bundle.originalSourceBundles)) {
            clone.originalSourceBundles = toCloneableBundles(bundle.originalSourceBundles);
        }

        return clone;
    });
};

const openStagingDB = () => {
    return new Promise((resolve, reject) => {
        const idb = getIndexedDBFactory();
        if (!idb) {
            reject(new Error('IndexedDB not supported'));
            return;
        }

        let request;
        try {
            request = idb.open(DB_NAME, DB_VERSION);
        } catch (err) {
            reject(err);
            return;
        }

        request.onerror = () => reject(request.error || new Error('Failed to open PrismStagingDB'));
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
};

const idbPut = async (key, value) => {
    const db = await openStagingDB();
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn, arg) => {
            if (settled) return;
            settled = true;
            try {
                db.close();
            } catch {
                /* ignore */
            }
            fn(arg);
        };

        try {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(value, key);

            request.onerror = () => finish(reject, request.error || new Error(`IndexedDB put failed for ${key}`));
            // Resolve on tx.oncomplete (not request.onsuccess) so writes flush to disk
            // before cross-page navigations like GitHub OAuth redirects.
            tx.oncomplete = () => finish(resolve, true);
            tx.onerror = () => finish(reject, tx.error || request.error || new Error(`IndexedDB transaction failed for ${key}`));
            tx.onabort = () => finish(reject, tx.error || new Error(`IndexedDB transaction aborted for ${key}`));
        } catch (err) {
            finish(reject, err);
        }
    });
};

const idbGet = async (key) => {
    const db = await openStagingDB();
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn, arg) => {
            if (settled) return;
            settled = true;
            try {
                db.close();
            } catch {
                /* ignore */
            }
            fn(arg);
        };

        try {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(key);

            request.onsuccess = () => finish(resolve, request.result ?? null);
            request.onerror = () => finish(reject, request.error || new Error(`IndexedDB get failed for ${key}`));
            tx.onerror = () => finish(reject, tx.error || request.error || new Error(`IndexedDB read transaction failed for ${key}`));
        } catch (err) {
            finish(reject, err);
        }
    });
};

const idbDelete = async (key) => {
    const db = await openStagingDB();
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn, arg) => {
            if (settled) return;
            settled = true;
            try {
                db.close();
            } catch {
                /* ignore */
            }
            fn(arg);
        };

        try {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.delete(key);

            request.onerror = () => finish(reject, request.error || new Error(`IndexedDB delete failed for ${key}`));
            tx.oncomplete = () => finish(resolve, true);
            tx.onerror = () => finish(reject, tx.error || request.error || new Error(`IndexedDB delete transaction failed for ${key}`));
            tx.onabort = () => finish(reject, tx.error || new Error(`IndexedDB delete transaction aborted for ${key}`));
        } catch (err) {
            finish(reject, err);
        }
    });
};

const emitStagedChanged = (slotKey, count) => {
    const meta = { slot: slotKey, count, updatedAt: Date.now() };
    safeLsSet(STAGED_META_LS, JSON.stringify(meta));
    try {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent('prism:staged-bundles-changed', { detail: meta }));
        }
    } catch {
        /* ignore */
    }
};

const persistSlotFallbackSync = ({ slotKey, legacyLsKey, markerLsKey, data, clearMemoryOnError = true, idbError = null }) => {
    const isEmpty = !Array.isArray(data) || data.length === 0;

    if (isEmpty) {
        memoryStore.delete(slotKey);
        safeLsRemove(legacyLsKey);
        safeLsRemove(markerLsKey);
        emitStagedChanged(slotKey, 0);
        return { ok: true, backend: 'cleared' };
    }

    if (typeof localStorage === 'undefined') {
        if (clearMemoryOnError) {
            memoryStore.delete(slotKey);
        }
        safeLsRemove(markerLsKey);
        return { ok: false, error: idbError || new Error('Browser storage is unavailable') };
    }

    const lsRes = trySetLocalStorageJSON(legacyLsKey, data);
    if (lsRes.ok) {
        safeLsSet(markerLsKey, '1');
        memoryStore.set(slotKey, data);
        emitStagedChanged(slotKey, data.length);
        return { ok: true, backend: 'localstorage' };
    }

    if (clearMemoryOnError) {
        memoryStore.delete(slotKey);
    }
    safeLsRemove(markerLsKey);
    const primaryError = isQuotaExceededError(idbError) ? idbError : (lsRes.error || idbError);
    return { ok: false, error: primaryError };
};

const persistSlot = async ({ slotKey, legacyLsKey, markerLsKey, data, clearMemoryOnError = true }) => {
    const isEmpty = !Array.isArray(data) || data.length === 0;

    // Always clear any bulky legacy JSON from localStorage first to reclaim quota.
    safeLsRemove(legacyLsKey);

    if (isEmpty) {
        memoryStore.delete(slotKey);
        safeLsRemove(markerLsKey);
        if (hasIndexedDB()) {
            try {
                await idbDelete(slotKey);
            } catch {
                /* ignore */
            }
        }
        emitStagedChanged(slotKey, 0);
        return { ok: true, backend: 'cleared' };
    }

    let idbError = null;
    if (hasIndexedDB()) {
        try {
            await idbPut(slotKey, data);
            memoryStore.set(slotKey, data);
            safeLsSet(markerLsKey, '1');
            emitStagedChanged(slotKey, data.length);
            return { ok: true, backend: 'indexeddb' };
        } catch (err) {
            idbError = err;
        }
    }

    return persistSlotFallbackSync({
        slotKey,
        legacyLsKey,
        markerLsKey,
        data,
        clearMemoryOnError,
        idbError
    });
};

const readSlotSync = ({ slotKey, legacyLsKey, markerLsKey }) => {
    if (memoryStore.has(slotKey)) {
        if (!hasIndexedDB() && safeLsGet(legacyLsKey) === null) {
            memoryStore.delete(slotKey);
        } else {
            return memoryStore.get(slotKey);
        }
    }

    const legacyRaw = safeLsGet(legacyLsKey);
    if (legacyRaw) {
        try {
            const parsed = JSON.parse(legacyRaw);
            if (Array.isArray(parsed)) {
                memoryStore.set(slotKey, parsed);
                if (hasIndexedDB()) {
                    // Opportunistically migrate legacy localStorage payload into IndexedDB.
                    idbPut(slotKey, parsed)
                        .then(() => {
                            safeLsSet(markerLsKey, '1');
                            safeLsRemove(legacyLsKey);
                        })
                        .catch(() => {
                            /* ignore background migration failure */
                        });
                }
                return parsed;
            }
        } catch {
            safeLsRemove(legacyLsKey);
        }
    }

    return null;
};

const loadSlotAsync = async ({ slotKey, legacyLsKey, markerLsKey }) => {
    if (memoryStore.has(slotKey)) {
        return memoryStore.get(slotKey);
    }

    if (hasIndexedDB()) {
        try {
            const idbVal = await idbGet(slotKey);
            if (Array.isArray(idbVal)) {
                memoryStore.set(slotKey, idbVal);
                safeLsRemove(legacyLsKey);
                safeLsSet(markerLsKey, '1');
                return idbVal;
            }
        } catch (err) {
            console.warn(`[stagedBundlesStore] Failed reading ${slotKey} from IndexedDB:`, err);
        }
    }

    const syncFallback = readSlotSync({ slotKey, legacyLsKey, markerLsKey });
    if (syncFallback !== null) {
        return syncFallback;
    }

    safeLsRemove(markerLsKey);
    return null;
};

const clearSlotAsync = async ({ slotKey, legacyLsKey, markerLsKey }) => {
    memoryStore.delete(slotKey);
    safeLsRemove(legacyLsKey);
    safeLsRemove(markerLsKey);
    if (hasIndexedDB()) {
        try {
            await idbDelete(slotKey);
        } catch {
            /* ignore */
        }
    }
    emitStagedChanged(slotKey, 0);
};

// --- Active Staged Bundles & Wizard Handoff API ---

export const saveActiveStagedBundles = async (bundles) => {
    const clean = toCloneableBundles(bundles);
    return persistSlot({
        slotKey: ACTIVE_STAGED_KEY,
        legacyLsKey: LEGACY_ACTIVE_STAGED_LS,
        markerLsKey: HAS_ACTIVE_STAGED_LS,
        data: clean
    });
};

export const getActiveStagedBundlesSync = () =>
    readSlotSync({
        slotKey: ACTIVE_STAGED_KEY,
        legacyLsKey: LEGACY_ACTIVE_STAGED_LS,
        markerLsKey: HAS_ACTIVE_STAGED_LS
    });

export const loadActiveStagedBundles = () =>
    loadSlotAsync({
        slotKey: ACTIVE_STAGED_KEY,
        legacyLsKey: LEGACY_ACTIVE_STAGED_LS,
        markerLsKey: HAS_ACTIVE_STAGED_LS
    });

export const clearActiveStagedBundles = () =>
    clearSlotAsync({
        slotKey: ACTIVE_STAGED_KEY,
        legacyLsKey: LEGACY_ACTIVE_STAGED_LS,
        markerLsKey: HAS_ACTIVE_STAGED_LS
    });

export const clearWizardHandoffFlags = () => {
    memoryWizardMeta = { step: null, intent: null };
    safeLsRemove(WIZARD_STEP_LS);
    safeLsRemove(SUBMIT_INTENT_LS);
    safeLsRemove(TRIGGER_RESUME_LS);
};

export const saveWizardHandoffSync = ({ bundles, step = 2, intent = 'submit-review' }) => {
    const clean = toCloneableBundles(bundles);
    const res = persistSlotFallbackSync({
        slotKey: ACTIVE_STAGED_KEY,
        legacyLsKey: LEGACY_ACTIVE_STAGED_LS,
        markerLsKey: HAS_ACTIVE_STAGED_LS,
        data: clean
    });
    if (!res.ok) {
        clearWizardHandoffFlags();
        return res;
    }

    const stepStr = String(step);
    memoryWizardMeta = { step: stepStr, intent };
    const stepSaved = safeLsSet(WIZARD_STEP_LS, stepStr);
    const intentSaved = safeLsSet(SUBMIT_INTENT_LS, intent);

    if (!stepSaved || !intentSaved) {
        memoryStore.delete(ACTIVE_STAGED_KEY);
        safeLsRemove(LEGACY_ACTIVE_STAGED_LS);
        safeLsRemove(HAS_ACTIVE_STAGED_LS);
        clearWizardHandoffFlags();
        const quotaErr = new Error('Browser storage quota exceeded while saving wizard step.');
        quotaErr.name = 'QuotaExceededError';
        return { ok: false, error: quotaErr };
    }

    return res;
};

export const saveWizardHandoff = async ({ bundles, step = 2, intent = 'submit-review' }) => {
    const res = await saveActiveStagedBundles(bundles);
    if (!res.ok) {
        clearWizardHandoffFlags();
        return res;
    }

    const stepStr = String(step);
    memoryWizardMeta = { step: stepStr, intent };
    const stepSaved = safeLsSet(WIZARD_STEP_LS, stepStr);
    const intentSaved = safeLsSet(SUBMIT_INTENT_LS, intent);

    // If localStorage served as the sole storage backend and couldn't store wizard metadata,
    // fail cleanly rather than opening Step 1 with orphaned state.
    if (res.backend === 'localstorage' && (!stepSaved || !intentSaved)) {
        await clearActiveStagedBundles();
        clearWizardHandoffFlags();
        const quotaErr = new Error('Browser storage quota exceeded while saving wizard step.');
        quotaErr.name = 'QuotaExceededError';
        return { ok: false, error: quotaErr };
    }

    return res;
};

// --- GitHub OAuth Redirect Cache API ---

export const saveStagedUploadCache = async (bundles) => {
    const clean = toCloneableBundles(bundles);
    return persistSlot({
        slotKey: UPLOAD_CACHE_KEY,
        legacyLsKey: LEGACY_UPLOAD_CACHE_LS,
        markerLsKey: HAS_UPLOAD_CACHE_LS,
        data: clean
    });
};

export const getStagedUploadCacheSync = () =>
    readSlotSync({
        slotKey: UPLOAD_CACHE_KEY,
        legacyLsKey: LEGACY_UPLOAD_CACHE_LS,
        markerLsKey: HAS_UPLOAD_CACHE_LS
    });

export const loadStagedUploadCache = () =>
    loadSlotAsync({
        slotKey: UPLOAD_CACHE_KEY,
        legacyLsKey: LEGACY_UPLOAD_CACHE_LS,
        markerLsKey: HAS_UPLOAD_CACHE_LS
    });

export const clearStagedUploadCache = () =>
    clearSlotAsync({
        slotKey: UPLOAD_CACHE_KEY,
        legacyLsKey: LEGACY_UPLOAD_CACHE_LS,
        markerLsKey: HAS_UPLOAD_CACHE_LS
    });

/**
 * Pure, non-destructive synchronous inspection of pending wizard startup state.
 * Safe to invoke inside `useState(() => ...)` under React `<StrictMode>`.
 */
export const peekWizardStartupState = ({ initialIntent = null, search = '' } = {}) => {
    const syncUploadCache = getStagedUploadCacheSync();
    const hasUploadCacheMarker = safeLsGet(HAS_UPLOAD_CACHE_LS) === '1' && hasIndexedDB();
    if (syncUploadCache !== null || hasUploadCacheMarker) {
        return {
            mode: 'oauth-cache',
            wizardStep: 3,
            uploadIntent: 'submit-review',
            ingestionSource: 'local',
            syncBundles: syncUploadCache,
            needsAsyncHydration: syncUploadCache === null,
            shouldClearActiveStaged: false
        };
    }

    if (safeLsGet(TRIGGER_RESUME_LS) === 'true') {
        const syncActive = getActiveStagedBundlesSync();
        return {
            mode: 'resume-trigger',
            wizardStep: 3,
            uploadIntent: 'submit-review',
            ingestionSource: 'local',
            syncBundles: syncActive,
            needsAsyncHydration: syncActive === null && hasIndexedDB(),
            shouldClearActiveStaged: false
        };
    }

    const rawStep = memoryWizardMeta.step || safeLsGet(WIZARD_STEP_LS);
    if (rawStep) {
        const parsedStep = Number.parseInt(rawStep, 10);
        const stepNum = Number.isFinite(parsedStep) && parsedStep >= 1 ? parsedStep : 2;
        const savedIntent = memoryWizardMeta.intent || safeLsGet(SUBMIT_INTENT_LS) || 'submit-review';
        const syncActive = getActiveStagedBundlesSync();
        return {
            mode: 'wizard-step',
            wizardStep: stepNum,
            uploadIntent: savedIntent,
            ingestionSource: 'local',
            syncBundles: syncActive,
            needsAsyncHydration: syncActive === null && hasIndexedDB(),
            shouldClearActiveStaged: false
        };
    }

    const urlParams = new URLSearchParams(search);
    const urlIntent = urlParams.get('intent');
    const savedSubmitIntent = memoryWizardMeta.intent || safeLsGet(SUBMIT_INTENT_LS);
    const effectiveIntent = initialIntent || urlIntent || savedSubmitIntent || null;

    if (effectiveIntent) {
        return {
            mode: 'intent',
            wizardStep: 1,
            uploadIntent: effectiveIntent,
            ingestionSource: 'local',
            syncBundles: [],
            needsAsyncHydration: false,
            shouldClearActiveStaged: effectiveIntent === 'stage-locally',
            hasSavedSubmitIntentFlag: !initialIntent && !urlIntent && Boolean(savedSubmitIntent)
        };
    }

    return {
        mode: 'reset',
        wizardStep: 1,
        uploadIntent: 'submit-review',
        ingestionSource: 'local',
        syncBundles: [],
        needsAsyncHydration: false,
        shouldClearActiveStaged: false,
        hasSavedSubmitIntentFlag: false
    };
};

// --- Local Staged Runs (`brv02Runs`) Persistence API ---

export const getBrv02RunsSync = () =>
    readSlotSync({
        slotKey: BRV02_RUNS_KEY,
        legacyLsKey: LEGACY_BRV02_RUNS_LS,
        markerLsKey: HAS_BRV02_RUNS_LS
    });

export const hasPendingBrv02Hydration = () =>
    !memoryStore.has(BRV02_RUNS_KEY) &&
    safeLsGet(LEGACY_BRV02_RUNS_LS) === null &&
    safeLsGet(HAS_BRV02_RUNS_LS) === '1' &&
    hasIndexedDB();

export const loadBrv02Runs = () =>
    loadSlotAsync({
        slotKey: BRV02_RUNS_KEY,
        legacyLsKey: LEGACY_BRV02_RUNS_LS,
        markerLsKey: HAS_BRV02_RUNS_LS
    });

const toCloneableRuns = (runs) => {
    if (!Array.isArray(runs)) return [];
    return runs.map((run) => {
        if (!run || typeof run !== 'object') return run;
        const nextRun = { ...run };
        if (run.bundle && typeof run.bundle === 'object') {
            nextRun.bundle = toCloneableBundles([run.bundle])[0];
        }
        if (Array.isArray(run.stages)) {
            nextRun.stages = run.stages.map((stage) => {
                if (!stage || typeof stage !== 'object' || !stage.bundle) return stage;
                return { ...stage, bundle: toCloneableBundles([stage.bundle])[0] };
            });
        }
        return nextRun;
    });
};

export const saveBrv02RunsSync = (runs) => {
    const clean = toCloneableRuns(runs);
    return persistSlotFallbackSync({
        slotKey: BRV02_RUNS_KEY,
        legacyLsKey: LEGACY_BRV02_RUNS_LS,
        markerLsKey: HAS_BRV02_RUNS_LS,
        data: clean,
        clearMemoryOnError: false
    });
};

export const saveBrv02Runs = async (runs) => {
    const clean = toCloneableRuns(runs);
    return persistSlot({
        slotKey: BRV02_RUNS_KEY,
        legacyLsKey: LEGACY_BRV02_RUNS_LS,
        markerLsKey: HAS_BRV02_RUNS_LS,
        data: clean,
        clearMemoryOnError: false
    });
};

export const resetMemoryStoreForTests = () => {
    memoryStore.clear();
    memoryWizardMeta = { step: null, intent: null };
};
