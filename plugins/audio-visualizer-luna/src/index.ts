import { type LunaUnload, Tracer } from "@luna/core";
import { StyleTag, PlayState, MediaItem, observe } from "@luna/lib";
import { settings, Settings } from "./Settings";
import * as audio from "./audio";
import type { AudioData } from "./audio";
import { type Visualizer, type VisualizerType, VISUALIZER_DIMENSIONS, MINI_DIMENSIONS, ALL_SLOT_KEYS, ZONE_SLOTS, type SlotKey } from "./visualizers/types";
import { createSpectrumLine } from "./visualizers/spectrum-line";
import { createSpectrumBars } from "./visualizers/spectrum-bars";
import { createOscilloscope } from "./visualizers/oscilloscope";
import { createVectorscope } from "./visualizers/vectorscope";
import { createLoudnessMeter } from "./visualizers/loudness-meter";

import visualizerStyles from "file://styles.css?minify";

export const { trace } = Tracer("[Audio Visualizer]");
export { Settings };

const log = (msg: string) => console.log(`[Audio Visualizer] ${msg}`);

export const unloads = new Set<LunaUnload>();
new StyleTag("AudioVisualizer", unloads, visualizerStyles);

const FACTORIES: Record<Exclude<VisualizerType, "none">, () => Visualizer> = {
	"spectrum-line": createSpectrumLine,
	"spectrum-bars": createSpectrumBars,
	oscilloscope: createOscilloscope,
	vectorscope: createVectorscope,
	"loudness-meter": createLoudnessMeter,
};

// Slot Management

interface Slot {
	container: HTMLDivElement | null;
	canvas: HTMLCanvasElement | null;
	visualizer: Visualizer | null;
	currentType: VisualizerType;
	contextType: "webgl" | "canvas2d" | null;
}

interface SlotGroup {
	groupContainer: HTMLDivElement;
	slots: Slot[];
	keys: readonly SlotKey[];
}

const groups = new Map<string, SlotGroup>();
let navArrowsEl: HTMLElement | null = null;

const getSlot = (key: SlotKey): VisualizerType =>
	(settings as unknown as Record<string, VisualizerType>)[key] ?? "none";

const isWebGLViz = (type: VisualizerType): boolean =>
	type === "spectrum-line" || type === "spectrum-bars";

const isMiniSlot = (key: SlotKey): boolean =>
	(settings.miniSlots ?? []).includes(key);

const getSlotDims = (type: VisualizerType, key: SlotKey) =>
	isMiniSlot(key) && MINI_DIMENSIONS[type] ? MINI_DIMENSIONS[type] : VISUALIZER_DIMENSIONS[type];

const createSlotCanvas = (dims: { width: number; height: number }): HTMLCanvasElement => {
	const cvs = document.createElement("canvas");
	cvs.width = dims.width;
	cvs.height = dims.height;
	cvs.style.cssText = `width:${dims.width}px;height:${dims.height}px;border-radius:4px;display:block;`;
	return cvs;
};

const applySlotSize = (slot: Slot, dims: { width: number; height: number }): void => {
	if (!slot.container || !slot.canvas) return;
	slot.canvas.width = dims.width;
	slot.canvas.height = dims.height;
	slot.canvas.style.width = `${dims.width}px`;
	slot.canvas.style.height = `${dims.height}px`;
	slot.container.style.width = `${dims.width + 8}px`;
	slot.container.style.height = `${dims.height + 8}px`;
	slot.visualizer?.resize(dims.width, dims.height);
};

const switchVisualizer = (slot: Slot, type: VisualizerType, key: SlotKey): void => {
	if (slot.currentType === type) return;

	slot.visualizer?.dispose();
	slot.visualizer = null;

	if (type === "none") {
		if (slot.container) slot.container.style.display = "none";
		slot.currentType = "none";
		return;
	}

	const dims = getSlotDims(type, key);
	if (slot.container) {
		slot.canvas?.remove();
		const cvs = createSlotCanvas(dims);
		slot.container.appendChild(cvs);
		slot.canvas = cvs;
		slot.contextType = isWebGLViz(type) ? "webgl" : "canvas2d";

		slot.container.style.display = "flex";
		slot.container.style.width = `${dims.width + 8}px`;
		slot.container.style.height = `${dims.height + 8}px`;
	}

	const factory = FACTORIES[type];
	const viz = factory();
	if (slot.canvas) {
		viz.init(slot.canvas, settings.barColor);
	}
	slot.visualizer = viz;
	slot.currentType = type;
};

