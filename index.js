#!/usr/bin/env node
import process from "process";
import nodePath, {basename} from "path";
import fs from "fs-extra";
import yargs from "yargs";
import globby from "globby";
import puppeteer from "puppeteer";
import pretty from "pretty";
import {pathToFileURL, fileURLToPath} from "url";
import minify from "minify";
import replaceAll from "string.prototype.replaceall";
import matchAll from "string.prototype.matchall";
import {Buffer} from "buffer";
import express from "express";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = nodePath.dirname(__filename);

const createLogger = (srcDir = process.cwd(), srcFile = "log.txt") => {
	const logFile = fs.createWriteStream(nodePath.resolve(srcDir, srcFile), {"flags": "a"});
	function logger (...args) {
		// console.log(...args);
		logFile.write(`[${new Date().toLocaleString("ru")}]   ${args.join(" ")} \n`);
	}
	logger.close = () => {
		logFile.end();
	};
	return logger;
};

let log;

function escapeRegex (string) {
	return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
}

async function $preview (argv) {
	const srcDir = nodePath.resolve(process.cwd(), argv.srcDir);

	log = createLogger(srcDir);

	const extractedDir = nodePath.resolve(srcDir, "extracted");
	const compiledDir = nodePath.resolve(srcDir, "compiled");
	const processedDir = nodePath.resolve(srcDir, "processed");
	const processedHtmlDir = nodePath.resolve(srcDir, "processed/html");
	const processedImgDir = nodePath.resolve(srcDir, "processed/img");
	await fs.ensureDir(extractedDir);
	await fs.ensureDir(compiledDir);
	await fs.ensureDir(processedDir);
	await fs.ensureDir(processedHtmlDir);
	await fs.ensureDir(processedImgDir);

	const filesDir = argv.type === "processed" ? processedHtmlDir : extractedDir;

	log(`===== START - PREVIEW - ${srcDir} - ${filesDir}`);

	const files = await globby(["./*.html"], {cwd: filesDir, absolute: true});


	const expressApp = express();
	expressApp.set("trust proxy", true); // app.settings.get("trust-proxy")

	const router = express.Router();

	router.get("/", async (req, res) => {
		let manifest = {};
		if (argv.type === "processed" && argv.localFiles) {
			manifest = JSON.parse(await fs.readFile(nodePath.join(processedDir, "manifest.json"), "utf8"));
		}
		// list files
		res.set("Content-Type", "text/html");
		const style = `<style>*{font-family:sans-serif}table{border-collapse:collapse;margin:25px 0;font-size:.9em;min-width:400px;border-radius:5px 5px 0 0;overflow:hidden;box-shadow:0 0 20px rgba(0,0,0,.15)}table thead tr{background-color:#009879;color:#fff;text-align:left;font-weight:700}table td,table th{padding:12px 15px}table tbody tr{border-bottom:1px solid #ddd}table tbody tr:nth-of-type(even){background-color:#f3f3f3}table tbody tr:last-of-type{border-bottom:2px solid #009879}</style>`;
		const html = style + `<table><thead><tr><th>html item</th><th>gifs</th><th>masks</th><th>amazon repl</th></tr></thead><tbody>${files.map(fileAbs => {
			const file = nodePath.relative(filesDir, fileAbs);
			return [
				`<tr>`,
				`<td><a href="/html/${file}" target="_blank">${file}</a></td>`,
				`<td>${(manifest?.[file]?.gifs ?? []).map($ => `<a href="/img/${nodePath.basename($)}" target="_blank">${$}</a>`)?.join("<br/>\n")}</td>`,
				`<td>${(manifest?.[file]?.masks ?? []).map($ => `<a href="/img/${nodePath.basename($)}" target="_blank">${$}</a>`)?.join("<br/>\n")}</td>`,
				`<td>${manifest?.[file]?.replacedDirecAmazunUrl ?? ""}</td>`,
				`</tr>`,
			].join("\n");
		}).join("\n")}</tbody></table>`;
		res.send(Buffer.from(html));
	});

	router.get("/html/:file", async (req, res) => {
		// list files
		res.set("Content-Type", "text/html");
		const file = req.params.file;
		let html = await fs.readFile(nodePath.join(filesDir, file), "utf8");
		if (argv.type === "processed" && argv.localFiles) {
			const manifest = JSON.parse(await fs.readFile(nodePath.join(processedDir, "manifest.json"), "utf8"));
			const fileMeta = manifest[file];
			if (fileMeta && fileMeta.gifs) {
				fileMeta.gifs.forEach(gif => {
					const base = nodePath.basename(gif);
					const rx = new RegExp(`[^(;)"']+(${escapeRegex(base)})`, "gm");
					html = (html || "").replace(rx, `/img/${base}`);
				});
			}
			if (fileMeta && fileMeta.masks) {
				fileMeta.masks.forEach(mask => {
					const base = nodePath.basename(mask);
					const rx = new RegExp(`[^(;)"']+(${escapeRegex(base)})`, "gm");
					html = (html || "").replace(rx, `/img/${base}`);
				});
			}
		}
		res.send(html);
	});

	if (argv.type === "processed") {
		router.use("/img", express.static(processedImgDir));
	}

	expressApp.use("/", router);

	const server = http.createServer(expressApp);

	server.listen(3000, "0.0.0.0", (req, res) => {
		const addr = server.address();
		console.log(`Preview server listening at http://${addr.address}:${addr.port}`);
	});
}

