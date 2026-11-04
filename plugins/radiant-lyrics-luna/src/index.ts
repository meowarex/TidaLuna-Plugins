// MARKER: Core Setup
import { type LunaUnload, Tracer, reduxStore, buildActions } from "@luna/core";
import {
	MediaItem,
	observe,
	PlayState,
	StyleTag,
	safeInterval,
	safeTimeout,
	redux,
} from "@luna/lib";
import {
	type ApiLine,
	type LyricsApiResponse,
	type WordLine,
	type WordTiming,
	alignLyrics as alignLyricsApi,
	type AlignResponse,
	type SyllaAlreadyAligned,
	type SyllaJobOptions,
	type SyllaQueue,
	fetchLyrics as fetchLyricsApi,
	flushLyrics as flushLyricsApi,
	generateLyrics as generateLyricsApi,
	romanizeLyrics as romanizeLyricsApi,
} from "./api";
import { KawarpLayer } from "./backdrop";
import {
	AnimatedArtworkLayer,
	ART_TILE_SELECTOR,
	MINI_ART_SELECTOR,
} from "./artwork";
import { Settings, TRANSLATE_LANGUAGES, settings } from "./Settings";

import backdropStylesCss from "file://backdrop-styles.css?minify";
import coverEverywhereCss from "file://cover-everywhere.css?minify";
import floatingPlayerBarCss from "file://floating-player-bar.css?minify";
import lyricsGlow from "file://lyrics-glow.css?minify";
import playerBarHidden from "file://player-bar-hidden.css?minify";
// Import CSS files directly using Luna's file:// syntax - Took me a while to figure out <3
import baseStyles from "file://styles.css?minify";

// Core tracer and exports
export const { trace } = Tracer("[Radiant Lyrics]");
export { Settings };

const toast = (msg: string) =>
	reduxStore.dispatch(
		buildActions["message/MESSAGE_INFO"]?.({ message: msg, category: "OTHER", severity: "INFO" }),
	);
const toastErr = (msg: string) =>
	reduxStore.dispatch(
		buildActions["message/MESSAGE_ERROR"]?.({ message: msg, category: "OTHER", severity: "ERROR" }),
	);

// clean up resources
export const unloads = new Set<LunaUnload>();

// MARKER: Romanization Gate
const romanizedText = (
	item: { text?: string | null; romanized?: string | null },
	fallback = "",
): string =>
	(settings.romanizeLyrics && item.romanized ? item.romanized : item.text) ??
	fallback;

// Hide translations that just repeat the line
const lettersOnly = (s: string): string =>
	s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const needsTranslation = (line: {
	text: string;
	translation?: string | null;
}): line is { text: string; translation: string } =>
	!!line.translation && lettersOnly(line.translation) !== lettersOnly(line.text);

// MARKER: Player Market UI (Ensure new UI is enabled)

function enablePlayerMarketUI() {
	const { flags, userOverrides } = redux.store.getState().featureFlags;
	const key = Object.keys(flags).find(
		(k) => k.toLowerCase().replace(/[\s_]/g, "-") === "player-market-ui",
	);
	const flag = key ? flags[key] : undefined;

	if (!flag) {
		trace.warn(`Feature flag "player-market-ui" not found`);
		return;
	}

	const currentValue = key !== undefined && key in userOverrides ? userOverrides[key] : flag.value;
	if (currentValue) {
		trace.log(`"${flag.name}" already enabled`);
		return;
	}

	redux.actions["featureFlags/TOGGLE_USER_OVERRIDE"]({ ...flag, value: true });
	trace.log(`Enabled "${flag.name}"`);
}

const { ready: flagsReady } = redux.store.getState().featureFlags;
if (flagsReady) {
	enablePlayerMarketUI();
} else {
	redux.intercept("featureFlags/READY", unloads, () => enablePlayerMarketUI(), true);
}

// StyleTag instances for different CSS modules
const baseStyleTag = new StyleTag("RadiantLyrics-base", unloads);
const playerBarStyleTag = new StyleTag("RadiantLyrics-player-bar", unloads);
const lyricsGlowStyleTag = new StyleTag("RadiantLyrics-lyrics-glow", unloads);
const floatingPlayerBarStyleTag = new StyleTag(
	"RadiantLyrics-floating-player-bar",
	unloads,
);

// MARKER: Floating Player Bar

// Hex color to RGB
// (i'm deranged and love Hexadecimal)
const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
	let cleaned = (hex || "#000000").replace("#", "");
	if (cleaned.length === 3) {
		cleaned =
			cleaned[0] +
			cleaned[0] +
			cleaned[1] +
			cleaned[1] +
			cleaned[2] +
			cleaned[2];
	}
	if (cleaned.length !== 6) {
		return { r: 0, g: 0, b: 0 };
	}
	return {
		r: parseInt(cleaned.substring(0, 2), 16) || 0,
		g: parseInt(cleaned.substring(2, 4), 16) || 0,
		b: parseInt(cleaned.substring(4, 6), 16) || 0,
	};
};

// Seekbar top corners match the floating bar radius
const applyIntegratedSeekbarChrome = (): void => {
	const footer = document.querySelector(
		'[data-test="footer-player"]',
	) as HTMLElement | null;
	if (!footer) return;
	if (!settings.integratedSeekBar) {
		footer.style.removeProperty("--rl-integrated-seekbar-top-radius");
		return;
	}
	const topR = settings.floatingPlayerBar ? settings.playerBarRadius : 0;
	footer.style.setProperty("--rl-integrated-seekbar-top-radius", `${topR}px`);
};

// Apply inline styles to the player bar (tint + optional radius/spacing customisation)
const applyPlayerBarTintToElement = (): void => {
	const footerPlayer = document.querySelector(
		'[data-test="footer-player"]',
	) as HTMLElement;
	if (!footerPlayer) return;
	if (settings.playerBarTintEnabled) {
		const alpha = settings.playerBarTint / 10;
		const { r, g, b } = hexToRgb(settings.playerBarTintColor);
		footerPlayer.style.removeProperty("background");
		footerPlayer.style.setProperty(
			"background-color",
			`rgba(${r}, ${g}, ${b}, ${alpha})`,
			"important",
		);
	} else {
		footerPlayer.style.removeProperty("background-color");
		footerPlayer.style.removeProperty("background");
	}
	if (settings.playerBarBlur) {
		footerPlayer.style.setProperty(
			"backdrop-filter",
			`blur(${settings.playerBarBlurAmount}px)`,
			"important",
		);
		footerPlayer.style.setProperty(
			"-webkit-backdrop-filter",
			`blur(${settings.playerBarBlurAmount}px)`,
			"important",
		);
	} else {
		footerPlayer.style.removeProperty("backdrop-filter");
		footerPlayer.style.removeProperty("-webkit-backdrop-filter");
	}
	if (settings.floatingPlayerBar) {
		footerPlayer.style.setProperty(
			"border-radius",
			`${settings.playerBarRadius}px`,
			"important",
		);
		const spacing = settings.playerBarSpacing;
		footerPlayer.style.setProperty("bottom", `${spacing}px`, "important");
		footerPlayer.style.setProperty("left", `${spacing}px`, "important");
		footerPlayer.style.setProperty(
			"width",
			`calc(100% - ${spacing * 2}px)`,
			"important",
		);
	} else {
		footerPlayer.style.removeProperty("border-radius");
		footerPlayer.style.removeProperty("bottom");
		footerPlayer.style.removeProperty("left");
		footerPlayer.style.removeProperty("width");
	}
	// Now Playing centres its artwork in a row running to the viewport bottom but the player bar overlays it so i do some complicaated thing to reserve the space <3
	document.documentElement.style.setProperty(
		"--rl-player-bar-inset",
		`${Math.round(footerPlayer.getBoundingClientRect().height) + (settings.floatingPlayerBar ? settings.playerBarSpacing : 0)}px`,
	);
	applyIntegratedSeekbarChrome();
};

// Floating off: inject square bar CSS
const applyFloatingPlayerBar = (): void => {
	if (settings.floatingPlayerBar) {
		floatingPlayerBarStyleTag.remove();
	} else {
		floatingPlayerBarStyleTag.css = floatingPlayerBarCss;
	}
	applyPlayerBarTintToElement();
};

// Alias for settings callback
const updateRadiantLyricsPlayerBarTint = applyFloatingPlayerBar;

// Apply floating player bar on load (Fixes race condition with flush button)
applyFloatingPlayerBar();

// MARKER: Quality-Based Seeker Color
// Maps data-test-quality-badge-streaming-quality values to colors
const qualityColors: Record<string, string> = {
	HI_RES_LOSSLESS: "#ffd432", //Max
	LOSSLESS: "#3fe", //High
	HIGH: "#FFFFFF", //Low
};

const applyQualityProgressColor = (): void => {
	const progressIndicator = document.querySelector(
		'[data-test="progress-indicator"]',
	) as HTMLElement | null;
	if (!progressIndicator) return;

	// Remove inline style if disabled
	if (!settings.qualityProgressColor) {
		progressIndicator.style.removeProperty("background-color");
		return;
	}

	// Read quality from the media-state tag
	// (using data-test-quality-badge-streaming-quality)
	const qualityButton = document.querySelector(
		"[data-test-quality-badge-streaming-quality]",
	) as HTMLElement | null;
	if (!qualityButton) return;

	const quality =
		qualityButton.getAttribute(
			"data-test-quality-badge-streaming-quality",
		) ?? "";
	const color = qualityColors[quality];
	if (!color) return;

	progressIndicator.style.setProperty("background-color", color, "important");
};

// Apply on load
if (settings.qualityProgressColor) {
	applyQualityProgressColor();
}

// MARKER: Integrated Seek Bar
// Moves the seekbar to the top border of the player bar | Inspired by Tokyo Tidal-HiFi theme (ages ago)

let integratedSeekbarIntervalId: ReturnType<typeof setInterval> | null = null;

const clearIntegratedSeekbarInterval = (): void => {
	if (integratedSeekbarIntervalId !== null) {
		clearInterval(integratedSeekbarIntervalId);
		integratedSeekbarIntervalId = null;
	}
};

// Restore Original DOM Structure (cleanup)
const unwrapIntegratedSeekbarTimes = (footerPlayer: HTMLElement): void => {
	const wrap = footerPlayer.querySelector(".rl-seekbar-times-wrap");
	if (!wrap?.parentElement) return;
	const row = wrap.parentElement;
	const bar =
		(row.querySelector(".rl-seekbar-bar") as HTMLElement | null) ??
		(row.querySelector('[data-test="progress-bar"]')?.parentElement as
			| HTMLElement
			| null);
	const p1 = wrap.querySelector('[data-test="current-time"]')
		?.parentElement as HTMLElement | undefined;
	const p2 = wrap.querySelector('[data-test="duration"]')
		?.parentElement as HTMLElement | undefined;
	wrap.querySelector(".rl-seekbar-time-sep")?.remove();
	if (p1 && p2 && bar) {
		row.insertBefore(p1, wrap);
		row.insertBefore(p2, bar.nextSibling);
	} else if (p1 && p2) {
		row.insertBefore(p1, wrap);
		row.appendChild(p2);
	}
	wrap.remove();
};

const syncIntegratedSeekbarCombinedTime = (footerPlayer: HTMLElement): void => {
	const el = footerPlayer.querySelector(
		".rl-seekbar-combined-time",
	) as HTMLElement | null;
	if (!el) return;
	const row = footerPlayer.querySelector(".rl-seekbar-container");
	if (!row) return;
	const cur =
		row.querySelector('[data-test="current-time"]')?.textContent?.trim() ?? "";
	const dur =
		row.querySelector('[data-test="duration"]')?.textContent?.trim() ?? "";
	el.textContent = `${cur} | ${dur}`;
};

// Finds the Seekbar Row
const getScrubberRowFromFooter = (
	footerPlayer: HTMLElement,
): HTMLElement | null => {
	const pb = footerPlayer.querySelector('[data-test="progress-bar"]');
	const bar = pb?.parentElement;
	return bar?.parentElement ?? null;
};

const clearNativeScrubberTimeDisplay = (footerPlayer: HTMLElement): void => {
	const row = getScrubberRowFromFooter(footerPlayer);
	if (!row) return;
	for (const p of row.querySelectorAll("p")) {
		if (
			p.querySelector('[data-test="current-time"]') ||
			p.querySelector('[data-test="duration"]')
		) {
			p.style.removeProperty("display");
		}
	}
};

const cleanupIntegratedSeekbarDisplay = (footerPlayer: HTMLElement): void => {
	clearIntegratedSeekbarInterval();
	clearNativeScrubberTimeDisplay(footerPlayer);
	unwrapIntegratedSeekbarTimes(footerPlayer);
	footerPlayer.querySelectorAll(".rl-seekbar-combined-time").forEach((n) => {
		n.remove();
	});
	for (const el of footerPlayer.querySelectorAll(".rl-seekbar-native-time")) {
		el.classList.remove("rl-seekbar-native-time");
	}
	footerPlayer.style.removeProperty("--rl-integrated-seekbar-top-radius");
};

const applyIntegratedSeekBar = (): void => {
	const footerPlayer = document.querySelector(
		'[data-test="footer-player"]',
	) as HTMLElement | null;
	if (!footerPlayer) return;

	clearIntegratedSeekbarInterval();

	// Cleanup
	for (const cls of ["rl-seekbar-container", "rl-seekbar-bar", "rl-seekbar-native-time"]) {
		footerPlayer.querySelectorAll(`.${cls}`).forEach((el) => {
			el.classList.remove(cls);
		});
	}

	if (!settings.integratedSeekBar) {
		document.body.classList.remove("rl-integrated-seekbar");
		cleanupIntegratedSeekbarDisplay(footerPlayer);
		return;
	}

	document.body.classList.add("rl-integrated-seekbar");
	applyIntegratedSeekbarChrome();

	const progressBar = footerPlayer.querySelector(
		'[data-test="progress-bar"]',
	) as HTMLElement | null;
	if (!progressBar) return;

	const scrubberBar = progressBar.parentElement as HTMLElement | null;
	const scrubberRow = scrubberBar?.parentElement as HTMLElement | null;
	if (!scrubberRow) return;

	scrubberRow.classList.add("rl-seekbar-container");

	// Mark the Seekbar (so it's moved in a sec)
	if (scrubberBar) {
		scrubberBar.classList.add("rl-seekbar-bar");
	}

	const currentTime = scrubberRow.querySelector(
		'[data-test="current-time"]',
	) as HTMLElement | null;
	const duration = scrubberRow.querySelector(
		'[data-test="duration"]',
	) as HTMLElement | null;
	const p1 = currentTime?.parentElement as HTMLElement | null;
	const p2 = duration?.parentElement as HTMLElement | null;
	if (!p1 || !p2) return;

	unwrapIntegratedSeekbarTimes(footerPlayer);

	p1.classList.add("rl-seekbar-native-time");
	p2.classList.add("rl-seekbar-native-time");
	p1.style.setProperty("display", "none", "important");
	p2.style.setProperty("display", "none", "important");

	const combinedNodes = scrubberRow.querySelectorAll(".rl-seekbar-combined-time");
	for (let i = 1; i < combinedNodes.length; i++) {
		combinedNodes[i]?.remove();
	}
	let combined = scrubberRow.querySelector(
		".rl-seekbar-combined-time",
	) as HTMLElement | null;
	if (!combined) {
		combined = document.createElement("span");
		combined.className = "rl-seekbar-combined-time";
		combined.setAttribute("aria-live", "polite");
		scrubberRow.insertBefore(combined, p1);
	}

	syncIntegratedSeekbarCombinedTime(footerPlayer);
	integratedSeekbarIntervalId = setInterval(() => {
		const fp = document.querySelector(
			'[data-test="footer-player"]',
		) as HTMLElement | null;
		if (!fp || !settings.integratedSeekBar) {
			clearIntegratedSeekbarInterval();
			return;
		}
		syncIntegratedSeekbarCombinedTime(fp);
	}, 250);
};

// Apply integrated seek bar on load (fixes race condition with flush button)
applyIntegratedSeekBar();
observe<HTMLElement>(unloads, '[data-test="footer-player"]', () => {
	applyPlayerBarTintToElement();
	applyIntegratedSeekBar();
});

// Apply styles.css + backdrop keyframes (Now Playing needs these even with Cover Everywhere off)
baseStyleTag.css = `${baseStyles}\n${backdropStylesCss}`;

// Lyrics glow vars & lyrics-glow.css (when enabled)
const updateRadiantLyricsTextGlow = function (): void {
	const root = document.documentElement;
	if (settings.lyricsGlowEnabled) {
		root.style.setProperty("--rl-glow-outer", `${settings.textGlow}px`);
		root.style.setProperty("--rl-glow-inner", "2px");
		lyricsGlowStyleTag.css = lyricsGlow;
	} else {
		root.style.setProperty("--rl-glow-outer", "0px");
		root.style.setProperty("--rl-glow-inner", "0px");
		lyricsGlowStyleTag.css = "";
	}
	root.style.setProperty("--rl-font-scale", `${settings.lyricsFontSize / 100}`);
};

// Apply glow state immediately at startup
updateRadiantLyricsTextGlow();

// Function to update styles when settings change
const updateRadiantLyricsStyles = function (): void {
	// Handle Player Bar Visibility
	if (isHidden) {
		if (!settings.playerBarVisible) {
			playerBarStyleTag.css = playerBarHidden;
		} else {
			playerBarStyleTag.remove();
		}
	} else {
		playerBarStyleTag.remove();
	}

	// Handle Floating Player Bar
	applyFloatingPlayerBar();

	// Lyrics glow vars & lyrics-glow.css (when enabled)
	updateRadiantLyricsTextGlow();
};

// MARKER: UI Visibility Control
// UI state shared across features
let isHidden = false;

const EYE_OFF_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
const EYE_ON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

const updateButtonStates = function (): void {
	const toggleButton = document.querySelector(".hide-ui-button") as HTMLElement;
	if (!toggleButton) return;

	if (settings.hideUIEnabled) {
		toggleButton.style.display = "";
		const newSvg = isHidden ? EYE_ON_SVG : EYE_OFF_SVG;
		const label = isHidden ? "Show UI" : "Hide UI";
		toggleButton.setAttribute("aria-label", label);
		toggleButton.setAttribute("title", label);
		const spanWrapper = toggleButton.querySelector("span");
		if (spanWrapper) {
			const svgClass = spanWrapper.querySelector("svg")?.getAttribute("class") ?? "";
			spanWrapper.innerHTML = newSvg;
			const svg = spanWrapper.querySelector("svg");
			if (svg && svgClass) svg.setAttribute("class", svgClass);
		}
	} else {
		toggleButton.style.display = "none";
	}
};

// Toggle hide/unhide UI
const toggleRadiantLyrics = function (): void {
	const nowPlayingContainer = document.querySelector(
		'[class*="_nowPlayingContainer"]',
	) as HTMLElement;
	isHidden = !isHidden;
	updateButtonStates();
	if (isHidden) {
		safeTimeout(
			unloads,
			() => {
				updateRadiantLyricsStyles();
				if (nowPlayingContainer)
					nowPlayingContainer.classList.add("radiant-lyrics-ui-hidden");
				document.body.classList.add("radiant-lyrics-ui-hidden");
			},
			50,
		);
	} else {
		if (nowPlayingContainer)
			nowPlayingContainer.classList.remove("radiant-lyrics-ui-hidden");
		document.body.classList.remove("radiant-lyrics-ui-hidden");
		safeTimeout(
			unloads,
			() => {
				if (!isHidden) {
					updateRadiantLyricsStyles();
				}
			},
			500,
		);
	}
};

// Create buttons
let flushLocked = false;
let flushSpinning = false;
// Flushed track.. next click retimes it with AI
let retimeTrackId: string | null = null;
let retiming = false;
// Bumped on track change so old Sylla results get dropped
let syllaEpoch = 0;
// Track that already ran auto Sylla (so rebuilds don't requeue)
let autoSyllaTrackId: string | null = null;
let autoSyllaRunning = false;
// Sylla job waiting in line (null = running or idle)
let syllaQueue: SyllaQueue | null = null;
let syllaAbort = new AbortController();
unloads.add(() => syllaAbort.abort());

const queueText = (q: SyllaQueue): string => `Sylla AI Queue (${q.position}/${q.size})`;

// Drop the current job (track change)
const resetSyllaJob = (): void => {
	syllaEpoch++;
	syllaAbort.abort();
	syllaAbort = new AbortController();
	syllaQueue = null;
};

const setFlushTip = (tip: string): void => {
	const btn = document.querySelector(".flush-lyrics-button");
	btn?.setAttribute("title", tip);
	btn?.setAttribute("aria-label", tip);
};
const flushIdleTip = (): string =>
	retimeTrackId ? "Retime Lyrics using Sylla!" : "Flush Lyrics";

// Rainbow flush button in retime mode
const syncRetimeStyle = (): void => {
	const btn = document.querySelector(".flush-lyrics-button");
	if (!btn) return;
	if (!document.getElementById("rl-retime-gradient")) {
		const defs = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		defs.setAttribute("class", "rl-retime-defs");
		defs.setAttribute("aria-hidden", "true");
		defs.innerHTML =
			'<defs><linearGradient id="rl-retime-gradient" x1="0" y1="1" x2="1" y2="0"><stop class="rl-retime-stop" offset="0"/><stop class="rl-retime-stop" offset="0.35"/><stop class="rl-retime-stop" offset="0.65"/><stop class="rl-retime-stop" offset="1"/></linearGradient></defs>';
		document.body.appendChild(defs);
	}
	btn.classList.toggle("rl-retime", retiming || (!flushLocked && retimeTrackId !== null));
	// Queued jobs spin slower
	btn.classList.toggle("rl-queued", syllaQueue !== null);
	if (syllaQueue) setFlushTip(queueText(syllaQueue));
};

