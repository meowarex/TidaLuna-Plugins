import type { AudioData } from "../audio";
import type { Visualizer } from "./types";
import { settings } from "../Settings";

export const createVectorscope = (): Visualizer => {
	let ctx: CanvasRenderingContext2D | null = null;
	let canvas: HTMLCanvasElement | null = null;
	let w = 0, h = 0;
	let lastX = 0, lastY = 0;
	let hasLast = false;
	let lastLissajous = false;

	return {
		name: "Vectorscope",
		id: "vectorscope",

		init(cvs, _color) {
			canvas = cvs;
			const c = cvs.getContext("2d");
			if (!c) return;
			ctx = c;
			w = cvs.width;
			h = cvs.height;
			hasLast = false;

			lastLissajous = !!settings.lissajous;
			cvs.style.transform = lastLissajous ? "rotate(45deg) scale(0.707)" : "";
		},

		render(data: AudioData, color: string) {
			if (!ctx || !canvas) return;

			const wantLissajous = !!settings.lissajous;
			if (wantLissajous !== lastLissajous) {
				lastLissajous = wantLissajous;
				canvas.style.transform = wantLissajous ? "rotate(45deg) scale(0.707)" : "";
			}

			ctx.clearRect(0, 0, w, h);

			const left = data.leftTimeDomain;
			const right = data.rightTimeDomain;
			const len = Math.min(left.length, right.length);
			const lineWidth = Math.max(0.5, (settings.lineThickness ?? 1.0) * 0.5);
			const inset = lineWidth;
			const halfW = Math.max(1, w / 2 - inset);
			const halfH = Math.max(1, h / 2 - inset);

			ctx.strokeStyle = color;
			ctx.lineWidth = lineWidth;
			ctx.lineJoin = "round";
			ctx.lineCap = "round";

			hasLast = false;
			ctx.beginPath();
			for (let i = 0; i < len; i++) {
				const x = left[i] * halfW + w / 2;
				const y = right[i] * halfH + h / 2;

				if (!hasLast) {
					ctx.moveTo(x, y);
					hasLast = true;
				} else {
					ctx.moveTo(lastX, lastY);
					ctx.lineTo(x, y);
				}
				lastX = x;
				lastY = y;
			}
			ctx.stroke();
		},

		resize(width, height) {
			w = width;
			h = height;
			hasLast = false;
		},

		dispose() {
			if (canvas) canvas.style.transform = "";
			ctx = null;
			canvas = null;
			hasLast = false;
		},
	};
};