async function $compile (argv) {
	const srcDir = nodePath.resolve(process.cwd(), argv.srcDir);

	log = createLogger(srcDir);

	const extractedDir = nodePath.resolve(srcDir, "extracted");
	const compiledDir = nodePath.resolve(srcDir, "compiled");
	const processedDir = nodePath.resolve(srcDir, "processed");
	const processedHtmlDir = nodePath.resolve(srcDir, "processed/html");
	const processedImgDir = nodePath.resolve(srcDir, "processed/img");
	await fs.ensureDir(extractedDir);
	await fs.ensureDir(compiledDir);
	await fs.ensureDir(processedDir);
	await fs.ensureDir(processedHtmlDir);
	await fs.ensureDir(processedImgDir);

	const filesDir = argv.type === "processed" ? processedHtmlDir : extractedDir;

	log(`===== START - COMPILE - ${srcDir} - ${filesDir}`);

	const files = await globby(["./*.html"], {cwd: filesDir, absolute: true});

	return files.reduce(async (prev, fileAbs) => {
		await prev;
		try {
			const file = nodePath.relative(filesDir, fileAbs);
			const [, name, idx] = file.match(/^(.+?)\-\-(\d+)\.html$/i);
			const fn = nodePath.join(compiledDir, `${name}.json`);
			console.log("compile", nodePath.relative(srcDir, fileAbs), "->", nodePath.relative(srcDir, fn), `:items[${idx}].value.text`);
			const data = JSON.parse(await fs.readFile(nodePath.join(srcDir, `${name}.json`), "utf8"));
			data.items[idx].value.text = await fs.readFile(fileAbs, "utf8");
			await fs.writeFile(fn, JSON.stringify(data), "utf8"); // .replace(".json", "--fix.json")
		}
		catch (error) {
			log(`Error`, error.message, fileAbs);
		}
	}, null);
}

