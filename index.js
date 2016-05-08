'use strict';

/**
 * Serverless Auto-Prune Plugin
 */

module.exports = function(S) {

	const BbPromise = require('bluebird');

	/**
	 * Action instantiation. Used to resemble the SLS core layout to
	 * make it easy to integrate into core later.
	 */
	let FunctionPrune = require('./lib/actions/FunctionPrune')(S);
	FunctionPrune = new FunctionPrune();

	/**
	 * ServerlessPlugin
	 */

	class ServerlessPlugin extends S.classes.Plugin {

		/**
		 * Constructor
		 */

		constructor() {
			super();
		}

		/**
		 * Define your plugins name
		 */

		static getName() {
			return 'com.serverless.' + ServerlessPlugin.name;
		}

		/**
		 * Register Actions
		 */

		registerActions() {

			return BbPromise.join(
				FunctionPrune.registerActions()
			);

		}

		/**
		 * Register Hooks
		 */

		registerHooks() {

			return BbPromise.join(
				FunctionPrune.registerHooks()
			);

		}

	}

	return ServerlessPlugin;
};
