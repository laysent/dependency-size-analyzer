const pacote = require('pacote');
const genericPool = require('generic-pool');

class MetaManager {
  constructor() {
    this.cached = { };
    this.usePackedSize = true;
    this.hasError = false;

    const metaFetchFactory = {
      create: () => {
        return (name) => {
          return pacote.packument(name, { registry: this.registry });
        };
      },
      destroy: function() {}
    };
    const metaFetchOpts = {
      max: 15,
      min: 1,
    };
    this.metaFetchPool = genericPool.createPool(metaFetchFactory, metaFetchOpts);
  }

  async getPackageManifest(packageName, version) {
    if (this.hasError) return;
    let versions;
    if (typeof this.cached[packageName] === 'undefined') {
      const promise = this.metaFetchPool.acquire().then(
        fetcher => fetcher(packageName).then(
          meta => this.metaFetchPool.release(fetcher).then(() => meta.versions)
        )
      );
      console.debug('feching...', packageName);
      this.cached[packageName] = promise;
    }
    versions = await this.cached[packageName];
    return versions[version];
  }

  getPackageSize(manifest) {
    if (typeof manifest.dist.unpackedSize === 'number') {
      this.usePackedSize = false;  
      return manifest.dist.unpackedSize;
    }
    if (!this.usePackedSize) {
      /**
       * official npm registry provides unpackedSize, but not for all of them.
       * throw error here if any data is missing, recommend to use cnpm registry instead.
       */
      this.hasError = true;
      throw new Error(`Cannot get package size from registry ${this.registry}, consider using cnpm registry instead!`);
    }
    this.usePackedSize = true;
    return manifest.dist.size;
  }

  setRegistry(registry) {
    this.registry = registry;
    this.usePackedSize = registry.indexOf('registry.npmjs.org') < 0;
  }
}

module.exports = new MetaManager();
