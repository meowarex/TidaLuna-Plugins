import type { AudioData } from "../audio";
import type { Visualizer } from "./types";
import { hexToRGB } from "../webgl";

const GATE_ABSOLUTE = -70;
const GATE_RELATIVE_OFFSET = -10;
const GAINS = [1.0, 1.0];

interface LUFSState {
	momentaryBlocks: number[];
	shortTermBlocks: number[];
	integratedPowers: number[];
	momentary: number;
	shortTerm: number;
	integrated: number;
	blockBuffer: Float32Array[];
	blockPos: number;
	blockSize: number;
	hopSize: number;
	hopPos: number;
	displayMomentary: number;
	displayShortTerm: number;
	displayIntegrated: number;
}

const createLUFSState = (sampleRate: number): LUFSState => {
	const blockSize = Math.floor(sampleRate * 0.4);
	const hopSize = Math.floor(sampleRate * 0.1);
	return {
		momentaryBlocks: [],
		shortTermBlocks: [],
		integratedPowers: [],
		momentary: -Infinity,
		shortTerm: -Infinity,
		integrated: -Infinity,
		blockBuffer: [new Float32Array(blockSize), new Float32Array(blockSize)],
		blockPos: 0,
		blockSize,
		hopSize,
		hopPos: 0,
		displayMomentary: -60,
		displayShortTerm: -60,
		displayIntegrated: -60,
	};
};

const computeBlockLoudness = (left: Float32Array, right: Float32Array, len: number): number => {
	let sumL = 0, sumR = 0;
	for (let i = 0; i < len; i++) {
		sumL += left[i] * left[i];
		sumR += right[i] * right[i];
	}
	const powerL = sumL / len;
	const powerR = sumR / len;
	const weighted = GAINS[0] * powerL + GAINS[1] * powerR;
	if (weighted <= 0) return -Infinity;
	return -0.691 + 10 * Math.log10(weighted);
};

const computeGatedIntegrated = (powers: number[]): number => {
	if (powers.length === 0) return -Infinity;

	const aboveAbsolute = powers.filter(p => p > GATE_ABSOLUTE);
	if (aboveAbsolute.length === 0) return -Infinity;

	const meanAbsolute = aboveAbsolute.reduce((s, v) => s + Math.pow(10, v / 10), 0) / aboveAbsolute.length;
	const relativeThreshold = 10 * Math.log10(meanAbsolute) + GATE_RELATIVE_OFFSET;
	const aboveRelative = aboveAbsolute.filter(p => p > relativeThreshold);
	if (aboveRelative.length === 0) return -Infinity;

	const meanRelative = aboveRelative.reduce((s, v) => s + Math.pow(10, v / 10), 0) / aboveRelative.length;
	return 10 * Math.log10(meanRelative);
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const createLoudnessMeter = (): Visualizer => {
	let ctx: CanvasRenderingContext2D | null = null;
	let w = 0, h = 0;
	let state: LUFSState | null = null;
	let lastSampleRate = 0;

	const SMOOTHING_FAST = 0.25;
	const SMOOTHING_SLOW = 0.08;

	return {
		name: "Loudness (LUFS)",
		id: "loudness-meter",

		init(canvas, _color) {
			ctx = canvas.getContext("2d")!;
			w = canvas.width;
			h = canvas.height;
			state = null;
			lastSampleRate = 0;
		},

		render(data: AudioData, color: string) {
			if (!ctx) return;

			if (!state || data.sampleRate !== lastSampleRate) {
				state = createLUFSState(data.sampleRate);
				lastSampleRate = data.sampleRate;
			}

			const left = data.leftTimeDomain;
			const right = data.rightTimeDomain;
			const len = Math.min(left.length, right.length);

			for (let i = 0; i < len; i++) {
				state.blockBuffer[0][state.blockPos] = left[i];
				state.blockBuffer[1][state.blockPos] = right[i];
				state.blockPos++;
				state.hopPos++;

				if (state.blockPos >= state.blockSize) {
					const loudness = computeBlockLoudness(state.blockBuffer[0], state.blockBuffer[1], state.blockSize);

					state.momentaryBlocks.push(loudness);
					if (state.momentaryBlocks.length > 4) state.momentaryBlocks.shift();
					state.momentary = Math.max(...state.momentaryBlocks);

					state.shortTermBlocks.push(loudness);
					if (state.shortTermBlocks.length > 30) state.shortTermBlocks.shift();
					const stPowers = state.shortTermBlocks.filter(v => v > -Infinity);
					if (stPowers.length > 0) {
						const stMean = stPowers.reduce((s, v) => s + Math.pow(10, v / 10), 0) / stPowers.length;
						state.shortTerm = 10 * Math.log10(stMean);
					}

					state.integratedPowers.push(loudness);
					if (state.integratedPowers.length > 3000) state.integratedPowers.shift();
					state.integrated = computeGatedIntegrated(state.integratedPowers);

					const keep = state.blockSize - state.hopSize;
					state.blockBuffer[0].copyWithin(0, state.hopSize);
					state.blockBuffer[1].copyWithin(0, state.hopSize);
					state.blockPos = keep;
					state.hopPos = 0;
				}
			}

			const clamp = (v: number) => (v === -Infinity ? -60 : Math.max(-60, Math.min(0, v)));
			state.displayMomentary = lerp(state.displayMomentary, clamp(state.momentary), SMOOTHING_FAST);
			state.displayShortTerm = lerp(state.displayShortTerm, clamp(state.shortTerm), SMOOTHING_FAST);
			state.displayIntegrated = lerp(state.displayIntegrated, clamp(state.integrated), SMOOTHING_SLOW);

			ctx.clearRect(0, 0, w, h);
			const [cr, cg, cb] = hexToRGB(color);

			const minLUFS = -60;
			const maxLUFS = 0;
			const range = maxLUFS - minLUFS;
			const norm = (v: number) => Math.max(0, Math.min(1, (v - minLUFS) / range));

			const labels = ["M", "S", "I"];
			const rawValues = [state.momentary, state.shortTerm, state.integrated];
			const displayValues = [state.displayMomentary, state.displayShortTerm, state.displayIntegrated];
			const barH = (h - 4) / 3;
			const labelW = 12;
			const valueW = 36;
			const barX = labelW;
			const barW = w - labelW - valueW;

			ctx.font = `bold ${Math.min(9, barH - 1)}px monospace`;
			ctx.textBaseline = "middle";

			for (let i = 0; i < 3; i++) {
				const y = 1 + i * (barH + 1);
				const n = norm(displayValues[i]);

				ctx.fillStyle = color;
				ctx.textAlign = "left";
				ctx.fillText(labels[i], 1, y + barH / 2);

				ctx.fillStyle = `rgba(${cr * 255}, ${cg * 255}, ${cb * 255}, 0.15)`;
				ctx.fillRect(barX, y, barW, barH);

				ctx.fillStyle = `rgba(${cr * 255}, ${cg * 255}, ${cb * 255}, 0.7)`;
				ctx.fillRect(barX, y, barW * n, barH);

				ctx.fillStyle = "rgba(255,255,255,0.8)";
				ctx.textAlign = "right";
				const raw = rawValues[i];
				const txt = raw > -Infinity ? raw.toFixed(1) : "-inf";
				ctx.fillText(txt, w - 1, y + barH / 2);
			}
		},

		resize(width, height) {
			w = width;
			h = height;
		},

		dispose() {
			ctx = null;
			state = null;
			lastSampleRate = 0;
		},
	};
};
