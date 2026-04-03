import type { AudioData } from "../audio";
import type { Visualizer } from "./types";
import { settings } from "../Settings";

export const createOscilloscope = (): Visualizer => {
	let ctx: CanvasRenderingContext2D | null = null;
	let w = 0, h = 0;
	let scrollBuffer: Float32Array | null = null;
	let scrollPos = 0;

	const ensureScrollBuffer = () => {
		if (!scrollBuffer || scrollBuffer.length !== w) {
			scrollBuffer = new Float32Array(w);
			scrollPos = 0;
		}
	};

	return {
		name: "Oscilloscope",
		id: "oscilloscope",

		init(canvas, _color) {
			ctx = canvas.getContext("2d")!;
			w = canvas.width;
			h = canvas.height;
			scrollBuffer = null;
			scrollPos = 0;
		},

		render(data: AudioData, color: string) {
			if (!ctx) return;
			ctx.clearRect(0, 0, w, h);

			const lineWidth = settings.lineThickness ?? 1.5;
			ctx.lineWidth = lineWidth;
			ctx.strokeStyle = color;
			ctx.lineJoin = "round";
			ctx.lineCap = "round";

			if (settings.scrollingOscilloscope) {
				ensureScrollBuffer();
				if (!scrollBuffer) return;

				const timeDomain = data.floatTimeDomain;
				const samplesPerPixel = Math.max(1, Math.floor(timeDomain.length / w));
				const pixelsToAdd = Math.max(1, Math.ceil(timeDomain.length / samplesPerPixel));

				for (let p = 0; p < pixelsToAdd; p++) {
					const sampleIdx = Math.floor(p * samplesPerPixel);
					let peak = 0;
					for (let s = sampleIdx; s < Math.min(sampleIdx + samplesPerPixel, timeDomain.length); s++) {
						if (Math.abs(timeDomain[s]) > Math.abs(peak)) peak = timeDomain[s];
					}
					scrollBuffer[scrollPos % w] = peak;
					scrollPos++;
				}

				ctx.beginPath();
				for (let x = 0; x < w; x++) {
					const idx = (scrollPos - w + x + w * 2) % w;
					const sample = scrollBuffer[idx];
					const y = (1 - sample) * h / 2;
					if (x === 0) ctx.moveTo(0, y);
					else ctx.lineTo(x, y);
				}
				ctx.stroke();
			} else {
				const buffer = data.byteTimeDomain;
				const len = buffer.length;
				const segmentWidth = w / len;

				ctx.beginPath();
				for (let i = 0; i < len; i++) {
					const v = buffer[i] / 128.0;
					const y = (v * h) / 2;
					if (i === 0) ctx.moveTo(0, y);
					else ctx.lineTo(i * segmentWidth, y);
				}
				ctx.stroke();
			}
		},

		resize(width, height) {
			w = width;
			h = height;
			scrollBuffer = null;
			scrollPos = 0;
		},

		dispose() {
			ctx = null;
			scrollBuffer = null;
			scrollPos = 0;
		},
	};
};
