function boxblur (canvas, radius = 0, {iterations = 1, x = 0, y = 0, width, height, mask = false, easeAlpha} = {}) {
	if (radius < 1) {
		return;
	}
	width = width == null ? canvas.width : width;
	height = height == null ? canvas.height : height;

	const context = canvas.getContext("2d");
	const imageData = context.getImageData(x, y, width, height);

	const pixels = imageData.data;

	let rsum; let gsum; let bsum; let asum;
	let p; let p1; let p2;
	let yp; let yi; let yw; let pa;

	const wm = width - 1;
	const hm = height - 1;
	const rad1 = radius + 1;
	const space = Math.pow(radius * 2, 2);

	const r = [];
	const g = [];
	const b = [];
	const a = [];

	const vmin = [];
	const vmax = [];

	const getPx = (i) => {
		const a = pixels[i + 3];
		return [
			a * pixels[i] / 255,
			a * pixels[i + 1] / 255,
			a * pixels[i + 2] / 255,
			a,
		];
	};

	while (iterations > 0) {
		iterations--;
		yw = yi = 0;

		for (let y = 0; y < height; y++) {
			const px = getPx(yw);
			rsum = px[0] * rad1;
			gsum = px[1] * rad1;
			bsum = px[2] * rad1;
			asum = px[3] * rad1;

			for (let i = 1; i <= radius; i++) {
				const px = getPx(yw + (((i > wm ? wm : i)) << 2));
				rsum += px[0];
				gsum += px[1];
				bsum += px[2];
				asum += px[3];
			}

			for (let x = 0; x < width; x++) {
				r[yi] = rsum;
				g[yi] = gsum;
				b[yi] = bsum;
				a[yi] = asum;

				if (y == 0) {
					p = x + rad1;
					vmin[x] = (p < wm ? p : wm) << 2;
					p = x - radius;
					vmax[x] = p > 0 ? p << 2 : 0;
				}

				p1 = yw + vmin[x];
				p2 = yw + vmax[x];

				const px1 = getPx(p1);
				const px2 = getPx(p2);

				rsum += px1[0] - px2[0];
				gsum += px1[1] - px2[1];
				bsum += px1[2] - px2[2];
				asum += px1[3] - px2[3];

				yi++;
			}
			yw += (width << 2);
		}

		for (let x = 0; x < width; x++) {
			yp = x;
			rsum = r[yp] * rad1;
			gsum = g[yp] * rad1;
			bsum = b[yp] * rad1;
			asum = a[yp] * rad1;

			for (let i = 1; i <= radius; i++) {
				yp += (i > hm ? 0 : width);
				rsum += r[yp];
				gsum += g[yp];
				bsum += b[yp];
				asum += a[yp];
			}

			yi = x << 2;
			for (let y = 0; y < height; y++) {
				if (!mask || pixels[yi + 3] > 0) {

					pixels[yi + 3] = pa = Math.round(easeAlpha ? (easeAlpha(asum / space / 255) * 255) : (asum / space));
					if (pa > 0) {
						pa = 255 / pa;
						pixels[yi] = Math.round(rsum / space * pa);
						pixels[yi + 1] = Math.round(gsum / space * pa);
						pixels[yi + 2] = Math.round(bsum / space * pa);
					}
					else {
						pixels[yi] = pixels[yi + 1] = pixels[yi + 2] = 0;
					}
				}
				else {
					pixels[yi] = pixels[yi + 1] = pixels[yi + 2] = 0;
				}
				if (x == 0) {
					p = y + rad1;
					vmin[y] = (p < hm ? p : hm) * width;
					p = y - radius;
					vmax[y] = p > 0 ? p * width : 0;
				}

				p1 = x + vmin[y];
				p2 = x + vmax[y];

				rsum += r[p1] - r[p2];
				gsum += g[p1] - g[p2];
				bsum += b[p1] - b[p2];
				asum += a[p1] - a[p2];

				yi += width << 2;

			}
		}
	}

	context.putImageData(imageData, x, y);
}

