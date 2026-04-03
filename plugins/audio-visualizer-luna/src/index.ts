import { type LunaUnload, Tracer } from "@luna/core";
import { StyleTag, PlayState, MediaItem, observe } from "@luna/lib";
import { settings, Settings } from "./Settings";

import visualizerStyles from "file://styles.css?minify";

export const { trace } = Tracer("[Audio Visualizer]");
export { Settings };

const log = (message: string) => console.log(`[Audio Visualizer] ${message}`);

const config = {
	width: 200,
	height: 40,
	get barCount() {
		return settings.barCount;
	},
	get color() {
		return settings.barColor;
	},
	get barRounding() {
		return settings.barRounding;
	},
	sensitivity: 1.5,
	smoothing: 0.8,
};

export const unloads = new Set<LunaUnload>();

new StyleTag("AudioVisualizer", unloads, visualizerStyles);


let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let audioSource: MediaStreamAudioSourceNode | null = null;
let dataArray: Uint8Array<ArrayBuffer> | null = null;
let animationId: number | null = null;
let isSourceConnected = false;


interface VisualizerSlot {
	container: HTMLDivElement | null;
	canvas: HTMLCanvasElement | null;
	ctx: CanvasRenderingContext2D | null;
}

const navSlot: VisualizerSlot = { container: null, canvas: null, ctx: null };
const npSlot: VisualizerSlot = { container: null, canvas: null, ctx: null };


const connectAudio = (): boolean => {
	const video = document.getElementById("video-one") as HTMLVideoElement | null;
	const capture = (video as unknown as { captureStream?: () => MediaStream })?.captureStream;
	if (!video || typeof capture !== "function") return false;

	try {
		if (!audioContext) audioContext = new AudioContext();

		if (!analyser) {
			analyser = audioContext.createAnalyser();
			analyser.fftSize = 512;
			analyser.smoothingTimeConstant = config.smoothing;
			dataArray = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
		}

		audioSource?.disconnect();

		const stream = capture.call(video);
		const audioTracks = stream.getAudioTracks();
		if (audioTracks.length === 0) {
			log("No audio tracks in captured stream");
			return false;
		}

		audioSource = audioContext.createMediaStreamSource(stream);
		audioSource.connect(analyser);

		if (audioContext.state === "suspended") {
			audioContext.resume().catch(() => {});
		}

		log("Connected via captureStream()");
		return true;
	} catch (err) {
		log(`Audio connection failed: ${err}`);
		return false;
	}
};

// Canvas things