async function $process (argv) {
	const srcDir = nodePath.resolve(process.cwd(), argv.srcDir);
	log = createLogger(srcDir);

	const extractedDir = nodePath.resolve(srcDir, "extracted");
	const compiledDir = nodePath.resolve(srcDir, "compiled");
	const processedDir = nodePath.resolve(srcDir, "processed");
	const processedHtmlDir = nodePath.resolve(srcDir, "processed/html");
	const processedImgDir = nodePath.resolve(srcDir, "processed/img");
	await fs.ensureDir(extractedDir);
	await fs.ensureDir(compiledDir);
	await fs.ensureDir(processedDir);
	await fs.ensureDir(processedHtmlDir);
	await fs.ensureDir(processedImgDir);

	log(`===== START - PROCESS - ${srcDir}`);

	// console.log("files", files);;
	const files = await globby(["./*.html"], {cwd: extractedDir, absolute: true});

	const manifest = {};
	return files.reduce(async (prev, fileAbs) => {
		await prev;
		try {
			log(`=== Processing file`, fileAbs);
			const file = nodePath.relative(extractedDir, fileAbs);

			const htmlFile = nodePath.resolve(extractedDir, file);
			console.log("htmlFile", htmlFile);
			log(`Opening puppeteer...`);
			const browser = await puppeteer.launch({
				headless: true,
				ignoreHTTPSErrors: true,
				args: [
					// "--no-sandbox",
					"--disable-web-security",
				],
			});
			log(`Puppeteer opened`);
			const page = await browser.newPage();
			await page.goto(pathToFileURL(htmlFile));
			const script = await page.addScriptTag({path: nodePath.resolve(__dirname, "./get-gif-mask.js")});
			await script.evaluateHandle((node) => {
				node.id = "mask-script";
			});
			log(`Searching/processing gifs...`);
			const masks = await page.evaluate(async () => {
				const masks = await window.getMasks();
				return await masks.reduce(async (prev, item) => {
					await prev;

					item.maskBinary = await new Promise(resolve => {
						const reader = new FileReader();
						reader.readAsBinaryString(item.data);
						reader.onload = () => resolve(reader.result);
					});

					item.imgBinary = await new Promise((resolve, reject) => {
						fetch(item.src).then(response => response.blob()).then(data => {
							const reader = new FileReader();
							reader.readAsBinaryString(data);
							reader.onload = () => resolve(reader.result);
						})
							.catch(() => {
								reject();
							});
					});

					return masks;
				}, masks);
			});

			log(`Gifs found:`, masks.length);

			await masks.reduce(async (prev, {maskBinary, imgBinary, src}) => {
				await prev;

				const gifFile = nodePath.resolve(processedImgDir, `${nodePath.basename(new URL(src).pathname)}`);
				await fs.writeFile(gifFile, Buffer.from(imgBinary, "binary"));
				log(`Original gif extracted:`, gifFile);

				const maskFile = nodePath.resolve(processedImgDir, `${nodePath.basename(new URL(src).pathname, ".gif")}--mask.png`);
				await fs.writeFile(maskFile, Buffer.from(maskBinary, "binary"));
				log(`Mask created:`, maskFile);


				log(`Injecting mask to html...`);
				await page.evaluate(async (src) => {
					[...document.querySelectorAll("img")].forEach(img => {
						if (img.src === src) {
							img.style["-webkit-mask-image"] = `url(${src.replace(".gif", `--mask.png`)})`;
							const div = document.createElement("div");
							div.style.filter = "drop-shadow(0px -2px 0px rgba(140,140,140, 0.3)) drop-shadow(0px 2px 0px rgba(140,140,140, 0.3))";
							img.after(div);
							div.append(img);
						}
					});
				}, src);
				log(`Mask has been successfuly injected!`);
				manifest[file] = manifest[file] || {};
				manifest[file].gifs = manifest[file].gifs || [];
				manifest[file].gifs.push(nodePath.relative(srcDir, gifFile));
				manifest[file].masks = manifest[file].masks || [];
				manifest[file].masks.push(nodePath.relative(srcDir, maskFile));
			}, null);

			await script.evaluateHandle(node => {
				node.remove();
			});
			let content = await page.content();
			if (content.includes("https://s3-eu-west-1.amazonaws.com/icons.ftband.net/")) {
				const occur = [...matchAll(content, "https://s3-eu-west-1.amazonaws.com/icons.ftband.net/")];
				log(`Replacing direct amazon urls (${occur.length}):`, "https://s3-eu-west-1.amazonaws.com/icons.ftband.net/", "->", "https://icons.monobank.com.ua/");
				content = replaceAll(content, "https://s3-eu-west-1.amazonaws.com/icons.ftband.net/", "https://icons.monobank.com.ua/");

				manifest[file] = manifest[file] || {};
				manifest[file].replacedDirecAmazonUrl = occur.length;
			}

			log("Minifying html...");
			content = await minify.html(content, {
				html: {
					"removeAttributeQuotes": false,
					"removeOptionalTags": false,
					"removeRedundantAttributes": false,
					"useShortDoctype": false,
					"removeEmptyAttributes": false,
					"removeEmptyElements": false,
				},
			});
			console.log("htmlFile write", nodePath.resolve(processedHtmlDir, file));
			log("Saving processed html to", nodePath.resolve(processedHtmlDir, file));
			await fs.writeFile(nodePath.resolve(processedHtmlDir, file), content, "utf8");
			log("Saving manifest to", nodePath.resolve(processedDir, "manifest.json"));
			await fs.writeFile(nodePath.resolve(processedDir, "manifest.json"), JSON.stringify(manifest, null, "\t"), "utf8");
			await browser.close();
		}
		catch (error) {
			log(`Error`, error.message, fileAbs);
		}

	}, null);

}