const syncGroupHeights = (group: SlotGroup): void => {
	let maxH = 0;
	for (let i = 0; i < group.keys.length; i++) {
		const slot = group.slots[i];
		if (slot.currentType === "none") continue;
		const dims = getSlotDims(slot.currentType, group.keys[i]);
		if (dims.height > maxH) maxH = dims.height;
	}
	if (maxH === 0) return;

	for (let i = 0; i < group.keys.length; i++) {
		const slot = group.slots[i];
		if (!slot.container || !slot.canvas || slot.currentType === "none") continue;
		const dims = getSlotDims(slot.currentType, group.keys[i]);
		const targetH = Math.max(dims.height, maxH);
		applySlotSize(slot, { width: dims.width, height: targetH });
	}
};

const updateGroupVisibility = (group: SlotGroup): void => {
	const activeCount = group.slots.filter(s => s.currentType !== "none").length;
	const allNone = activeCount === 0;
	group.groupContainer.style.display = allNone ? "none" : "flex";
	if (!allNone) syncGroupHeights(group);

	group.groupContainer.classList.toggle(
		"av-grouped",
		settings.groupedSlots && activeCount >= 2,
	);

	if (group === groups.get("topNav-left") && navArrowsEl) {
		navArrowsEl.style.marginRight = allNone ? "" : "0";
	}
};

const createGroup = (keys: readonly SlotKey[], zone: string, position: string): SlotGroup => {
	const groupContainer = document.createElement("div");
	groupContainer.className = "av-slot-group";
	groupContainer.dataset.zone = zone;
	groupContainer.dataset.position = position;

	const slots: Slot[] = [];
	for (const _key of keys) {
		const slotContainer = document.createElement("div");
		slotContainer.className = "audio-visualizer-container";
		slotContainer.style.display = "none";
		groupContainer.appendChild(slotContainer);
		slots.push({
			container: slotContainer,
			canvas: null,
			visualizer: null,
			currentType: "none",
			contextType: null,
		});
	}

	return { groupContainer, slots, keys };
};

const initGroupVisualizers = (group: SlotGroup): void => {
	for (let i = 0; i < group.keys.length; i++) {
		const key = group.keys[i];
		const type = getSlot(key);
		if (type !== "none") {
			switchVisualizer(group.slots[i], type, key);
		}
	}
	updateGroupVisibility(group);
};

const initAllGroups = (): void => {
	for (const [zoneId, positions] of Object.entries(ZONE_SLOTS)) {
		for (const [posId, keys] of Object.entries(positions)) {
			if (!keys) continue;
			const groupId = `${zoneId}-${posId}`;
			const group = createGroup(keys, zoneId, posId);
			groups.set(groupId, group);
		}
	}
};

// UI Attachment

const attachNavGroups = (anchor: Element): void => {
	const parent = anchor.parentElement;
	if (!parent) return;

	const navLeft = groups.get("topNav-left");
	if (navLeft && !navLeft.groupContainer.isConnected) {
		const navArrows = parent.querySelector('[data-test="navigation-arrows"]') as HTMLElement | null;
		if (navArrows) {
			navArrowsEl = navArrows;
			navArrows.after(navLeft.groupContainer);
		} else {
			parent.prepend(navLeft.groupContainer);
		}
		navLeft.groupContainer.style.marginRight = "auto";
		initGroupVisualizers(navLeft);
	}

	const navRight = groups.get("topNav-right");
	if (navRight && !navRight.groupContainer.isConnected) {
		parent.insertBefore(navRight.groupContainer, anchor);
		initGroupVisualizers(navRight);
	}
};

const attachNpGroups = (anchor: Element): void => {
	const leftContent = anchor.parentElement;
	if (!leftContent) return;
	const header = leftContent.parentElement as HTMLElement | null;
	if (!header) return;

	const npLeft = groups.get("nowPlaying-left");
	if (npLeft && !npLeft.groupContainer.isConnected) {
		leftContent.insertBefore(npLeft.groupContainer, anchor.nextSibling);
		initGroupVisualizers(npLeft);
	}

	const buttonsDiv = header.querySelector(':scope > [class*="buttons"]') as HTMLElement | null;
	const npRight = groups.get("nowPlaying-right");
	if (npRight && !npRight.groupContainer.isConnected) {
		if (buttonsDiv) {
			header.insertBefore(npRight.groupContainer, buttonsDiv);
		} else {
			header.appendChild(npRight.groupContainer);
		}
		npRight.groupContainer.style.marginLeft = "auto";
		initGroupVisualizers(npRight);
	}
};

