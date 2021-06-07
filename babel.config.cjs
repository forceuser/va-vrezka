const process = require("process");

console.log("BABEL VUE_APP_MODE", process.env.VUE_APP_MODE);
console.log("BABEL NODE_ENV", process.env.NODE_ENV);
console.log("BABEL VUE_APP_CONSOLE", process.env.VUE_APP_CONSOLE);
console.log("BABEL VUE_APP_API_ENV", process.env.VUE_APP_API_ENV);

function pluginsIf (plugins, condition) {
	if (typeof plugins === "function") {
		plugins = plugins();
	}
	if (condition) {
		return plugins;
	}
	return [];
}

module.exports = {
	presets: [
	],
	plugins: [
	],
	"env": {
		"production": {
		},
	},
};
