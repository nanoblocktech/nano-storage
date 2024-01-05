(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.NanoStorage = factory());
})(this, (function () { 
'use strict';

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.
    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.
    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */

    var __assign = function() {
        __assign = Object.assign || function __assign(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
            }
            return t;
        };
        return __assign.apply(this, arguments);
    };

    var _global = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self :  typeof window !== 'undefined' ? window : global;

    if (typeof Promise !== 'undefined' && !_global.Promise) {
        _global.Promise = Promise;
    }

    class NanoStorage {
        constructor(database) {
            this.database = database;
            this.versionCode = 1;
            this.storages = {};
            this.db = null;
            this.isOpening = false;
        }

        version(version) {
            this.versionCode = version;
            return this;
        }

        stores(object) {
            for (const baseTable in object) {
                if (object.hasOwnProperty(baseTable)) {
                    const storeConfig = object[baseTable];
                    //const clone = this.clone();
                    this[baseTable] = new StorageFilter(this, baseTable, storeConfig);
                    this.storages[baseTable] = {
                        config: storeConfig,
                        table: baseTable
                    };
                }
            }
        }

        /*clone() {
            //return new this.constructor(this.database);
        
            const clonedInstance = new NanoStorage(this.database);
            clonedInstance.versionCode = this.versionCode;
            clonedInstance.storages = { ...this.storages };
            clonedInstance.db = this.db;
            clonedInstance.isOpening = this.isOpening;
            return clonedInstance;
        }*/

        close(){
            if(this.isOpen()){
                this.db.close();
            }
            this.isOpening = false;
        }

        isOpen() {
            return this.db !== null;
        }

        async open(usePromise = false) {
            this.isOpening = true;
            
            if (usePromise) {
                return new _global.Promise((resolve, reject) => {
                    this._Open().then(() => {
                        resolve(this);
                    }).catch((error) => {
                        reject(error);
                    });
                });
            } else {
                return this._Open().then(() => this);
            }
        }

        async _Open() {
            if (this.isOpen()) {
                return;
            }
        
            return new _global.Promise((resolve, reject) => {
                const request = _global.indexedDB.open(this.database, this.versionCode);
        
                if (!request) {
                    this.logError("Failed to open database");
                    reject("Failed to open database");
                    return;
                }
        
                request.onblocked = (event) => {
                    this.logError("Please close all other tabs with this site open!");
                };
        
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
        
                    for (const baseTable in this.storages) {
                        const hasStorage = db.objectStoreNames.contains(baseTable);
                        if (this.storages.hasOwnProperty(baseTable) && !hasStorage) {
                            const storeConfig = this.storages[baseTable].config;
                            const store = db.createObjectStore(baseTable, { keyPath: 'key', autoIncrement: true });
                            const arrayConfig = storeConfig.split(',');
        
                            for (var i = 0; i < arrayConfig.length; i++) {
                                const index = arrayConfig[i]?.trim();
                                let unique = index == 'key';
                                store.createIndex(index, index, { unique: unique });
                            }
                        }
                    }
                };
        
                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    resolve();
                };
        
                request.onerror = (event) => {
                    reject(event.target.error);
                };
            });
        }

        newDatabase() {
            this.db.onversionchange = (event) => {
                this.close();
                this.logError("A new version of this page is ready. Please reload or close this tab!");
            };
        }

        delete() {
            return new _global.Promise((resolve, reject) => {
                const deleteRequest = _global.indexedDB.deleteDatabase(this.database);

                deleteRequest.onsuccess = () => {
                    this.db = null;
                    resolve(true);
                };

                deleteRequest.onerror = (event) => {
                    resolve(false);
                    this.logError(event.target.error);
                };
            });
        }

        getStore(storeName, permission) {
            if(!this.isOpen()){
                this.logError("Database is not open");
                return null;
            }else{
                const transaction = this.db.transaction([storeName], permission);
                const result = transaction.objectStore(storeName);
                transaction.oncomplete = function() {
                    //this.close();
                };
                return result;
            }
        }
    }

    class StorageFilter {
        constructor(instance, baseTable, config) {
            this.instance = instance;
            this.baseTable = baseTable;
            this.config = config;
            this.column = null;
            this.findKey = null;
            this.isOpening = false;
        }

        where(column) {
            this.column = column;
            return this;
        }

        equals(key) {
            this.findKey = this.toKey(key);
            return this;
        }

        async count(callback) {
            if (this.shouldProceed()) {
                return this.instance.open(true)
                    .then(() => this._Count(callback))
                    .catch(error => {
                        this.throwError(error); 
                    });
            } else {
                return this.dbConError();
            }
        }

        _Count(callback) {
            return new _global.Promise((resolve, reject) => {
                const isCallable = typeof callback !== 'undefined' && typeof callback === 'function';
                let error = null;

                if(this.findKey === null) {
                    error = {
                        message: "Cache key cannot be empty " + this.findKey,
                        status: 0
                    };
                }else {
                    const store = this.instance.getStore(this.baseTable, 'readonly');
                   
                    if(store == null){
                        error = this.dbError();
                    }else{
                        let request = null;
                        if(this.column == null){
                            request = store.get(this.findKey);
                        }else{
                            const index = store.index(this.column);
                            request = index.count(IDBKeyRange.only(this.findKey));
                        }
            
                        request.onsuccess = (event) => {
                            const count = event.target.result;
                            resolve(count);
                            if(isCallable){
                                callback(count);
                            }
                        };
            
                        request.onerror = (event) => {
                            resolve(0);
                            if(isCallable){
                                callback(0);
                            }
                            reject(event.target.error);
                        };
                    }
                    this._Reset();
                }

                if(error !== null){
                    resolve(0);
                    if(isCallable){
                        callback(0);
                    }
                    reject(error);
                }
            });
        }
        

        async get(object) {

            if (this.shouldProceed()) {
                return this.instance.open(true)
                    .then(() => this._Get(object))
                    .catch(error => {
                        this.throwError(error); 
                    });
            } else {
                return this.dbConError();
            }
        }   
        
        _Get(object) {
            const store = this.instance.getStore(this.baseTable, 'readonly');
            let request = null;
            let error = null;

            if(store === null){
                error = this.dbError();
            }else{
                if (typeof object.key === 'undefined') {
                    const keys = Object.keys(object);
            
                    if (keys.length === 1 && keys[0] !== 'key') {
                        const index = store.index(keys[0]);
                        request = index.get(this.toKey(object[keys[0]]));
                    } else {
                        request = store.get(this.toKey(object.key));
                    }
                } else {
                    request = store.get(this.toKey(object.key));
                }
            }
 
            return new _global.Promise((resolve, reject) => {
                if(request === null){
                    error = this.dbError();
                }else{
                    request.onsuccess = (event) => {
                        resolve(event.target.result);
                    };
            
                    request.onerror = (event) => {
                        resolve(undefined);
                        reject(event.target.error);
                    };
                }

                if(error !== null){
                    resolve(undefined);
                    reject(error);
                }
            });
        } 

        async put(object, usePromise = false) {
            if (this.shouldProceed()) {
                try {
                    await this.instance.open(true);
                    return await this._Put(object, usePromise);
                } catch (error) {
                    this.throwError(error);
                }
            } else {
                return this.dbConError();
            }
        }
        
        async _Put(object, usePromise = false) {
            const store = this.instance.getStore(this.baseTable, 'readwrite');
            let passed = false;
            let error = null;
        
            if (store === null) {
                error = this.dbError();
            } else if (!object.key) {
                error = 'Cache key is missing or invalid';
            } else {
                object.key = this.toKey(object.key);
        
                try {
                    const request = await store.put(object);
                    passed = true;
                } catch (err) {
                    error = err;
                    this.throwError(error);
                }
        
                if (usePromise) {
                    return new _global.Promise((resolve, reject) => {
                        resolve(passed);
                        if (error !== null) {
                            reject(error);
                        }
                    });
                }
            }
        
            if (error !== null) {
                this.logError(error);
            }
        
            return passed;
        }        

        /*async put(object, usePromise = false) {
            if (this.shouldProceed()) {
                return this.instance.open(true)
                    .then(() => this._Put(object, usePromise))
                    .catch(error => {
                        this.throwError(error); 
                    });
            } else {
                return this.dbConError();
            }
        }
        
        _Put(object, usePromise = false) {
            const store = this.instance.getStore(this.baseTable, 'readwrite');
            let passed = false;
            let error = null;
           
            if(store === null){
                error = this.dbError();
            }else if(!object.key){
                error = 'Cache key is missing or invalid';
            }else{
                object.key = this.toKey(object.key);
                const request = store.put(object);
                if(usePromise){
                    return new _global.Promise((resolve, reject) => {
                        request.onsuccess = () => {
                            resolve(true);
                        };
        
                        request.onerror = (event) => {
                            resolve(false);
                            reject(event.target.error);
                        };
                    });
                }


                request.onsuccess = () => {
                    passed = true;
                };

                request.onerror = (event) => {
                    this.logError(event.target.error);
                };
            }

            if(error !== null){
                this.logError(error);
            }

            return passed;
        }*/

        delete() {
            if (this.shouldProceed()) {
                return this.instance.open(true)
                    .then(() => this._Delete())
                    .catch(error => {
                        this.throwError(error); 
                    });
            } else {
                return this.dbConError();
            }
        }

        _Delete() {
            return new _global.Promise((resolve, reject) => {
                let error = null;
                if (this.findKey === null) {
                    error = "Cache key cannot be empty";
                } else {
                    const store = this.instance.getStore(this.baseTable, 'readwrite');
                   
                    if(store == null){
                        error = this.dbError();
                    }else{
                        let deleteRequest = null;
            
                        if (this.column == null) {
                            // Delete by primary key
                            deleteRequest = store.delete(this.findKey);
                            deleteRequest.onsuccess = () => {
                                resolve(true);
                            };
                
                            deleteRequest.onerror = (event) => {
                                resolve(false);
                                reject(event.target.error);
                            };
                        } else {
                            // Delete using an index
                            const index = store.index(this.column);
                            const cursorRequest = index.openCursor(IDBKeyRange.only(this.findKey));
            
                            cursorRequest.onsuccess = (event) => {
                                const cursor = event.target.result;
            
                                if (cursor) {
                                    deleteRequest = cursor.delete();
            
                                    deleteRequest.onsuccess = () => {
                                        resolve(true);
                                    };
            
                                    deleteRequest.onerror = (error) => {
                                        resolve(false);
                                        reject(event.target.error);
                                    };
                                } else {
                                    resolve(false);
                                    reject('No matching record found');
                                }
                            };
                        }
                    }
                    
                    this._Reset();
                }

                
                if(error !== null){
                    resolve(false);
                    reject(error);
                }
            });
        }

        clear() {
            if (this.shouldProceed()) {
                return this.instance.open(true)
                    .then(() => this._Clear())
                    .catch(error => {
                        this.throwError(error); 
                    });
            } else {
                return this.dbConError();
            }
        }
        

        _Clear() {
            return new _global.Promise((resolve, reject) => {
                const store = this.instance.getStore(this.baseTable, 'readwrite');
                if(store == null){
                    resolve(false);
                    reject(this.dbError());
                }else{
                    const request = store.clear();
                    request.onsuccess = () => {
                        resolve(true);
                    };
            
                    request.onerror = (event) => {
                        resolve(false);
                        reject(event.target.error);
                    };
                }
            });
        }

        dbConError(){
            return _global.Promise.reject({
                message: "Database is not open",
                status: 500
            });
        }

        shouldProceed(){
            const status = (this.instance.isOpening && !this.instance.isOpen()) || this.instance.isOpen();
            if(status){
                console.log("database connection is open", this.instance.isOpening, this.instance.isOpen());
            }else{
                console.error("database connection has closed", this.instance.isOpening, this.instance.isOpen());
            }
            return status;
        }

        logError(error){
            console.error(error);
        }

        throwError(error) {
            this.logError(error);
            //this.instance.close();
            const customError = { message: error.message, status: 500 };
            throw customError;
        }

        dbError(){
            return {
                message: "Database connection error",
                status: 0
            };
        }
        
        _Reset(){
            this.column = null;
            this.findKey = null;
        }

        toKey(str){
            let key = str?.trim().toLowerCase();
            key = key.split(' ').pop();

            return key;
        }
    }

    var namedExports = Object.freeze({
        __proto__: null,
        NanoStorage: NanoStorage,
        'default': NanoStorage
    });

    __assign(NanoStorage, namedExports, { default: NanoStorage });

    return NanoStorage;

}));
