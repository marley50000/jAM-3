
/**
 * JamTalk Secure Storage Service
 * Implements Zero-Knowledge AES-GCM 256-bit encryption.
 */

const DB_NAME = 'JamTalkDB';
const DB_VERSION = 1;
const ENCRYPTION_ALGO = 'AES-GCM';
const KEY_DERIVATION_ALGO = 'PBKDF2';

export class StorageService {
  private db: IDBDatabase | null = null;
  private masterKey: CryptoKey | null = null;

  constructor() {
    this.initPersistence();
  }

  private async initPersistence() {
    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist();
    }
  }

  /**
   * Generates a cryptographic key from a user-provided PIN/Password.
   */
  async unlockVault(password: string, saltHex: string): Promise<void> {
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);
    const salt = this.hexToUint8Array(saltHex);

    const baseKey = await window.crypto.subtle.importKey(
      'raw',
      passwordData,
      KEY_DERIVATION_ALGO,
      false,
      ['deriveBits', 'deriveKey']
    );

    this.masterKey = await window.crypto.subtle.deriveKey(
      {
        name: KEY_DERIVATION_ALGO,
        salt: salt,
        iterations: 600000,
        hash: 'SHA-256',
      },
      baseKey,
      { name: ENCRYPTION_ALGO, length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  lockVault() {
    this.masterKey = null;
  }

  isLocked(): boolean {
    return this.masterKey === null;
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        ['settings', 'history', 'lessons', 'profile', 'vault_meta'].forEach(name => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        });
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async setItem(storeName: string, key: string, value: any): Promise<void> {
    const db = await this.getDB();
    let dataToStore = value;

    // Encrypt sensitive data if vault is unlocked and target is sensitive
    if (this.masterKey && (storeName === 'history' || storeName === 'profile')) {
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(JSON.stringify(value));
      
      const encryptedContent = await window.crypto.subtle.encrypt(
        { name: ENCRYPTION_ALGO, iv },
        this.masterKey,
        encodedData
      );

      dataToStore = {
        _encrypted: true,
        iv: this.uint8ArrayToHex(iv),
        content: this.uint8ArrayToHex(new Uint8Array(encryptedContent))
      };
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(dataToStore, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getItem<T>(storeName: string, key: string): Promise<T | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = async () => {
        const result = request.result;
        if (result && result._encrypted) {
          if (!this.masterKey) return null; // Can't decrypt if locked
          
          try {
            const iv = this.hexToUint8Array(result.iv);
            const content = this.hexToUint8Array(result.content);
            const decrypted = await window.crypto.subtle.decrypt(
              { name: ENCRYPTION_ALGO, iv },
              this.masterKey,
              content
            );
            const decoder = new TextDecoder();
            resolve(JSON.parse(decoder.decode(decrypted)));
          } catch (e) {
            console.error("Decryption failed", e);
            resolve(null);
          }
        } else {
          resolve(result || null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    const db = await this.getDB();
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    
    return new Promise((resolve, reject) => {
      request.onsuccess = async () => {
        const results = request.result || [];
        const decryptedResults = await Promise.all(results.map(async (res) => {
          if (res && res._encrypted) {
            if (!this.masterKey) return null;
            try {
              const iv = this.hexToUint8Array(res.iv);
              const content = this.hexToUint8Array(res.content);
              const decrypted = await window.crypto.subtle.decrypt({ name: ENCRYPTION_ALGO, iv }, this.masterKey, content);
              return JSON.parse(new TextDecoder().decode(decrypted));
            } catch { return null; }
          }
          return res;
        }));
        resolve(decryptedResults.filter(r => r !== null));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearStore(storeName: string): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).clear();
  }

  async removeItem(storeName: string, key: string): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(key);
  }

  // Helper utilities
  private uint8ArrayToHex(arr: Uint8Array): string {
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private hexToUint8Array(hex: string): Uint8Array {
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < arr.length; i++) {
      arr[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return arr;
  }
}

export const storage = new StorageService();