// Queue updates for one job (toast when it enters the queue)
const syllaJob = (epoch: number, tip: string): SyllaJobOptions => {
	let toasted = false;
	return {
		signal: syllaAbort.signal,
		onQueue: (queue) => {
			if (epoch !== syllaEpoch) return;
			if (queue && !toasted) {
				toasted = true;
				toast(`${queueText(queue)}, Please wait...`);
			}
			if (queue?.position === syllaQueue?.position && queue?.size === syllaQueue?.size) return;
			syllaQueue = queue;
			syncRetimeStyle();
			if (!queue) setFlushTip(tip);
		},
	};
};
unloads.add(() => document.querySelector(".rl-retime-defs")?.remove());

// Swap flush icon and loading spinner
const setFlushSpinner = (on: boolean): void => {
	flushSpinning = on;
	const btn = document.querySelector(".flush-lyrics-button") as HTMLButtonElement | null;
	if (!btn) return;
	const svg = btn.querySelector("svg");
	if (!svg) return;
	const svgClass = (svg.getAttribute("class") ?? "")
		.split(/\s+/)
		.filter((c) => c && c !== "rl-spinner");
	if (on) {
		if (svg.classList.contains("rl-spinner")) return;
		btn.setAttribute("title", "Loading lyrics…");
		btn.setAttribute("aria-label", "Loading lyrics…");
		const spinner = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		if (svgClass.length) spinner.setAttribute("class", svgClass.join(" "));
		spinner.classList.add("rl-spinner");
		spinner.setAttribute("viewBox", "0 0 20 20");
		spinner.setAttribute("aria-hidden", "true");
		const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		circle.setAttribute("cx", "10");
		circle.setAttribute("cy", "10");
		circle.setAttribute("r", "8");
		circle.setAttribute(
			"style",
			"fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-dasharray:42 8",
		);
		spinner.appendChild(circle);
		svg.replaceWith(spinner);
	} else {
		const spinner = btn.querySelector("svg.rl-spinner");
		if (!spinner) return;
		const syncSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		if (svgClass.length) syncSvg.setAttribute("class", svgClass.join(" "));
		syncSvg.setAttribute("viewBox", "0 0 20 20");
		const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
		use.setAttribute("href", "#general__lyrics-sync");
		syncSvg.appendChild(use);
		spinner.replaceWith(syncSvg);
	}
};

const unlockFlush = (): void => {
	flushLocked = false;
	setFlushSpinner(false);
	const btn = document.querySelector(".flush-lyrics-button") as HTMLButtonElement;
	if (btn) {
		btn.disabled = false;
		btn.style.opacity = "";
		btn.style.cursor = "";
		setFlushTip(flushIdleTip());
	}
	syncRetimeStyle();
};
const lockFlush = (): void => {
	flushLocked = true;
	const btn = document.querySelector(".flush-lyrics-button") as HTMLButtonElement;
	if (btn) {
		btn.disabled = true;
		btn.style.opacity = "0.3";
		btn.style.cursor = "not-allowed";
	}
	setFlushSpinner(true);
	syncRetimeStyle();
};
const disableFlushNoLyrics = (): void => {
	flushLocked = true;
	setFlushSpinner(false);
	const btn = document.querySelector(".flush-lyrics-button") as HTMLButtonElement;
	if (btn) {
		btn.disabled = true;
		btn.style.opacity = "0.3";
		btn.style.cursor = "not-allowed";
		btn.setAttribute("title", "Track has no lyrics");
		btn.setAttribute("aria-label", "Track has no lyrics");
	}
	syncRetimeStyle();
};

const flushLyrics = async (): Promise<void> => {
	if (flushLocked) return;

	const trackInfo = await getTrackInfo();
	if (!trackInfo) {
		trace.msg.err("Flush: could not get track info");
		return;
	}
	if (retimeTrackId === trackInfo.trackId) {
		await retimeLyrics(trackInfo);
		return;
	}

	lockFlush();

	try {
		const result = await flushLyricsApi(trackInfo);
		if (!result.ok) {
			if (result.notFound) {
				toast("No lyrics found for this track");
				unlockFlush();
				return;
			}
			toastErr(`Flush failed (${result.status})`);
			unlockFlush();
			return;
		}
		const data = result.data;
		const note = data?._flush ?? "";
		if (settings.allowAI) retimeTrackId = trackInfo.trackId;

		const needsReload = note.startsWith("Created") || note.startsWith("Updated");
		if (note) {
			toast(note);
		} else {
			toast("Lyrics flushed");
		}
		if (needsReload || !note) {
			cachedLyricsKey = null;
			cachedLyricsData = null;
			onTrackChange();
		} else {
			unlockFlush();
		}
	} catch (err) {
		toastErr(`Flush error: ${err instanceof Error ? err.message : String(err)}`);
		unlockFlush();
	}
};

const alreadyAlignedMsg = (info: SyllaAlreadyAligned): string =>
	`Already timed by Sylla${info.confidence !== undefined ? ` (${Math.round(info.confidence * 100)}% confidence)` : ""}`;

// Second click after a flush (Sylla retime)
const retimeLyrics = async (trackInfo: TrackInfo): Promise<void> => {
	const current = lyricsResponse ?? cachedLyricsData;
	if (!current) {
		toast("No lyrics to retime");
		return;
	}

	const tip = "Retiming with Sylla AI…";
	retiming = true;
	lockFlush();
	setFlushTip(tip);

	const epoch = syllaEpoch;
	const result = await alignLyricsApi(trackInfo, current, syllaJob(epoch, tip));
	// Track changed mid request, onTrackChange handles the button
	if (epoch !== syllaEpoch) return;
	if (!result.ok) {
		retiming = false;
		if (result.alreadyAligned) toast(alreadyAlignedMsg(result.alreadyAligned));
		else toastErr(`AI retime failed (${result.detail || result.status})`);
		unlockFlush();
		return;
	}

	loadSyllaLyrics(trackInfo, result.data, "retimed");
};

// Cache Sylla lyrics then reload so they show
const loadSyllaLyrics = (
	trackInfo: TrackInfo,
	data: AlignResponse,
	kind: "retimed" | "generated",
): void => {
	retiming = false;
	toast(`Lyrics ${kind} with Sylla AI (${Math.round(data.confidence * 100)}% confidence)`);
	cachedLyricsKey = lyricsCacheKey(trackInfo.title, trackInfo.artist, trackInfo.isrc);
	cachedLyricsData = {
		...data.lyrics,
		_synthesized: true,
		_synthesisType: kind === "generated" ? "Generate" : "Align",
		_confidence: data.confidence,
	};
	onTrackChange();
};

// Sylla waits 5s from song start (skip spam)
const SYLLA_SETTLE_MS = 5000;
// When this track started
let trackStartedAt = 0;

// false if skipped before the wait ends
const syllaSettle = (signal: AbortSignal): Promise<boolean> =>
	new Promise((resolve) => {
		if (signal.aborted) return resolve(false);
		const wait = trackStartedAt + SYLLA_SETTLE_MS - Date.now();
		if (wait <= 0) return resolve(true);
		const onAbort = (): void => {
			clearTimeout(timer);
			resolve(false);
		};
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve(true);
		}, wait);
		signal.addEventListener("abort", onAbort, { once: true });
	});

// Auto Sylla job (once per track)
// Both need the Radiant AI setting btw
//   gen: no lyrics = Sylla makes
//   align: Line only = Sylla Retimes (makes Syllables)
const autoSylla = (
	trackInfo: TrackInfo,
	mode: "gen" | "align",
	source?: LyricsApiResponse,
): boolean => {
	if (!settings.lyricsApi || !settings.allowAI || !settings.radiantAI) return false;
	const tip = mode === "gen" ? "Generating lyrics with Sylla…" : "Generating syllables with Sylla…";
	if (autoSyllaTrackId === trackInfo.trackId) {
		// Rebuilt mid job keeps the spinner (failed jobs don't retry)
		if (autoSyllaRunning) setFlushTip(syllaQueue ? queueText(syllaQueue) : tip);
		return autoSyllaRunning;
	}
	autoSyllaTrackId = trackInfo.trackId;
	autoSyllaRunning = true;
	retiming = true;
	lockFlush();
	setFlushTip(tip);

	const epoch = syllaEpoch;
	const options = syllaJob(epoch, tip);
	void syllaSettle(syllaAbort.signal).then(async (settled) => {
		// Skipped, never reaches Sylla
		if (!settled || epoch !== syllaEpoch) return;
		const result = await (mode === "align" && source
			? alignLyricsApi(trackInfo, source, options)
			: generateLyricsApi(trackInfo, options));
		if (epoch !== syllaEpoch) return;
		autoSyllaRunning = false;
		retiming = false;
		if (!result.ok) {
			trace.log(
				`Sylla ${mode === "gen" ? "Gen" : "Align"}: kept ${mode === "gen" ? "no lyrics" : "line lyrics"} (${result.verdict ?? (result.detail || result.status)})`,
			);
			if (mode === "gen") disableFlushNoLyrics();
			else unlockFlush();
			return;
		}
		loadSyllaLyrics(trackInfo, result.data, mode === "gen" ? "generated" : "retimed");
	});
	return true;
};

// Cancel the auto job so its result gets dropped
const cancelAutoSylla = (): void => {
	if (!autoSyllaRunning) return;
	resetSyllaJob();
	autoSyllaRunning = false;
	retiming = false;
	autoSyllaTrackId = null;
};

const flushBtn = function (): void {
	const closeButton = document.querySelector(
		'[data-test="new-now-playing-close"]',
	) as HTMLButtonElement;
	if (!closeButton?.parentElement) return;
	if (document.querySelector(".flush-lyrics-button")) return;
	const buttonContainer = closeButton.parentElement;

	const flushButton = closeButton.cloneNode(false) as HTMLButtonElement;
	flushButton.className = closeButton.className;
	flushButton.classList.add("flush-lyrics-button");
	flushButton.removeAttribute("data-test");
	flushButton.setAttribute("type", "button");
	flushButton.setAttribute("aria-label", "Flush Lyrics");
	flushButton.setAttribute("title", "Flush Lyrics");
	flushButton.disabled = true;
	flushButton.style.opacity = "0.3";
	flushButton.style.cursor = "not-allowed";

	const iconSpan = closeButton.querySelector("span");
	const iconSvg = closeButton.querySelector("svg");
	const spanWrapper = document.createElement("span");
	if (iconSpan) spanWrapper.className = iconSpan.className;
	spanWrapper.setAttribute("aria-hidden", "true");
	const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svgEl.setAttribute("viewBox", "0 0 20 20");
	if (iconSvg) svgEl.setAttribute("class", iconSvg.className.baseVal);
	const useEl = document.createElementNS("http://www.w3.org/2000/svg", "use");
	useEl.setAttribute("href", "#general__lyrics-sync");
	svgEl.appendChild(useEl);
	spanWrapper.appendChild(svgEl);
	flushButton.appendChild(spanWrapper);
	// Recreated while loading, show the spinner again
	if (flushSpinning) {
		flushButton.setAttribute("title", "Loading lyrics…");
		flushButton.setAttribute("aria-label", "Loading lyrics…");
		setFlushSpinner(true);
	}

	flushButton.onclick = () => flushLyrics();

	const hideBtn = buttonContainer.querySelector(".hide-ui-button");
	buttonContainer.insertBefore(
		flushButton,
		hideBtn ?? closeButton,
	);
	syncRetimeStyle();
};

const createHideUIButton = function (): void {
	if (!settings.hideUIEnabled) return;
	const closeButton = document.querySelector(
		'[data-test="new-now-playing-close"]',
	) as HTMLButtonElement;
	if (!closeButton?.parentElement) return;
	if (document.querySelector(".hide-ui-button")) return;
	const buttonContainer = closeButton.parentElement;

	const hideUIButton = closeButton.cloneNode(false) as HTMLButtonElement;
	hideUIButton.className = closeButton.className;
	hideUIButton.classList.add("hide-ui-button");
	hideUIButton.removeAttribute("data-test");
	hideUIButton.setAttribute("type", "button");
	hideUIButton.setAttribute("aria-label", isHidden ? "Show UI" : "Hide UI");
	hideUIButton.setAttribute("title", isHidden ? "Show UI" : "Hide UI");

	const iconSpan = closeButton.querySelector("span");
	const iconSvg = closeButton.querySelector("svg");
	const spanWrapper = document.createElement("span");
	if (iconSpan) spanWrapper.className = iconSpan.className;
	spanWrapper.setAttribute("aria-hidden", "true");
	const svgContent = isHidden ? EYE_ON_SVG : EYE_OFF_SVG;
	spanWrapper.innerHTML = svgContent;
	const svg = spanWrapper.querySelector("svg");
	if (svg && iconSvg) svg.setAttribute("class", iconSvg.className.baseVal);
	hideUIButton.appendChild(spanWrapper);

	hideUIButton.onclick = toggleRadiantLyrics;
	buttonContainer.insertBefore(hideUIButton, closeButton);
};

// MARKER: Background Rendering (Kawarp Shader)
// cover art URL -> kawarp -> Animated Backdrop <3
let globalSpinningBgStyleTag: StyleTag | null = null;
let globalBackgroundContainer: HTMLElement | null = null;
let nowPlayingBackgroundContainer: HTMLElement | null = null;
let currentCoverSrc: string | null = null;

const kawarpLayers: {
	global: KawarpLayer | null;
	nowPlaying: KawarpLayer | null;
} = { global: null, nowPlaying: null };

const disposeKawarpLayer = (slot: "global" | "nowPlaying"): void => {
	kawarpLayers[slot]?.dispose();
	kawarpLayers[slot] = null;
};

/**
 * Only ever run one shader chain
 */
// Now Playing view slides = ~1 second (stops frozen backdrop on reveal) [Super WIP]
const PAUSE_GRACE_MS = 1500;
const pauseHiddenSince: { global: number; nowPlaying: number } = {
	global: 0,
	nowPlaying: 0,
};

const setLayerRunning = (
	slot: "global" | "nowPlaying",
	layer: KawarpLayer | null,
	shouldRun: boolean,
	now: number,
): void => {
	if (!layer) return;
	if (shouldRun) {
		pauseHiddenSince[slot] = 0;
		layer.setPaused(false);
		return;
	}
	// window hidden [Untested dk why it wouldn't work tho]
	if (document.hidden) {
		pauseHiddenSince[slot] = 0;
		layer.setPaused(true);
		return;
	}
	if (pauseHiddenSince[slot] === 0) pauseHiddenSince[slot] = now;
	if (now - pauseHiddenSince[slot] >= PAUSE_GRACE_MS) layer.setPaused(true);
};

// Cached so the 200ms tick skips a document-wide query.
let cachedNowPlayingPanel: HTMLElement | null = null;

// On screen, not just mounted.
const artPanelVisible = (panel: HTMLElement): boolean => {
	if (typeof panel.checkVisibility === "function") {
		return panel.checkVisibility({ checkVisibilityCSS: true });
	}
	return getComputedStyle(panel).visibility !== "hidden";
};

const syncBackdropActivity = (): void => {
	// Stock backdrop keeps current (no shader loop)
	if (stockContainer) applyStockCoverEverywhere();

	const nowPlaying = kawarpLayers.nowPlaying;
	const global = kawarpLayers.global;
	const nowPlayingVisible = nowPlaying?.isVisible() ?? false;
	const now = Date.now();

	// Ramp shader down when playback pauses (maybe not the best way but it does work sooo)
	const playing = settings.backdropPlaybackReactive
		? reduxPlaybackIsPlaying()
		: true;
	nowPlaying?.setPlaying(playing);
	global?.setPlaying(playing);

	setLayerRunning(
		"nowPlaying",
		nowPlaying,
		!document.hidden && nowPlayingVisible && playing,
		now,
	);
	// keep animating underneath for whole slide (stops freeze before hidden) [Super WIP]
	setLayerRunning(
		"global",
		global,
		!document.hidden &&
			!nowPlayingVisible &&
			playing &&
			(global?.isVisible() ?? false),
		now,
	);

	// Pause art when off screen (ticks 5x/sec)
	if (animatedArtworkLayer) {
		if (!cachedNowPlayingPanel?.isConnected) {
			cachedNowPlayingPanel = document.querySelector(
				'[class*="_nowPlayingContainer"]',
			) as HTMLElement | null;
		}
		animatedArtworkLayer.syncVisibility(
			!!cachedNowPlayingPanel && artPanelVisible(cachedNowPlayingPanel),
		);
	}
};

/** cover art @ resolution worth sampling */
const getCoverArtSrc = (): string | null => {
	const targetRes = "160x160";
	const img = document.querySelector(
		'[data-test="current-media-imagery"] img',
	) as HTMLImageElement | null;
	if (img?.src) return img.src.replace(/\d+x\d+/, targetRes);

	const video = document.querySelector(
		'[data-test="current-media-imagery"] video',
	) as HTMLVideoElement | null;
	const poster = video?.getAttribute("poster");
	return poster ? poster.replace(/\d+x\d+/, targetRes) : null;
};

/** Mount/remount kawarp canvas */
const ensureLayer = (
	slot: "global" | "nowPlaying",
	container: HTMLElement,
	zIndex: string,
): KawarpLayer | null => {
	let layer = kawarpLayers[slot];
	if (layer && !layer.isMountedIn(container)) {
		// Tidal rebuilt the container
		disposeKawarpLayer(slot);
		layer = null;
	}
	if (!layer) {
		layer = new KawarpLayer(container, slot, zIndex);
		kawarpLayers[slot] = layer;
	}
	return layer;
};

// Apply backdrop across whole app (cover everywhere)
const applyGlobalBackdrop = (coverArtImageSrc: string): void => {
	if (!settings.CoverEverywhere) {
		cleanUpGlobalBackground();
		return;
	}

	const appContainer = document.querySelector(
		'[data-test="main"]',
	) as HTMLElement | null;
	if (!appContainer) return;

	if (!globalSpinningBgStyleTag) {
		globalSpinningBgStyleTag = new StyleTag(
			"RadiantLyrics-global-backdrop",
			unloads,
			coverEverywhereCss,
		);
	}

	if (!globalBackgroundContainer?.isConnected) {
		globalBackgroundContainer = document.createElement("div");
		globalBackgroundContainer.className = "global-background-container";
		appContainer.appendChild(globalBackgroundContainer);
	}

	ensureLayer("global", globalBackgroundContainer, "-1")?.apply(
		coverArtImageSrc,
	);
};

// Apply backdrop in Now Playing
const applyNowPlayingBackdrop = (coverArtImageSrc: string): void => {
	const nowPlayingContainerElement = document.querySelector(
		'[class*="_nowPlayingContainer"]',
	) as HTMLElement | null;
	if (!nowPlayingContainerElement) return;

	if (
		!nowPlayingBackgroundContainer?.isConnected ||
		!nowPlayingContainerElement.contains(nowPlayingBackgroundContainer)
	) {
		nowPlayingBackgroundContainer = document.createElement("div");
		nowPlayingBackgroundContainer.className =
			"now-playing-background-container";
		nowPlayingContainerElement.appendChild(nowPlayingBackgroundContainer);
	}

	ensureLayer("nowPlaying", nowPlayingBackgroundContainer, "0")?.apply(
		coverArtImageSrc,
	);
};

// Feed cover art into both backdrops
function updateCoverArtBackground(method: number = 0): void {
	if (method === 1) {
		safeTimeout(
			unloads,
			() => {
				updateCoverArtBackground();
			},
			2000,
		);
		return;
	}

	// Teardown <3
	document.body.classList.toggle("rl-backdrop-active", settings.backdropEnabled);
	if (!settings.backdropEnabled) {
		cleanUpDynamicArt();
		// Cover Everywhere still applies (Stock Tidal Backdrop)
		if (settings.CoverEverywhere) applyStockCoverEverywhere();
		else cleanUpStockCoverEverywhere();
		return;
	}
	cleanUpStockCoverEverywhere();

	const coverArtImageSrc = getCoverArtSrc();
	if (!coverArtImageSrc) {
		cleanUpDynamicArt();
		return;
	}
	currentCoverSrc = coverArtImageSrc;

	applyGlobalBackdrop(coverArtImageSrc);
	applyNowPlayingBackdrop(coverArtImageSrc);
	syncBackdropActivity();
}

// MARKER: Stock Backdrop (Cover Everywhere without the shader)

const STOCK_MARKUP =
	'<div class="rl-stock-rotator"><div class="rl-stock-overscan">' +
	'<img class="rl-stock-art" alt=""><img class="rl-stock-art" alt="">' +
	'</div></div><div class="rl-stock-scrim"></div>';
const STOCK_ART_RES = "320x320";

let stockBgStyleTag: StyleTag | null = null;
let stockContainer: HTMLElement | null = null;

const applyStockCoverEverywhere = (): void => {
	// Same sheet the shader uses
	stockBgStyleTag ??= new StyleTag(
		"RadiantLyrics-stock-backdrop",
		unloads,
		coverEverywhereCss,
	);

	if (!stockContainer?.isConnected) {
		// Sweep first
		cleanUpStockContainers();
		stockContainer = document.createElement("div");
		stockContainer.className = "rl-stock-background-container";
		stockContainer.innerHTML = STOCK_MARKUP;
		document.body.appendChild(stockContainer);
	}

	const source = document.querySelector<HTMLImageElement>(
		'[data-test="footer-player"] [data-test="current-media-imagery"] img',
	);
	const layers = [
		...stockContainer.querySelectorAll<HTMLImageElement>(".rl-stock-art"),
	];
	// Which layer is showing lives in DOM (no state to track)
	const shown =
		layers.find((l) => l.classList.contains("rl-stock-art-active")) ?? layers[1];
	const next = layers.find((l) => l !== shown);

	const cover = source?.src.replace(/\d+x\d+/, STOCK_ART_RES);
	if (next && cover && cover !== shown.src) {
		next.src = cover;
		// Swap only once decoded (otherwise the crossfade reveals a blank layer)
		const reveal = () => {
			next.classList.add("rl-stock-art-active");
			shown.classList.remove("rl-stock-art-active");
		};
		if (next.complete) reveal();
		else next.addEventListener("load", reveal, { once: true });
	}

	// Tidal halts its own spin while paused
	stockContainer.classList.toggle(
		"rl-stock-paused",
		!reduxPlaybackIsPlaying(),
	);
};

