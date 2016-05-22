'use strict';

/**
 * Action: Function Prune
 */

module.exports = function(S) {

	const SError  = require(S.getServerlessPath('Error')),
		SCli      = require(S.getServerlessPath('utils/cli')),
		SUtils    = S.utils,
		BbPromise = require('bluebird'),
		_         = require('lodash');

	// TODO This can be removed once Serverless 0.5.6 has been released
	function persistentRequest(f) {
		return new BbPromise(function(resolve, reject){
			let doCall = function(){
				f()
				.then(resolve)
				.catch(function(err) {

					if (err.statusCode === 429) {
						S.utils.sDebug("'Too many requests' received, sleeping 5 seconds");
						setTimeout( doCall, 5000 );
					}
					else {
						reject( err );
					}
				});
			};
			return doCall();
		});
	}


	/**
	 * Serverless Auto-Prune Plugin
	 */

	class AutoPrunePlugin extends S.classes.Plugin {

		/**
		 * Get Name
		 */

		static getName() {
			return 'serverless.core.' + AutoPrunePlugin.name;
		}

		/**
		 * Constructor
		 */

		constructor() {
			super();
			S.commands.function.deploy.options.push({
				option: 'prune',
				shortcut: 'p',
				description: 'Optional - Delete previous Lambda versions after deployment'
			});
			S.commands.function.deploy.options.push({
				option: 'number',
				shortcut: 'n',
				description: 'Optional - Keep last N versions (default: 3)'
			});
		}

		/**
		 * Register Plugin Actions
		 */

		registerActions() {

			S.addAction(this._functionPruneAction.bind(this), {
				handler:       'functionPrune',
				description:   'Delete old/unused Lambda versions from your AWS account',
				context:       'function',
				contextAction: 'prune',
				options:       [{
					option:      'stage',
					shortcut:    's',
					description: 'Optional if Lambda function names don´t differ by stage'
				}, {
					option:      'region',
					shortcut:    'r',
					description: 'Optional - Target one region to prune'
				}, {
					option:      'all',
					shortcut:    'a',
					description: 'Optional - Deploy all Functions'
				}, {
					option:      'number',
					shortcut:    'n',
					description: 'Optional - Keep last N versions (default: 3)'
				}],
				parameters: [{
					parameter: 'names',
					description: 'One or multiple function names',
					position: '0->'
				}]
			});

			return BbPromise.resolve();
		}

		/**
		 * Register Hooks
		 */

		registerHooks() {

			S.addHook(this._functionDeployPostHook.bind(this), {
				action: 'functionDeploy',
				event:  'post'
			});

			return BbPromise.resolve();
		}

		/**
		 * Function Prune Action
		 */

		_functionPruneAction(evt) {

			let _this     = this;
			_this.evt     = evt;

			// Flow
			return BbPromise.try(() => {
				if (!S.getProject().getAllStages().length) {
					return BbPromise.reject(new SError('No existing stages in the project'));
				}
			})
			.bind(_this)
			.then(_this._validateAndPrepare)
			.then(_this._pruneFunctions)
			.then(function() {

				// Status
				if (_this.pruned) {

					// Line for neatness
					SCli.log('------------------------');

					SCli.log('Successfully pruned the following functions in the following regions: ');

					// Display Functions & ARNs
					for (let i = 0; i < Object.keys(_this.pruned).length; i++) {
						let region = _this.pruned[Object.keys(_this.pruned)[i]];
						SCli.log(Object.keys(_this.pruned)[i] + ' ------------------------');
						for (let j = 0; j < region.length; j++) {
							SCli.log(`  ${region[j].functionName} (${region[j].lambdaName}): ${region[j].deleted} versions deleted`);
						}
					}
				}

				/**
				 * Return EVT
				 */

				return _this.evt;

			});
		}

		/**
		 * Function Deployment Post Hook
		 */

		_functionDeployPostHook(evt) {
			if (evt.options.prune) {

				// Line for neatness
				SCli.log('------------------------');

				return this._functionPruneAction(evt);
			}
			else {
				return evt;
			}
		}

		/**
		 * Validate And Prepare
		 * - If CLI, maps CLI input to event object
		 */

		_validateAndPrepare() {

			let _this = this;

			// Set Defaults
			_this.functions = [];
			_this.evt.options.stage = _this.evt.options.stage ? _this.evt.options.stage : null;
			_this.evt.options.names  = _this.evt.options.names ? _this.evt.options.names : [];
			_this.evt.options.number = (_this.evt.options.number !== null) ? _this.evt.options.number : 3;

			// Instantiate Classes
			_this.aws = S.getProvider();
			_this.project = S.getProject();

			// Set and check deploy Regions (check for undefined as region could be "false")
			if (_this.evt.options.region && S.getProvider().validRegions.indexOf(_this.evt.options.region) <= -1) {
				return BbPromise.reject(new SError('Invalid region specified'));
			}

			_this.regions = [];
			if (_this.evt.options.region) {
				_this.regions.push(_this.evt.options.region);
			}
			else {
				// Get a list of all regions of all stages
				let stages = S.getProject().getAllStages();
				stages.forEach((stage) => {
					_this.regions = _.union(_this.regions, S.getProject().getAllRegionNames(stage.name));
				});
			}

			if (_this.evt.options.names.length) {
				_this.evt.options.names.forEach((name) => {
					let func = _this.project.getFunction(name);
					if (!func) {
						throw new SError(`Function "${name}" doesn't exist in your project`);
					}
					_this.functions.push(_this.project.getFunction(name));
				});
			}

			// If CLI and no function names targeted, prune from CWD
			if (S.cli &&
					!_this.evt.options.names.length &&
					!_this.evt.options.all) {
				_this.functions = SUtils.getFunctionsByCwd(S.getProject().getAllFunctions());
			}

			// If --all is selected, load all paths
			if (_this.evt.options.all) {
				_this.functions = S.getProject().getAllFunctions();
			}

			if (_this.functions.length === 0) {
				throw new SError(`You don't have any functions in your project`);
			}

			return BbPromise.resolve();
		}

		/**
		 * Prune Functions
		 */

		_pruneFunctions() {

			// Status
			SCli.log(`Pruning specified functions in the following regions: ${this.regions.join(', ')}`);

			this._spinner = SCli.spinner();
			this._spinner.start();

			return BbPromise
			// Deploy Function Code in each region
			.each(this.regions, (region) => this._pruneByRegion(region))
			.then(() => S.utils.sDebug(`pruning is done`))
			// Stop Spinner
			.then(() => this._spinner.stop(true));
		}

		/**
		 * Prune By Region
		 */

		_pruneByRegion(region) {
			let _this = this;

			const pruneFunc = (func) => {
				// Determine function names per stage as they might differ
				let stages = S.getProject().getAllStages();
				let lambdaNames = [];
				stages.forEach((stage) => {
					if (!_this.evt.options.stage || _this.evt.options.stage === stage.name) {
						let lambdaName = func.getDeployedName({
							stage: stage.name,
							region: region
						});
						if (lambdaNames.indexOf(lambdaName) < 0) {
							lambdaNames.push(lambdaName);
						}
					}
				});

				return BbPromise.each(lambdaNames, (lambdaName) => {
					return BbPromise.join(
						persistentRequest( () => _this.aws.request('Lambda', 'listAliases', { FunctionName: lambdaName }, _this.evt.options.stage, _this.evt.options.region) ),
						persistentRequest( () => _this.aws.request('Lambda', 'listVersionsByFunction', { FunctionName: lambdaName }, _this.evt.options.stage, _this.evt.options.region) )
					).spread((aliases, versions) => {
						S.utils.sDebug( `Pruning ${func.name}, found ${aliases.Aliases.length} aliases and ${versions.Versions.length} versions` );

						// Keep all named versions
						let keepVersions = aliases.Aliases.map((a) => {
							return a.FunctionVersion;
						});

						// Always keep the latest version
						keepVersions.push('$LATEST');

						// Sort versions so we keep the newest ones
						let vs = versions.Versions.sort((v1,v2) => {
							if (v1.LastModified < v2.LastModified) {
								return 1;
							}
							else if (v1.LastModified > v2.LastModified) {
								return -1;
							}
							else {
								return 0;
							}
						});

						// Keep the last N versions
						let toKeep = _this.evt.options.number;
						vs.forEach((v) => {
							if ((toKeep > 0) && (keepVersions.indexOf(v.Version) < 0)) {
								keepVersions.push(v.Version);
								toKeep--;
							}
						});

						let deleted = 0;
						return BbPromise.map(versions.Versions, (v) => {
							if (keepVersions.indexOf( v.Version ) < 0) {
								S.utils.sDebug( `Deleting version ${v.Version} of ${func.name} function` );
								deleted++;

								return persistentRequest( ()=> _this.aws.request('Lambda', 'deleteFunction', {
									FunctionName: lambdaName,
									Qualifier: v.Version
								}, _this.evt.options.stage, _this.evt.options.region) );
							}
							else {
								S.utils.sDebug( `Keeping version ${v.Version} of ${func.name} function` );
							}
						}, { concurrency: 3 })
						.then(() => {
							return BbPromise.resolve({
								lambdaName: lambdaName,
								functionName: func.name,
								deleted: deleted
							});
						});
					})
					.then((result) => {

						// Add Function and Region
						if (!this.pruned) {
							this.pruned = {};
						}
						if (!this.pruned[region]) {
							this.pruned[region] = [];
						}

						this.pruned[region].push(result);
					});
				});
			};

			return BbPromise.map(_this.functions, pruneFunc, { concurrency: 3 });
		}
	}

	return( AutoPrunePlugin );
};