const makeSlotElements = (): { container: HTMLDivElement; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null => {
	const container = document.createElement("div");
	container.className = "audio-visualizer-container";
	container.style.cssText = `
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 8px;
		padding: 4px;
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
	`;

	const cvs = document.createElement("canvas");
	cvs.width = config.width;
	cvs.height = config.height;
	cvs.style.cssText = `
		width: ${config.width}px;
		height: ${config.height}px;
		border-radius: 4px;
	`;

	container.appendChild(cvs);
	const ctx = cvs.getContext("2d");
	if (!ctx) return null;
	return { container, canvas: cvs, ctx };
};

const clearSlot = (slot: VisualizerSlot): void => {
	slot.container?.remove();
	slot.container = null;
	slot.canvas = null;
	slot.ctx = null;
};

// UI Placement with Luna Observer

const attachNavSlot = (anchor: Element): void => {
	if (navSlot.container?.isConnected) return;
	clearSlot(navSlot);

	const parent = anchor.parentElement;
	if (!parent) return;

	const els = makeSlotElements();
	if (!els) return;
	els.container.style.marginRight = "12px";
	Object.assign(navSlot, els);
	parent.insertBefore(els.container, anchor);
};

const attachNpSlot = (anchor: Element): void => {
	if (npSlot.container?.isConnected) return;
	clearSlot(npSlot);

	const parent = anchor.parentElement;
	if (!parent) return;

	const els = makeSlotElements();
	if (!els) return;
	els.container.style.marginLeft = "12px";
	Object.assign(npSlot, els);
	parent.insertBefore(els.container, anchor.nextSibling);
};

observe(unloads, '[data-test="search-popover-container"]', attachNavSlot);
observe(unloads, '[data-test="artist-info"]', attachNpSlot);

// Rendering things

let waveTime = 0;

const drawRoundedRect = (
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
): void => {
	ctx.beginPath();
	ctx.roundRect(x, y, width, height, radius);
	ctx.fill();
};

const drawScrollingWave = (ctx: CanvasRenderingContext2D, cvs: HTMLCanvasElement): void => {
	const barCount = config.barCount;
	const barWidth = cvs.width / barCount;
	const maxHeight = cvs.height * 0.6;

	ctx.fillStyle = config.color;

	for (let i = 0; i < barCount; i++) {
		const x = i / barCount;
		const wave1 = Math.sin(x * Math.PI * 2 + waveTime) * 0.3;
		const wave2 = Math.sin(x * Math.PI * 4 + waveTime * 1.3) * 0.2;
		const wave3 = Math.sin(x * Math.PI * 6 + waveTime * 0.7) * 0.1;
		const combinedWave = (wave1 + wave2 + wave3 + 1) / 2;
		const travelWave = Math.sin(x * Math.PI * 3 - waveTime * 2) * 0.5 + 0.5;
		const barHeight = maxHeight * combinedWave * travelWave * 0.8 + 2;

		const xPos = i * barWidth;
		const yPos = (cvs.height - barHeight) / 2;

		if (config.barRounding) {
			drawRoundedRect(ctx, xPos, yPos, barWidth - 1, barHeight, 2);
		} else {
			ctx.fillRect(xPos, yPos, barWidth - 1, barHeight);
		}
	}
};

const drawBars = (ctx: CanvasRenderingContext2D, cvs: HTMLCanvasElement): void => {
	if (!dataArray) return;

	const barWidth = cvs.width / config.barCount;
	const heightScale = cvs.height / 255;

	ctx.fillStyle = config.color;

	for (let i = 0; i < config.barCount; i++) {
		const dataIndex = Math.floor(i * (dataArray.length / config.barCount));
		const barHeight = dataArray[dataIndex] * config.sensitivity * heightScale;

		const x = i * barWidth;
		const y = cvs.height - barHeight;

		if (config.barRounding) {
			drawRoundedRect(ctx, x, y, barWidth - 1, barHeight, 2);
		} else {
			ctx.fillRect(x, y, barWidth - 1, barHeight);
		}
	}
};

// Animation Loop

const animate = (): void => {
	const slots = [navSlot, npSlot].filter(s => s.ctx && s.canvas);

	if (slots.length > 0) {
		waveTime += 0.05;

		let hasRealAudio = false;
		if (analyser && dataArray) {
			analyser.getByteFrequencyData(dataArray);
			const avgVolume = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
			hasRealAudio = avgVolume > 5;
		}

		for (const slot of slots) {
			const { ctx, canvas: cvs } = slot;
			if (!ctx || !cvs) continue;
			ctx.clearRect(0, 0, cvs.width, cvs.height);

			if (hasRealAudio) {
				drawBars(ctx, cvs);
			} else {
				drawScrollingWave(ctx, cvs);
			}
		}
	}

	animationId = requestAnimationFrame(animate);
};

// Initialization (events)

PlayState.onState(unloads, (state) => {
	if (state === "PLAYING" && !isSourceConnected) {
		isSourceConnected = connectAudio();
	}
});

MediaItem.onMediaTransition(unloads, () => {
	isSourceConnected = false;
	if (PlayState.playing) {
		isSourceConnected = connectAudio();
	}
});

// Initialization (startup)

log("Initializing...");

if (PlayState.playing) {
	isSourceConnected = connectAudio();
}

animationId = requestAnimationFrame(animate);

// Cleanup

unloads.add(() => {
	log("Plugin unloading");

	if (animationId) {
		cancelAnimationFrame(animationId);
		animationId = null;
	}

	clearSlot(navSlot);
	clearSlot(npSlot);

	try { audioSource?.disconnect(); } catch {}

	if (audioContext && audioContext.state !== "closed") {
		audioContext.close();
	}

	audioContext = null;
	analyser = null;
	audioSource = null;
	dataArray = null;
	isSourceConnected = false;
});
