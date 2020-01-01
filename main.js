const path = require('path');
const fs = require('fs');
const lockfile = require('@yarnpkg/lockfile');
const glob = require('glob');
const packlist = require('npm-packlist');
const tar = require('tar');
const cacache = require('cacache');

const metaManager = require('./meta');

function getYarnLock(root) {
  const lockPath = path.resolve(root, 'yarn.lock');
  if (!fs.existsSync(lockPath)) {
    throw new Error(`yarn.lock cannot be found under current folder: ${root}`);
  }
  const content = fs.readFileSync(lockPath, 'utf8');
  const parsed = lockfile.parse(content);
  if (parsed.type !== 'success') {
    throw new Error(`yarn.lock is not in healthy state (${parsed.type}), please solve merge conflict first.`);
  }
  return parsed.object;
}

function getRootPackageJson(root) {
  const pkgPath = path.resolve(root, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`package.json cannot be found under current folder: ${root}`);
  }
  return require(pkgPath);
}

let workspaces = { };

function getPackageJson(packagePath) {
  try {
    return require(path.resolve(packagePath, 'package.json'));
  } catch (e) {
    return null;
  }
}

function getEntryPackages(root, option) {
  const pkg = getRootPackageJson(root);
  if (!pkg.name) pkg.name === 'root';
  workspaces[pkg.name] = {
    packageJson: pkg,
    path: root
  };
  if (pkg.workspaces && pkg.workspaces.packages) {
    const allPackages = pkg.workspaces.packages
      .map(pattern => glob.sync(pattern, { cwd: root }))
      .reduce((acc, array) => acc.concat(array), []);
    const allPackagesJson = allPackages
      .map(getPackageJson);
    allPackagesJson.forEach((packageJson, i) => {
      if (!packageJson) return;
      const { name } = packageJson;
      workspaces[name] = { packageJson, path: allPackages[i] };
    });
    if (option.all) {
      return allPackagesJson;
    }
    if (option.entry !== root) {
      const index = allPackages
        .findIndex(package => path.resolve(root, package) === option.entry);
      if (index < 0) throw new Error(`Cannot find package: ${option.entry}`);
      return [allPackagesJson[index]];
    }
  }
  return [pkg];
}

function getPackageId(name, version) {
  return `${name}@${version}`;
}

function transformFromDependenciesToArray(dependencies) {
  if (!dependencies) return [];
  return Object.keys(dependencies).map(name => getPackageId(name, dependencies[name]));
}

function getDependenciesFromPackageJson(packageJson, option) {
  let dependencies = transformFromDependenciesToArray(packageJson.dependencies);
  if (!option.production) {
    dependencies = dependencies
      .concat(transformFromDependenciesToArray(packageJson.devDependencies))
      .concat(transformFromDependenciesToArray(packageJson.optionalDependencies));
  }
  return dependencies;
}

function parsePackageId(packageId) {
  const isScope = packageId[0] === '@';
  const index = packageId.lastIndexOf('@');
  if (isScope && index === 0) return { name: packageId, version: '' };
  if (index < 0) return { name: packageId, version: '' };
  const name = packageId.substr(0, index);
  const version = packageId.substr(index + 1);
  return { name, version };
}

async function getActualLocalPackageSize(packagePath) {
  console.log('analyzing local package size ...', packagePath);
  const files = await packlist({ path: packagePath })
  let size;
  if (metaManager.usePackedSize) {
    const folder = await cacache.tmp.mkdir('.tmp');
    const tmpTar = path.join(folder, 'package.tgz');
    await tar.create({
      prefix: 'package/',
      cwd: packagePath,
      file: tmpTar,
      gzip: true
    }, files);
    size = fs.statSync(tmpTar).size;
  } else {
    size = files
      .map(file => {
        const filePath = path.resolve(packagePath, file);
        return fs.statSync(filePath).size;
      })
      .reduce((acc, curr) => acc + curr, 0);
  }
  return size;
}

const localPackageSizeCache = { };
async function getLocalPackageSize(packagePath) {
  if (typeof localPackageSizeCache[packagePath] === 'undefined') {
    const promise = getActualLocalPackageSize(packagePath);
    localPackageSizeCache[packagePath] = promise;
    
  }
  return localPackageSizeCache[packagePath];
}

const analyzedPackage = new Set();

async function getPackageInfoFromWorkspace(lock, packageId, option) {
  const { name } = parsePackageId(packageId);
  if (option.exclude.indexOf(name) >= 0) return null;

  const result = {
    label: name,
    weight: 0,
    groups: []
  };
  const { packageJson, path: packagePath } = workspaces[name];
  if (!packageJson) return result;
  const id = getPackageId(packageJson.name, packageJson.version || '');
  if (analyzedPackage.has(id)) {
    if (!option.duplicate) {
      return null;
    }
  } else {
    analyzedPackage.add(id);
  }
  let size = 0;
  const dependenciesList = getDependenciesFromPackageJson(packageJson, option);
  result.groups = (await analyzePackages(lock, dependenciesList, option)).filter(Boolean);
  if (option.entry !== path.resolve(process.cwd(), packagePath) || !option.ignoreEntry) {
    size = await getLocalPackageSize(packagePath);
  }
  result.weight = result.groups.reduce((acc, sub) => sub.weight + acc, size);
  if (result.groups.length !== 0) {
    result.groups.push({
      label: packageId,
      weight: size,
      groups: [],
    });
  }
  return result;
}

async function getPackageInfoFromRemote(lock, dependency, option) {
  const { name } = parsePackageId(dependency);
  if (option.exclude.indexOf(name) >= 0) return null;
  const lockInfo = lock[dependency];
  const { version, dependencies } = lockInfo;
  const id = getPackageId(name, version);
  if (analyzedPackage.has(id)) {
    if (!option.duplicate) {
      return null;
    }
  } else {
    analyzedPackage.add(id);
  }
  const manifest = await metaManager.getPackageManifest(name, version);
  const size = metaManager.getPackageSize(manifest);
  const dependenciesList = transformFromDependenciesToArray(dependencies);
  const subResult = (await analyzePackages(lock, dependenciesList, option)).filter(Boolean);
  let weight = subResult.reduce((acc, sub) => sub.weight + acc, size);
  if (subResult.length !== 0) {
    subResult.push({
      label: `${dependency}(${version})`,
      weight: size,
      groups: [],
    });
  }
  return {
    label: subResult.length === 0 ? `${dependency}(${version})` : name,
    weight,
    groups: subResult
  };
}

async function analyzePackage(lock, packageId, option) {
  const config = lock[packageId];
  if (!config) return getPackageInfoFromWorkspace(lock, packageId, option);
  return getPackageInfoFromRemote(lock, packageId, option)
}

function analyzePackages(lock, dependencies, option) {
  return Promise.all(dependencies.map(pkgId => analyzePackage(lock, pkgId, option)));
}

module.exports = async function main(root, option) {
  const lock = getYarnLock(root);
  metaManager.setRegistry(option.registry);
  const entryPackages = getEntryPackages(root, option);
  const result = await Promise.all(
    entryPackages.map(pkg => getPackageInfoFromWorkspace(lock, pkg.name, option))
  );
  const ret = result.filter(Boolean);
  if (ret.length === 1) return ret[0].groups;
  return ret;
}