const attachPbGroups = (anchor: Element): void => {
	const trackInfo = anchor.querySelector('[data-test="track-info"]');
	const utilityContainer = anchor.querySelector('[class*="utilityContainer"]');

	const pbLeft = groups.get("playerBar-left");
	if (pbLeft && !pbLeft.groupContainer.isConnected && trackInfo) {
		trackInfo.appendChild(pbLeft.groupContainer);
		initGroupVisualizers(pbLeft);
	}

	const pbRight = groups.get("playerBar-right");
	if (pbRight && !pbRight.groupContainer.isConnected && utilityContainer) {
		utilityContainer.prepend(pbRight.groupContainer);
		initGroupVisualizers(pbRight);
	}
};

initAllGroups();

observe(unloads, '[data-test="search-popover-container"]', attachNavGroups);
observe(unloads, '[data-test="artist-info"]', attachNpGroups);
observe(unloads, '[data-test="footer-player"]', attachPbGroups);

const existingSearch = document.querySelector('[data-test="search-popover-container"]');
if (existingSearch) attachNavGroups(existingSearch);
const existingArtist = document.querySelector('[data-test="artist-info"]');
if (existingArtist) attachNpGroups(existingArtist);
const existingFooter = document.querySelector('[data-test="footer-player"]');
if (existingFooter) attachPbGroups(existingFooter);

// Audio Connection stuff

const fft = () => settings.fftSize ?? 2048;
const reactivityToSmoothing = (r: number) => Math.max(0, Math.min(0.95, (100 - r) / 100));
const smooth = () => reactivityToSmoothing(settings.reactivity ?? 30);

let lastReactivity = settings.reactivity ?? 30;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 500;
const MAX_RETRY_DELAY = 5000;
let silentFrames = 0;
const SILENT_THRESHOLD = 120;

const clearRetry = (): void => {
	if (retryTimer !== null) {
		clearTimeout(retryTimer);
		retryTimer = null;
	}
	retryDelay = 500;
};

const tryConnect = (): boolean => {
	const ok = audio.connect(fft(), smooth());
	if (ok) {
		clearRetry();
		silentFrames = 0;
	}
	return ok;
};

const tryReconnect = (): boolean => {
	const ok = audio.reconnect(fft(), smooth());
	if (ok) {
		clearRetry();
		silentFrames = 0;
	}
	return ok;
};

const scheduleRetry = (): void => {
	if (retryTimer !== null) return;
	retryTimer = setTimeout(() => {
		retryTimer = null;
		if (!PlayState.playing) return;
		if (!tryConnect()) {
			retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
			scheduleRetry();
		}
	}, retryDelay);
};

observe(unloads, "#video-one", () => {
	log("video-one element observed in DOM");
	silentFrames = 0;
	if (PlayState.playing) {
		if (!tryReconnect()) scheduleRetry();
	}
});

PlayState.onState(unloads, (state) => {
	if (state === "PLAYING") {
		silentFrames = 0;
		if (!audio.isConnected() || audio.videoChanged()) {
			if (!tryReconnect()) scheduleRetry();
		}
	} else {
		clearRetry();
	}
});

MediaItem.onMediaTransition(unloads, () => {
	log("Media transition");
	silentFrames = 0;
	setTimeout(() => {
		if (PlayState.playing) {
			if (!tryReconnect()) scheduleRetry();
		}
	}, 300);
});

// Idle Animation Synthetic Data

let waveTime = 0;
const IDLE_SIZE = 1024;
const idleByteFreq = new Uint8Array(IDLE_SIZE);
const idleByteTime = new Uint8Array(IDLE_SIZE);
const idleFloatFreq = new Float32Array(IDLE_SIZE);
const idleFloatTime = new Float32Array(IDLE_SIZE);
const idleLeftTime = new Float32Array(IDLE_SIZE);
const idleRightTime = new Float32Array(IDLE_SIZE);