const cleanUpStockContainers = (): void => {
	document
		.querySelectorAll(".rl-stock-background-container")
		.forEach((el) => el.remove());
};

const cleanUpStockCoverEverywhere = (): void => {
	stockContainer = null;
	cleanUpStockContainers();
	stockBgStyleTag?.remove();
	stockBgStyleTag = null;
};

const cleanUpGlobalBackground = function (): void {
	// Release WebGL context before canvas is orphaned (otherwise death occurs)
	disposeKawarpLayer("global");

	globalBackgroundContainer?.remove();
	globalBackgroundContainer = null;

	if (globalSpinningBgStyleTag) {
		globalSpinningBgStyleTag.remove();
		globalSpinningBgStyleTag = null;
	}
};

const cleanUpDynamicArt = function (): void {
	disposeKawarpLayer("nowPlaying");
	nowPlayingBackgroundContainer?.remove();
	nowPlayingBackgroundContainer = null;
	currentCoverSrc = null;

	// more more teardown <3
	document
		.querySelectorAll(".now-playing-background-container")
		.forEach((el) => {
			el.remove();
		});

	cleanUpGlobalBackground();
};

// Re-render both backdrops when settings change
const updateRadiantLyricsBackdrop = function (): void {
	if (settings.performanceMode) {
		document.body.classList.add("performance-mode");
	} else {
		document.body.classList.remove("performance-mode");
	}

	// Gates the rules that hide Tidal now-playing background
	document.body.classList.toggle("rl-backdrop-active", settings.backdropEnabled);

	if (!settings.backdropEnabled) {
		cleanUpDynamicArt();
		// Cover Everywhere still applies (Stock Tidal Backdrop)
		if (settings.CoverEverywhere) applyStockCoverEverywhere();
		else cleanUpStockCoverEverywhere();
		return;
	}
	cleanUpStockCoverEverywhere();

	if (!settings.CoverEverywhere) cleanUpGlobalBackground();

	if (currentCoverSrc) {
		if (settings.CoverEverywhere) applyGlobalBackdrop(currentCoverSrc);
		applyNowPlayingBackdrop(currentCoverSrc);
		syncBackdropActivity();
	} else {
		updateCoverArtBackground();
	}
};

// MARKER: Animated Artwork (live artwork on the artwork tiles)
let animatedArtworkLayer: AnimatedArtworkLayer | null = null;
let lastArtworkTile: Element | null = null;
let lastMiniArtworkTile: Element | null = null;
let artworkUpdateSeq = 0;

// Album key, or title key if no album
const artworkKey = (t: TrackInfo): string =>
	t.album && t.album.trim() !== ""
		? `${t.artist}\u0000${t.album.trim()}`
		: `${t.artist}\u0000\u0000${t.title}`;

// Load art for the playing track
const updateAnimatedArtwork = async (): Promise<void> => {
	const seq = ++artworkUpdateSeq;
	if (!settings.animatedArtwork) {
		animatedArtworkLayer?.dispose();
		animatedArtworkLayer = null;
		lastArtworkTile = null;
		lastMiniArtworkTile = null;
		return;
	}
	animatedArtworkLayer ??= new AnimatedArtworkLayer();
	const target = await getTrackInfo();
	// Newer track change won, bail
	if (seq !== artworkUpdateSeq || !target || !animatedArtworkLayer) return;
	await animatedArtworkLayer.setTrack(target, artworkKey(target));
};

(window as any).updateAnimatedArtwork = updateAnimatedArtwork;
(window as any).updateAnimatedArtworkRate = (): void =>
	animatedArtworkLayer?.refresh();

// Make these functions available globally so Settings can call them
(window as any).updateRadiantLyricsStyles = updateRadiantLyricsStyles;
(window as any).updateRadiantLyricsBackdrop = updateRadiantLyricsBackdrop;
(window as any).updateRadiantLyricsTextGlow = updateRadiantLyricsTextGlow;
(window as any).updateRadiantLyricsPlayerBarTint =
	updateRadiantLyricsPlayerBarTint;
(window as any).updateQualityProgressColor = applyQualityProgressColor;
(window as any).updateIntegratedSeekBar = applyIntegratedSeekBar;

// halts the RAF loop (drives vissibility stuff)
document.addEventListener("visibilitychange", syncBackdropActivity);

// Tidal toggles the Now Playing view with visibility (dk why they don't unmount but oki)
safeInterval(unloads, syncBackdropActivity, 200);

// React the instant the slide starts/ends
observe<HTMLElement>(unloads, '[class*="_nowPlayingContainer"]', (container) => {
	for (const event of ["transitionrun", "transitionstart", "transitionend"]) {
		container.addEventListener(event, syncBackdropActivity);
	}
});


// Init performance mode
if (settings.performanceMode) {
	document.body.classList.add("performance-mode");
}

// Init text glow
updateRadiantLyricsTextGlow();

// Init global background
updateCoverArtBackground(1);

// Deferred: getTrackInfo() is declared further down and would be uninitialised.
queueMicrotask(() => void updateAnimatedArtwork());

// Cleanups
unloads.add(() => {
	animatedArtworkLayer?.dispose();
	animatedArtworkLayer = null;
	cachedNowPlayingPanel = null;
	cleanUpDynamicArt();
	cleanUpStockCoverEverywhere();
	document.body.classList.remove("rl-backdrop-active");

	// Clean up floating player bar inline styles
	const footerPlayer = document.querySelector(
		'[data-test="footer-player"]',
	) as HTMLElement;
	if (footerPlayer) {
		footerPlayer.style.removeProperty("background-color");
		footerPlayer.style.removeProperty("border-radius");
		footerPlayer.style.removeProperty("bottom");
		footerPlayer.style.removeProperty("left");
		footerPlayer.style.removeProperty("width");
		footerPlayer.style.removeProperty("--rl-integrated-seekbar-top-radius");
	}

	// Clean up integrated seekbar
	document.body.classList.remove("rl-integrated-seekbar");
	clearIntegratedSeekbarInterval();
	document
		.querySelectorAll(".rl-seekbar-container, .rl-seekbar-bar, .rl-seekbar-native-time")
		.forEach((el) => {
			el.classList.remove(
				"rl-seekbar-container",
				"rl-seekbar-bar",
				"rl-seekbar-native-time",
			);
		});
	if (footerPlayer) {
		cleanupIntegratedSeekbarDisplay(footerPlayer);
	}

	// Clean up action buttons
	for (const sel of [".hide-ui-button", ".flush-lyrics-button"]) {
		const btn = document.querySelector(sel);
		if (btn?.parentNode) btn.parentNode.removeChild(btn);
	}

	// Clean up lyrics menu elements
	document
		.querySelectorAll(".rl-lyrics-menu-trigger, .rl-lyrics-menu")
		.forEach((el) => {
			el.remove();
		});

	// even more more teardown <3
	cleanUpDynamicArt();
});

// MARKER: Lyrics Menu (dropdown on the lyrics toggle)

const LYRICS_MENU_ICON =
	'<svg viewBox="0 0 512 512" width="16" height="16"><defs><linearGradient id="rl-ai-gradient" gradientUnits="userSpaceOnUse" x1="0" y1="512" x2="512" y2="0"><stop class="rl-ai-stop" offset="0" stop-color="#ff6b9d"/><stop class="rl-ai-stop" offset="0.35" stop-color="#ffd166"/><stop class="rl-ai-stop" offset="0.65" stop-color="#5ee7ff"/><stop class="rl-ai-stop" offset="1" stop-color="#a78bfa"/></linearGradient></defs><path fill="currentColor" d="M208,512a24.84,24.84,0,0,1-23.34-16l-39.84-103.6a16.06,16.06,0,0,0-9.19-9.19L32,343.34a25,25,0,0,1,0-46.68l103.6-39.84a16.06,16.06,0,0,0,9.19-9.19L184.66,144a25,25,0,0,1,46.68,0l39.84,103.6a16.06,16.06,0,0,0,9.19,9.19l103,39.63A25.49,25.49,0,0,1,400,320.52a24.82,24.82,0,0,1-16,22.82l-103.6,39.84a16.06,16.06,0,0,0-9.19,9.19L231.34,496A24.84,24.84,0,0,1,208,512Zm66.85-254.84h0Z"/><path fill="currentColor" d="M88,176a14.67,14.67,0,0,1-13.69-9.4L57.45,122.76a7.28,7.28,0,0,0-4.21-4.21L9.4,101.69a14.67,14.67,0,0,1,0-27.38L53.24,57.45a7.31,7.31,0,0,0,4.21-4.21L74.16,9.79A15,15,0,0,1,86.23.11,14.67,14.67,0,0,1,101.69,9.4l16.86,43.84a7.31,7.31,0,0,0,4.21,4.21L166.6,74.31a14.67,14.67,0,0,1,0,27.38l-43.84,16.86a7.28,7.28,0,0,0-4.21,4.21L101.69,166.6A14.67,14.67,0,0,1,88,176Z"/><path fill="currentColor" d="M400,256a16,16,0,0,1-14.93-10.26l-22.84-59.37a8,8,0,0,0-4.6-4.6l-59.37-22.84a16,16,0,0,1,0-29.86l59.37-22.84a8,8,0,0,0,4.6-4.6L384.9,42.68a16.45,16.45,0,0,1,13.17-10.57,16,16,0,0,1,16.86,10.15l22.84,59.37a8,8,0,0,0,4.6,4.6l59.37,22.84a16,16,0,0,1,0,29.86l-59.37,22.84a8,8,0,0,0-4.6,4.6l-22.84,59.37A16,16,0,0,1,400,256Z"/></svg>';

const applyLyricsMenuIcon = (): void => {
	const trigger = document.querySelector(
		".rl-lyrics-menu-trigger",
	) as HTMLElement;
	if (!trigger) return;
	trigger.innerHTML = LYRICS_MENU_ICON;
	trigger.style.paddingLeft = "5px";
};

const LYRICS_MENU_TIP = "Lyrics Options";

// Rainbow sparkle for Sylla Align / Generate lyrics
const syncAiIndicator = (): void => {
	const showAi = lyricsIsAiGenerated && settings.allowAI && settings.lyricsApi;
	document.body.classList.toggle("rl-ai-lyrics", showAi);
	document
		.querySelector(".rl-lyrics-menu-trigger")
		?.setAttribute(
			"title",
			!showAi
				? LYRICS_MENU_TIP
				: aiSynthesisType === "Generate"
					? "Lyrics were generated by Sylla AI"
					: "Lyrics were timed by Sylla AI",
		);
};
unloads.add(() => document.body.classList.remove("rl-ai-lyrics"));

// Console: Syllables.log = true/false
// Verbose logging for word/syllable lyrics (hidden setting)
const sylLog = (...args: unknown[]) => {
	if (settings.syllableLogging) console.log(...args);
};
const sylTrace = (...args: unknown[]) => {
	if (settings.syllableLogging) trace.log(...args);
};
(window as any).Syllables = {
	get log() {
		return settings.syllableLogging;
	},
	set log(value: boolean) {
		settings.syllableLogging = value;
		console.log(
			`[Radiant Lyrics] Syllable logging ${value ? "enabled" : "disabled"}`,
		);
	},
	// Playback clock calibration in ms (i assume Lunar will break playback one day since MPV is wierd so i added this for that)
	get offset() {
		return settings.lyricsOffsetMs;
	},
	set offset(value: number) {
		const ms = Math.round(Number(value));
		if (!Number.isFinite(ms)) return;
		settings.lyricsOffsetMs = ms;
		console.log(
			`[Radiant Lyrics] Lyrics offset: ${ms > 0 ? "+" : ""}${ms} ms (${ms === 0 ? "no shift" : ms > 0 ? "earlier" : "later"})`,
		);
	},
	// MARKER: Syllable animations (WIP coming soon)
	get style() {
		return settings.syllableStyle;
	},
	set style(value: number) {
		const names = ["none", "Pop!", "Jump"];
		const clamped = Math.max(0, Math.min(2, Math.floor(value)));
		settings.syllableStyle = clamped;
		const container = document.querySelector(".rl-wbw-container");
		if (container) {
			container.classList.remove("rl-syl-pop", "rl-syl-jump");
			if (isWordMode()) {
				if (clamped === 1) container.classList.add("rl-syl-pop");
				else if (clamped === 2) container.classList.add("rl-syl-jump");
			}
		}
		console.log(
			`[Radiant Lyrics] Syllable style: ${names[clamped] ?? clamped}`,
		);
	},
};

let lyricsMenuEl: HTMLElement | null = null;
let lyricsMenuOpen = false;

const positionDropdown = (): void => {
	if (!lyricsMenuEl) return;
	const toggle = document.querySelector('[data-test="toggle-lyrics"]') as HTMLElement;
	if (!toggle) return;
	const rect = toggle.getBoundingClientRect();
	lyricsMenuEl.style.top = `${rect.bottom}px`;
	lyricsMenuEl.style.left = `${rect.left}px`;
	lyricsMenuEl.style.width = `${rect.width}px`;
	lyricsMenuEl.style.display = "block";
};

const openLyricsMenu = (toggle: HTMLElement): void => {
	lyricsMenuOpen = true;
	document.body.classList.add("rl-dropdown-open");
	let positioned = false;
	const onWidened = (e: TransitionEvent) => {
		if (e.propertyName !== "min-width") return;
		toggle.removeEventListener("transitionend", onWidened);
		if (!positioned) {
			positioned = true;
			positionDropdown();
		}
	};
	toggle.addEventListener("transitionend", onWidened as EventListener);
	safeTimeout(unloads, () => {
		toggle.removeEventListener("transitionend", onWidened as EventListener);
		if (!positioned) {
			positioned = true;
			positionDropdown();
		}
	}, 200);
};

const closeLyricsMenu = (): void => {
	lyricsMenuOpen = false;
	document.body.classList.remove("rl-dropdown-open");
	if (lyricsMenuEl) lyricsMenuEl.style.display = "none";
};

const ensureLyricsMenu = (): HTMLElement => {
	if (lyricsMenuEl) return lyricsMenuEl;

	const dropdown = document.createElement("div");
	dropdown.className = "rl-lyrics-menu";
	dropdown.style.display = "none";

	dropdown.innerHTML = `
		<div class="rl-lyrics-menu-row">
			<span class="rl-lyrics-menu-label">Romanization</span>
			<label class="rl-lyrics-menu-switch">
				<input type="checkbox" data-setting="romanizeLyrics" ${settings.romanizeLyrics ? "checked" : ""}>
				<span class="rl-lyrics-menu-slider"></span>
			</label>
		</div>
		<div class="rl-lyrics-menu-row">
			<span class="rl-lyrics-menu-label">Translation</span>
			<label class="rl-lyrics-menu-switch">
				<input type="checkbox" data-setting="translateLyrics" ${settings.translateLyrics ? "checked" : ""}>
				<span class="rl-lyrics-menu-slider"></span>
			</label>
		</div>
		<div class="rl-lyrics-menu-row rl-language-row"${settings.translateLyrics ? "" : " hidden"}>
			<select class="rl-lyrics-menu-select" data-setting="translateLanguage">
				${TRANSLATE_LANGUAGES.map((l) => `<option value="${l.value}"${settings.translateLanguage === l.value ? " selected" : ""}>${l.label}</option>`).join("")}
			</select>
		</div>
		<div class="rl-lyrics-menu-row" data-ai-feature title="Generates and Re-times lyrics with Sylla AI"${settings.allowAI ? "" : " hidden"}>
			<span class="rl-lyrics-menu-label">Radiant AI</span>
			<label class="rl-lyrics-menu-switch">
				<input type="checkbox" data-setting="radiantAI" ${settings.radiantAI ? "checked" : ""}>
				<span class="rl-lyrics-menu-slider"></span>
			</label>
		</div>
		<div class="rl-lyrics-menu-row rl-style-row">
			<div class="rl-seg-control">
				<button type="button" class="rl-seg-btn${settings.lyricsStyle === 0 ? " rl-seg-active" : ""}" data-style="0">Line</button>
				<button type="button" class="rl-seg-btn${settings.lyricsStyle === 1 ? " rl-seg-active" : ""}" data-style="1">Word</button>
				<button type="button" class="rl-seg-btn${settings.lyricsStyle === 2 ? " rl-seg-active" : ""}" data-style="2">Syllable</button>
			</div>
		</div>
	`;

	// Radiant AI (same as the setting)
	const radiantAICheckbox = dropdown.querySelector(
		'input[data-setting="radiantAI"]',
	) as HTMLInputElement;
	radiantAICheckbox.addEventListener("change", () => {
		settings.radiantAI = radiantAICheckbox.checked;
		(window as any).updateRadiantAISetting?.(radiantAICheckbox.checked);
		updateRadiantAIFromSettings();
	});

	// Romanization (mirrors the Romanize Lyrics setting)
	const romanizeCheckbox = dropdown.querySelector(
		'input[data-setting="romanizeLyrics"]',
	) as HTMLInputElement;
	romanizeCheckbox.addEventListener("change", () => {
		settings.romanizeLyrics = romanizeCheckbox.checked;
		(window as any).updateRomanizeLyricsSetting?.(romanizeCheckbox.checked);
		updateRomanizeLyricsFromSettings();
	});

	// Translate (same as the setting)
	const translateCheckbox = dropdown.querySelector(
		'input[data-setting="translateLyrics"]',
	) as HTMLInputElement;
	translateCheckbox.addEventListener("change", () => {
		settings.translateLyrics = translateCheckbox.checked;
		(window as any).updateTranslateLyricsSetting?.(translateCheckbox.checked);
		updateTranslateLyricsFromSettings();
	});

	// Translation language (same as the setting)
	const languageSelect = dropdown.querySelector(
		'select[data-setting="translateLanguage"]',
	) as HTMLSelectElement;
	languageSelect.addEventListener("change", () => {
		settings.translateLanguage = languageSelect.value;
		(window as any).updateTranslateLanguageSetting?.(languageSelect.value);
		updateTranslateLyricsFromSettings();
	});

	const styleNames = ["Line", "Word", "Syllable"];
	const segButtons = dropdown.querySelectorAll(".rl-seg-btn");
	for (const btn of segButtons) {
		btn.addEventListener("click", (e: Event) => {
			e.stopPropagation();
			const raw = (btn as HTMLElement).dataset.style;
			if (raw === undefined) return;
			const style = Number(raw);
			if (style === settings.lyricsStyle) return;

			settings.lyricsStyle = style;
			for (const b of segButtons) b.classList.remove("rl-seg-active");
			btn.classList.add("rl-seg-active");
			(window as any).updateLyricsStyleSetting?.(style);
			sylLog(`[RL-Syllable] Lyrics style changed to "${styleNames[style]}"`);
			toggle();
		});
	}

	document.body.appendChild(dropdown);
	lyricsMenuEl = dropdown;

	const outsideHandler = (e: MouseEvent): void => {
		const trigger = document.querySelector(".rl-lyrics-menu-trigger");
		if (
			(!trigger || !trigger.contains(e.target as Node)) &&
			!dropdown.contains(e.target as Node)
		) {
			closeLyricsMenu();
		}
	};
	document.addEventListener("click", outsideHandler);

	unloads.add(() => {
		document.removeEventListener("click", outsideHandler);
		document.body.classList.remove("rl-dropdown-open");
		dropdown.remove();
		lyricsMenuEl = null;
		lyricsMenuOpen = false;
	});

	return dropdown;
};

const createLyricsMenu = (): void => {
	const lyricsToggle = document.querySelector(
		'[data-test="toggle-lyrics"]',
	) as HTMLElement;
	if (!lyricsToggle) return;
	// No API = nothing in the menu works
	if (!settings.lyricsApi) return;
	if (lyricsToggle.querySelector(".rl-lyrics-menu-trigger")) return;

	ensureLyricsMenu();

	const trigger = document.createElement("div");
	trigger.className = "rl-lyrics-menu-trigger";
	trigger.setAttribute("title", LYRICS_MENU_TIP);
	trigger.innerHTML = LYRICS_MENU_ICON;

	for (const evtName of [
		"pointerdown",
		"pointerup",
		"mousedown",
		"mouseup",
	] as const) {
		trigger.addEventListener(
			evtName,
			(e: Event) => {
				e.stopPropagation();
			},
			true,
		);
	}

	trigger.addEventListener(
		"click",
		(e: MouseEvent) => {
			e.stopPropagation();
			const isActive = lyricsToggle.getAttribute("aria-pressed") === "true";
			if (!isActive) {
				lyricsToggle.click();
				safeTimeout(unloads, () => openLyricsMenu(lyricsToggle), 150);
				return;
			}
			if (lyricsMenuOpen) {
				closeLyricsMenu();
			} else {
				openLyricsMenu(lyricsToggle);
			}
		},
		true,
	);

	lyricsToggle.appendChild(trigger);
	syncAiIndicator();

	if (lyricsMenuOpen) {
		positionDropdown();
	}
};

// Nav for injected lyrics tab
const syncNativeLyricsAvailability = (): void => {
	if (!syntheticNativeLyrics) return;
	notifyNativeLyricsStateChanged();
};

// Track change sequencing (used by onTrackChange)
let isTrackChangeRunning = false;
let trackChangeRunSeq = 0;

