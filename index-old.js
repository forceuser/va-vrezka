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
import {Buffer} from "buffer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = nodePath.dirname(__filename);

async function $compile (argv) {
	const srcDir = nodePath.resolve(process.cwd(), argv.srcDir);
}

async function $process (argv) {
	const srcDir = nodePath.resolve(process.cwd(), argv.srcDir);
	const extractedDir = nodePath.resolve(srcDir, "extracted");
	const processedDir = nodePath.resolve(srcDir, "processed");
	const processedHtmlDir = nodePath.resolve(srcDir, "processed/html");
	const processedImgDir = nodePath.resolve(srcDir, "processed/img");
	await fs.ensureDir(extractedDir);
	await fs.ensureDir(processedDir);
	await fs.ensureDir(processedHtmlDir);
	await fs.ensureDir(processedImgDir);

	// console.log("files", files);;
	const files = await globby(["./*.json"], {cwd: extractedDir});


}

async function $extract (argv) {
	// console.log("argv", argv);
	const srcDir = nodePath.resolve(process.cwd(), argv.srcDir);
	const extractedDir = nodePath.resolve(srcDir, "extracted");
	const processedDir = nodePath.resolve(srcDir, "processed");
	const processedHtmlDir = nodePath.resolve(srcDir, "processed/html");
	const processedImgDir = nodePath.resolve(srcDir, "processed/img");
	await fs.ensureDir(extractedDir);
	await fs.ensureDir(processedDir);
	await fs.ensureDir(processedHtmlDir);
	await fs.ensureDir(processedImgDir);

	// console.log("files", files);;
	const files = await globby(["./*.json"], {cwd: srcDir});
	files.reduce(async (prev, file) => {
		await prev;
		if (file.endsWith("--fix.json")) {
			return;
		}
		const data = JSON.parse(await fs.readFile(file, "utf8"));
		let fixed = false;
		await (data.items || []).reduce(async (prev, item, idx) => {
			await prev;
			if (item.type === "html") {
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

				const browser = await puppeteer.launch({
					headless: true,
					ignoreHTTPSErrors: true,
					args: [
						// "--no-sandbox",
						"--disable-web-security",
					],
				});
				const page = await browser.newPage();
				await page.goto(pathToFileURL(htmlFile));
				const script = await page.addScriptTag({path: nodePath.resolve(__dirname, "./get-gif-mask.js")});
				await script.evaluateHandle((node) => {
					node.id = "mask-script";
				});
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

				await masks.reduce(async (prev, {maskBinary, imgBinary, src}) => {
					await prev;
					await fs.writeFile(
						nodePath.resolve(processedImgDir, `${nodePath.basename(new URL(src).pathname)}`),
						Buffer.from(imgBinary, "binary"),
					);
					await fs.writeFile(
						nodePath.resolve(processedImgDir, `${nodePath.basename(new URL(src).pathname, ".gif")}--mask.png`),
						Buffer.from(maskBinary, "binary"),
					);

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
				}, null);
				await script.evaluateHandle(node => {
					node.remove();
				});
				let content = await page.content();
				content = replaceAll(content, "https://s3-eu-west-1.amazonaws.com/icons.ftband.net/", "https://icons.monobank.com.ua/");
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
				await fs.writeFile(nodePath.resolve(processedHtmlDir, `${nodePath.basename(file, ".json")}--${idx}--fix.html`), content, "utf8");
				await browser.close();
				item.value.text = content;
				fixed = true;
			}
			// console.log("item", item);
		}, null);

		if (fixed) {
			await fs.writeFile(nodePath.resolve(srcDir, "processed", nodePath.basename(file)), JSON.stringify(data), "utf8"); // .replace(".json", "--fix.json")
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
				aliases: ["s"],
				describe: "start node server",
				handler: async argv => {
					await extract(argv);
				},
				builder: yargs => {
					return yargs
						.positional("srcDir", {
							alias: ["s"],
							describe: "source dir",
							type: "string",
							default: ".",
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
