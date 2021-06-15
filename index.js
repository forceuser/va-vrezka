#!/usr/bin/env node
import process from "process";
import nodePath, {basename, resolve} from "path";
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
import fp from "find-free-port";
import open from "open";
import JSZip from "jszip";


const __filename = fileURLToPath(import.meta.url);
const __dirname = nodePath.dirname(__filename);

let globalLogFile;
const createLogger = (srcDir = process.cwd(), srcFile = globalLogFile || "log.txt") => {
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
	const cmdType = argv.type || "processed";

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

	const filesDir = cmdType ? processedHtmlDir : extractedDir;

	log(`===== START - PREVIEW - ${srcDir} - ${filesDir}`);
	console.log(`===== START - PREVIEW - ${srcDir} - ${filesDir}`);

	const files = await globby(["./*.html"], {cwd: filesDir, absolute: true});


	const expressApp = express();
	expressApp.set("trust proxy", true); // app.settings.get("trust-proxy")

	const router = express.Router();

	router.get("/", async (req, res) => {
		let manifest = {};
		if (cmdType === "processed") {
			manifest = JSON.parse(await fs.readFile(nodePath.join(processedDir, "manifest.json"), "utf8"));
		}
		// console.log("manifest", manifest);
		// console.log(processedDir);
		// list files
		res.set("Content-Type", "text/html");
		const style = `<style>*{font-family:sans-serif}table{border-collapse:collapse;margin:25px 0;font-size:.9em;min-width:400px;border-radius:5px 5px 0 0;overflow:hidden;box-shadow:0 0 20px rgba(0,0,0,.15)}table thead tr{background-color:#009879;color:#fff;text-align:left;font-weight:700}table td,table th{padding:12px 15px}table tbody tr{border-bottom:1px solid #ddd}table tbody tr:nth-of-type(even){background-color:#f3f3f3}table tbody tr:last-of-type{border-bottom:2px solid #009879}</style>`;
		const html = style + `<!doctype HTML><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0"/><title>va-vrezka preview ${filesDir}</title></head><body><table><thead><tr><th>html item</th><th>gifs</th><th>masks</th><th>string replaced</th></tr></thead><tbody>${files.map(fileAbs => {
			const file = nodePath.relative(filesDir, fileAbs);
			return [
				`<tr>`,
				`<td><a href="/html/${file}" target="_blank">${file}</a></td>`,
				`<td>${(manifest?.[file]?.gifs ?? []).map($ => `<a href="/img/${$.replace("processed/img/", "")}" target="_blank">${$}</a>`)?.join("<br/>\n")}</td>`,
				`<td>${(manifest?.[file]?.masks ?? []).map($ => `<a href="/img/${$.replace("processed/img/", "")}" target="_blank">${$}</a>`)?.join("<br/>\n")}</td>`,
				`<td>${manifest?.[file]?.stringReplaced ?? ""}</td>`,
				`</tr>`,
			].join("\n");
		}).join("\n")}</tbody></table></body></html>`;
		res.send(Buffer.from(html));
	});

	router.get("/html/:file", async (req, res) => {
		// list files
		res.set("Content-Type", "text/html");
		const file = req.params.file;
		let html = await fs.readFile(nodePath.join(filesDir, file), "utf8");
		if (cmdType === "processed" && argv.localFiles) {
			const manifest = JSON.parse(await fs.readFile(nodePath.join(processedDir, "manifest.json"), "utf8"));
			const fileMeta = manifest[file];
			if (fileMeta && fileMeta.gifs) {
				fileMeta.gifs.forEach(gif => {
					const base = gif.replace("processed/img/", "");
					const rx = new RegExp(`[^(;)"']+(${escapeRegex(base)})`, "gm");
					html = (html || "").replace(rx, `/img/${base}`);
				});
			}
			if (fileMeta && fileMeta.masks) {
				fileMeta.masks.forEach(mask => {
					const base = mask.replace("processed/img/", "");
					const rx = new RegExp(`[^(;)"']+(${escapeRegex(base)})`, "gm");
					html = (html || "").replace(rx, `/img/${base}`);
				});
			}
		}
		res.send(html);
	});

	if (cmdType === "processed") {
		router.use("/img", express.static(processedImgDir));
	}

	expressApp.use("/", router);

	const server = http.createServer(expressApp);

	const [port] = await fp(3000);
	server.listen(port, "0.0.0.0", (req, res) => {
		const addr = server.address();
		console.log(`Preview server listening at http://${addr.address}:${addr.port}`);
		open(`http://${addr.address}:${addr.port}`);
	});
}

