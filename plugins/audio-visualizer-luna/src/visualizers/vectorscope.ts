import type { AudioData } from "../audio";
import type { Visualizer } from "./types";
import { settings } from "../Settings";

export const createVectorscope = (): Visualizer => {
	let ctx: CanvasRenderingContext2D | null = null;
	let canvas: HTMLCanvasElement | null = null;
	let trailCanvas: HTMLCanvasElement | null = null;
	let trailCtx: CanvasRenderingContext2D | null = null;
	let w = 0, h = 0;
	let lastX = 0, lastY = 0;
	let hasLast = false;
	let lastLissajous = false;

	return {
		name: "Vectorscope",
		id: "vectorscope",

		init(cvs, _color) {
			canvas = cvs;
			ctx = cvs.getContext("2d")!;
			w = cvs.width;
			h = cvs.height;
			hasLast = false;

			trailCanvas = document.createElement("canvas");
			trailCanvas.width = w;
			trailCanvas.height = h;
			trailCtx = trailCanvas.getContext("2d")!;

			lastLissajous = !!settings.lissajous;
			cvs.style.transform = lastLissajous ? "rotate(45deg) scale(0.707)" : "";
		},

		render(data: AudioData, color: string) {
			if (!ctx || !trailCtx || !trailCanvas || !canvas) return;

			const wantLissajous = !!settings.lissajous;
			if (wantLissajous !== lastLissajous) {
				lastLissajous = wantLissajous;
				canvas.style.transform = wantLissajous ? "rotate(45deg) scale(0.707)" : "";
			}

			// Fade the trail buffer by drawing it at reduced opacity onto itself
			trailCtx.save();
			trailCtx.globalCompositeOperation = "destination-in";
			trailCtx.fillStyle = "rgba(0, 0, 0, 0.82)";
			trailCtx.fillRect(0, 0, w, h);
			trailCtx.restore();

			const left = data.leftTimeDomain;
			const right = data.rightTimeDomain;
			const len = Math.min(left.length, right.length);
			const lineWidth = Math.max(0.5, (settings.lineThickness ?? 1.0) * 0.5);
			const scale = 2.25;

			trailCtx.strokeStyle = color;
			trailCtx.lineWidth = lineWidth;
			trailCtx.lineJoin = "round";
			trailCtx.lineCap = "round";
			trailCtx.globalAlpha = 0.9;

			trailCtx.beginPath();
			for (let i = 0; i < len; i++) {
				const x = left[i] * (w / scale) + w / 2;
				const y = right[i] * (h / scale) + h / 2;

				if (!hasLast) {
					trailCtx.moveTo(x, y);
					hasLast = true;
				} else {
					trailCtx.moveTo(lastX, lastY);
					trailCtx.lineTo(x, y);
				}
				lastX = x;
				lastY = y;
			}
			trailCtx.stroke();
			trailCtx.globalAlpha = 1.0;

			// Composite trail onto visible canvas (fully transparent background)
			ctx.clearRect(0, 0, w, h);
			ctx.drawImage(trailCanvas, 0, 0);
		},

		resize(width, height) {
			w = width;
			h = height;
			hasLast = false;
			if (trailCanvas && trailCtx) {
				trailCanvas.width = w;
				trailCanvas.height = h;
			}
		},

		dispose() {
			if (canvas) canvas.style.transform = "";
			ctx = null;
			canvas = null;
			trailCtx = null;
			trailCanvas = null;
			hasLast = false;
		},
	};
};
