#!/usr/bin/env node
const path = require('path');
const ejs = require('ejs');
const fs = require('fs');
const rimraf = require('rimraf');
const libnpmconfig = require('libnpmconfig');
const opener = require('opener');
const main = require('./main');

const argv = require('yargs')
  .option('registry', {
    type: 'string',
    description: 'Registry server of npm'
  })
  .option('development', {
    type: 'boolean',
    default: false,
    description: 'Development mode takes devDependencies into count for local packages'
  })
  .option('root', {
    alias: 'r',
    type: 'string',
    description: 'Entry folder for analyze',
  })
  .option('duplicate', {
    alias: 'd',
    type: 'boolean',
    default: false,
    description: 'Whether allow one dependency to be counted under different package'
  })
  .option('exclude', {
    alias: 'e',
    type: 'string',
    default: '',
    description: 'Certain packages to exclude, use comma to separate',
  })
  .option('ignore-entry', {
    alias: 'i',
    type: 'boolean',
    default: false,
    description: 'Whether size of entry package should be ignored'
  })
  .option('all', {
    alias: 'a',
    type: 'boolean',
    default: false,
    description: 'Whether all packages in workspaces should be considered'
  })
  .option('output', {
    alias: 'o',
    type: 'string',
    default: 'report.html',
    description: 'File path of generated report',
  })
  .option('json', {
    type: 'boolean',
    default: false,
    description: 'Output JSON format of report data'
  })
  .argv;

const npmrc = libnpmconfig.read();

const option = {
  allowDuplicate: argv.duplicate,
  registry: argv.registry || npmrc.registry,
  entry: path.resolve(process.cwd(), argv.root || '.'),
  production: !argv.development,
  exclude: argv.exclude.split(',').map(name => name.trim()),
  ignoreEntry: argv["ignore-entry"],
  all: argv.all,
  duplicate: argv.duplicate
};

main(process.cwd(), option)
  .then(json => {
    const template = path.resolve(__dirname, 'index.ejs');
    return new Promise((resolve, reject) => {
      const jsonStr = JSON.stringify(json);
      ejs.renderFile(template, { data: jsonStr }, function (error, str) {
        if (error) return reject(error);
        fs.writeFileSync(argv.output, str, 'utf8');
        if (argv.json) {
          const { dir, name } = path.parse(argv.output);
          const jsonPath = path.resolve(dir, `${name}.json`);
          fs.writeFileSync(jsonPath, jsonStr, 'utf8');
        }
        resolve();
      });
    });
  })
  .then(() => {
    opener(argv.output);
  })
  .catch((error) => {
    console.log(error);
  })
  .finally(() => {
    rimraf.sync('.tmp');
  });