async function fileExists (file) {
	return fs.access(file, fs.constants.F_OK)
		.then(() => true)
		.catch(() => false);
}

function getFormattedDate (date = new Date()) {
	const dt = new Date(date);
	dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
	return dt.toISOString().split(".")[0].replace("T", "_").replace(/\:/g, "-");
}

const outsideDir = "skk/monobank/skk-icons/icon-mdpi/outside";

async function $compile (argv) {
	const srcDir = nodePath.resolve(process.cwd(), argv.srcDir);
	const cmdType = argv.type || "processed";

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

	const filesDir = cmdType === "processed" ? processedHtmlDir : extractedDir;

	log(`===== START - COMPILE - ${srcDir} - ${filesDir}`);
	console.log(`===== START - COMPILE - ${srcDir} - ${filesDir}`);

	const files = await globby(["./*.html"], {cwd: filesDir, absolute: true});
	const compiled = new Set();

	await files.reduce(async (prev, fileAbs) => {
		await prev;
		try {
			const file = nodePath.relative(filesDir, fileAbs);
			const [, name, idx] = file.match(/^(.+?)\-\-(\d+)\.html$/i);
			const fn = nodePath.join(compiledDir, `${name}.json`);
			// console.log("compile", nodePath.relative(srcDir, fileAbs), "->", nodePath.relative(srcDir, fn), `:items[${idx}].value.text`);
			const data = compiled.has(fn) ? JSON.parse(await fs.readFile(fn, "utf8")) : JSON.parse(await fs.readFile(nodePath.join(srcDir, `${name}.json`), "utf8"));
			let content = await fs.readFile(fileAbs, "utf8");
			log("Minifying html...", fileAbs);
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
			data.items[idx].value.text = content;
			log("Putting html content into json:", fn);
			log(`items[${idx}].value.text=`, fileAbs);
			await fs.writeFile(fn, JSON.stringify(data), "utf8"); // .replace(".json", "--fix.json")
			compiled.add(fn);
		}
		catch (error) {
			log(`Error`, error.message, fileAbs);
		}
	}, null);

	console.log(`${compiled.size} file(s) compiled to`, compiledDir);
	try {
		const zipFileName = nodePath.join(srcDir, `compiled--${getFormattedDate()}.zip`);
		log("Creating zip file...", zipFileName);

		const zip = new JSZip();
		await (await globby(["compiled/*.json"], {cwd: srcDir, absolute: true})).reduce(async (prev, fileAbs) => {
			await prev;
			await zip.file(nodePath.relative(compiledDir, fileAbs), fs.createReadStream(fileAbs));
		}, null);
		await (await globby(["processed/img/**/*.png"], {cwd: srcDir, absolute: true})).reduce(async (prev, fileAbs) => {
			await prev;
			await zip.file(nodePath.join("to-amazon", nodePath.relative(processedImgDir, fileAbs)), fs.createReadStream(fileAbs));
		}, null);
		await (await globby([`processed/img/${outsideDir}/**/*.gif`], {cwd: srcDir, absolute: true})).reduce(async (prev, fileAbs) => {
			await prev;
			await zip.file(nodePath.join("to-amazon", nodePath.relative(processedImgDir, fileAbs)), fs.createReadStream(fileAbs));
		}, null);


		await new Promise(resolve => {
			zip
				.generateNodeStream({type: "nodebuffer", streamFiles: true})
				.pipe(fs.createWriteStream(zipFileName))
				.on("finish", () => {
					resolve();
				});
		});

		console.log(`Zip file created:`, zipFileName);
	}
	catch (error) {
		log("Error", error.message);
	}
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
	console.log(`===== START - PROCESS - ${srcDir}`);

	// console.log("files", files);;
	const files = await globby(["./*.html"], {cwd: extractedDir, absolute: true});

	const manifest = {};
	const count = files.length;
	await files.reduce(async (prev, fileAbs, idx) => {
		await prev;
		let browser;
		try {
			log(`=== Processing file`, fileAbs);
			const file = nodePath.relative(extractedDir, fileAbs);

			const htmlFile = nodePath.resolve(extractedDir, file);
			console.log(`[${idx + 1}/${count}]`, "processing:", htmlFile);
			log(`Opening puppeteer...`);
			browser = await puppeteer.launch({
				headless: true,
				ignoreHTTPSErrors: true,
				args: [
					// "--no-sandbox",
					"--disable-web-security",
				],
			});
			log(`Puppeteer opened`);
			const page = await browser.newPage();


			// let content = await page.content();
			let content = await fs.readFile(htmlFile, "utf8");
			const occurWrongHttp = [...matchAll(content, "hhttps://")];
			if (occurWrongHttp?.length) {
				content = replaceAll(content, "hhttps://", "https://");
				log(`Replacing wrong http string (${occurWrongHttp.length}):`);
				manifest[file] = manifest[file] || {};
				manifest[file].stringReplaced = (manifest[file].stringReplaced || 0) + occurWrongHttp.length;
			}
			const occurDirectAmazonUrl = [...matchAll(content, "https://s3-eu-west-1.amazonaws.com/icons.ftband.net/")];
			if (occurDirectAmazonUrl?.length) {
				log(`Replacing direct amazon urls (${occurDirectAmazonUrl.length}):`, "https://s3-eu-west-1.amazonaws.com/icons.ftband.net/", "->", "https://icons.monobank.com.ua/");
				content = replaceAll(content, "https://s3-eu-west-1.amazonaws.com/icons.ftband.net/", "https://icons.monobank.com.ua/");

				manifest[file] = manifest[file] || {};
				manifest[file].stringReplaced = (manifest[file].stringReplaced || 0) + occurDirectAmazonUrl.length;
			}
			const occurOldCss = [...matchAll(content, "skk/monobank/skk-icons/icon-mdpi/css_ot_06_12.css")];
			if (occurOldCss?.length) {
				content = replaceAll(content, "skk/monobank/skk-icons/icon-mdpi/css_ot_06_12.css", "skk/monobank/other_skk/template.css");
				log(`Replacing old css links string (${occurOldCss.length}):`);
				manifest[file] = manifest[file] || {};
				manifest[file].stringReplaced = (manifest[file].stringReplaced || 0) + occurOldCss.length;
			}

			const occurTypo1 = [...matchAll(content, "skk/monobank/skk-icons/icon-mdpi/GIF/omy/cashback_4.gif/monobank/skk-icons/icon-mdpi/GIF/screencast-partner-cashback.gif")];
			if (occurTypo1?.length) {
				content = replaceAll(content, "skk/monobank/skk-icons/icon-mdpi/GIF/omy/cashback_4.gif/monobank/skk-icons/icon-mdpi/GIF/screencast-partner-cashback.gif", "https://icons.monobank.com.ua/skk/monobank/skk-icons/icon-mdpi/GIF/omy/cashback_4.gif");
				log(`Replacing typo1 string (${occurTypo1.length}):`);
				manifest[file] = manifest[file] || {};
				manifest[file].stringReplaced = (manifest[file].stringReplaced || 0) + occurTypo1.length;
			}

			// await page.goto(pathToFileURL(htmlFile));
			// console.log("content", content);
			await page.evaluate(async (content) => {
				window.document.write(content);
			}, content);
			const script = await page.addScriptTag({path: nodePath.resolve(__dirname, "./get-gif-mask.js")});
			await script.evaluateHandle((node) => {
				node.id = "mask-script";
			});
			log(`Searching/processing gifs...`);
			const masks = await page.evaluate(async () => {
				const masks = await window.getMasks();
				await masks.reduce(async (prev, item) => {
					await prev;

					if (!item.src.startsWith("https://icons.monobank.com.ua/")) {
						item.outside = true;
					}

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

				}, null);
				return masks;
			});

			log(`Gifs found:`, masks.length);



			await masks.reduce(async (prev, {maskBinary, imgBinary, src, outside}) => {
				await prev;



				log(`Injecting mask to html...`, src);
				let pathname = new URL(src).pathname.replace(/^\/+/, "");
				if (outside) {
					pathname = nodePath.join(outsideDir, nodePath.basename(pathname)).replace(/^\/+/, "");
				}
				const dir = nodePath.resolve(processedImgDir, nodePath.dirname(pathname));
				const srcMod = `https://icons.monobank.com.ua/${pathname}`;
				const some = await page.evaluate(async (src, srcMod) => {
					let some = false;
					[...document.querySelectorAll("img")].forEach(img => {
						// console.log("IMG.src", img.src, src, img.src === src);
						if (img.src === src) {
							if (!img.closest("video")) {
								const maskedEl = img.closest("video") ? img.closest("video") : img;
								// console.log("maskStyle", maskStyle);
								img.src = srcMod;
								const maskStyle = `url('${encodeURI(srcMod.replace(".gif", `--mask.png`))}')`;
								maskedEl.style["-webkit-mask-image"] = maskStyle;
								const div = document.createElement("div");
								div.style.display = "contents";
								div.style.filter = "drop-shadow(0px -2px 0px rgba(140,140,140, 0.3)) drop-shadow(0px 2px 0px rgba(140,140,140, 0.3))";
								maskedEl.after(div);
								div.append(maskedEl);
								some = true;
							}
						}
					});
					return some;
				}, src, srcMod);

				if (some) {

					log(`Image dir:`, dir);
					await fs.ensureDir(dir);
					const gifFile = nodePath.resolve(dir, `${nodePath.basename(pathname)}`);
					await fs.writeFile(gifFile, Buffer.from(imgBinary, "binary"));
					log(`Original gif extracted:`, gifFile);

					const maskFile = nodePath.resolve(dir, `${nodePath.basename(pathname, ".gif")}--mask.png`);
					await fs.writeFile(maskFile, Buffer.from(maskBinary, "binary"));
					log(`Mask created:`, maskFile);

					log(`Mask has been successfuly injected!`);
					manifest[file] = manifest[file] || {};
					manifest[file].gifs = manifest[file].gifs || [];
					manifest[file].gifs.push(nodePath.relative(srcDir, gifFile));
					manifest[file].masks = manifest[file].masks || [];
					manifest[file].masks.push(nodePath.relative(srcDir, maskFile));
				}
			}, null);

			await script.evaluateHandle(node => {
				node.remove();
			});

			content = await page.content();
			console.log("ready");
			log("Saving processed html to", nodePath.resolve(processedHtmlDir, file));
			await fs.writeFile(nodePath.resolve(processedHtmlDir, file), content, "utf8");
			log("Saving manifest to", nodePath.resolve(processedDir, "manifest.json"));
			await fs.writeFile(nodePath.resolve(processedDir, "manifest.json"), JSON.stringify(manifest, null, "\t"), "utf8");
		}
		catch (error) {
			log(`Error`, error.message, fileAbs);
		}
		if (browser) {
			await browser.close();
			browser = null;
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
	console.log(`===== START - EXTRACT - ${srcDir}`);

	const files = await globby(["./*.json"], {cwd: srcDir, absolute: true});
	// console.log("files", files, srcDir);

	const extracted = new Set();
	const count = files.length;
	await files.reduce(async (prev, fileAbs) => {
		await prev;
		try {
			const file = nodePath.relative(srcDir, fileAbs);
			log(`=== Extracting file`, fileAbs);
			log(`file`, file);

			// if (file.endsWith("--fix.json")) {
			// 	return;
			// }
			const data = JSON.parse(await fs.readFile(nodePath.join(srcDir, file), "utf8"));
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
						extracted.add(htmlFile);
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
	}, null);
	console.log(`${extracted.size} file(s) extracted to`, extractedDir);
}

async function main () {
	const argv = await yargs(process.argv.slice(2))
		// .parserConfiguration({"strip-aliased": true})
		.command([
			{
				command: "all [srcDir]",
				aliases: [],
				describe: "extract html items from vrezka",
				handler: async argv => {
					console.log("== DOING ALL SEQENCE");
					globalLogFile = `log-all--${getFormattedDate()}.txt`;
					await $extract(argv);
					await $process(argv);
					await $compile(argv);
					await $preview({...argv, localFiles: true});
					console.log(`Generated log: `, nodePath.resolve(process.cwd(), argv.srcDir, globalLogFile));
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