const generateIdleData = (): AudioData => {
	for (let i = 0; i < IDLE_SIZE; i++) {
		const x = i / IDLE_SIZE;
		const wave1 = Math.sin(x * Math.PI * 2 + waveTime) * 0.3;
		const wave2 = Math.sin(x * Math.PI * 4 + waveTime * 1.3) * 0.2;
		const wave3 = Math.sin(x * Math.PI * 6 + waveTime * 0.7) * 0.1;
		const combined = (wave1 + wave2 + wave3 + 1) / 2;
		const travel = Math.sin(x * Math.PI * 3 - waveTime * 2) * 0.5 + 0.5;

		const byteVal = Math.floor(combined * travel * 140 + 20);
		idleByteFreq[i] = byteVal;
		idleFloatFreq[i] = -40 + byteVal * 0.3;

		const timeSample = Math.sin(x * Math.PI * 8 + waveTime * 3) * 0.15;
		idleByteTime[i] = 128 + Math.floor(timeSample * 127);
		idleFloatTime[i] = timeSample;
		idleLeftTime[i] = timeSample;
		idleRightTime[i] = Math.sin(x * Math.PI * 8 + waveTime * 3 + 0.3) * 0.15;
	}

	return {
		byteFrequency: idleByteFreq,
		byteTimeDomain: idleByteTime,
		floatFrequency: idleFloatFreq,
		floatTimeDomain: idleFloatTime,
		leftTimeDomain: idleLeftTime,
		rightTimeDomain: idleRightTime,
		sampleRate: 44100,
		fftSize: IDLE_SIZE * 2,
		binCount: IDLE_SIZE,
	};
};

// Animation Loop

let animationId: number | null = null;
const lastSlotTypes = new Map<SlotKey, VisualizerType>();
const lastMiniState = new Map<SlotKey, boolean>();
let lastGrouped = settings.groupedSlots;
let lastChromeless = settings.transparentContainers;

const syncChromelessClass = (): void => {
	document.body.classList.toggle("av-chromeless", !!settings.transparentContainers);
};

syncChromelessClass();

for (const key of ALL_SLOT_KEYS) {
	lastSlotTypes.set(key, getSlot(key));
	lastMiniState.set(key, isMiniSlot(key));
}

const animate = (): void => {
	for (const group of groups.values()) {
		let changed = false;
		for (let i = 0; i < group.keys.length; i++) {
			const key = group.keys[i];
			const currentType = getSlot(key);
			const lastType = lastSlotTypes.get(key) ?? "none";
			const mini = isMiniSlot(key);
			const wasMini = lastMiniState.get(key) ?? false;
			if (currentType !== lastType) {
				switchVisualizer(group.slots[i], currentType, key);
				lastSlotTypes.set(key, currentType);
				lastMiniState.set(key, mini);
				changed = true;
			} else if (mini !== wasMini && currentType !== "none") {
				const dims = getSlotDims(currentType, key);
				applySlotSize(group.slots[i], dims);
				lastMiniState.set(key, mini);
				changed = true;
			}
		}
		if (changed) updateGroupVisibility(group);
	}

	const grouped = settings.groupedSlots;
	if (grouped !== lastGrouped) {
		for (const group of groups.values()) updateGroupVisibility(group);
		lastGrouped = grouped;
	}

	const chromeless = !!settings.transparentContainers;
	if (chromeless !== lastChromeless) {
		syncChromelessClass();
		lastChromeless = chromeless;
	}

	const currentReactivity = settings.reactivity ?? 30;
	if (currentReactivity !== lastReactivity) {
		audio.setSmoothing(reactivityToSmoothing(currentReactivity));
		lastReactivity = currentReactivity;
	}

	waveTime += 0.05;
	const data = audio.sample();
	const hasSignal = data && audio.hasSignal(data);

	if (PlayState.playing && audio.isConnected()) {
		if (!hasSignal) {
			silentFrames++;
			if (silentFrames >= SILENT_THRESHOLD) {
				log("Silent for too long, reconnecting...");
				silentFrames = 0;
				if (!tryReconnect()) scheduleRetry();
			}
		} else {
			silentFrames = 0;
		}
	} else if (PlayState.playing && !audio.isConnected() && retryTimer === null) {
		scheduleRetry();
	}

	const renderData = hasSignal ? data : generateIdleData();

	for (const group of groups.values()) {
		for (const slot of group.slots) {
			if (!slot.canvas || slot.currentType === "none" || !slot.visualizer) continue;
			slot.visualizer.render(renderData, settings.barColor);
		}
	}

	animationId = requestAnimationFrame(animate);
};

// Init

log("Initializing...");

if (PlayState.playing) {
	if (!tryConnect()) scheduleRetry();
}

animationId = requestAnimationFrame(animate);

// Cleanup

unloads.add(() => {
	log("Plugin unloading");
	clearRetry();

	document.body.classList.remove("av-chromeless");

	if (navArrowsEl) {
		navArrowsEl.style.marginRight = "";
		navArrowsEl = null;
	}

	if (animationId) {
		cancelAnimationFrame(animationId);
		animationId = null;
	}

	for (const group of groups.values()) {
		for (const slot of group.slots) {
			slot.visualizer?.dispose();
		}
		group.groupContainer.remove();
	}
	groups.clear();
	audio.dispose();
});
