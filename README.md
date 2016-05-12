# serverless-autoprune-plugin

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)

This Serverless 0.5.x plugin deletes old AWS Lambda versions.


## Overview
The plugin lets you delete old AWS Lambda versions from your account.

`serverless-autoprune-plugin` is heavily inspired by Nopik's 
[serverless-lambda-prune-plugin](https://github.com/Nopik/serverless-lambda-prune-plugin)
but adds some much needed functionality such as limiting pruning to a specific region, project and function.
It is fully compatible with Serverless 0.5.5 and higher.


## Installation

1. Install the plugin module.

   `npm install serverless-autoprune-plugin --save` will install the latest version of the plugin.

   If you want to debug, you also can reference the source repository at a specific version or branch
   with `npm install https://github.com/arabold/serverless-autoprune-plugin#<tag or branch name>`

2. Activate the plugin in your Serverless project.

   Add `serverless-autoprune-plugin` to the plugins array in your `s-project.json`.
   ```
   {
     "name": "my-project",
     "custom": {},
     "plugins": [
       "serverless-autoprune-plugin"
     ]
   }
   ```


## Usage

This plugin adds a new function command `prune`:
```
serverless function prune [ function-name [...] ]
```

You can specify one or multiple function names to prune, omit any function names to prune the
functions in the current directory tree, or specify `-a` or `--all` to prune all functions of the project.

### Options

* `-s|--stage <stage>`: prune only a specific stage (only applicable if your Lambda
  functions use different names per stage)
* `-r|--region <region>`: prune only a specific region (defaults to all regions).
* `-n|--number <number>`: keep last N versions (defaults to 3).
* `-a|--all`: prune all functions of the current project.


## Releases

### 0.1.3
* Support pruning only a specific stage (in case Lambda function names differ per stage)
* Use Serverless credentials depending on stage and region specified.

### 0.1.2
* Added `aws-sdk` as dependency in case it's not installed globally

### 0.1.1
* Small bugfix

### 0.1.0
* Initial release

### To Dos
* Optionally prune during `function deploy`
* Pruning of API Gateway Deploments (https://github.com/Nopik/serverless-lambda-prune-plugin/pull/6)