// Observer: create dropdown when lyrics toggle appears & detect track changes
function setupLyricsMenuObserver(): void {
	// Create dropdown if lyrics toggle already exists
	const existing = document.querySelector('[data-test="toggle-lyrics"]');
	if (existing && !existing.querySelector(".rl-lyrics-menu-trigger")) {
		createLyricsMenu();
	}

	// Re-create dropdown whenever lyrics toggle reappears
	observe<HTMLElement>(unloads, '[data-test="toggle-lyrics"]', () => {
		const toggle = document.querySelector('[data-test="toggle-lyrics"]');
		syncNativeLyricsAvailability();
		if (toggle && !toggle.querySelector(".rl-lyrics-menu-trigger")) {
			createLyricsMenu();
		}
	});

	// Covers remount, move the video over (no refetch)
	observe<HTMLElement>(unloads, ART_TILE_SELECTOR, (tile) => {
		// Identity check, ignores our own video
		if (tile === lastArtworkTile) return;
		lastArtworkTile = tile;
		animatedArtworkLayer?.rebind();
	});
	observe<HTMLElement>(unloads, MINI_ART_SELECTOR, (tile) => {
		if (tile === lastMiniArtworkTile) return;
		lastMiniArtworkTile = tile;
		animatedArtworkLayer?.rebind();
	});

	// Apply word lyrics when lyrics container appears or reappears
	observe<HTMLElement>(unloads, '[data-test="now-playing-lyrics"]', () => {
		if (isTrackChangeRunning) return;
		const panel = getNowPlayingLyricsPanel();
		if (panel?.querySelector(".rl-wbw-container")) return;
		const lyricsContainer = findLyricsContainer();
		if (lyricsContainer?.querySelector(".rl-wbw-container")) return;

		if (lyricsMode === "line-tidal") {
			void reapplyTidalLines();
		} else if (lyricsData) {
			reapplyWordLyrics();
		} else {
			onTrackChange();
		}
	});

}

// track change system (used everywhere)
const trackChangeListeners: (() => void)[] = [];
const onGlobalTrackChange = (listener: () => void): void => {
	trackChangeListeners.push(listener);
};

// MARKER: Syllable Lyrics

type LyricsOverlayMode = "none" | "word" | "line-api" | "line-tidal";

interface TrackInfo {
	trackId: string;
	title: string;
	artist: string;
	isrc?: string;
	album?: string;
}

interface SyntheticNativeLyricsState {
	trackId: string;
	lyricsId: string;
	text: string;
	lrcText: string;
	providerName: string;
	direction: "LEFT_TO_RIGHT" | "RIGHT_TO_LEFT";
	response: LyricsApiResponse;
}

// syllable state
let trackChangeToken = 0;
let lyricsData: WordLine[] | null = null;
let lyricsResponse: LyricsApiResponse | null = null;
let lyricsIsAiGenerated = false;
let aiSynthesisType: "Align" | "Generate" | null = null;
let lyricsMode: LyricsOverlayMode = "none";
let tickLoopUnload: LunaUnload | null = null;
let isActive = false;
let savedTidalClasses: string[] | null = null;
let tidalFollowObserver: MutationObserver | null = null;
let tidalFollowLunaUnload: (() => void) | null = null;
let tidalFollowRebuildPending = false;
let nativeLyricsOverlayInstalled = false;
let originalReduxGetState: (() => ReturnType<typeof redux.store.getState>) | null =
	null;
let syntheticNativeLyrics: SyntheticNativeLyricsState | null = null;
let cachedSyntheticEntry: SyntheticNativeLyricsState | null = null;
let cachedSyntheticEntity: any = null;
let cachedSrcTrackRef: any = null;
let cachedModifiedTrack: any = null;
let cachedSrcTracksSlice: any = null;
let cachedSrcLyricsSlice: any = null;
let cachedOvlTracksSlice: any = null;
let cachedOvlLyricsSlice: any = null;
let cachedSrcEntities: any = null;
let cachedOvlEntities: any = null;
let cachedSrcState: any = null;
let cachedOvlState: any = null;

const isWordMode = (): boolean => lyricsMode === "word";
const getLyricsStyle = (): number => (isWordMode() ? settings.lyricsStyle : 0);

const getNowPlayingLyricsPanel = (): HTMLElement | null =>
	document.querySelector('[data-test="now-playing-lyrics"]') as HTMLElement | null;

// Find the lyrics container (no data-test in new UI)
const findLyricsContainer = (): HTMLElement | null => {
	const line = document.querySelector('span[data-test="lyrics-line"]');
	if (line?.parentElement?.parentElement) {
		return line.parentElement.parentElement as HTMLElement;
	}
	return null;
};

// Is this Tidal line active (_current_ class)
const isTidalSpanActive = (span: HTMLElement): boolean => {
	return Array.from(span.classList).some((c) => c.startsWith("_current_"));
};

const getReduxState = (preferOriginal = false): any => {
	if (preferOriginal && originalReduxGetState) {
		return originalReduxGetState();
	}
	// Read through the real store (Lunar)
	return reduxStore.getState() as any;
};

const getNativeTrackEntity = (trackId: string): any | null =>
	getReduxState(true)?.entities?.tracks?.entities?.[trackId] ?? null;

const trackHasNativeLyrics = (trackId: string): boolean => {
	const rel = getNativeTrackEntity(trackId)?.relationships?.lyrics?.data;
	return Array.isArray(rel) && rel.length > 0;
};

