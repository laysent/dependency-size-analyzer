# How to use

Simple way:

```bash
npx dependency-size-analyzer
```

Or install the CLI tool globally then run the command in project:

```bash
npm i -g dependency-size-analyzer
analyze-dep
```

## Use Cases

1. Electron app

Try the following command to analyze an Electron app with [two package.json structure](https://www.electron.build/tutorials/two-package-structure):

```bash
analyze-dep --root app --ignore-entry
```

Since Electron app use different technique to pack, entry package size might not be very accurate, use `--ignore-entry` to ignore it.

2. Lerna Package

Try the following command to analyze packages managed by lerna:

```bash
analyze-dep --all
```

# Available flags

+ `--registry` (string, optional): provides the npm registry for fetching meta data of used packages. If not provided, CLI will use default npm registry (either the official one or the one you defined in `.npmrc`); It's recommended to use cnpm registry instead of official one, see <Notice> for explaination. Usage: `--registry https://registry.npm.taobao.org`;
+ `--development` (boolean, optional): determine if `devDependencies` and `optionalDependencies` in local packages should also be analyzed. Default value is `false`, only `dependencies` will be analyzed. Usage: `--development`;
+ `--root` / `-r` (string, optional): provides the root package for starting the analysis. By default, it uses current folder where CLI is running. However, there are cases where the actual used package is another folder, for example Electron uses [two package.json structure](https://www.electron.build/tutorials/two-package-structure) and the root package might then be `app`. Usage: `--root app`;
+ `--duplicate` / `-d` (boolean, optional): determine if one package should be counted multiple times. It's very common that one package is required by multiple packages and thus being shared in project. By default, analyzer will only count package once, pass this flag to disable this feature. Usage: `--duplicate`;
+ `--exclude` / `-e` (string, optional): provides a list of packages that should be excluded from analyzing, use comma to separate each package. Usage: `--exclude react,react-dom`;
+ `--ignore-entry` / `-i` (boolean, optional): determine if size of entry package should be ignored. This flag is mainly for Electron app. By default, analyzer will use same algorithm as `npm publish --dry-run` to get the size of local package. However, Electron app usually does not use `.npmignore` to exclude files from being packed. Use this flag to exclude the entry size analyze if it does not help. Usage: `--ignore-entry`;
+ `--all` / `-a` (boolean, optional): determine if all packages in workspace should be analyzed. By default, only root package will be recursively analyzed (the root package is either the folder where CLI is running or the folder determined by `--root`). Passing `--all` flag will treat all packages in workspace as entry and recursively analyze all of them. Usage: `--all`;
+ `--output` / `-o` (string, optional): determine the output filename of report HTML. The default name is `report.html` and is generated under current folder. Usage: `--output output.html`;
+ `--json` (boolean, optional): determine if JSON data should be saved as well. By default, only HTML file is generated. Passing this flag will generate a JSON data as well, using the same name as HTML file, only suffix is different. Default JSON file name is `report.json`, use `--output` flag to change this name. Usage: `--json`.

# Notice

It's recommended to use **cnpm registry** instead of official registry for analysis. You can pass `--registry` flag to use another registry if you haven't set it up via `.npmrc`, e.g. `--registry https://registry.npm.taobao.org`.

The reason is, cnpm registry will provide packed size of each package when fetching the meta info. The official npm registry provides unpacked size, but this info is missing for some packages. The CLI will throw out error if registry fails to provide size data for any of the dependency package. Thus, it's recommended to use cnpm registry instead.

# Screenshot

![Image](https://github.com/laysent/dependency-size-analyzer/raw/master/screenshot.png)
