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
 * Centralized Cache Manager for Prism Data Sources
 * Uses IndexedDB to bypass localStorage 5MB quota limits.
 */

const DB_NAME = 'PrismCacheDB';
const STORE_NAME = 'keyval';
const DB_VERSION = 1;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 Hours

const CACHE_VERSION = 'v21'; // Bump this string to force-invalidate all client caches

// Helper to open DB
const openDB = () => {
    return new Promise((resolve, reject) => {
        // Handle SSR or environments without indexedDB
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB not supported'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
};

export const CacheManager = {
    /**
     * Generates a consistent cache key
     * @param {string} type - 'giq', 'gcs', etc.
     * @param {string} id - projectId or bucketName
     */
    generateKey: (type, id) => `prism_cache_${CACHE_VERSION}:${type}:${id}`,

    /**
     * Retrieves data from cache if valid
     * @param {string} type 
     * @param {string} id 
     * @returns {Promise<any|null>}
     */
    get: async (type, id) => {
        try {
            const db = await openDB();
            const key = CacheManager.generateKey(type, id);
            
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const request = store.get(key);
                
                request.onsuccess = () => {
                    const payload = request.result;
                    if (!payload) {
                        resolve(null);
                        return;
                    }

                    // Check Expiry
                    if (Date.now() - payload.timestamp > (payload.ttl || DEFAULT_TTL_MS)) {
                        console.log(`[CacheManager] Expired key: ${key}`);
                        // We can lazy delete, but need a separate tx for write
                        CacheManager.remove(type, id).catch(err => console.error("Failed to remove expired key", err));
                        resolve(null);
                    } else {
                        resolve(payload.data);
                    }
                };
                
                request.onerror = () => {
                    console.warn("[CacheManager] Error reading from IDB", request.error);
                    resolve(null); // Fail safe
                };
            });
        } catch (e) {
            console.warn("[CacheManager] Load failed (IDB open error)", e);
            return null;
        }
    },

    /**
     * Saves data to cache
     * @param {string} type 
     * @param {string} id 
     * @param {any} data 
     * @param {number} ttlMs - Optional custom TTL
     * @returns {Promise<boolean>} success
     */
    set: async (type, id, data, ttlMs = DEFAULT_TTL_MS) => {
        try {
            const db = await openDB();
            const key = CacheManager.generateKey(type, id);
            const payload = {
                timestamp: Date.now(),
                ttl: ttlMs,
                data: data
            };

            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const request = store.put(payload, key);
                
                request.onsuccess = () => {
                    console.log(`[CacheManager] Saved ${key} to IDB`);
                    resolve(true);
                };
                
                request.onerror = () => {
                    console.warn("[CacheManager] Save failed", request.error);
                    resolve(false);
                };
            });
        } catch (e) {
            console.warn("[CacheManager] Save failed (IDB error)", e);
            return false;
        }
    },

    /**
     * Removes specific item from cache
     */
    remove: async (type, id) => {
        try {
            const db = await openDB();
            const key = CacheManager.generateKey(type, id);
            
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const request = store.delete(key);
                
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.warn("Failed to remove from cache", e);
        }
    },

    /**
     * Clears all items in the store
     */
    clearAll: async () => {
        try {
            const db = await openDB();
             return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const request = store.clear();
                
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.warn("Failed to clear cache", e);
        }
    }
};
