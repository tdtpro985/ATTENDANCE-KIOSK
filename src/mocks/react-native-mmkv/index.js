const AsyncStorage = require('@react-native-async-storage/async-storage').default;

// Synchronous in-memory layer (loaded from AsyncStorage on first access)
const stores = {};

class MMKV {
  constructor(config) {
    this.id = (config && config.id) ? config.id : 'default';
    if (!stores[this.id]) {
      stores[this.id] = {};
      // Hydrate from AsyncStorage asynchronously
      AsyncStorage.getItem('__mmkv_store_' + this.id).then(raw => {
        if (raw) {
          try { stores[this.id] = JSON.parse(raw); } catch {}
        }
      }).catch(() => {});
    }
  }

  _persist() {
    AsyncStorage.setItem('__mmkv_store_' + this.id, JSON.stringify(stores[this.id])).catch(() => {});
  }

  set(key, value) {
    stores[this.id][key] = String(value);
    this._persist();
  }

  getString(key) {
    const v = stores[this.id][key];
    return v !== undefined ? v : undefined;
  }

  delete(key) {
    delete stores[this.id][key];
    this._persist();
  }

  contains(key) {
    return key in stores[this.id];
  }

  getAllKeys() {
    return Object.keys(stores[this.id]);
  }
}

module.exports = { MMKV };
