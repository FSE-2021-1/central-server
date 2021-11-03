class PoweredMap {
    #map;
    #updateCallback;
  
    constructor(initValue, options) {
      this.#map = new Map(initValue);
      this.#updateCallback = options?.updateCallback;
    }
  
    get(key) {
      return this.#map.get(key);
    }

    values() {
        return this.#map.values();
    }
  
    set(key, value) {
      this.#map.set(key, value);
      if (this.#updateCallback) {
        this.#updateCallback(this.#map);
      }
    }

    setUpdateCallback(callback) {
        this.#updateCallback = callback;
    }
  
    has(key) {
      return this.#map.has(key);
    }
  
    delete(key) {
      this.#map.delete(key);
      if (this.#updateCallback) {
        this.#updateCallback(this.#map);
      }
    }
  }

  module.exports = PoweredMap;