async function $extract (argv) {
	// console.log("argv", argv);
	const srcDir = nodePath.resolve(process.cwd(), argv.srcDir);

	log = createLogger(srcDir);

	const extractedDir = nodePath.resolve(srcDir, "extracted");
	const processedDir = nodePath.resolve(srcDir, "processed");
	const processedHtmlDir = nodePath.resolve(srcDir, "processed/html");
	const processedImgDir = nodePath.resolve(srcDir, "processed/img");
	await fs.ensureDir(extractedDir);
	await fs.ensureDir(processedDir);
	await fs.ensureDir(processedHtmlDir);
	await fs.ensureDir(processedImgDir);

	log(`===== START - EXTRACT - ${srcDir}`);
	// console.log("files", files);;
	const files = await globby(["./*.json"], {cwd: srcDir, absolute: true});
	return files.reduce(async (prev, fileAbs) => {
		await prev;
		try {
			const file = nodePath.relative(srcDir, fileAbs);
			log(`=== Extracting file`, fileAbs);

			if (file.endsWith("--fix.json")) {
				return;
			}
			const data = JSON.parse(await fs.readFile(file, "utf8"));
			log(`file read success`);
			log(`file items length`, (data.items || []).length);
			await (data.items || []).reduce(async (prev, item, idx) => {
				await prev;
				try {
					if (item.type === "html") {
						log(`== Extracting single html item`, idx);
						const htmlFile = nodePath.resolve(extractedDir, `${nodePath.basename(file, ".json")}--${idx}.html`);
						await fs.writeFile(
							htmlFile,
							pretty(item?.value?.text ?? "", {
								"indent-with-tabs": true,
								"indent_char": "\t",
								indent_size: 1,
							}),
							"utf8"
						);
						log(`Extracting single html item`, idx, "success!");
					}
				}
				catch (error) {
					log(`Error`, error.message);
				}
				// console.log("item", item);
			}, null);
		}
		catch (error) {
			log(`Error`, error.message, fileAbs);
		}


		// console.log("data", data);
	}, null);
}

async function main () {
	const argv = await yargs(process.argv.slice(2))
		// .parserConfiguration({"strip-aliased": true})
		.command([
			{
				command: "extract [srcDir]",
				aliases: [],
				describe: "extract html items from vrezka",
				handler: async argv => {
					await $extract(argv);
				},
				builder: yargs => {
					return yargs
						.positional("srcDir", {
							alias: ["s", "src"],
							describe: "source dir",
							type: "string",
							default: ".",
						});
				},
			},
			{
				command: "process [srcDir]",
				aliases: [],
				describe: "process extracted html files",
				handler: async argv => {
					await $process(argv);
				},
				builder: yargs => {
					return yargs
						.positional("srcDir", {
							alias: ["s", "src"],
							describe: "source dir",
							type: "string",
							default: ".",
						});
				},
			},
			{
				command: "compile [type] [srcDir]",
				aliases: [],
				describe: "compile html items into vrezka json file",
				handler: async argv => {
					await $compile(argv);
				},
				builder: yargs => {
					return yargs
						.positional("srcDir", {
							alias: ["s", "src"],
							describe: "source dir",
							type: "string",
							default: ".",
						})
						.positional("type", {
							alias: ["t"],
							describe: "type",
							type: "string",
							default: "processed",
							choices: ["processed", "extracted"],
						});
				},
			},
			{
				command: "preview [type] [srcDir]",
				aliases: [],
				describe: "preview extracted html items",
				handler: async argv => {
					await $preview(argv);
				},
				builder: yargs => {
					return yargs
						.positional("srcDir", {
							alias: ["s", "src"],
							describe: "source dir",
							type: "string",
							default: ".",
						})
						.positional("type", {
							alias: ["t"],
							describe: "type",
							type: "string",
							default: "processed",
							choices: ["processed", "extracted"],
						})
						.positional("local-files", {
							alias: ["loc"],
							describe: "Replace masks and gifs path to local directory for preview",
							type: "boolean",
							default: true,
						});
				},
			},
		])
		.help("help")
		.demandCommand()
		.showHelpOnFail(true)
		.argv;
}


main();