// TIDAL's own synced lyrics (from redux, not the DOM) as rl-api Line shape
// Used as Sylla Align input when RL API has nothing
const getNativeTidalLineLyrics = (trackInfo: TrackInfo): LyricsApiResponse | null => {
	const rel = getNativeTrackEntity(trackInfo.trackId)?.relationships?.lyrics?.data;
	const lyricsId = Array.isArray(rel) ? rel[0]?.id : undefined;
	if (!lyricsId) return null;
	const attrs = getReduxState(true)?.entities?.lyrics?.entities?.[lyricsId]?.attributes;
	const lrc: unknown = attrs?.lrcText;
	if (typeof lrc !== "string" || !lrc.trim()) return null;

	const timed: Array<{ start: number; text: string }> = [];
	for (const raw of lrc.split(/\r?\n/)) {
		const m = raw.match(/^\s*\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
		if (!m) continue;
		timed.push({ start: Number(m[1]) * 60 + Number(m[2]), text: m[3].trim() });
	}
	const data: ApiLine[] = [];
	timed.forEach((line, i) => {
		if (!line.text) return;
		const end = timed[i + 1]?.start ?? line.start + 5;
		data.push({
			text: line.text,
			startTime: line.start,
			duration: Math.max(0, Math.round((end - line.start) * 1000) / 1000),
			endTime: end,
			element: { key: `L${data.length + 1}`, singer: "v1" },
		});
	});
	if (data.length === 0) return null;

	const last = data[data.length - 1];
	return {
		type: "Line",
		data,
		metadata: {
			title: trackInfo.title,
			language: "",
			totalDuration: String(last.endTime),
		},
	};
};

const currentTrackWantsLyricsPanel = (): boolean =>
	(getReduxState()?.settings?.nowPlayingActiveView ?? null) === "lyrics";

const getSyntheticNativeLyricsEntity = (
	entry: SyntheticNativeLyricsState,
) => ({
	id: entry.lyricsId,
	type: "lyrics",
	attributes: {
		text: entry.text,
		lrcText: entry.lrcText,
		technicalStatus: "OK",
		provider: {
			source: "THIRD_PARTY",
			name: entry.providerName,
			commonTrackId: "",
			lyricsId: "",
		},
		direction: entry.direction,
	},
	relationships: {
		owners: {
			links: {
				self: `/lyrics/${entry.lyricsId}/relationships/owners`,
			},
		},
		track: {
			links: {
				self: `/lyrics/${entry.lyricsId}/relationships/track`,
			},
		},
	},
});

const invalidateOverlayCache = (): void => {
	cachedSyntheticEntry = null;
	cachedSyntheticEntity = null;
	cachedSrcTrackRef = null;
	cachedModifiedTrack = null;
	cachedSrcTracksSlice = null;
	cachedSrcLyricsSlice = null;
	cachedOvlTracksSlice = null;
	cachedOvlLyricsSlice = null;
	cachedSrcEntities = null;
	cachedOvlEntities = null;
	cachedSrcState = null;
	cachedOvlState = null;
};

const overlaySyntheticNativeLyricsState = (state: any): any => {
	const entry = syntheticNativeLyrics;
	if (!entry) return state;

	const entities = state?.entities;
	const tracksSlice = entities?.tracks;
	const lyricsSlice = entities?.lyrics;
	if (!tracksSlice?.entities || !lyricsSlice?.entities) return state;

	const existingTrack = tracksSlice.entities[entry.trackId];
	if (!existingTrack) return state;

	const existingRel = existingTrack.relationships?.lyrics?.data;
	if (Array.isArray(existingRel) && existingRel.length > 0) return state;

	if (cachedSyntheticEntry !== entry) {
		cachedSyntheticEntry = entry;
		cachedSyntheticEntity = getSyntheticNativeLyricsEntity(entry);
		cachedSrcTrackRef = null;
	}

	if (cachedSrcTrackRef !== existingTrack) {
		cachedSrcTrackRef = existingTrack;
		cachedModifiedTrack = {
			...existingTrack,
			relationships: {
				...existingTrack.relationships,
				lyrics: {
					...existingTrack.relationships?.lyrics,
					data: [{ id: entry.lyricsId, type: "lyrics" }],
				},
			},
		};
		cachedSrcTracksSlice = null;
	}

	if (cachedSrcTracksSlice !== tracksSlice) {
		cachedSrcTracksSlice = tracksSlice;
		cachedOvlTracksSlice = {
			...tracksSlice,
			entities: { ...tracksSlice.entities, [entry.trackId]: cachedModifiedTrack },
		};
		cachedSrcEntities = null;
	}

	if (cachedSrcLyricsSlice !== lyricsSlice) {
		cachedSrcLyricsSlice = lyricsSlice;
		cachedOvlLyricsSlice = {
			...lyricsSlice,
			ids: lyricsSlice.ids.includes(entry.lyricsId)
				? lyricsSlice.ids
				: [...lyricsSlice.ids, entry.lyricsId],
			entities: { ...lyricsSlice.entities, [entry.lyricsId]: cachedSyntheticEntity },
		};
		cachedSrcEntities = null;
	}

	if (cachedSrcEntities !== entities) {
		cachedSrcEntities = entities;
		cachedOvlEntities = {
			...entities,
			tracks: cachedOvlTracksSlice,
			lyrics: cachedOvlLyricsSlice,
		};
		cachedSrcState = null;
	}

	if (cachedSrcState !== state) {
		cachedSrcState = state;
		cachedOvlState = { ...state, entities: cachedOvlEntities };
	}

	return cachedOvlState ?? state;
};

const installNativeLyricsOverlay = (): boolean => {
	if (nativeLyricsOverlayInstalled) return true;
	// Lunar hands @luna/libs `redux.store` out as a restricted clone so Lunar needs babysitting..
	const rawGetState = reduxStore.getState;
	const original = rawGetState.bind(reduxStore);
	(reduxStore as any).getState = () => overlaySyntheticNativeLyricsState(original());
	if (reduxStore.getState === rawGetState) {
		trace.warn(
			"could not install native lyrics overlay — redux getState is not writable on this client",
		);
		return false;
	}
	originalReduxGetState = original;
	nativeLyricsOverlayInstalled = true;
	unloads.add(() => {
		if (originalReduxGetState) {
			(reduxStore as any).getState = originalReduxGetState;
		}
		nativeLyricsOverlayInstalled = false;
		originalReduxGetState = null;
		syntheticNativeLyrics = null;
		invalidateOverlayCache();
	});
	return true;
};

const setNowPlayingActiveView = (view: string): boolean => {
	const action = redux.actions["settings/SET_NOW_PLAYING_ACTIVE_VIEW"] as
		| ((nextView: string) => unknown)
		| undefined;
	if (typeof action !== "function") return false;
	action(view);
	return true;
};

const notifyNativeLyricsStateChanged = (): void => {
	const currentView = getReduxState()?.settings?.nowPlayingActiveView ?? null;
	if (currentView === "lyrics") {
		if (setNowPlayingActiveView("credits")) {
			safeTimeout(unloads, () => {
				setNowPlayingActiveView("lyrics");
			}, 0);
		}
		return;
	}
	if (typeof currentView === "string" && currentView.length > 0) {
		setNowPlayingActiveView(currentView);
	}
};

const formatLrcTime = (timeSeconds: number): string => {
	const safeSeconds = Number.isFinite(timeSeconds) ? Math.max(0, timeSeconds) : 0;
	const totalMs = Math.round(safeSeconds * 1000);
	const minutes = Math.floor(totalMs / 60000);
	const seconds = Math.floor((totalMs % 60000) / 1000);
	const hundredths = Math.floor((totalMs % 1000) / 10);
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
};

const buildSyntheticLyricsText = (response: LyricsApiResponse): string =>
	response.data
		.map((line) => romanizedText(line))
		.filter((line) => line.trim().length > 0)
		.join("\n");

const buildSyntheticLrcText = (response: LyricsApiResponse): string =>
	response.data
		.map((line) => `[${formatLrcTime(line.startTime)}]${romanizedText(line)}`)
		.join("\n");

const registerSyntheticNativeLyrics = (
	trackInfo: TrackInfo,
	response: LyricsApiResponse,
): boolean => {
	if (!installNativeLyricsOverlay()) return false;
	const track = getNativeTrackEntity(trackInfo.trackId);
	if (!track) return false;

	syntheticNativeLyrics = {
		trackId: trackInfo.trackId,
		lyricsId: `radiant-lyrics-${trackInfo.trackId}`,
		text: buildSyntheticLyricsText(response),
		lrcText: buildSyntheticLrcText(response),
		providerName:
			response.type === "Word" && response._synthesized
				? "Radiant Lyrics (AI)"
				: "Radiant Lyrics",
		direction: "LEFT_TO_RIGHT",
		response,
	};
	invalidateOverlayCache();
	notifyNativeLyricsStateChanged();
	return true;
};

const clearSyntheticNativeLyrics = (): void => {
	if (!syntheticNativeLyrics) return;
	syntheticNativeLyrics = null;
	invalidateOverlayCache();
	notifyNativeLyricsStateChanged();
};

const muteRerenderObserver = (): void => {
	suppressRerenderObserver = true;
	if (rerenderObserverMuteTimeout !== null) {
		window.clearTimeout(rerenderObserverMuteTimeout);
		rerenderObserverMuteTimeout = null;
	}
};

const unmuteRerenderObserverSoon = (): void => {
	if (rerenderObserverMuteTimeout !== null) {
		window.clearTimeout(rerenderObserverMuteTimeout);
	}
	rerenderObserverMuteTimeout = window.setTimeout(() => {
		suppressRerenderObserver = false;
		rerenderObserverMuteTimeout = null;
	}, 0);
};

const runWithMutedRerenderObserver = (fn: () => void): void => {
	muteRerenderObserver();
	try {
		fn();
	} finally {
		unmuteRerenderObserverSoon();
	}
};

const getLyricsRenderHost = (): {
	container: HTMLElement;
	inner: HTMLElement;
} | null => {
	const tidalContainer = findLyricsContainer();
	if (tidalContainer) {
		const innerDiv = tidalContainer.querySelector(":scope > div") as HTMLElement | null;
		if (innerDiv) return { container: tidalContainer, inner: innerDiv };
	}

	const panel = getNowPlayingLyricsPanel();
	if (!panel) return null;

	const mountParent = panel;
	let wrapper = Array.from(mountParent.children).find((el) => {
		if (!(el instanceof HTMLElement) || el.tagName !== "DIV") return false;
		return !Array.from(el.classList).some((cls) => cls.startsWith("os-scrollbar"));
	}) as HTMLElement | null;
	if (!wrapper) {
		wrapper = document.createElement("div");
		wrapper.dataset.rlSyntheticCreated = "true";
		mountParent.insertBefore(wrapper, mountParent.firstChild);
	}

	let host = wrapper.querySelector(":scope > .rl-native-lyrics-host") as
		| HTMLElement
		| null;
	if (!host) {
		host = wrapper.querySelector(':scope > [class*="_content_"]') as
			| HTMLElement
			| null;
		if (!host) {
			host = document.createElement("div");
			host.dataset.rlSyntheticCreated = "true";
			wrapper.appendChild(host);
		}
	}
	host.classList.add("rl-native-lyrics-host");
	host.style.setProperty("display", "block", "important");
	host.style.setProperty("width", "100%", "important");
	host.style.setProperty("box-sizing", "border-box", "important");
	host.style.setProperty("overflow", "visible", "important");

	let inner = host.querySelector(":scope > .rl-native-lyrics-inner") as
		| HTMLElement
		| null;
	if (!inner) {
		inner = Array.from(host.children).find((el) => {
			if (!(el instanceof HTMLElement) || el.tagName !== "DIV") return false;
			return !(el.className || "").toString().includes("_footer_");
		}) as
			| HTMLElement
			| null;
		if (!inner) {
			inner = document.createElement("div");
			inner.dataset.rlSyntheticCreated = "true";
			const footer = host.querySelector(':scope > [class*="_footer_"]');
			if (footer?.parentElement === host) host.insertBefore(inner, footer);
			else host.appendChild(inner);
		}
	}
	inner.classList.add("rl-native-lyrics-inner");
	inner.style.setProperty("display", "block", "important");
	inner.style.setProperty("width", "100%", "important");
	inner.style.setProperty("max-width", "none", "important");
	inner.style.setProperty("box-sizing", "border-box", "important");
	inner.style.setProperty("overflow", "visible", "important");
	inner.style.setProperty("flex", "none", "important");

	return { container: host, inner };
};

interface WordEntry {
	el: HTMLSpanElement;
	start: number; // ms
	end: number; // ms
	duration: number; // ms
}

interface LineEntry {
	el: HTMLElement;
	tidalSpan: HTMLElement | null; // matching tidal span for data-current
	startMs: number; // first word start
	endMs: number; // last word end
	words: WordEntry[];
	bgWords: WordEntry[];
	isBg: boolean; // entirely background/adlib line
	transWords?: TransWordEntry[]; // timed translation words (not in time order)
}

// 0 = not reached, 1 = singing, 2 = done
interface TransWordEntry extends WordEntry {
	state?: 0 | 1 | 2;
}

// Translated words are out of order so each times itself
const syncTranslationWords = (
	line: LineEntry,
	nowMs: number,
	isSyl: boolean,
): void => {
	if (!line.transWords) return;
	const CLS_ACTIVE = isSyl ? "rl-syl-active" : "rl-wbw-active";
	const CLS_FINISHED = isSyl ? "rl-syl-finished" : "rl-wbw-finished";
	for (const w of line.transWords) {
		const state = nowMs >= w.end ? 2 : nowMs >= w.start ? 1 : 0;
		if (w.state === state) continue;
		w.state = state;
		w.el.classList.toggle(CLS_ACTIVE, state === 1);
		w.el.classList.toggle(CLS_FINISHED, state === 2);
		if (isSyl) {
			w.el.style.animation =
				state === 1 ? `rl-wipe ${w.duration}ms linear forwards` : "";
			w.el.style.animationDelay = state === 1 ? `-${nowMs - w.start}ms` : "";
		}
	}
};

let lines: LineEntry[] = [];
let rerenderObserver: MutationObserver | null = null;
let rerenderDebounce: number | null = null;
let suppressRerenderObserver = false;
let rerenderObserverMuteTimeout: number | null = null;
const activeWordEls = new Map<number, HTMLSpanElement | null>();
const activeBgWordEls = new Map<number, HTMLSpanElement | null>();
let activeLineIdxs = new Set<number>();
let primaryLineIdx = -1;
const lineSlideTimers = new Map<number, number>();

const clearLineSlideTimer = (idx: number): void => {
	const timer = lineSlideTimers.get(idx);
	if (timer !== undefined) {
		window.clearTimeout(timer);
		lineSlideTimers.delete(idx);
	}
};

const clearLineSlideTimers = (): void => {
	for (const timer of lineSlideTimers.values()) {
		window.clearTimeout(timer);
	}
	lineSlideTimers.clear();
};

// Defer blur until the first lyric activates each track
let blurActivated = false;

// Scroll sync (unhook on user scroll)
let scrollSynced = true;
let userScrollListener: (() => void) | null = null;
let syncButtonListener: (() => void) | null = null;
let syncButtonEl: HTMLElement | null = null;
let syncButtonObserverUnload: (() => void) | null = null;

/* Stops tidal from thinking RL line changes are User Scrolls (Hides sync button manually until user scrolls) */
const applyScrollOwnerState = (): void => {
	document.body.classList.toggle(
		"rl-owns-lyric-scroll",
		isActive && scrollSynced,
	);
};

const setScrollSynced = (value: boolean): void => {
	scrollSynced = value;
	applyScrollOwnerState();
};

// scroll bounce animation state
let scrollAnimIsAnimating = false;
let scrollAnimPending: {
	parent: HTMLElement;
	refIdx: number;
	target: number;
} | null = null;
let scrollUnlockTimeout: LunaUnload | null = null;
let scrollCleanupTimeout: LunaUnload | null = null;
let animatingEls: HTMLElement[] = [];

const clearScrollAnim = (): void => {
	if (scrollUnlockTimeout) {
		scrollUnlockTimeout();
		scrollUnlockTimeout = null;
	}
	if (scrollCleanupTimeout) {
		scrollCleanupTimeout();
		scrollCleanupTimeout = null;
	}
	for (const el of animatingEls) {
		el.classList.remove("rl-scroll-animate");
		el.style.removeProperty("--rl-scroll-delta");
		el.style.removeProperty("--rl-line-delay");
	}
	animatingEls = [];
	scrollAnimIsAnimating = false;
	scrollAnimPending = null;
};

const applyScrollBounce = (
	scrollParent: HTMLElement,
	referenceIdx: number,
	scrollTarget: number,
): void => {
	// queue if an animation is already running
	if (scrollAnimIsAnimating) {
		scrollAnimPending = {
			parent: scrollParent,
			refIdx: referenceIdx,
			target: scrollTarget,
		};
		return;
	}

	// clear previous animation timeouts
	if (scrollUnlockTimeout) {
		scrollUnlockTimeout();
		scrollUnlockTimeout = null;
	}
	if (scrollCleanupTimeout) {
		scrollCleanupTimeout();
		scrollCleanupTimeout = null;
	}

	// clean up previous animation classes
	for (const el of animatingEls) {
		el.classList.remove("rl-scroll-animate");
		el.style.removeProperty("--rl-scroll-delta");
		el.style.removeProperty("--rl-line-delay");
	}
	animatingEls = [];

	// cancel any in-flight CSS animations
	const container = scrollParent.querySelector(".rl-wbw-container");
	if (container) {
		for (const anim of container.getAnimations({ subtree: true })) {
			if (
				anim instanceof CSSAnimation &&
				anim.animationName === "rl-scroll-bounce"
			) {
				anim.cancel();
			}
		}
	}

	// clamp target to the actual scrollable range (avoid overshoot at bottom of lyrics)
	const maxScroll = scrollParent.scrollHeight - scrollParent.clientHeight;
	const clampedTarget = Math.max(0, Math.min(scrollTarget, maxScroll));
	const delta = clampedTarget - scrollParent.scrollTop;
	if (Math.abs(delta) < 2) {
		scrollTo(scrollParent, { top: clampedTarget, behavior: "instant" });
		return;
	}

	const lookBehind = 5;
	const lookAhead = 20;
	const delayIncrement = 30;
	const start = Math.max(0, referenceIdx - lookBehind);
	const end = Math.min(lines.length, referenceIdx + lookAhead);

	let maxDuration = 0;
	let delayCounter = 0;

	// apply animation classes FIRST (offset elements to starting position)
	for (let i = start; i < end; i++) {
		const el = lines[i].el;
		const delay = i >= referenceIdx ? delayCounter * delayIncrement : 0;

		if (i >= referenceIdx && !el.classList.contains("rl-wbw-spacer")) {
			delayCounter++;
		}

		el.style.setProperty("--rl-scroll-delta", `${delta}px`);
		el.style.setProperty("--rl-line-delay", `${delay}ms`);
		el.classList.add("rl-scroll-animate");
		animatingEls.push(el);

		const duration = 400 + delay;
		if (duration > maxDuration) maxDuration = duration;
	}

	// scroll AFTER classes are applied (invisible because elements are offset by delta)
	scrollAnimIsAnimating = true;
	scrollTo(scrollParent, { top: clampedTarget, behavior: "instant" });

	// unlock animation state after base duration, process pending if queued
	const BASE_DURATION = 400;
	scrollUnlockTimeout = safeTimeout(
		unloads,
		() => {
			scrollAnimIsAnimating = false;
			if (scrollAnimPending) {
				const pending = scrollAnimPending;
				scrollAnimPending = null;
				applyScrollBounce(pending.parent, pending.refIdx, pending.target);
			}
		},
		BASE_DURATION,
	);

	// clean up animation classes after all staggered animations complete
	scrollCleanupTimeout = safeTimeout(
		unloads,
		() => {
			for (const el of animatingEls) {
				el.classList.remove("rl-scroll-animate");
				el.style.removeProperty("--rl-scroll-delta");
				el.style.removeProperty("--rl-line-delay");
			}
			animatingEls = [];
		},
		maxDuration + 50,
	);
};

// scroll lock (for scroll gate)
let scrollParentRef: HTMLElement | null = null;
let savedScrollTo: any = null;
let savedScroll: any = null;
let savedScrollBy: any = null;
let scrollAllowed = false;

// MARKER: Tidal Connect (Casting & Remote Lyrics Syncing)
// Uses Redux to mirror Seek Bar progress because Luna PlayState doesn't track remote playback.
const isRemotePlayback = (state = getReduxState()): boolean => {
	if (state?.activePlayer?.activePlayer === "REMOTE_PLAYBACK") return true;
	return state?.playbackControls?.playbackContext?.playbackSessionId === "tidal-connect";
};

const reduxPlaybackIsPlaying = (state = getReduxState()): boolean => {
	const pc = state?.playbackControls;
	if (!pc) return false;
	if (pc.playbackState === "NOT_PLAYING") return false;
	if (pc.playbackState === "PLAYING") return true;
	const apt = state?.accumulatedPlaybackTime?.playbackState;
	if (apt === "NOT_PLAYING") return false;
	if (apt === "PLAYING") return true;
	// Tidal Connect leaves playbackState on IDLE (that's why using desiredPlaybackState)
	return pc.desiredPlaybackState === "PLAYING";
};

const getPrimaryArtistName = (value: unknown): string => {
	if (!Array.isArray(value) || value.length === 0) return "";
	const first = value[0] as { name?: unknown; artist?: { name?: unknown } } | undefined;
	if (!first) return "";
	if (typeof first.name === "string") return first.name;
	if (typeof first.artist?.name === "string") return first.artist.name;
	return "";
};

const trackInfoFromReduxProductId = (productId: string): TrackInfo | null => {
	const ent = getNativeTrackEntity(productId);
	if (!ent) return null;
	const attr = ent.attributes ?? ent;
	const title = String(attr.title ?? "");
	const artist = String(attr.artist?.name ?? getPrimaryArtistName(attr.artists) ?? "");
	const isrc = attr.isrc ?? undefined;
	const album = attr.album?.title ?? undefined;
	if (!title || !artist) return null;
	return { trackId: productId, title, artist, isrc, album };
};

// MARKER: Playback clock

// Two raw position sources exist and behave very differently per client..
//   PlayState.currentTime -> activePlayer.currentTime
//   playbackControls.latestCurrentTime -> redux mirror

// Electron (official client): activePlayer.currentTime is backed by a media element
// Lunar: audio is decoded natively and activePlayer.currentTime is only refreshed roughly once a second AND isn't monotonic
// So.. pick the clock per client <3
const IS_NATIVE_CLIENT = /TidaLunar/i.test(navigator.userAgent);

// currentTime exists but isn't in luna's typings
const playerCurrentTime = (): number =>
	(PlayState as unknown as { currentTime: number }).currentTime;

// Original interpolation (Electron)
let lastPlayerTime = 0;
let lastPlayerTimeAt = 0;
let wasPlaying = false;

// Remote playback time in seconds (interpolation [Redux playbackControls.latestCurrentTime])
let lastRemotePlayerTime = 0;
let lastRemotePlayerTimeAt = 0;
let wasRemotePlaying = false;

let postTrackChangeResyncTimeout: LunaUnload | null = null;

const getRemotePlaybackMs = (state = getReduxState()): number => {
	const pc = state?.playbackControls;
	const raw = Number(pc?.latestCurrentTime);
	const playerTime = Number.isFinite(raw) ? raw : 0;
	const playing = reduxPlaybackIsPlaying(state);
	const now = performance.now();

	if (playing !== wasRemotePlaying) {
		wasRemotePlaying = playing;
		lastRemotePlayerTimeAt = now;
		lastRemotePlayerTime = playerTime;
		return playerTime * 1000;
	}

	if (playerTime !== lastRemotePlayerTime) {
		lastRemotePlayerTime = playerTime;
		lastRemotePlayerTimeAt = now;
		return playerTime * 1000;
	}

	if (playing && lastRemotePlayerTimeAt > 0) {
		const elapsed = now - lastRemotePlayerTimeAt;
		return lastRemotePlayerTime * 1000 + elapsed;
	}

	return playerTime * 1000;
};

const getLegacyPlaybackMs = (): number => {
	const state = getReduxState();
	if (isRemotePlayback(state)) {
		return getRemotePlaybackMs(state);
	}
	const playerTime = playerCurrentTime();
	const playing = PlayState.playing;
	const now = performance.now();

	// reset interpolation for pause/resume resyncs
	if (playing !== wasPlaying) {
		wasPlaying = playing;
		lastPlayerTimeAt = now;
		lastPlayerTime = playerTime;
		return playerTime * 1000;
	}

	if (playerTime !== lastPlayerTime) {
		lastPlayerTime = playerTime;
		lastPlayerTimeAt = now;
		return playerTime * 1000;
	}

	if (playing && lastPlayerTimeAt > 0) {
		const elapsed = now - lastPlayerTimeAt;
		return lastPlayerTime * 1000 + elapsed;
	}

	return playerTime * 1000;
};

// Monotonic clock (Lunar)

// Never coast further than this past the last raw update.
const MAX_EXTRAPOLATION_MS = 1200;
// Movement larger than this is real seek or track change (not drift)
const SEEK_THRESHOLD_MS = 750;

let clockAnchorMs = 0; // raw source position at the last anchor
let clockAnchorAt = 0; // performance.now() at the last anchor
let clockLastOut = 0; // last value handed to the tick loop
let clockWasPlaying = false;

const nativeRawPlaybackMs = (state = getReduxState()): number => {
	const latest = Number(state?.playbackControls?.latestCurrentTime);
	if (Number.isFinite(latest)) return latest * 1000;
	const current = Number(playerCurrentTime());
	return Number.isFinite(current) ? current * 1000 : 0;
};

const nativeIsPlaying = (state = getReduxState()): boolean =>
	isRemotePlayback(state) ? reduxPlaybackIsPlaying(state) : PlayState.playing;

const getNativePlaybackMs = (): number => {
	const state = getReduxState();
	const raw = nativeRawPlaybackMs(state);
	const playing = nativeIsPlaying(state);
	const now = performance.now();

	// Re-anchor hard on play/pause and on genuine seeks. These *should* surface to the tick loop as a scrub so it resyncs.. maybe.
	if (
		playing !== clockWasPlaying ||
		Math.abs(raw - clockLastOut) > SEEK_THRESHOLD_MS
	) {
		clockWasPlaying = playing;
		clockAnchorMs = raw;
		clockAnchorAt = now;
		clockLastOut = raw;
	} else {
		// Follow the raw source whenever it advances & interpolate between updates
		if (raw !== clockAnchorMs) {
			clockAnchorMs = raw;
			clockAnchorAt = now;
		}
		if (!playing) {
			clockLastOut = clockAnchorMs;
		} else {
			const out = clockAnchorMs + Math.min(now - clockAnchorAt, MAX_EXTRAPOLATION_MS);
			// Stop Sub seek corrections dragging the lyrics backwards (Why Lunar lyrics flickered)
			clockLastOut = Math.max(out, clockLastOut);
		}
	}
	return clockLastOut;
};

const getPlaybackMs = (): number =>
	// Calibration for Lunar (if oneday the audio breaks timings)
	(IS_NATIVE_CLIENT ? getNativePlaybackMs() : getLegacyPlaybackMs()) +
	settings.lyricsOffsetMs;

/** Re Sync Lyrics to getPlaybackMs (PlayState/Redux on Connect). */
const snapPlaybackInterpolationToPlayer = (): void => {
	const state = getReduxState();
	if (IS_NATIVE_CLIENT) {
		clockAnchorMs = nativeRawPlaybackMs(state);
		clockAnchorAt = performance.now();
		clockLastOut = clockAnchorMs;
		clockWasPlaying = nativeIsPlaying(state);
		return;
	}
	if (isRemotePlayback(state)) {
		const pc = state?.playbackControls;
		const raw = Number(pc?.latestCurrentTime);
		lastRemotePlayerTime = Number.isFinite(raw) ? raw : 0;
		lastRemotePlayerTimeAt = performance.now();
		wasRemotePlaying = reduxPlaybackIsPlaying(state);
		return;
	}
	lastPlayerTime = playerCurrentTime();
	lastPlayerTimeAt = performance.now();
	wasPlaying = PlayState.playing;
};

const hasCurrentSyncAnchor = (): boolean =>
	primaryLineIdx >= 0 && primaryLineIdx < lines.length && activeLineIdxs.size > 0;

const clearPostTrackChangeResync = (): void => {
	if (postTrackChangeResyncTimeout) {
		postTrackChangeResyncTimeout();
		postTrackChangeResyncTimeout = null;
	}
};

const scheduleRemoteTrackChangeResync = (attempt = 0): void => {
	clearPostTrackChangeResync();
	postTrackChangeResyncTimeout = safeTimeout(
		unloads,
		() => {
			postTrackChangeResyncTimeout = null;
			if (!isActive || lines.length === 0) return;
			const state = getReduxState();
			if (!isRemotePlayback(state)) return;
			if (!reduxPlaybackIsPlaying(state)) {
				if (attempt < 10) scheduleRemoteTrackChangeResync(attempt + 1);
				return;
			}
			if (!hasCurrentSyncAnchor()) {
				if (attempt < 10) scheduleRemoteTrackChangeResync(attempt + 1);
				return;
			}
			snapPlaybackInterpolationToPlayer();
			resync();
			sylLog("[RL-Syllable] Post-track-change resync");
		},
		150,
	);
};

// get title + artist from media item (Used everywhere now <3)
const getTrackInfo = async (): Promise<TrackInfo | null> => {
	const mi = await MediaItem.fromPlaybackContext();
	if (mi?.tidalItem) {
		const baseTitle = mi.tidalItem.title ?? "";
		const version = mi.tidalItem.version; // REMIX Detection
		const title = version ? `${baseTitle} (${version})` : baseTitle;
		const artist =
			mi.tidalItem.artist?.name ?? getPrimaryArtistName(mi.tidalItem.artists) ?? ""; // REMIX Detection
		const isrc = mi.tidalItem.isrc ?? undefined;
		const trackId = String(mi.tidalItem.id ?? PlayState.playbackContext?.actualProductId ?? "");
		const album = mi.tidalItem.album?.title ?? undefined;

		if (!baseTitle || !artist || !trackId) return null;
		return { trackId, title, artist, isrc, album };
	}

	const state = getReduxState();
	if (isRemotePlayback(state)) {
		const pid = String(state?.playbackControls?.mediaProduct?.productId ?? "");
		if (pid) {
			const fromRedux = trackInfoFromReduxProductId(pid);
			if (fromRedux) return fromRedux;
		}
	}

	return null;
};


// MARKER: Lyrics API Fetching (Caching & Romanization)

// fetch syllables from the API (wiped on track change)
let cachedLyricsKey: string | null = null;
let cachedLyricsData: LyricsApiResponse | null = null;
let cachedTidalRomanizeKey: string | null = null;
let cachedTidalRomanizedLines: string[] | null = null;
const lyricsCacheKey = (title: string, artist: string, isrc?: string): string =>
	`${title}\0${artist}\0${isrc ?? ""}\0${settings.allowAI ? "" : "n"}${settings.romanizeLyrics ? "r" : ""}${settings.translateLyrics ? `t${settings.translateLanguage}` : ""}`;
const fetchLyrics = async (
	title: string,
	artist: string,
	isrc?: string,
): Promise<LyricsApiResponse | null> => {
	const cacheKey = lyricsCacheKey(title, artist, isrc);
	if (cachedLyricsKey === cacheKey) {
		sylLog(`[RL-Syllable] Cache hit for "${title}" by "${artist}"`);
		return cachedLyricsData;
	}

	const data = await fetchLyricsApi(
		title,
		artist,
		isrc,
		settings.romanizeLyrics,
	);
	cachedLyricsKey = cacheKey;
	cachedLyricsData = data;
	return data;
};

const normalizeLineData = (data: ApiLine[]): WordLine[] => {
	return data
		.filter((line) => typeof line.text === "string")
		.map((line, idx) => {
			const startMs = Number.isFinite(line.startTime)
				? Math.max(0, Math.round(line.startTime * 1000))
				: 0;
			const durationMs = Number.isFinite(line.duration)
				? Math.max(0, Math.round(line.duration * 1000))
				: 0;
			const endMs = Number.isFinite(line.endTime)
				? Math.max(startMs, Math.round(line.endTime * 1000))
				: startMs + durationMs;
			const safeSinger = line.element?.singer ?? "v1000";
			const safeKey = line.element?.key ?? `line-${idx}`;
			// Romanization Gate now decides which text to show (romanized or original)
			return {
				text: romanizedText(line),
				startTime: startMs / 1000,
				duration: durationMs / 1000,
				endTime: endMs / 1000,
				syllabus: [
					{
						text: `${line.text} `,
						time: startMs,
						duration: Math.max(1, endMs - startMs),
						isBackground: false,
						romanized: line.romanized ? `${line.romanized} ` : undefined,
					},
				],
				element: {
					key: safeKey,
					singer: safeSinger,
					songPart: line.element?.songPart,
					songPartIndex: line.element?.songPartIndex,
				},
				translation: line.translation ?? null,
				romanized: line.romanized,
			};
		});
};

// Scrapes Tidal Line Texts (For Romanization)
const getTidalLines = (): string[] => {
	const lyricsContainer = findLyricsContainer();
	if (!lyricsContainer) return [];
	const innerDiv = lyricsContainer.querySelector(":scope > div") as HTMLElement;
	if (!innerDiv) return [];

	const spans = Array.from(
		innerDiv.querySelectorAll('span[data-test="lyrics-line"]'),
	) as HTMLElement[];
	return spans
		.map((s) => s.textContent ?? "")
		.filter((text) => text.trim().length > 0);
};

const romanizeLyrics = async (lineTexts: string[]): Promise<string[] | null> => {
	if (!settings.romanizeLyrics || lineTexts.length === 0) return null;

	const cacheKey = `${lineTexts.join("\n")}\0r`;
	if (cachedTidalRomanizeKey === cacheKey && cachedTidalRomanizedLines) {
		return cachedTidalRomanizedLines;
	}

	const romanized = await romanizeLyricsApi(lineTexts);
	if (romanized) {
		cachedTidalRomanizeKey = cacheKey;
		cachedTidalRomanizedLines = romanized;
	}
	return romanized;
};

// strip tidal css classes (prevent conflict)
const hideTidalLyrics = (): boolean => {
	const lyricsContainer = findLyricsContainer();
	if (!lyricsContainer) return !!getLyricsRenderHost();

	// collect _ tidal classes
	const tidalClasses = Array.from(lyricsContainer.classList).filter((c) =>
		c.startsWith("_"),
	);

	if (tidalClasses.length === 0) return true;

	// Save classes on first call (for teardown)
	if (!savedTidalClasses) {
		savedTidalClasses = tidalClasses;
		sylTrace(`Saved Tidal classes: ${savedTidalClasses.join(", ")}`);
	}

	for (const c of tidalClasses) lyricsContainer.classList.remove(c);
	return true;
};

// restore tidal classes (remove our container + cleanup)
const restoreTidalLyrics = (): void => {
	const lyricsContainer = findLyricsContainer();
	if (lyricsContainer) {
		// re-add the exact _ classes
		if (savedTidalClasses) {
			for (const c of savedTidalClasses) {
				if (!lyricsContainer.classList.contains(c)) {
					lyricsContainer.classList.add(c);
				}
			}
			sylTrace(`Restored Tidal classes: ${savedTidalClasses.join(", ")}`);
		}

		lyricsContainer.classList.remove("rl-wbw-active");
		lyricsContainer.style.removeProperty("overflow");

		const innerDiv = lyricsContainer.querySelector(
			":scope > div",
		) as HTMLElement;
		if (innerDiv) {
			innerDiv.style.removeProperty("overflow");
			innerDiv.style.removeProperty("position");
		}

		lyricsContainer
			.querySelectorAll(".rl-wbw-line[data-current]")
			.forEach((el) => {
				el.removeAttribute("data-current");
			});

		lyricsContainer.querySelector(".rl-wbw-container")?.remove();
	}
	getNowPlayingLyricsPanel()?.querySelectorAll(".rl-native-lyrics-inner").forEach((el) => {
		if (!(el instanceof HTMLElement)) return;
		el.querySelector(".rl-wbw-container")?.remove();
		el.classList.remove("rl-native-lyrics-inner");
		el.style.removeProperty("display");
		el.style.removeProperty("width");
		el.style.removeProperty("max-width");
		el.style.removeProperty("box-sizing");
		el.style.removeProperty("overflow");
		el.style.removeProperty("flex");
		if (el.dataset.rlSyntheticCreated === "true") {
			el.remove();
		}
		delete el.dataset.rlSyntheticCreated;
	});
	getNowPlayingLyricsPanel()?.querySelectorAll(".rl-native-lyrics-host").forEach((el) => {
		if (!(el instanceof HTMLElement)) return;
		el.classList.remove("rl-native-lyrics-host", "rl-wbw-active");
		el.style.removeProperty("display");
		el.style.removeProperty("width");
		el.style.removeProperty("box-sizing");
		el.style.removeProperty("overflow");
		if (el.dataset.rlSyntheticCreated === "true") {
			el.remove();
		}
		delete el.dataset.rlSyntheticCreated;
	});
	savedTidalClasses = null;
};

// Duet sides: 2nd singer right, rest left (thx Opus 4.6 <3)
const computeSingerSides = (
	data: WordLine[],
	agents: Record<string, { type: string; name: string; alias: string }>,
): { sides: string[]; isDualSide: boolean } => {
	const sides = new Array<string>(data.length).fill("");
	const personOrder: string[] = [];
	const singerSideMap = new Map<string, string>();

	for (const line of data) {
		const singerId = line.element?.singer;
		if (!singerId || singerSideMap.has(singerId)) continue;

		const agentData = agents[singerId];
		const type = agentData
			? agentData.type
			: singerId === "v1000"
				? "group"
				: singerId === "v2000"
					? "other"
					: "person";

		if (type === "group" || type === "other") {
			singerSideMap.set(singerId, "rl-singer-left");
		} else {
			personOrder.push(singerId);
			singerSideMap.set(
				singerId,
				personOrder.length === 2 ? "rl-singer-right" : "rl-singer-left",
			);
		}
	}

	let rightCount = 0;
	let totalCount = 0;
	for (let i = 0; i < data.length; i++) {
		const singerId = data[i].element?.singer;
		if (!singerId) continue;
		const side = singerSideMap.get(singerId) || "rl-singer-left";
		sides[i] = side;
		totalCount++;
		if (side === "rl-singer-right") rightCount++;
	}

	if (totalCount > 0 && Math.round((rightCount / totalCount) * 100) >= 85) {
		const flip = (s: string) =>
			s === "rl-singer-left"
				? "rl-singer-right"
				: s === "rl-singer-right"
					? "rl-singer-left"
					: s;
		for (let i = 0; i < sides.length; i++) sides[i] = flip(sides[i]);
	}

	const hasLeft = sides.includes("rl-singer-left");
	const hasRight = sides.includes("rl-singer-right");
	return { sides, isDualSide: hasLeft && hasRight };
};

// build word/syllable container over tidal spans
// RTL letters (Hebrew, Arabic, Syriac, Thaana, N'Ko)
const RTL_LETTER = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
// Joined letters (splitting these into spans breaks them)
const JOINING_LETTER =
	/[\u0600-\u074F\u0750-\u077F\u07C0-\u07FF\u0860-\u08FF\u1800-\u18AF\uFB50-\uFDFF\uFE70-\uFEFF]/;

// RTL song = most lines start with RTL letters
const isRtlSong = (texts: string[]): boolean => {
	let rtl = 0;
	let total = 0;
	for (const text of texts) {
		const first = text.match(/\p{L}/u)?.[0];
		if (!first) continue;
		total++;
		if (RTL_LETTER.test(first)) rtl++;
	}
	return total > 0 && rtl * 2 > total;
};

const buildWordSpans = (): {
	lines: LineEntry[];
} => {
	const lines: LineEntry[] = [];
	if (!lyricsData) return { lines };

	const renderHost = getLyricsRenderHost();
	if (!renderHost) return { lines };
	const lyricsContainer = renderHost.container;
	const innerDiv = renderHost.inner;

	// remove existing container
	innerDiv.querySelector(".rl-wbw-container")?.remove();

	// hide tidal spans + take over scroll
	lyricsContainer.classList.add("rl-wbw-active");

	// force overflow visible to fix glow clipping (WIP doesnt work yet)
	lyricsContainer.style.setProperty("overflow", "visible", "important");
	innerDiv.style.setProperty("overflow", "visible", "important");

	// helper for setting !important styles (got sick of pathing all the time)
	const forceStyle = (el: HTMLElement, props: Record<string, string>) => {
		for (const [k, v] of Object.entries(props)) {
			el.style.setProperty(k, v, "important");
		}
	};

	// create lyrics container for word/syllable lines
	const wbwContainer = document.createElement("div");
	wbwContainer.className = "rl-wbw-container";
	if (settings.blurInactive && scrollSynced && blurActivated)
		wbwContainer.classList.add("rl-blur-active");
	if (settings.bubbledLyrics) wbwContainer.classList.add("rl-bubbled");
	if (lyricsIsAiGenerated) wbwContainer.classList.add("rl-ai");
	if (
		isRtlSong(
			lyricsData.map((l) => (l.syllabus ?? []).map((syl) => romanizedText(syl)).join("")),
		)
	)
		wbwContainer.classList.add("rl-rtl");
	const effectiveStyle = getLyricsStyle();
	const allowWordSylStyles = isWordMode();
	// MARKER: Syllable animations (WIP coming soon)
	if (allowWordSylStyles && settings.syllableStyle === 1)
		wbwContainer.classList.add("rl-syl-pop");
	else if (allowWordSylStyles && settings.syllableStyle === 2)
		wbwContainer.classList.add("rl-syl-jump");
	forceStyle(wbwContainer, {
		display: "block",
		width: "100%",
		"box-sizing": "border-box",
		margin: "0",
		padding: "0",
		float: "none",
		flex: "none",
		"column-count": "auto",
		overflow: "visible",
	});

	const contextAware = settings.contextAwareLyrics;
	const agents = lyricsResponse?.metadata?.agents;
	let singerSides: { sides: string[]; isDualSide: boolean } | null = null;

	if (contextAware && agents && Object.keys(agents).length > 0) {
		singerSides = computeSingerSides(lyricsData, agents);
		if (singerSides.isDualSide) {
			wbwContainer.classList.add("rl-dual-side");
		}
	}

	const FONT_STACK =
		'"AbyssFont", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif';

	let lineIndex = 0;
	for (const apiLine of lyricsData) {
		const currentLineIndex = lineIndex++;

		// skip empty/stanza-end lines
		if (!apiLine.syllabus || apiLine.syllabus.length === 0) {
			const spacer = document.createElement("div");
			spacer.className = "rl-wbw-line rl-wbw-spacer";
			forceStyle(spacer, {
				display: "block",
				height: "1rem",
				margin: "0 0 1rem 0",
			});
			wbwContainer.appendChild(spacer);
			continue;
		}

		const lineDiv = document.createElement("div");
		lineDiv.className = "rl-wbw-line";
		forceStyle(lineDiv, {
			display: "block",
			"white-space": "normal",
			"word-spacing": "normal",
			"letter-spacing": "normal",
			"margin-bottom": "2rem",
			"padding-top": "0",
			"padding-bottom": "0",
			"font-size": "calc(40px * var(--rl-font-scale, 1))",
			"font-family": FONT_STACK,
			"font-weight": "700",
			color: "rgba(255, 255, 255, 0.4)",
			overflow: "visible",
			flex: "none",
			"column-count": "auto",
			gap: "0",
			"justify-content": "initial",
			"align-items": "initial",
		});

		// Text picks its own direction (Arabic, Hebrew etc)
		lineDiv.dir = "auto";

		if (contextAware && singerSides) {
			const sideClass = singerSides.sides[currentLineIndex];
			if (sideClass) lineDiv.classList.add(sideClass);
		}

		const lineWords: WordEntry[] = [];
		const lineBgWords: WordEntry[] = [];
		const syllabus = apiLine.syllabus;
		const isSylMode = effectiveStyle === 2;

		const hasBgSyllables = contextAware && syllabus.some((s) => s.isBackground);
		const allAreBg = hasBgSyllables && syllabus.every((s) => s.isBackground);
		const splitBg = hasBgSyllables && !allAreBg;

		let mainContainer: HTMLElement = lineDiv;
		let bgContainer: HTMLElement | null = null;

		if (splitBg) {
			mainContainer = document.createElement("p");
			mainContainer.className = "rl-wbw-main";
			forceStyle(mainContainer, { margin: "0", padding: "0" });
			lineDiv.appendChild(mainContainer);

			bgContainer = document.createElement("p");
			bgContainer.className = "rl-wbw-bg-container";
			forceStyle(bgContainer, { margin: "0" });
			lineDiv.appendChild(bgContainer);
		}

		const WORD_SPAN_STYLE: Record<string, string> = {
			display: "inline-block",
			float: "none",
			flex: "none",
			margin: "0",
			padding: "0",
			"word-spacing": "normal",
			"letter-spacing": "normal",
		};

		const makeSpan = (
			text: string,
			seekMs: number,
			bg: boolean,
			confidence?: number,
		): HTMLSpanElement => {
			const span = document.createElement("span");
			span.className = "rl-wbw-word";
			if (splitBg && bg) {
				span.textContent = text.replace(/[()]/g, "");
			} else {
				span.textContent = text;
			}
			forceStyle(span, WORD_SPAN_STYLE);
			// Feather wipe by AI confidence SUPER WIP
			if (confidence !== undefined) {
				const feather = 0.55 + (1 - Math.max(0, Math.min(1, confidence))) * 1.3;
				span.style.setProperty("--rl-wipe-feather", `${feather.toFixed(2)}em`);
			}
			if (bg) span.classList.add("rl-wbw-bg");
			span.addEventListener("click", () => {
				PlayState.seek(seekMs / 1000);
				if (!PlayState.playing) PlayState.play();
				resync();
			});
			return span;
		};

		const sylDisplay = (s: WordTiming) => romanizedText(s);

		// Group syllables into words (trailing space = boundary)
		const wordGroups: number[][] = [];
		let currentGroup: number[] = [];
		for (let si = 0; si < syllabus.length; si++) {
			currentGroup.push(si);
			const isWordEnd =
				syllabus[si].text !== syllabus[si].text.trimEnd() ||
				si === syllabus.length - 1;
			if (isWordEnd) {
				wordGroups.push(currentGroup);
				currentGroup = [];
			}
		}

		if (effectiveStyle === 0) {
			// Line mode: one span per container, no word split
			const mainSyls = syllabus.filter((s) => !splitBg || !s.isBackground);
			const bgSyls = splitBg ? syllabus.filter((s) => s.isBackground) : [];

			if (mainSyls.length > 0) {
				const text = mainSyls
					.map((s) => sylDisplay(s))
					.join("")
					.trim();
				const first = mainSyls[0];
				const last = mainSyls[mainSyls.length - 1];
				const span = makeSpan(text, first.time, false);
				mainContainer.appendChild(span);
				lineWords.push({
					el: span,
					start: first.time,
					end: last.time + last.duration,
					duration: last.time + last.duration - first.time,
				});
			}
			if (bgSyls.length > 0 && bgContainer) {
				const text = bgSyls
					.map((s) => sylDisplay(s))
					.join("")
					.trim()
					.replace(/[()]/g, "");
				const first = bgSyls[0];
				const last = bgSyls[bgSyls.length - 1];
				const span = makeSpan(text, first.time, true);
				bgContainer.appendChild(span);
				lineBgWords.push({
					el: span,
					start: first.time,
					end: last.time + last.duration,
					duration: last.time + last.duration - first.time,
				});
			}
		} else {
			for (const group of wordGroups) {
				if (!Array.isArray(group) || group.length === 0) continue;
				const firstIndex = group[0];
				const lastIndex = group[group.length - 1];
				const firstSyl = syllabus[firstIndex];
				const lastSyl = syllabus[lastIndex];
				if (!firstSyl || !lastSyl) continue;
				const groupIsBg = splitBg && firstSyl.isBackground;
				const targetContainer = groupIsBg ? bgContainer! : mainContainer;
				const targetWords = groupIsBg ? lineBgWords : lineWords;

				// Arabic etc = one span per word (keeps letters joined)
				const joinsLetters = group.some((si) =>
					JOINING_LETTER.test(syllabus[si]?.text ?? ""),
				);
				if (isSylMode && !joinsLetters) {
					const wordStartMs = firstSyl.time;
					const groupSpans: HTMLSpanElement[] = [];
					// Word wrapper (stops words splitting on resize)
					const wordEl = document.createElement("span");
					wordEl.className = "rl-wbw-syl-group";
					targetContainer.appendChild(wordEl);
					for (const si of group) {
						const syl = syllabus[si];
						if (!syl) continue;
						const span = makeSpan(
							sylDisplay(syl).trimEnd(),
							wordStartMs,
							syl.isBackground,
							syl.confidence,
						);
						span.addEventListener("mouseenter", () => {
							for (const s of groupSpans) s.classList.add("rl-wbw-word-hover");
						});
						span.addEventListener("mouseleave", () => {
							for (const s of groupSpans)
								s.classList.remove("rl-wbw-word-hover");
						});
						groupSpans.push(span);
						wordEl.appendChild(span);
						const entry: WordEntry = {
							el: span,
							start: syl.time,
							end: syl.time + syl.duration,
							duration: syl.duration,
						};
						targetWords.push(entry);
					}
				} else {
					const mergedText = group
						.map((si) => syllabus[si])
						.filter((syl): syl is WordTiming => Boolean(syl))
						.map((syl) => sylDisplay(syl).trimEnd())
						.join("");
					const start = firstSyl.time;
					const end = lastSyl.time + lastSyl.duration;
					const bg = firstSyl.isBackground;
					const span = makeSpan(mergedText, start, bg, firstSyl.confidence);
					targetContainer.appendChild(span);
					const entry: WordEntry = {
						el: span,
						start,
						end,
						duration: end - start,
					};
					targetWords.push(entry);
				}
				targetContainer.appendChild(document.createTextNode(" "));
			}
		}

		// Translation sit above the line
		const lineTransWords: TransWordEntry[] = [];
		if (settings.translateLyrics && needsTranslation(apiLine)) {
			const translationEl = document.createElement("p");
			translationEl.className = "rl-wbw-translation";
			translationEl.dir = "auto";
			forceStyle(translationEl, { margin: "0" });
			// Word/Syllable: translated words light up with their syllable
			const timed = effectiveStyle !== 0 ? apiLine.translationSyllabus : undefined;
			if (timed && timed.length > 0) {
				for (const tw of timed) {
					const span = makeSpan(tw.text.trimEnd(), syllabus[0].time, false);
					translationEl.appendChild(span);
					if (tw.text !== tw.text.trimEnd()) {
						translationEl.appendChild(document.createTextNode(" "));
					}
					lineTransWords.push({
						el: span,
						start: tw.time,
						end: tw.time + tw.duration,
						duration: tw.duration,
					});
				}
			} else {
				translationEl.textContent = apiLine.translation;
			}
			lineDiv.prepend(translationEl);
		}

		wbwContainer.appendChild(lineDiv);

		const allWords = lineWords.length > 0 ? lineWords : lineBgWords;
		if (allWords.length > 0) {
			const firstStart = Math.min(
				lineWords.length > 0 ? lineWords[0].start : Infinity,
				lineBgWords.length > 0 ? lineBgWords[0].start : Infinity,
			);
			const lastEnd = Math.max(
				lineWords.length > 0 ? lineWords[lineWords.length - 1].end : 0,
				lineBgWords.length > 0 ? lineBgWords[lineBgWords.length - 1].end : 0,
			);
			lines.push({
				el: lineDiv,
				tidalSpan: null,
				startMs: firstStart,
				endMs: lastEnd,
				words: allWords,
				bgWords: lineBgWords,
				isBg: allAreBg,
				transWords: lineTransWords,
			});
		}
	}

	// insert spacers between lines with large timing gaps (instrumental breaks)
	for (let i = 0; i < lines.length - 1; i++) {
		const gap = lines[i + 1].startMs - lines[i].endMs;
		if (gap > 2500) {
			const spacer = document.createElement("div");
			spacer.className = "rl-wbw-spacer";
			forceStyle(spacer, {
				display: "block",
				height: "2rem",
				margin: "0 0 1rem 0",
			});
			lines[i].el.after(spacer);
		}
	}

	// match lines to tidal spans by index
	const tidalSpans = Array.from(
		innerDiv.querySelectorAll('span[data-test="lyrics-line"]'),
	) as HTMLElement[];
	for (let i = 0; i < lines.length && i < tidalSpans.length; i++) {
		lines[i].tidalSpan = tidalSpans[i];
	}
	sylTrace(
		`Matched ${Math.min(lines.length, tidalSpans.length)} word/syllable lines to Tidal spans (${lines.length} lines, ${tidalSpans.length} spans)`,
	);

	// append lyrics container (yea ik i was gonan edit tidals but uhh shhhh)
	innerDiv.appendChild(wbwContainer);

	sylTrace(
		`Word-by-word DOM: ${lines.reduce((n, l) => n + l.words.length, 0)} word spans across ${lines.length} lines`,
	);
	return { lines };
};

// Scrapes & Builds Tidal Line Spans (no lines found in API)
const buildTidalLines = (
	romanizedLines: string[] | null = null,
): { lines: LineEntry[] } => {
	const lines: LineEntry[] = [];
	const lyricsContainer = findLyricsContainer();
	if (!lyricsContainer) return { lines };

	const innerDiv = lyricsContainer.querySelector(":scope > div") as HTMLElement;
	if (!innerDiv) return { lines };

	innerDiv.querySelector(".rl-wbw-container")?.remove();
	lyricsContainer.classList.add("rl-wbw-active");
	lyricsContainer.style.setProperty("overflow", "visible", "important");
	innerDiv.style.setProperty("overflow", "visible", "important");

	const forceStyle = (el: HTMLElement, props: Record<string, string>) => {
		for (const [k, v] of Object.entries(props)) {
			el.style.setProperty(k, v, "important");
		}
	};

	const wbwContainer = document.createElement("div");
	wbwContainer.className = "rl-wbw-container";
	if (settings.blurInactive && scrollSynced && blurActivated)
		wbwContainer.classList.add("rl-blur-active");
	if (settings.bubbledLyrics) wbwContainer.classList.add("rl-bubbled");
	forceStyle(wbwContainer, {
		display: "block",
		width: "100%",
		"box-sizing": "border-box",
		margin: "0",
		padding: "0",
		float: "none",
		flex: "none",
		"column-count": "auto",
		overflow: "visible",
	});

	const tidalSpans = Array.from(
		innerDiv.querySelectorAll('span[data-test="lyrics-line"]'),
	) as HTMLElement[];
	const lineTexts: string[] = [];
	let textIdx = 0;
	for (const tidalSpan of tidalSpans) {
		const rawText = tidalSpan.textContent ?? "";
		const text = romanizedText({
			text: rawText,
			romanized: romanizedLines?.[textIdx],
		});
		if (rawText.trim().length > 0) {
			textIdx++;
			lineTexts.push(text);
		}
		if (rawText.trim().length === 0) {
			const spacer = document.createElement("div");
			spacer.className = "rl-wbw-line rl-wbw-spacer";
			forceStyle(spacer, {
				display: "block",
				height: "1rem",
				margin: "0 0 1rem 0",
			});
			wbwContainer.appendChild(spacer);
			continue;
		}

		const lineDiv = document.createElement("div");
		lineDiv.className = "rl-wbw-line";
		forceStyle(lineDiv, {
			display: "block",
			"white-space": "normal",
			"word-spacing": "normal",
			"letter-spacing": "normal",
			"margin-bottom": "2rem",
			"padding-top": "0",
			"padding-bottom": "0",
			"font-size": "calc(40px * var(--rl-font-scale, 1))",
			"font-family":
				'"AbyssFont", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif',
			"font-weight": "700",
			color: "rgba(255, 255, 255, 0.4)",
			overflow: "visible",
			flex: "none",
			"column-count": "auto",
			gap: "0",
			"justify-content": "initial",
			"align-items": "initial",
		});

		// Text picks its own direction (Arabic, Hebrew etc)
		lineDiv.dir = "auto";

		const lineSpan = document.createElement("span");
		lineSpan.className = "rl-wbw-word";
		lineSpan.textContent = text;
		forceStyle(lineSpan, {
			display: "inline-block",
			float: "none",
			flex: "none",
			margin: "0",
			padding: "0",
			"word-spacing": "normal",
			"letter-spacing": "normal",
		});

		lineDiv.appendChild(lineSpan);
		lineDiv.addEventListener("click", () => {
			tidalSpan.click();
			resync();
		});
		wbwContainer.appendChild(lineDiv);
		lines.push({
			el: lineDiv,
			tidalSpan,
			startMs: 0,
			endMs: 0,
			words: [],
			bgWords: [],
			isBg: false,
		});
	}

	if (isRtlSong(lineTexts)) wbwContainer.classList.add("rl-rtl");
	innerDiv.appendChild(wbwContainer);
	return { lines };
};

const stopTidalFollowLoop = (): void => {
	tidalFollowRebuildPending = false;
	if (tidalFollowLunaUnload) {
		tidalFollowLunaUnload();
		tidalFollowLunaUnload = null;
	}
	if (tidalFollowObserver) {
		tidalFollowObserver.disconnect();
		tidalFollowObserver = null;
	}
};

// smthn GPT 5.3 Codex did
const setTidalFallbackLineWordState = (
	lineEl: HTMLElement,
	active: boolean,
): void => {
	const words = lineEl.querySelectorAll(".rl-wbw-word");
	for (const word of words) {
		if (active) {
			word.classList.add("rl-wbw-active");
			word.classList.remove("rl-wbw-finished");
		} else {
			word.classList.remove("rl-wbw-active");
			word.classList.add("rl-wbw-finished");
		}
	}
};

const getActiveWbwContainer = (): HTMLElement | null => {
	const currentLine =
		primaryLineIdx >= 0 && primaryLineIdx < lines.length
			? lines[primaryLineIdx]?.el
			: lines[0]?.el;
	if (currentLine) {
		const container = currentLine.closest(".rl-wbw-container");
		if (container instanceof HTMLElement) return container;
	}
	const container = document.querySelector(".rl-wbw-container");
	return container instanceof HTMLElement ? container : null;
};

const clearInactiveBlurState = (): void => {
	const container = getActiveWbwContainer();
	container?.classList.remove("rl-blur-active");
	for (const line of lines) {
		line.el.classList.remove("rl-pos-1", "rl-pos-2", "rl-pos-3", "rl-gap-hold");
	}
};

const applyInactiveBlurState = (
	activeIndex: number,
	holdLastActive = false,
	activeSet: ReadonlySet<number> | null = null,
): void => {
	if (!settings.blurInactive) return;
	if (!scrollSynced || !blurActivated) {
		clearInactiveBlurState();
		return;
	}
	const container = getActiveWbwContainer();
	container?.classList.add("rl-blur-active");
	for (const line of lines) {
		line.el.classList.remove("rl-pos-1", "rl-pos-2", "rl-pos-3", "rl-gap-hold");
	}
	if (holdLastActive && primaryLineIdx >= 0 && primaryLineIdx < lines.length) {
		lines[primaryLineIdx].el.classList.add("rl-gap-hold");
		return;
	}
	if (activeIndex < 0) return;
	for (let dist = 1; dist <= 3; dist++) {
		const before = activeIndex - dist;
		const after = activeIndex + dist;
		const cls = `rl-pos-${dist}`;
		if (before >= 0 && !activeSet?.has(before)) lines[before].el.classList.add(cls);
		if (after < lines.length && !activeSet?.has(after)) lines[after].el.classList.add(cls);
	}
};

// Reapply active state after a rebuild, without transitions
const applyActiveLineStateNoTransition = (): void => {
	if (primaryLineIdx < 0 || activeLineIdxs.size === 0 || lines.length === 0) return;

	const effectiveStyle = getLyricsStyle();
	const isSyl = effectiveStyle === 2;
	const isLineStyle = effectiveStyle === 0;
	const CLS_ACTIVE = isSyl ? "rl-syl-active" : "rl-wbw-active";
	const CLS_FINISHED = isSyl ? "rl-syl-finished" : "rl-wbw-finished";

	// Mark words on past lines as finished (they render unstyled otherwise)
	for (let li = 0; li < primaryLineIdx && li < lines.length; li++) {
		for (const w of lines[li].words) w.el.classList.add(CLS_FINISHED);
		for (const w of lines[li].bgWords) w.el.classList.add(CLS_FINISHED);
	}

	// Apply active-line classes with transitions suppressed
	for (const idx of activeLineIdxs) {
		if (idx >= lines.length) continue;
		const el = lines[idx].el;
		el.style.setProperty("transition", "none", "important");
		el.classList.add("rl-wbw-line-active");
		el.classList.remove("rl-pos-1", "rl-pos-2", "rl-pos-3");
		el.setAttribute("data-current", "true");
	}

	// Restore word state so the tick loop doesn't flash
	const nowMs = getPlaybackMs();
	activeWordEls.clear();
	activeBgWordEls.clear();

	for (const lineIdx of activeLineIdxs) {
		if (lineIdx >= lines.length) continue;
		const currentLine = lines[lineIdx];
		syncTranslationWords(currentLine, nowMs, isSyl);

		if (isLineStyle) {
			for (const w of currentLine.words) {
				w.el.style.setProperty("transition", "none", "important");
				w.el.classList.add(CLS_ACTIVE);
				activeWordEls.set(lineIdx, w.el);
			}
		} else {
			let activeWordIdx = -1;
			for (let i = currentLine.words.length - 1; i >= 0; i--) {
				if (nowMs >= currentLine.words[i].start) {
					activeWordIdx = i;
					break;
				}
			}
			for (let i = 0; i < currentLine.words.length; i++) {
				const w = currentLine.words[i];
				w.el.style.setProperty("transition", "none", "important");
				if (i < activeWordIdx) {
					w.el.classList.add(CLS_FINISHED);
				} else if (i === activeWordIdx) {
					if (isSyl) {
						const elapsed = nowMs - w.start;
						if (elapsed >= w.duration) {
							w.el.classList.add(CLS_FINISHED);
						} else {
							w.el.classList.add("rl-syl-active");
							w.el.style.animation = `rl-wipe ${w.duration}ms linear forwards`;
							w.el.style.animationDelay = `-${elapsed}ms`;
						}
					} else {
						w.el.classList.add(CLS_ACTIVE);
					}
					activeWordEls.set(lineIdx, w.el);
				}
			}

			// Background words
			let activeBgIdx = -1;
			for (let i = currentLine.bgWords.length - 1; i >= 0; i--) {
				if (nowMs >= currentLine.bgWords[i].start) {
					activeBgIdx = i;
					break;
				}
			}
			for (let i = 0; i < currentLine.bgWords.length; i++) {
				const w = currentLine.bgWords[i];
				w.el.style.setProperty("transition", "none", "important");
				if (i < activeBgIdx) {
					w.el.classList.add(CLS_FINISHED);
				} else if (i === activeBgIdx) {
					if (isSyl) {
						const elapsed = nowMs - w.start;
						if (elapsed >= w.duration) {
							w.el.classList.add(CLS_FINISHED);
						} else {
							w.el.classList.add("rl-syl-active");
							w.el.style.animation = `rl-wipe ${w.duration}ms linear forwards`;
							w.el.style.animationDelay = `-${elapsed}ms`;
						}
					} else {
						w.el.classList.add(CLS_ACTIVE);
					}
					activeBgWordEls.set(lineIdx, w.el);
				}
			}
		}
	}

	// Force reflow, then restore transitions
	void document.body.offsetHeight;
	for (const line of lines) {
		line.el.style.removeProperty("transition");
		for (const w of line.words) w.el.style.removeProperty("transition");
		for (const w of line.bgWords) w.el.style.removeProperty("transition");
	}

	// Re-apply blur positioning
	if (settings.blurInactive && scrollSynced && blurActivated) {
		applyInactiveBlurState(primaryLineIdx, false, activeLineIdxs);
	}
};

const updateTidalFollowActiveLine = (): void => {
	if (!isActive || lyricsMode !== "line-tidal" || lines.length === 0) return;

	let activeIndex = -1;
	for (let i = 0; i < lines.length; i++) {
		const tidalSpan = lines[i].tidalSpan;
		if (!tidalSpan) continue;
		if (isTidalSpanActive(tidalSpan)) {
			activeIndex = i;
			break;
		}
	}
	if (activeIndex < 0) return;

	const newActiveSet = new Set<number>([activeIndex]);
	for (const idx of activeLineIdxs) {
		if (!newActiveSet.has(idx) && idx < lines.length) {
			lines[idx].el.classList.remove("rl-wbw-line-active");
			lines[idx].el.removeAttribute("data-current");
			setTidalFallbackLineWordState(lines[idx].el, false);
		}
	}

	if (!activeLineIdxs.has(activeIndex)) {
		lines[activeIndex].el.classList.add("rl-wbw-line-active");
		lines[activeIndex].el.classList.remove("rl-pos-1", "rl-pos-2", "rl-pos-3");
		lines[activeIndex].el.setAttribute("data-current", "true");
	}
	setTidalFallbackLineWordState(lines[activeIndex].el, true);

	const prevPrimary = primaryLineIdx;
	primaryLineIdx = activeIndex;
	activeLineIdxs = newActiveSet;

	if (settings.blurInactive && scrollSynced && !blurActivated) {
		blurActivated = true;
	}

	applyInactiveBlurState(activeIndex);

	// Retry hooking the sync button when desynced (no tick loop in line-tidal)
	if (!scrollSynced && !syncButtonEl) {
		hookSyncButton();
	}

	if (activeIndex !== prevPrimary) {
		const newLine = lines[activeIndex];
		const scrollParent = findScroller(newLine.el);
		if (scrollSynced) {
			lockScroll(scrollParent);
			hookUserScroll(scrollParent);
			const lineRect = newLine.el.getBoundingClientRect();
			const parentRect = scrollParent.getBoundingClientRect();
			const targetOffset = parentRect.height * 0.2;
			const scrollTarget =
				scrollParent.scrollTop + (lineRect.top - parentRect.top) - targetOffset;
			const sequential = prevPrimary >= 0;
			if (settings.bubbledLyrics && sequential) {
				applyScrollBounce(scrollParent, activeIndex, scrollTarget);
			} else if (sequential) {
				clearScrollAnim();
				scrollTo(scrollParent, {
					top: Math.max(0, scrollTarget),
					behavior: "smooth",
				});
			} else {
				clearScrollAnim();
				scrollTo(scrollParent, {
					top: Math.max(0, scrollTarget),
					behavior: "instant",
				});
			}
		}
	}
};

const rebuildTidalSpanAttrObservers = (): void => {
	if (tidalFollowObserver) {
		tidalFollowObserver.disconnect();
		tidalFollowObserver = null;
	}

	const lyricsContainer = findLyricsContainer();
	if (!lyricsContainer) return;

	const tidalSpans = lyricsContainer.querySelectorAll(
		'span[data-test="lyrics-line"]',
	);
	if (tidalSpans.length === 0) return;

	tidalFollowObserver = new MutationObserver(() => {
		updateTidalFollowActiveLine();
	});

	for (const span of tidalSpans) {
		tidalFollowObserver.observe(span, {
			attributes: true,
			attributeFilter: ["class"],
		});
	}

	updateTidalFollowActiveLine();
};

const startTidalFollowLoop = (): void => {
	stopTidalFollowLoop();

	rebuildTidalSpanAttrObservers();

	tidalFollowLunaUnload = observe<HTMLElement>(
		unloads,
		'span[data-test="lyrics-line"]',
		() => {
			if (tidalFollowRebuildPending) return;
			tidalFollowRebuildPending = true;
			setTimeout(() => {
				tidalFollowRebuildPending = false;
				rebuildTidalSpanAttrObservers();
			}, 0);
		},
	);
};

// watch for re-renders
const watchForRerender = (): void => {
	unwatchRerender();

	const lyricsContainer =
		getLyricsRenderHost()?.container ?? getNowPlayingLyricsPanel();
	if (!lyricsContainer) return;

	rerenderObserver = new MutationObserver(() => {
		if (suppressRerenderObserver) return;
		if (rerenderDebounce !== null) {
			clearTimeout(rerenderDebounce);
		}
		rerenderDebounce = window.setTimeout(() => {
			rerenderDebounce = null;
			if (!isActive || lyricsMode === "none") return;

			const existing = lyricsContainer.querySelector(".rl-wbw-container");
			if (!existing) {
				sylTrace("Lyrics overlay: re-applying after Tidal re-render");
				runWithMutedRerenderObserver(() => {
					hideTidalLyrics();
					if (lyricsMode === "line-tidal") {
						const result = buildTidalLines(cachedTidalRomanizedLines);
						lines = result.lines;
						applyActiveLineStateNoTransition();
						startTidalFollowLoop();
					} else if (lyricsData) {
						const result = buildWordSpans();
						lines = result.lines;
						applyActiveLineStateNoTransition();
					}
				});
			}
		}, 100);
	});

	rerenderObserver.observe(lyricsContainer, {
		childList: true,
		subtree: true,
	});
};

const unwatchRerender = (): void => {
	if (rerenderDebounce !== null) {
		clearTimeout(rerenderDebounce);
		rerenderDebounce = null;
	}
	if (rerenderObserverMuteTimeout !== null) {
		window.clearTimeout(rerenderObserverMuteTimeout);
		rerenderObserverMuteTimeout = null;
	}
	suppressRerenderObserver = false;
	if (rerenderObserver) {
		rerenderObserver.disconnect();
		rerenderObserver = null;
	}
};

const clearTickLoop = (): void => {
	if (tickLoopUnload !== null) {
		tickLoopUnload();
		tickLoopUnload = null;
	}
};

// teardown (cleanup)
const teardown = (): void => {
	trackChangeToken++;
	clearTickLoop();
	clearPostTrackChangeResync(); // Tidal Connect (see MARKER block)
	stopTidalFollowLoop();
	clearScrollAnim();
	unwatchRerender();
	unhookUserScroll();
	unhookSyncButton();
	unlockScroll();
	scrollSynced = true;
	blurActivated = false;
	isActive = false;
	lyricsMode = "none";
	lyricsData = null;
	lyricsResponse = null;
	lyricsIsAiGenerated = false;
	aiSynthesisType = null;
	syncAiIndicator();
	lines = [];
	activeWordEls.clear();
	activeBgWordEls.clear();
	activeLineIdxs.clear();
	primaryLineIdx = -1;
	clearLineSlideTimers();
	clearSyntheticNativeLyrics();
	restoreTidalLyrics();
	applyScrollOwnerState();
};

// find scrollable parent (don't shift the play queue)
const findScroller = (el: HTMLElement): HTMLElement => {
	const lyricsPanel = el.closest(
		'[data-test="now-playing-lyrics"]',
	) as HTMLElement | null;
	if (lyricsPanel && lyricsPanel.scrollHeight > lyricsPanel.clientHeight) {
		return lyricsPanel;
	}

	const boundary = el.closest('[data-test="new-now-playing"]');
	let parent = el.parentElement;
	while (parent) {
		if (boundary && !boundary.contains(parent)) break;
		const style = window.getComputedStyle(parent);
		const oy = style.overflowY;
		const o = style.overflow;
		const scrollable = oy === "auto" || oy === "scroll" || o === "auto" || o === "scroll";
		if (scrollable || ((oy === "hidden" || o === "hidden") && parent.scrollHeight > parent.clientHeight + 1)) {
			return parent;
		}
		parent = parent.parentElement;
	}
	return lyricsPanel ?? document.documentElement;
};

// Lock scroll parent so tidal can't scroll to line spans
const lockScroll = (parent: HTMLElement): void => {
	if (scrollParentRef === parent) return;
	unlockScroll();

	scrollParentRef = parent;
	savedScrollTo = parent.scrollTo;
	savedScroll = parent.scroll;
	savedScrollBy = parent.scrollBy;

	// scroll gate to stop tidal scrolling to line spans
	const makeGated = (original: any) =>
		function (this: HTMLElement, ...args: unknown[]) {
			if (scrollAllowed || !isActive) {
				original.apply(parent, args);
			}
		};

	parent.scrollTo = makeGated(savedScrollTo);
	parent.scroll = makeGated(savedScroll);
	parent.scrollBy = makeGated(savedScrollBy);

	// gate the scrollTop setter
	const desc = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");
	if (desc?.set && desc.get) {
		const origGet = desc.get;
		const origSet = desc.set;
		Object.defineProperty(parent, "scrollTop", {
			get() {
				return origGet.call(this);
			},
			set(value: number) {
				if (scrollAllowed || !isActive) {
					origSet.call(this, value);
				}
			},
			configurable: true,
		});
	}
};

// Restore original scroll methods
const unlockScroll = (): void => {
	if (!scrollParentRef) return;
	if (savedScrollTo)
		scrollParentRef.scrollTo =
			savedScrollTo as typeof Element.prototype.scrollTo;
	if (savedScroll)
		scrollParentRef.scroll = savedScroll as typeof Element.prototype.scroll;
	if (savedScrollBy)
		scrollParentRef.scrollBy =
			savedScrollBy as typeof Element.prototype.scrollBy;
	// Remove instance-level scrollTop override
	delete (scrollParentRef as any).scrollTop;
	scrollParentRef = null;
	savedScrollTo = null;
	savedScroll = null;
	savedScrollBy = null;
};

// Scroll bypassing scroll lock (probably not the best way to do this)
const scrollTo = (parent: HTMLElement, options: ScrollToOptions): void => {
	scrollAllowed = true;
	parent.scrollTo(options);
	scrollAllowed = false;
};

// Scroll to active line (resync)
const scrollToActiveLine = (): void => {
	if (primaryLineIdx < 0 || primaryLineIdx >= lines.length) return;
	const line = lines[primaryLineIdx];
	const scroller = findScroller(line.el);
	lockScroll(scroller);
	const lineRect = line.el.getBoundingClientRect();
	const parentRect = scroller.getBoundingClientRect();
	const targetOffset = parentRect.height * 0.2;
	const scrollTarget =
		scroller.scrollTop + (lineRect.top - parentRect.top) - targetOffset;
	clearScrollAnim();
	scrollTo(scroller, { top: Math.max(0, scrollTarget), behavior: "instant" });
};

// Resync lyric scroll (scrubbing and lyric jumps)
const resync = (): void => {
	setScrollSynced(true);
	applyInactiveBlurState(primaryLineIdx, activeLineIdxs.size === 0, activeLineIdxs);
	scrollToActiveLine();
	unhookSyncButton();
	sylLog("[RL-Syllable] Scroll resynced");
};

// Hook user scroll
const hookUserScroll = (parent: HTMLElement): void => {
	unhookUserScroll();
	const onUserScroll = () => {
		if (!scrollSynced) return;
		setScrollSynced(false);
		clearScrollAnim();
		if (settings.blurInactive) {
			clearInactiveBlurState();
		}
		hookSyncButton();
		sylLog("[RL-Syllable] User scrolled — auto-scroll unhooked");
	};
	parent.addEventListener("wheel", onUserScroll, { passive: true });
	parent.addEventListener("touchmove", onUserScroll, { passive: true });
	userScrollListener = () => {
		parent.removeEventListener("wheel", onUserScroll);
		parent.removeEventListener("touchmove", onUserScroll);
	};
};

const unhookUserScroll = (): void => {
	if (userScrollListener) {
		userScrollListener();
		userScrollListener = null;
	}
};

// Hook lyric scroll sync button
const SYNC_BTN_SELECTOR = 'div[class*="_syncButton"] button';

const attachSyncButtonHandler = (btn: HTMLElement): void => {
	syncButtonEl = btn;
	const handler = () => resync();
	btn.addEventListener("click", handler);
	syncButtonListener = () => btn.removeEventListener("click", handler);
};

const hookSyncButton = (): void => {
	unhookSyncButton();
	const btn = document.querySelector(SYNC_BTN_SELECTOR) as HTMLElement;
	if (btn) {
		attachSyncButtonHandler(btn);
		return;
	}
	syncButtonObserverUnload = observe<HTMLElement>(
		unloads,
		SYNC_BTN_SELECTOR,
		(el) => {
			if (syncButtonEl) return;
			attachSyncButtonHandler(el);
		},
	);
};

const unhookSyncButton = (): void => {
	if (syncButtonObserverUnload) {
		syncButtonObserverUnload();
		syncButtonObserverUnload = null;
	}
	if (syncButtonListener) {
		syncButtonListener();
		syncButtonListener = null;
		syncButtonEl = null;
	}
};

// Tick Loop: determine active line and word
const startTickLoop = (): void => {
	clearTickLoop();
	applyScrollOwnerState();

	sylLog("[RL-Syllable] Tick loop started");

	let lastLogTime = 0;
	// -1 so the first tick can't be read as a scrub (the guard below checks >= 0)
	let lastTickMs = -1;

	tickLoopUnload = safeInterval(
		unloads,
		() => {
			if (!isActive || lines.length === 0) return;

			const nowMs = getPlaybackMs();
			const effectiveStyle = getLyricsStyle();
			const isSyl = effectiveStyle === 2;
			const isLineStyle = effectiveStyle === 0;
			const CLS_ACTIVE = isSyl ? "rl-syl-active" : "rl-wbw-active";
			const CLS_FINISHED = isSyl ? "rl-syl-finished" : "rl-wbw-finished";

			// scrub/seek detection: time went backward or jumped forward significantly
			const timeDelta = nowMs - lastTickMs;
			const didScrub =
				lastTickMs >= 0 && (timeDelta < -100 || timeDelta > 1000);
			lastTickMs = nowMs;

			if (!isLineStyle && nowMs - lastLogTime >= 1000) {
				lastLogTime = nowMs;
				sylLog(`[RL-Syllable] Playback | ${nowMs.toFixed(0)} ms`);
			}

			// find all active lines (supports overlapping duet/adlib lines)
			const newActiveSet = new Set<number>();
			for (let i = 0; i < lines.length; i++) {
				const lineEnd = lines[i].endMs;
				// skip over background/adlib lines when computing nextStart so main lines
				// stay active while their attached adlibs play (vewy important thx Opus 4.6)
				let nextMainIdx = i + 1;
				while (nextMainIdx < lines.length && lines[nextMainIdx].isBg)
					nextMainIdx++;
				const nextStart =
					nextMainIdx < lines.length ? lines[nextMainIdx].startMs : Infinity;
				const effectiveEnd = Math.max(
					lineEnd,
					Math.min(lineEnd + 2500, nextStart),
				);
				if (nowMs >= lines[i].startMs && nowMs < effectiveEnd) {
					newActiveSet.add(i);
				}
			}
			const newPrimary = newActiveSet.size > 0 ? Math.min(...newActiveSet) : -1;

			// single pass to set correct state for all words (scrub or seek)
			if (didScrub) {
				for (let li = 0; li < lines.length; li++) {
					lines[li].el.classList.remove("rl-line-slide");
					const allEntries =
						lines[li].bgWords.length > 0
							? [...lines[li].words, ...lines[li].bgWords]
							: lines[li].words;
					for (const w of allEntries) {
						if (li < newPrimary) {
							w.el.classList.remove(CLS_ACTIVE);
							if (isSyl) w.el.style.animation = "";
							if (!w.el.classList.contains(CLS_FINISHED))
								w.el.classList.add(CLS_FINISHED);
						} else {
							w.el.classList.remove(CLS_ACTIVE, CLS_FINISHED);
							if (isSyl) w.el.style.animation = "";
						}
					}
				}
				activeWordEls.clear();
				activeBgWordEls.clear();
				for (const idx of activeLineIdxs) {
					if (idx < lines.length) {
						lines[idx].el.classList.remove("rl-wbw-line-active");
						lines[idx].el.removeAttribute("data-current");
					}
				}
				activeLineIdxs.clear();
				primaryLineIdx = -1;
				clearLineSlideTimers();
				const held = document.querySelector(".rl-gap-hold");
				if (held) held.classList.remove("rl-gap-hold");
				sylLog(
					`[RL-Syllable] Scrub detected (${timeDelta > 0 ? "+" : ""}${timeDelta.toFixed(0)} ms) → resync`,
				);
			}

			// deactivate lines no longer active
			for (const idx of activeLineIdxs) {
				if (!newActiveSet.has(idx) && idx < lines.length) {
					lines[idx].el.classList.remove("rl-wbw-line-active");
					lines[idx].el.classList.remove("rl-line-slide");
					clearLineSlideTimer(idx);
					lines[idx].el.removeAttribute("data-current");
					const lastWord = activeWordEls.get(idx);
					if (lastWord) {
						lastWord.classList.remove(CLS_ACTIVE);
						if (isSyl) lastWord.style.animation = "";
						lastWord.classList.add(CLS_FINISHED);
					}
					const lastBgWord = activeBgWordEls.get(idx);
					if (lastBgWord) {
						lastBgWord.classList.remove(CLS_ACTIVE);
						if (isSyl) lastBgWord.style.animation = "";
						lastBgWord.classList.add(CLS_FINISHED);
					}
					activeWordEls.delete(idx);
					activeBgWordEls.delete(idx);
				}
			}

			// activate newly active lines
			for (const idx of newActiveSet) {
				if (!activeLineIdxs.has(idx)) {
					lines[idx].el.classList.add("rl-wbw-line-active");
					lines[idx].el.classList.remove("rl-pos-1", "rl-pos-2", "rl-pos-3");
					lines[idx].el.setAttribute("data-current", "true");
					if (isLineStyle) {
						lines[idx].el.classList.add("rl-line-slide");
						clearLineSlideTimer(idx);
						const t = window.setTimeout(() => {
							if (idx < lines.length)
								lines[idx].el.classList.remove("rl-line-slide");
							lineSlideTimers.delete(idx);
						}, 360);
						lineSlideTimers.set(idx, t);
					}
					sylLog(
						`[RL-Syllable] Line ${idx} Active "${lines[idx].el.textContent?.slice(0, 40)}" | ${lines[idx].startMs} ms - ${lines[idx].endMs} ms   [${nowMs.toFixed(0)} ms]`,
					);
				}
			}

			// activate blur on first lyric of the track
			if (
				settings.blurInactive &&
				scrollSynced &&
				!blurActivated &&
				newActiveSet.size > 0
			) {
				blurActivated = true;
			}

			// instrumental gaps, keep the last-active line unblurred
			if (settings.blurInactive && newActiveSet.size === 0) {
				applyInactiveBlurState(primaryLineIdx, true, newActiveSet);
			}

			activeLineIdxs = newActiveSet;

			// scroll to primary (topmost) active line
			if (newPrimary !== primaryLineIdx && newPrimary >= 0) {
				const prevPrimary = primaryLineIdx;
				primaryLineIdx = newPrimary;
				const newLine = lines[primaryLineIdx];
				const scrollParent = findScroller(newLine.el);

				if (scrollSynced) {
					lockScroll(scrollParent);
					hookUserScroll(scrollParent);
					const lineRect = newLine.el.getBoundingClientRect();
					const parentRect = scrollParent.getBoundingClientRect();
					const targetOffset = parentRect.height * 0.2;
					const scrollTarget =
						scrollParent.scrollTop +
						(lineRect.top - parentRect.top) -
						targetOffset;
					// only bounce on normal sequential line changes (not scrubs, jumps, or overlapping activations)
					const isSequential =
						!didScrub && prevPrimary >= 0 && newActiveSet.size <= 1;
					if (settings.bubbledLyrics && isSequential) {
						applyScrollBounce(scrollParent, primaryLineIdx, scrollTarget);
					} else if (isSequential) {
						clearScrollAnim();
						scrollTo(scrollParent, {
							top: Math.max(0, scrollTarget),
							behavior: "smooth",
						});
					} else {
						clearScrollAnim();
						scrollTo(scrollParent, {
							top: Math.max(0, scrollTarget),
							behavior: "instant",
						});
					}
				}

				// distance-based blur position classes (skip active lines)
				applyInactiveBlurState(newPrimary, false, newActiveSet);
			}

			// hook lyric scroll sync button
			if (!scrollSynced && !syncButtonEl) {
				hookSyncButton();
			}

			// highlight words in all active lines
			if (activeLineIdxs.size === 0) return;

			for (const lineIdx of activeLineIdxs) {
				const currentLine = lines[lineIdx];
				syncTranslationWords(currentLine, nowMs, isSyl);
				const prevActiveWord = activeWordEls.get(lineIdx) ?? null;

				let activeWordIdx = -1;
				for (let i = currentLine.words.length - 1; i >= 0; i--) {
					if (nowMs >= currentLine.words[i].start) {
						activeWordIdx = i;
						break;
					}
				}

				if (activeWordIdx < 0) continue;
				const word = currentLine.words[activeWordIdx];

				for (let i = 0; i < activeWordIdx; i++) {
					const prev = currentLine.words[i].el;
					if (
						prev.classList.contains(CLS_ACTIVE) ||
						!prev.classList.contains(CLS_FINISHED)
					) {
						prev.classList.remove(CLS_ACTIVE);
						if (isSyl) prev.style.animation = "";
						prev.classList.add(CLS_FINISHED);
					}
				}

				const isStillSinging = isLineStyle
					? activeLineIdxs.has(lineIdx)
					: nowMs <= word.end;
				if (isStillSinging) {
					if (prevActiveWord !== word.el) {
						if (prevActiveWord) {
							prevActiveWord.classList.remove(CLS_ACTIVE);
							if (isSyl) prevActiveWord.style.animation = "";
							prevActiveWord.classList.add(CLS_FINISHED);
						}
						word.el.classList.add(CLS_ACTIVE);
						word.el.classList.remove(CLS_FINISHED);
						if (isSyl) {
							const wipe = `rl-wipe ${word.duration}ms linear forwards`;
							const sylAnim =
								settings.syllableStyle === 1
									? ", rl-pop 0.6s ease-out"
									: settings.syllableStyle === 2
										? ", rl-jump 0.35s ease-out"
										: "";
							word.el.style.animation = wipe + sylAnim;
						}
						activeWordEls.set(lineIdx, word.el);
						if (!isLineStyle) {
							sylLog(
								`[RL-Syllable] Word/Syllable "${word.el.textContent}" | ${word.start} ms - ${word.end} ms   [${nowMs.toFixed(0)} ms]`,
							);
						}
					}
				} else {
					word.el.classList.remove(CLS_ACTIVE);
					if (isSyl) word.el.style.animation = "";
					if (!word.el.classList.contains(CLS_FINISHED)) {
						word.el.classList.add(CLS_FINISHED);
					}
					if (prevActiveWord === word.el) {
						activeWordEls.set(lineIdx, null);
					}
				}

				// highlight bg words independently (adlibs no interfere with main words *angy*)
				const bgWords = currentLine.bgWords;
				if (bgWords.length === 0) continue;
				const prevBgWord = activeBgWordEls.get(lineIdx) ?? null;

				let activeBgIdx = -1;
				for (let i = bgWords.length - 1; i >= 0; i--) {
					if (nowMs >= bgWords[i].start) {
						activeBgIdx = i;
						break;
					}
				}

				if (activeBgIdx < 0) continue;
				const bgWord = bgWords[activeBgIdx];

				for (let i = 0; i < activeBgIdx; i++) {
					const prev = bgWords[i].el;
					if (
						prev.classList.contains(CLS_ACTIVE) ||
						!prev.classList.contains(CLS_FINISHED)
					) {
						prev.classList.remove(CLS_ACTIVE);
						if (isSyl) prev.style.animation = "";
						prev.classList.add(CLS_FINISHED);
					}
				}

				const bgStillSinging = isLineStyle
					? activeLineIdxs.has(lineIdx)
					: nowMs <= bgWord.end;
				if (bgStillSinging) {
					if (prevBgWord !== bgWord.el) {
						if (prevBgWord) {
							prevBgWord.classList.remove(CLS_ACTIVE);
							if (isSyl) prevBgWord.style.animation = "";
							prevBgWord.classList.add(CLS_FINISHED);
						}
						bgWord.el.classList.add(CLS_ACTIVE);
						bgWord.el.classList.remove(CLS_FINISHED);
						if (isSyl) {
							bgWord.el.style.animation = `rl-wipe ${bgWord.duration}ms linear forwards`;
						}
						activeBgWordEls.set(lineIdx, bgWord.el);
					}
				} else {
					bgWord.el.classList.remove(CLS_ACTIVE);
					if (isSyl) bgWord.el.style.animation = "";
					if (!bgWord.el.classList.contains(CLS_FINISHED)) {
						bgWord.el.classList.add(CLS_FINISHED);
					}
					if (prevBgWord === bgWord.el) {
						activeBgWordEls.set(lineIdx, null);
					}
				}
			}
		},
		50,
	);
};

// Changes this close = skipping
const SKIP_WINDOW_MS = 5000;
// Hold the lookup while skipping
const LYRICS_SETTLE_MS = 1500;

// Called by track change or style toggle
const onTrackChange = async (settleMs = 0): Promise<void> => {
	teardown();
	lockFlush();

	const runId = ++trackChangeRunSeq;
	isTrackChangeRunning = true;
	const token = ++trackChangeToken;
	try {
		const trackInfo = await getTrackInfo();
		if (token !== trackChangeToken) return;
		if (!trackInfo) {
			trace.log("could not get track info from playback state");
			setFlushSpinner(false);
			return;
		}
		const nativeHasLyrics = trackHasNativeLyrics(trackInfo.trackId);

		// Can't cancel once sent, so wait first
		if (settleMs > 0) {
			await new Promise<void>((resolve) => safeTimeout(unloads, resolve, settleMs));
			if (token !== trackChangeToken) return;
		}

		sylTrace(
			`RL API: looking up "${trackInfo.title}" by "${trackInfo.artist}"${trackInfo.isrc ? ` (ISRC: ${trackInfo.isrc})` : ""}`,
		);

		const response = await fetchLyrics(
			trackInfo.title,
			trackInfo.artist,
			trackInfo.isrc,
		);
		if (token !== trackChangeToken) return;
		if (!response) {
			trace.log("RL API: no API lyrics available, falling back to TIDAL lines");
			// TIDAL has synced lines: Sylla aligns those, else it generates from scratch
			const tidalSource = getNativeTidalLineLyrics(trackInfo);
			if (tidalSource) sylTrace(`Sylla: using ${tidalSource.data.length} TIDAL lines as align input`);
			const started = tidalSource
				? autoSylla(trackInfo, "align", tidalSource)
				: autoSylla(trackInfo, "gen");
			if (!started) disableFlushNoLyrics();
			const tidalTexts = getTidalLines();
			const romanized = settings.romanizeLyrics
				? await romanizeLyrics(tidalTexts)
				: null;
			if (token !== trackChangeToken) return;
			cachedTidalRomanizedLines = romanized;
			cachedTidalRomanizeKey = settings.romanizeLyrics
				? `${tidalTexts.join("\n")}\0r`
				: null;
			isActive = true;
			lyricsMode = "line-tidal";
			hideTidalLyrics();
			const tidalResult = buildTidalLines(romanized);
			lines = tidalResult.lines;
			if (lines.length === 0) {
				trace.log("No TIDAL lines available yet");
				teardown();
				return;
			}
			watchForRerender();
			startTidalFollowLoop();
			return;
		}

		if (!nativeHasLyrics) {
			const unlocked = registerSyntheticNativeLyrics(trackInfo, response);
			if (!unlocked) {
				trace.warn(
					`RL API: found API lyrics for "${trackInfo.title}" but could not unlock native lyrics state`,
				);
				teardown();
				return;
			}
			sylLog(
				`[RL-Syllable] Registered synthetic native lyrics for "${trackInfo.title}"`,
			);
		}

		sylTrace(`RL API: loaded ${response.data.length} lines`);
		if (settings.translateLyrics && response._translated === false) {
			trace.log(
				`RL API: translation failed${response._translationError ? ` | ${response._translationError}` : ""}`,
			);
		}
		sylLog(
			`[RL-Syllable] Loaded "${trackInfo.title}" by "${trackInfo.artist}" — ${response.data.length} lines`,
		);

		// Line only: Radiant AI retimes
		const aligning = response.type === "Line" && autoSylla(trackInfo, "align", response);
		if (!aligning) unlockFlush();

		// MARKER: Sylla AI lyrics [RL API]
		if (
			response.type === "Word" &&
			response._synthesized &&
			(response._synthesisType === "Align" || response._synthesisType === "Generate")
		) {
			lyricsIsAiGenerated = true;
			aiSynthesisType = response._synthesisType;
			syncAiIndicator();
			sylLog(
				`[RL-Syllable] Sylla ${response._synthesisType} lyrics (${response._modelVersion ?? response._model ?? "?"}, conf ${response._confidence ?? "?"})`,
			);
		}

		lyricsMode = response.type === "Word" ? "word" : "line-api";
		if (token !== trackChangeToken) return;
		lyricsData =
			response.type === "Word"
				? response.data
				: normalizeLineData(response.data);
		lyricsResponse = response;
		isActive = true;
		if (!lyricsData || lyricsData.length === 0) {
			trace.log("Lyrics payload had no usable lines");
			teardown();
			return;
		}

		// Remove Tidal classes
		hideTidalLyrics();

		// Build word spans only once the native panel has mounted.
		const lyricsPanel = getNowPlayingLyricsPanel();
		if (lyricsPanel) {
			const result = buildWordSpans();
			lines = result.lines;
			watchForRerender();
			startTickLoop();
			scheduleRemoteTrackChangeResync(); // Tidal Connect (see MARKER block)
		} else {
			safeTimeout(unloads, () => {
				if (token !== trackChangeToken) return;
				const alreadyOnLyricsTab = currentTrackWantsLyricsPanel();
				syncNativeLyricsAvailability();
				if (!nativeHasLyrics && !alreadyOnLyricsTab) {
					// Track had no native lyrics but API found them
					// force navigate to lyrics view so the panel mounts.
					setNowPlayingActiveView("lyrics");
				}
			}, 0);

			let panelRetries = 0;
			const waitForPanel = (): void => {
				if (token !== trackChangeToken) return;
				const panel = getNowPlayingLyricsPanel();
				if (panel) {
					if (!panel.querySelector(".rl-wbw-container") && lyricsData) {
						hideTidalLyrics();
						const result = buildWordSpans();
						lines = result.lines;
						watchForRerender();
						startTickLoop();
						scheduleRemoteTrackChangeResync(); // Tidal Connect (see MARKER block)
					}
				} else if (++panelRetries < 20) {
					safeTimeout(unloads, waitForPanel, 250);
				}
			};
			safeTimeout(unloads, waitForPanel, 250);
		}
	} finally {
		if (runId === trackChangeRunSeq) {
			isTrackChangeRunning = false;
		}
	}
};

// Reapply word lyrics (for tab switch back)
const reapplyWordLyrics = (): void => {
	if (!lyricsData) return;

	const savedPrimary = primaryLineIdx;
	const savedActive = new Set(activeLineIdxs);

	clearTickLoop();
	clearScrollAnim();
	unwatchRerender();
	unhookUserScroll();
	unhookSyncButton();
	unlockScroll();
	activeWordEls.clear();
	activeBgWordEls.clear();
	activeLineIdxs.clear();
	primaryLineIdx = -1;
	clearLineSlideTimers();

	isActive = true;
	lyricsMode = lyricsMode === "line-api" ? "line-api" : "word";
	hideTidalLyrics();
	const result = buildWordSpans();
	lines = result.lines;

	primaryLineIdx = savedPrimary;
	activeLineIdxs = savedActive;
	applyActiveLineStateNoTransition();

	watchForRerender();
	startTickLoop();
	sylLog("[RL-Syllable] Reapplied word/syllable lyrics (cached)");
};

const reapplyTidalLines = async (): Promise<void> => {
	const savedPrimary = primaryLineIdx;
	const savedActive = new Set(activeLineIdxs);

	clearTickLoop();
	stopTidalFollowLoop();
	clearScrollAnim();
	unwatchRerender();
	unhookUserScroll();
	unhookSyncButton();
	unlockScroll();
	activeWordEls.clear();
	activeBgWordEls.clear();
	activeLineIdxs.clear();
	primaryLineIdx = -1;

	isActive = true;
	lyricsMode = "line-tidal";
	const tidalTexts = getTidalLines();
	const romanized = settings.romanizeLyrics
		? await romanizeLyrics(tidalTexts)
		: null;
	hideTidalLyrics();
	const result = buildTidalLines(romanized);
	lines = result.lines;
	if (lines.length === 0) return;

	primaryLineIdx = savedPrimary;
	activeLineIdxs = savedActive;
	applyActiveLineStateNoTransition();

	watchForRerender();
	startTidalFollowLoop();
	sylLog("[RL-Syllable] Reapplied TIDAL line lyrics (fallback)");
};

// Called by Settings or dropdown
const toggle = (): void => {
	teardown();
	onTrackChange();
};
const updateLyricsStyleFromSettings = (): void => {
	const segButtons = document.querySelectorAll(".rl-seg-btn");
	for (const btn of segButtons) {
		const raw = (btn as HTMLElement).dataset.style;
		if (raw === undefined) continue;
		btn.classList.toggle("rl-seg-active", Number(raw) === settings.lyricsStyle);
	}
	toggle();
};
(window as any).updateLyricsStyle = updateLyricsStyleFromSettings;

// Romanize + translate change the API response (refetch)
const updateLyricsTextMode = (): void => {
	for (const [key, on] of [
		["romanizeLyrics", settings.romanizeLyrics],
		["translateLyrics", settings.translateLyrics],
	] as const) {
		const checkbox = document.querySelector(
			`input[data-setting="${key}"]`,
		) as HTMLInputElement | null;
		if (checkbox) checkbox.checked = on;
	}
	const languageSelect = document.querySelector(
		'select[data-setting="translateLanguage"]',
	) as HTMLSelectElement | null;
	if (languageSelect) languageSelect.value = settings.translateLanguage;
	// Language only matters while translating
	const languageRow = document.querySelector<HTMLElement>(".rl-language-row");
	if (languageRow) languageRow.hidden = !settings.translateLyrics;
	cachedLyricsKey = null;
	cachedLyricsData = null;
	cachedTidalRomanizeKey = null;
	cachedTidalRomanizedLines = null;
	toggle();
};
const updateRomanizeLyricsFromSettings = updateLyricsTextMode;
const updateTranslateLyricsFromSettings = updateLyricsTextMode;
(window as any).updateRomanizeLyrics = updateRomanizeLyricsFromSettings;
(window as any).updateTranslateLyrics = updateTranslateLyricsFromSettings;

// AI Features: show/hide AI stuff (refetch)
const updateAllowAIFromSettings = (): void => {
	const allow = settings.allowAI;
	if (!allow) {
		retimeTrackId = null;
		cancelAutoSylla();
	}
	document.querySelectorAll<HTMLElement>("[data-ai-feature]").forEach((el) => {
		el.hidden = !allow;
	});
	syncAiIndicator();
	sylLog(`[RL-Syllable] AI features ${allow ? "allowed" : "disabled"}`);
	cachedLyricsKey = null;
	cachedLyricsData = null;
	toggle();
};
(window as any).updateAllowAI = updateAllowAIFromSettings;

// Lyrics API: off = TIDAL lyrics only <3
const syncLyricsApi = (): void => {
	document.body.classList.toggle("rl-api-off", !settings.lyricsApi);
	if (settings.lyricsApi) {
		createLyricsMenu();
		return;
	}
	closeLyricsMenu();
	document.querySelector(".rl-lyrics-menu-trigger")?.remove();
};
// Observer makes the menu, just the class here
document.body.classList.toggle("rl-api-off", !settings.lyricsApi);
unloads.add(() => document.body.classList.remove("rl-api-off"));
const updateLyricsApiFromSettings = (): void => {
	syncLyricsApi();
	if (!settings.lyricsApi) {
		retimeTrackId = null;
		cancelAutoSylla();
	}
	autoSyllaTrackId = null;
	cachedLyricsKey = null;
	cachedLyricsData = null;
	cachedTidalRomanizeKey = null;
	cachedTidalRomanizedLines = null;
	syncAiIndicator();
	sylLog(`[RL-Syllable] Lyrics API ${settings.lyricsApi ? "on" : "off"}`);
	toggle();
};
(window as any).updateLyricsApi = updateLyricsApiFromSettings;

// Radiant AI: off drops Sylla lyrics (killswitch)
const updateRadiantAIFromSettings = (): void => {
	const checkbox = document.querySelector(
		'input[data-setting="radiantAI"]',
	) as HTMLInputElement | null;
	if (checkbox) checkbox.checked = settings.radiantAI;
	cancelAutoSylla();
	autoSyllaTrackId = null;
	cachedLyricsKey = null;
	cachedLyricsData = null;
	toggle();
};
(window as any).updateRadiantAI = updateRadiantAIFromSettings;

// Update lyrics on track change (wipe cache for new song)
onGlobalTrackChange(() => {
	const now = Date.now();
	const skipping = now - trackStartedAt < SKIP_WINDOW_MS;
	trackStartedAt = now;
	retimeTrackId = null;
	retiming = false;
	autoSyllaTrackId = null;
	autoSyllaRunning = false;
	resetSyllaJob();
	cachedLyricsKey = null;
	cachedLyricsData = null;
	cachedTidalRomanizeKey = null;
	cachedTidalRomanizedLines = null;
	onTrackChange(skipping ? LYRICS_SETTLE_MS : 0);
});
unloads.add(() => teardown());

// MARKER: Observers

const setupTrackChangeListener = (): void => {
	MediaItem.onMediaTransition(unloads, () => {
		for (const listener of trackChangeListeners) listener();
	});

	// Applies on app reopen (most ppl close the app while smthn playing)
	let hasFiredInitial = false;
	if (PlayState.playbackContext?.actualProductId) {
		hasFiredInitial = true;
		for (const listener of trackChangeListeners) listener();
	}
	if (!hasFiredInitial) {
		PlayState.onState(unloads, (state) => {
			if (hasFiredInitial) return;
			if (state === "PLAYING" && PlayState.playbackContext?.actualProductId) {
				hasFiredInitial = true;
				for (const listener of trackChangeListeners) listener();
			}
		});
	}
};

function setupHeaderObserver(): void {
	const injectButtons = () => {
		if (!document.querySelector(".flush-lyrics-button")) flushBtn();
		if (!document.querySelector(".hide-ui-button")) createHideUIButton();
	};

	if (document.querySelector('[data-test="new-now-playing-close"]')) {
		injectButtons();
	}
	observe<HTMLElement>(unloads, '[data-test="new-now-playing-close"]', injectButtons);
}

// Apply seeker color on track change
onGlobalTrackChange(() => {
	updateCoverArtBackground();
	void updateAnimatedArtwork();
	if (settings.qualityProgressColor) applyQualityProgressColor();
});

// Init observers
setupHeaderObserver();
setupLyricsMenuObserver();
setupTrackChangeListener();
