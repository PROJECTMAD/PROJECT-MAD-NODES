import { api } from "/scripts/api.js";
import { LOG_PREFIX, CACHE_KEY, API_ENDPOINTS } from "./Constants.js";

const MAX_CONCURRENT_REQUESTS = 4;

// IndexedDB Configuration
const DB_NAME = "MadNodesDB";
const STORE_NAME = "cache";
const DB_VERSION = 1;

class IDBAdapter {
    constructor() {
        this.db = null;
        this.readyPromise = this.init();
    }

    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };

            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };

            request.onerror = (e) => reject(e);
        });
    }

    async getAll() {
        await this.readyPromise;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const request = store.openCursor();
            const result = {};

            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    result[cursor.key] = cursor.value;
                    cursor.continue();
                } else {
                    resolve(result);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async set(key, value) {
        await this.readyPromise;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(value, key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async delete(key) {
        await this.readyPromise;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clear() {
        await this.readyPromise;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

export class RequestManager {
    constructor() {
        this.queue = [];
        this.activeRequests = 0;
        this.storageCache = {};
        this.onQueueChange = null;

        this.db = new IDBAdapter();
        this.hydrate();
    }

    async hydrate() {
        try {
            const data = await this.db.getAll();
            if (data && Object.keys(data).length > 0) {
                this.storageCache = data;
                console.log(`${LOG_PREFIX} Cache hydrated from IndexedDB.`);
            } else {
                const rawLegacy = localStorage.getItem(CACHE_KEY);
                if (rawLegacy) {
                    try {
                        console.log(`${LOG_PREFIX} Migrating legacy localStorage cache to IndexedDB...`);
                        const legacyData = JSON.parse(rawLegacy);
                        this.storageCache = legacyData;

                        for (const [k, v] of Object.entries(legacyData)) {
                            this.db.set(k, v);
                        }

                        localStorage.removeItem(CACHE_KEY);
                    } catch (e) {
                        console.warn(`${LOG_PREFIX} Legacy migration failed`, e);
                    }
                }
            }
        } catch (e) {
            console.error(`${LOG_PREFIX} Failed to hydrate cache`, e);
        }
    }

    getCached(key) {
        return this.storageCache[key] || null;
    }

    setCached(key, data) {
        this.storageCache[key] = data;

        this.db.set(key, data).catch((e) => console.warn(`${LOG_PREFIX} Failed to write to IDB`, e));
    }

    clearStorage(specificKey = null) {
        if (specificKey) {
            delete this.storageCache[specificKey];
            this.db.delete(specificKey);
        } else {
            this.storageCache = {};
            this.db.clear();
        }
    }

    schedule(id, fetchFn, highPriority = false) {
        return new Promise((resolve, reject) => {
            const task = { id, fn: fetchFn, resolve, reject };

            if (highPriority) {
                this.queue.unshift(task);
            } else {
                this.queue.push(task);
            }

            this._processQueue();
        });
    }

    async _processQueue() {
        if (this.activeRequests >= MAX_CONCURRENT_REQUESTS || this.queue.length === 0) return;

        this.activeRequests++;
        const task = this.queue.shift();

        try {
            const result = await task.fn();
            task.resolve(result);
        } catch (error) {
            console.error(`${LOG_PREFIX} Request failed: ${task.id}`, error);
            task.reject(error);
        } finally {
            this.activeRequests--;
            this._processQueue();
        }
    }

    async fetchConfig() {
        try {
            const res = await api.fetchApi(API_ENDPOINTS.CONFIG);
            if (!res.ok) throw new Error("Config fetch failed");
            return await res.json();
        } catch (e) {
            console.error(`${LOG_PREFIX} Failed to fetch UI config`, e);
            return {};
        }
    }

    async fetchLoraList() {
        try {
            const response = await api.fetchApi(API_ENDPOINTS.LORA_LIST);
            const data = await response.json();
            return data?.LoraLoader?.input?.required?.lora_name?.[0] || [];
        } catch (e) {
            console.error(`${LOG_PREFIX} Failed to fetch LoRA list`, e);
            throw e;
        }
    }

    async clearBackendCache() {
        try {
            await api.fetchApi(`${API_ENDPOINTS.INSPECT}?clear_cache_all=true`);
        } catch (e) {
            console.error(`${LOG_PREFIX} Failed to clear backend cache`, e);
        }
    }

    async inspectLora(loraName, forceRefresh = false, isHighPriority = false) {
        if (!loraName) return { arch: "UNKNOWN" };

        if (!forceRefresh) {
            const cached = this.getCached(`inspect:${loraName}`);

            if (cached && cached.stats) return cached;
        }

        const priority = isHighPriority || forceRefresh;

        return this.schedule(
            `inspect:${loraName}`,
            async () => {
                const url = `${API_ENDPOINTS.INSPECT}?lora_name=${encodeURIComponent(loraName)}&refresh=${forceRefresh}`;
                const res = await api.fetchApi(url);
                if (!res.ok) throw new Error(res.statusText);
                const data = await res.json();
                this.setCached(`inspect:${loraName}`, data);
                return data;
            },
            priority,
        );
    }

    primeInspectCache(loraName, arch) {
        if (!loraName || !arch || arch === "UNKNOWN") return;

        const key = `inspect:${loraName}`;
        const existing = this.getCached(key);

        if (!existing) {
            this.setCached(key, { arch: arch, stats: null });
        } else if (existing.arch === "UNKNOWN") {
            existing.arch = arch;
            this.setCached(key, existing);
        }
    }

    async checkCompatibility(ckptName, loraName) {
        const key = `compat:${ckptName}:${loraName}`;

        const cached = this.getCached(key);
        if (cached) return cached;

        return this.schedule(
            key,
            async () => {
                const url = `${API_ENDPOINTS.COMPAT}?ckpt_name=${encodeURIComponent(ckptName)}&lora_name=${encodeURIComponent(loraName)}`;
                const res = await api.fetchApi(url);
                const data = await res.json();

                this.setCached(key, data);
                return data;
            },
            false,
        );
    }
}

export const requestManager = new RequestManager();
