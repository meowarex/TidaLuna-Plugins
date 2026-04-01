import { LunaUnload, Tracer } from "@luna/core";
import { StyleTag, PlayState } from "@luna/lib";
import { settings, Settings } from "./Settings";

// Import CSS styles for the visualizer
import visualizerStyles from "file://styles.css?minify";

export const { trace } = Tracer("[Audio Visualizer]");

const log = (message: string) => console.log(`[Audio Visualizer] ${message}`);
export { Settings };

const config = {
	enabled: true,
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

// Clean up resources
export const unloads = new Set<LunaUnload>();

// StyleTag for CSS
const styleTag = new StyleTag("AudioVisualizer", unloads, visualizerStyles);

// Audio context and analyzer
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let audioSource: MediaElementAudioSourceNode | null = null;
let dataArray: Uint8Array | null = null;
let animationId: number | null = null;
let currentAudioElement: HTMLAudioElement | null = null;
let isSourceConnected: boolean = false;

// Each placement gets its own container/canvas/context
interface VisualizerSlot {
	container: HTMLDivElement | null;
	canvas: HTMLCanvasElement | null;
	ctx: CanvasRenderingContext2D | null;
}

const navSlot: VisualizerSlot = { container: null, canvas: null, ctx: null };
const npSlot: VisualizerSlot = { container: null, canvas: null, ctx: null };

// Find the audio element - this is a bit of a hack but it works
const findAudioElement = (): HTMLAudioElement | null => {
	// Try main selectors first
	const selectors = [
		"audio",
		"video",
		"audio[data-test]",
		'[data-test="audio-player"] audio',
	];

	for (const selector of selectors) {
		const element = document.querySelector(selector) as HTMLAudioElement;
		if (
			element &&
			(element.tagName === "AUDIO" || element.tagName === "VIDEO")
		) {
			return element;
		}
	}

	// Quick scan for any audio elements
	const audioElements = document.querySelectorAll("audio, video");
	for (const element of audioElements) {
		const audioEl = element as HTMLAudioElement;
		if (audioEl.src || audioEl.currentSrc) {
			return audioEl;
		}
	}

	return null;
};

// Initialize audio visualization
const initializeAudioVisualizer = async (): Promise<void> => {
	try {
		// Find the audio element
		const audioElement = findAudioElement();
		if (!audioElement) {
			return;
		}

		// create audio context
		if (!audioContext) {
			audioContext = new AudioContext();
			log("Created AudioContext");
		}

		// create analyser
		if (!analyser) {
			analyser = audioContext.createAnalyser();
			analyser.fftSize = 512; // Fixed power of 2 that provides enough frequency bins
			analyser.smoothingTimeConstant = config.smoothing;
			dataArray = new Uint8Array(analyser.frequencyBinCount);
			log("Created AnalyserNode");
		}

		// attempt audio connection if not already connected
		if (!isSourceConnected && audioElement !== currentAudioElement) {
			try {
				// Create audio source - this might fail if already connected elsewhere
				audioSource = audioContext.createMediaElementSource(audioElement);
				audioSource.connect(analyser);
				// CRITICAL: connect back to destination for audio output (otherwise no sound)
				analyser.connect(audioContext.destination);

				currentAudioElement = audioElement;
				isSourceConnected = true;
				log("Connected to audio stream with output");
			} catch (error) {
				// Audio is connected elsewhere - that's fine, we just can't visualize
				if (
					error instanceof Error &&
					error.message.includes("already connected")
				) {
					log("Audio already connected elsewhere - skipping visualization");
				}
				return;
			}
		}

		// Resume context only if needed and don't wait for it
		// (otherwise it will wait for the audio to start playing)
		if (audioContext.state === "suspended") {
			audioContext.resume().catch(() => {}); // Fire and forget
		}

		createVisualizerUI();

		// Start animation only if not already running
		if (!animationId) {
			animate();
		}
	} catch (err) {
		// log errors
		console.error(err);
	}
};

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

const ensureNavSlot = (): void => {
	if (navSlot.container?.isConnected) return;
	clearSlot(navSlot);

	const searchField = document.querySelector('input[class*="_searchField"]') as HTMLInputElement;
	if (!searchField) return;
	const searchContainer = searchField.parentElement;
	if (!searchContainer?.parentElement) return;

	const els = makeSlotElements();
	if (!els) return;
	els.container.style.marginRight = "12px";
	Object.assign(navSlot, els);
	searchContainer.parentElement.insertBefore(els.container, searchContainer);
};

const ensureNpSlot = (): void => {
	if (npSlot.container?.isConnected) return;
	clearSlot(npSlot);

	const artistInfo = document.querySelector('[data-test="artist-info"]');
	if (!artistInfo) return;
	const leftContent = artistInfo.parentElement;
	if (!leftContent) return;

	const els = makeSlotElements();
	if (!els) return;
	els.container.style.marginLeft = "12px";
	Object.assign(npSlot, els);
	leftContent.insertBefore(els.container, artistInfo.nextSibling);
};

const createVisualizerUI = (): void => {
	if (!config.enabled) return;
	ensureNavSlot();
	ensureNpSlot();
};

const removeVisualizerUI = (): void => {
	clearSlot(navSlot);
	clearSlot(npSlot);
};

// Animation loop for rendering visualizer
const animate = (): void => {
	// Re-attach slots that got disconnected from the DOM
	createVisualizerUI();

	const slots = [navSlot, npSlot].filter(s => s.ctx && s.canvas);
	if (slots.length === 0) {
		animationId = requestAnimationFrame(animate);
		return;
	}

	let hasRealAudio = false;
	if (analyser && dataArray) {
		analyser.getByteFrequencyData(dataArray);
		const avgVolume =
			dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
		hasRealAudio = avgVolume > 5;
	}

	for (const slot of slots) {
		const ctx = slot.ctx!;
		const cvs = slot.canvas!;
		ctx.fillStyle = config.color;
		ctx.strokeStyle = config.color;
		ctx.clearRect(0, 0, cvs.width, cvs.height);

		if (hasRealAudio && analyser && dataArray) {
			drawBars(ctx, cvs);
		} else {
			drawScrollingWave(ctx, cvs);
		}
	}

	animationId = requestAnimationFrame(animate);
};

// Global wave animation state
let waveTime = 0;

// Helper function to draw rounded rectangles
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
	waveTime += 0.05 / [navSlot, npSlot].filter(s => s.ctx).length;

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

// Draw waveform visualization - NOT IMPLEMENTED YET
// const drawWaveform = (): void => {
//     if (!canvasContext || !dataArray || !canvas) return;

//     const centerY = canvas.height / 2;
//     const amplitudeScale = canvas.height / 512;

//     canvasContext.strokeStyle = config.color;
//     canvasContext.lineWidth = 2;
//     canvasContext.beginPath();

//     for (let i = 0; i < config.barCount; i++) {
//         const dataIndex = Math.floor(i * (dataArray.length / config.barCount));
//         const amplitude = (dataArray[dataIndex] - 128) * config.sensitivity * amplitudeScale;

//         const x = (i / config.barCount) * canvas.width;
//         const y = centerY + amplitude;

//         if (i === 0) {
//             canvasContext.moveTo(x, y);
//         } else {
//             canvasContext.lineTo(x, y);
//         }
//     }

//     canvasContext.stroke();
// };

// Draw circular visualization - NOT IMPLEMENTED YET
// const drawCircular = (): void => {
//     if (!canvasContext || !dataArray || !canvas) return;

//     const centerX = canvas.width / 2;
//     const centerY = canvas.height / 2;
//     const radius = Math.min(centerX, centerY) - 10;

//     canvasContext.strokeStyle = config.color;
//     canvasContext.lineWidth = 2;

//     for (let i = 0; i < config.barCount; i++) {
//         const dataIndex = Math.floor(i * (dataArray.length / config.barCount));
//         const amplitude = (dataArray[dataIndex] * config.sensitivity) / 255;

//         const angle = (i / config.barCount) * Math.PI * 2;
//         const startX = centerX + Math.cos(angle) * radius * 0.7;
//         const startY = centerY + Math.sin(angle) * radius * 0.7;
//         const endX = centerX + Math.cos(angle) * radius * (0.7 + amplitude * 0.3);
//         const endY = centerY + Math.sin(angle) * radius * (0.7 + amplitude * 0.3);

//         canvasContext.beginPath();
//         canvasContext.moveTo(startX, startY);
//         canvasContext.lineTo(endX, endY);
//         canvasContext.stroke();
//     }
// };

const updateAudioVisualizer = (): void => {
	if (analyser) {
		analyser.fftSize = 512;
		analyser.smoothingTimeConstant = config.smoothing;
		dataArray = new Uint8Array(analyser.frequencyBinCount);
	}

	for (const slot of [navSlot, npSlot]) {
		if (slot.canvas) {
			slot.canvas.width = config.width;
			slot.canvas.height = config.height;
			slot.canvas.style.width = `${config.width}px`;
			slot.canvas.style.height = `${config.height}px`;
		}
	}

	removeVisualizerUI();
	createVisualizerUI();
};

// Make updateAudioVisualizer available globally for settings
(window as any).updateAudioVisualizer = updateAudioVisualizer;

// Clean up function
const cleanupAudioVisualizer = (): void => {
	// stop animation and hide UI - don't touch audio connections (otherwise it will reconnect)
	if (animationId) {
		cancelAnimationFrame(animationId);
		animationId = null;
	}

	removeVisualizerUI();

	// i was killing audio connections - But it was reconnecting and being a pain
	// so i just left it alone - it works fine
};

// Initialize when DOM is ready and track is playing
const observePlayState = (): void => {
	let hasTriedInitialization = false;
	let checkCount = 0;

	const checkAndInitialize = () => {
		checkCount++;

		// Only try to initialize once when music starts playing
		if (PlayState.playing && !hasTriedInitialization) {
			hasTriedInitialization = true;
			log("Initializing audio visualizer...");

			// Initialize immediately - no delay (after audio starts playing ofc)
			initializeAudioVisualizer().then(() => {
				if (audioContext && analyser) {
					log("Audio visualizer ready!");
				} else {
					hasTriedInitialization = false; // Allow retry if failed
				}
			});
		} else if (!PlayState.playing && hasTriedInitialization) {
			// Reset try flag when music stops so it can try again next time (otherwise it explode)
			hasTriedInitialization = false;
		}

		// Keep animation running regardless of play state
		if (!animationId) {
			animate();
		}
	};

	// Start with fast checking, then slow down
	const fastInterval = setInterval(() => {
		checkAndInitialize();
		if (checkCount > 10) {
			// After 10 quick checks, switch to slower
			clearInterval(fastInterval);
			const slowInterval = setInterval(checkAndInitialize, 2000);
			unloads.add(() => clearInterval(slowInterval));
		}
	}, 200); // Check every 200ms initially

	unloads.add(() => clearInterval(fastInterval));

	// Immediate first check
	checkAndInitialize();
};

// Initialize the plugin
const initialize = (): void => {
	log("Audio Visualizer plugin initializing...");

	// Start immediately - DOM should be ready by plugin load
	setTimeout(() => {
		log("Starting visualizer...");
		// Create UI immediately so wave effect shows
		createVisualizerUI();
		// Start animation loop immediately
		animate();
		// Also observe play state for audio detection
		observePlayState();
	}, 100); // Minimal delay to ensure DOM is ready
};

// Complete cleanup function for plugin unload
const completeCleanup = (): void => {
	log("Complete cleanup - plugin unloading");

	if (animationId) {
		cancelAnimationFrame(animationId);
		animationId = null;
	}

	removeVisualizerUI();

	// Fully disconnect and reset everything
	if (audioSource) {
		try {
			audioSource.disconnect();
			log("Disconnected audio source completely");
		} catch (e) {
			log("Audio source already disconnected");
		}
	}

	// Close audio context completely on plugin unload
	if (audioContext && audioContext.state !== "closed") {
		audioContext.close();
		log("Closed AudioContext");
	}

	// Reset all references
	audioContext = null;
	analyser = null;
	audioSource = null;
	dataArray = null;
	currentAudioElement = null;
	isSourceConnected = false;
};

// Register cleanup
unloads.add(completeCleanup);

// Start initialization
initialize();