async function getMasks () {
	const images = Array.from(document.querySelectorAll("img")).filter((img) => {
		return (img.src || "").match(/\.gif$/);
	});

	function getPoint (x, y, {data, width = data.length, size = 4} = {}) {
		let i = (y * width * size) + (x * size);
		return Array.prototype.slice.call(data, i, i + size);
	}

	function setPoint (x, y, {data, width = data.length, size = 4} = {}, rgba) {
		let i = (y * width * size) + (x * size);
		for (let j = 0; j < size; j++) {
			data[i + j] = rgba[j];
		}
	}

	function deltaE (rgbA, rgbB) {
		let labA = rgb2lab(rgbA);
		let labB = rgb2lab(rgbB);
		let deltaL = labA[0] - labB[0];
		let deltaA = labA[1] - labB[1];
		let deltaB = labA[2] - labB[2];
		let c1 = Math.sqrt(labA[1] * labA[1] + labA[2] * labA[2]);
		let c2 = Math.sqrt(labB[1] * labB[1] + labB[2] * labB[2]);
		let deltaC = c1 - c2;
		let deltaH = deltaA * deltaA + deltaB * deltaB - deltaC * deltaC;
		deltaH = deltaH < 0 ? 0 : Math.sqrt(deltaH);
		let sc = 1.0 + 0.045 * c1;
		let sh = 1.0 + 0.015 * c1;
		let deltaLKlsl = deltaL / (1.0);
		let deltaCkcsc = deltaC / (sc);
		let deltaHkhsh = deltaH / (sh);
		let i = deltaLKlsl * deltaLKlsl + deltaCkcsc * deltaCkcsc + deltaHkhsh * deltaHkhsh;
		return i < 0 ? 0 : Math.sqrt(i);
	}

	function rgb2lab (rgb) {
		let r = rgb[0] / 255; let g = rgb[1] / 255; let b = rgb[2] / 255; let x; let y; let z;
		r = (r > 0.04045) ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
		g = (g > 0.04045) ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
		b = (b > 0.04045) ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
		x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
		y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.00000;
		z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
		x = (x > 0.008856) ? Math.pow(x, 1 / 3) : (7.787 * x) + 16 / 116;
		y = (y > 0.008856) ? Math.pow(y, 1 / 3) : (7.787 * y) + 16 / 116;
		z = (z > 0.008856) ? Math.pow(z, 1 / 3) : (7.787 * z) + 16 / 116;
		return [(116 * y) - 16, 500 * (x - y), 200 * (y - z)];
	}

	function fill (canvas, fuzz = 32, fillColor = [0, 0, 0, 0], pixelStack = []) {
		const ctx = canvas.getContext("2d");
		const ref = ctx.getImageData(0, 0, canvas.width, canvas.height);
		const w = canvas.width;
		const h = canvas.height;
		const buffer = new ArrayBuffer(w * h);
		const proc = new Uint8Array(buffer);
		let color = getPoint(0, 0, ref);

		pixelStack.push([0, 0]);
		pixelStack.push([w - 1, 0]);
		pixelStack.push([0, h - 1]);
		pixelStack.push([w - 1, h - 1]);
		function getPPoint (x, y) {
			return getPoint(x, y, {data: proc, width: w, size: 1})[0];
		}

		function setPPoint (x, y, val) {
			setPoint(x, y, {data: proc, width: w, size: 1}, [val]);
		}

		while (pixelStack.length) {
			let [x, y] = pixelStack.pop();
			while (y > 0 && !getPPoint(x, y - 1) && deltaE(getPoint(x, y - 1, ref), color) < fuzz) {
				y--;
			}

			while (y < h) {
				if (!getPPoint(x, y) && deltaE(getPoint(x, y, ref), color) < fuzz) {
					if (x > 0) {
						if (!getPPoint(x - 1, y) && deltaE(getPoint(x - 1, y, ref), color) < fuzz) {
							pixelStack.push([x - 1, y]);
						}
					}
					if (x < w - 1) {
						if (!getPPoint(x + 1, y) && deltaE(getPoint(x + 1, y, ref), color) < fuzz) {
							pixelStack.push([x + 1, y]);
						}
					}
					setPPoint(x, y, 1);
				}
				else {
					break;
				}
				y++;
			}
		}

		for (let x = 0; x < w; x++) {
			for (let y = 0; y < h; y++) {
				setPoint(x, y, ref, [0, 0, 0, getPPoint(x, y) ? 0 : 255]);
			}
		}

		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.putImageData(ref, 0, 0);

		boxblur(canvas, 2, {mask: false, easeAlpha: $ => Math.pow($, 4)});
	}

	return images.reduce(async (list, img) => {
		list = await list;
		await new Promise((resolve, reject) => {
			const start = Date.now();
			const interv = setInterval(() => {
				if (img.complete && img.naturalWidth && img.naturalHeight) {
					clearInterval(interv);
					resolve();
				}
				else if (Date.now() - start > 5000) {
					clearTimeout(interv);
					throw new Error(`Failed to load image ${img.src}`);
				}
			}, 20);
		});
		let canvas = document.createElement("canvas");
		canvas.width = img.naturalWidth;
		canvas.height = img.naturalHeight;
		let ctx = canvas.getContext("2d");
		ctx.drawImage(img, 0, 0);

		fill(canvas, 50);

		list.push({
			src: img.src,
			data: await new Promise(resolve => canvas.toBlob(blob => resolve(blob))),
		});
		return list;
	}, []);
}

window.getMasks = getMasks;

