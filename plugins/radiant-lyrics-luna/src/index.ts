// MARKER: Core Setup
import { type LunaUnload, Tracer } from "@luna/core";
import {
	MediaItem,
	observe,
	PlayState,
	StyleTag,
	safeInterval,
	safeTimeout,
	redux,
} from "@luna/lib";
import { Settings, settings } from "./Settings";

// Interpret integer backgroundScale (e.g., 10=1.0x, 20=2.0x)
const getScaledMultiplier = (): number => {
	const value = settings.backgroundScale;
	return value / 10;
};

import coverEverywhereCss from "file://cover-everywhere.css?minify";
import floatingPlayerBarCss from "file://floating-player-bar.css?minify";
import lyricsGlow from "file://lyrics-glow.css?minify";
import playerBarHidden from "file://player-bar-hidden.css?minify";
// Import CSS files directly using Luna's file:// syntax - Took me a while to figure out <3
import baseStyles from "file://styles.css?minify";

// Core tracer and exports
export const { trace } = Tracer("[Radiant Lyrics]");
export { Settings };

// clean up resources
export const unloads = new Set<LunaUnload>();

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

// Always load lyrics CSS (glow is toggled via .lyrics-glow-disabled class)
lyricsGlowStyleTag.css = lyricsGlow;

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

// Apply inline styles to the player bar (tint + optional radius/spacing customisation)
const applyPlayerBarTintToElement = (): void => {
	const footerPlayer = document.querySelector(
		'[data-test="footer-player"]',
	) as HTMLElement;
	if (!footerPlayer) return;
	const alpha = settings.playerBarTint / 10;
	const { r, g, b } = hexToRgb(settings.playerBarTintColor);
	footerPlayer.style.setProperty(
		"background-color",
		`rgba(${r}, ${g}, ${b}, ${alpha})`,
		"important",
	);
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
};

// When floating is disabled, inject square-bar CSS to override Tidal's native floating styles
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

// Apply floating player bar + tint on load
applyFloatingPlayerBar();
observe<HTMLElement>(unloads, '[data-test="footer-player"]', () => {
	applyPlayerBarTintToElement();
});

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

// Apply base styles always (I kinda dont really remember what this does but it's important i guess)
baseStyleTag.css = baseStyles;

// Update CSS variables for lyrics glow + font scale
const updateRadiantLyricsTextGlow = function (): void {
	const root = document.documentElement;
	if (settings.lyricsGlowEnabled) {
		root.style.setProperty("--rl-glow-outer", `${settings.textGlow}px`);
		root.style.setProperty("--rl-glow-inner", "2px");
		root.classList.remove("lyrics-glow-disabled");
	} else {
		root.style.setProperty("--rl-glow-outer", "0px");
		root.style.setProperty("--rl-glow-inner", "0px");
		root.classList.add("lyrics-glow-disabled");
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

	// Toggle glow via CSS vars + class on :root (always available, no timing issues)
	updateRadiantLyricsTextGlow();
};

// MARKER: UI Visibility Control
// UI state shared across features
let isHidden = false;
let unhideButtonAutoFadeTimeout: number | null = null;

// Helper to safely create a one-off timeout that clears previous if any
const safelySetAutoFadeTimeout = (
	existingId: number | null,
	fn: () => void,
	delay: number,
): number => {
	if (existingId != null) window.clearTimeout(existingId);
	return window.setTimeout(fn, delay);
};

const updateButtonStates = function (): void {
	const hideButton = document.querySelector(".hide-ui-button") as HTMLElement;
	const unhideButton = document.querySelector(
		".unhide-ui-button",
	) as HTMLElement;

	if (hideButton) {
		if (settings.hideUIEnabled && !isHidden) {
			hideButton.style.display = "flex";
			// Small delay to ensure display is set first, then fade in
			safeTimeout(
				unloads,
				() => {
					hideButton.style.opacity = "1";
					hideButton.style.visibility = "visible";
					hideButton.style.pointerEvents = "auto";
				},
				50,
			);
		} else {
			// Hide UI button immediately when clicked - (couldn't get the fade to work)
			hideButton.style.display = "none";
			hideButton.style.opacity = "0";
			hideButton.style.visibility = "hidden";
			hideButton.style.pointerEvents = "none";
		}
	}
	if (unhideButton) {
		// Clear any existing auto-fade timeout
		if (unhideButtonAutoFadeTimeout != null) {
			window.clearTimeout(unhideButtonAutoFadeTimeout);
			unhideButtonAutoFadeTimeout = null;
		}

		if (settings.hideUIEnabled && isHidden) {
			unhideButton.style.display = "flex";
			// Remove the hide-immediately class and let it fade in smoothly
			unhideButton.classList.remove("hide-immediately");
			unhideButton.classList.remove("auto-faded");
			// Small delay to ensure display is set first, then fade in - (Works for unhide button.. but not hide button.. because uhh idk)
			safeTimeout(
				unloads,
				() => {
					unhideButton.style.opacity = "1";
					unhideButton.style.visibility = "visible";
					unhideButton.style.pointerEvents = "auto";

					// Set up auto-fade after 2 seconds
					unhideButtonAutoFadeTimeout = safelySetAutoFadeTimeout(
						unhideButtonAutoFadeTimeout,
						() => {
							if (isHidden && unhideButton && !unhideButton.matches(":hover")) {
								unhideButton.classList.add("auto-faded");
							}
						},
						2000,
					);
				},
				50,
			);
		} else {
			// Smooth fade out for Unhide UI button
			unhideButton.style.opacity = "0";
			unhideButton.style.visibility = "hidden";
			unhideButton.style.pointerEvents = "none";
			unhideButton.classList.remove("auto-faded");
			// Keep display: flex to maintain transitions, then hide after fade
			safeTimeout(
				unloads,
				() => {
					if (unhideButton.style.opacity === "0") {
						unhideButton.style.display = "none";
					}
				},
				500,
			);
		}
	}
};

// Toggle hide/unhide UI
const toggleRadiantLyrics = function (): void {
	const nowPlayingContainer = document.querySelector(
		'[class*="_nowPlayingContainer"]',
	) as HTMLElement;
	if (isHidden) {
		const unhideButton = document.querySelector(
			".unhide-ui-button",
		) as HTMLElement;
		if (unhideButton) unhideButton.classList.add("hide-immediately");
		isHidden = !isHidden;
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
		updateButtonStates();
	} else {
		isHidden = !isHidden;
		updateButtonStates();
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
	}
};

// Create buttons
const createHideUIButton = function (): void {
	safeTimeout(
		unloads,
		() => {
			if (!settings.hideUIEnabled) return;
			const fullscreenButton = document.querySelector(
				'[data-test="new-now-playing-expand"]',
			);
			if (!fullscreenButton || !fullscreenButton.parentElement) {
				safeTimeout(unloads, () => createHideUIButton(), 1000);
				return;
			}
			if (document.querySelector(".hide-ui-button")) return;
			const buttonContainer = fullscreenButton.parentElement;
			const hideUIButton = document.createElement("button");
			hideUIButton.className = "hide-ui-button";
			hideUIButton.setAttribute("aria-label", "Hide UI");
			hideUIButton.setAttribute("title", "Hide UI");
			hideUIButton.textContent = "Hide UI";
			hideUIButton.style.backgroundColor = "#ffffff";
			hideUIButton.style.color = "black";
			hideUIButton.style.border = "none";
			hideUIButton.style.borderRadius = "12px";
			hideUIButton.style.height = "40px";
			hideUIButton.style.padding = "0 12px";
			hideUIButton.style.marginLeft = "8px";
			hideUIButton.style.cursor = "pointer";
			hideUIButton.style.display = "flex";
			hideUIButton.style.alignItems = "center";
			hideUIButton.style.justifyContent = "center";
			hideUIButton.style.fontSize = "12px";
			hideUIButton.style.fontWeight = "600";
			hideUIButton.style.whiteSpace = "nowrap";
			hideUIButton.style.transition =
				"opacity 0.5s ease-in-out, visibility 0.5s ease-in-out, background-color 0.2s ease-in-out";
			hideUIButton.style.opacity = "0";
			hideUIButton.style.visibility = "hidden";
			hideUIButton.style.pointerEvents = "none";
			hideUIButton.addEventListener("mouseenter", () => {
				hideUIButton.style.backgroundColor = "#e5e5e5";
			});
			hideUIButton.addEventListener("mouseleave", () => {
				hideUIButton.style.backgroundColor = "#ffffff";
			});
			hideUIButton.onclick = toggleRadiantLyrics;
			buttonContainer.insertBefore(hideUIButton, fullscreenButton.nextSibling);
			safeTimeout(
				unloads,
				() => {
					if (settings.hideUIEnabled && !isHidden) {
						hideUIButton.style.opacity = "1";
						hideUIButton.style.visibility = "visible";
						hideUIButton.style.pointerEvents = "auto";
					}
				},
				100,
			);
		},
		1000,
	);
};

const createUnhideUIButton = function (): void {
	safeTimeout(
		unloads,
		() => {
			if (!settings.hideUIEnabled) return;
			if (document.querySelector(".unhide-ui-button")) return;
			const nowPlayingContainer = document.querySelector(
				'[class*="_nowPlayingContainer"]',
			) as HTMLElement;
			if (!nowPlayingContainer) {
				safeTimeout(unloads, () => createUnhideUIButton(), 1000);
				return;
			}
			const unhideUIButton = document.createElement("button");
			unhideUIButton.className = "unhide-ui-button";
			unhideUIButton.setAttribute("aria-label", "Unhide UI");
			unhideUIButton.setAttribute("title", "Unhide UI");
			unhideUIButton.textContent = "Unhide";
			unhideUIButton.style.cssText = `position: absolute; top: 10px; right: 10px; background-color: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 12px; height: 40px; padding: 0 12px; cursor: pointer; display: none; align-items: center; justify-content: center; transition: all 0.5s ease-in-out; font-size: 12px; font-weight: 600; white-space: nowrap; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.3); opacity: 0; visibility: hidden; pointer-events: none;`;
			unhideUIButton.addEventListener("mouseenter", () => {
				unhideUIButton.style.backgroundColor = "rgba(255,255,255,0.3)";
				unhideUIButton.style.transform = "scale(1.05)";
				unhideUIButton.classList.remove("auto-faded");
			});
			unhideUIButton.addEventListener("mouseleave", () => {
				unhideUIButton.style.backgroundColor = "rgba(255,255,255,0.2)";
				unhideUIButton.style.transform = "scale(1)";
				safeTimeout(
					unloads,
					() => {
						if (isHidden && !unhideUIButton.matches(":hover")) {
							unhideUIButton.classList.add("auto-faded");
						}
					},
					2000,
				);
			});
			unhideUIButton.onclick = toggleRadiantLyrics;
			nowPlayingContainer.appendChild(unhideUIButton);
			updateButtonStates();
		},
		1500,
	);
};

// MARKER: Background Rendering
// Variable setup
let globalSpinningBgStyleTag: StyleTag | null = null;
let globalBackgroundContainer: HTMLElement | null = null;
let globalBackgroundImage: HTMLImageElement | null = null;
let globalBlackBg: HTMLElement | null = null;
let globalGradientOverlay: HTMLElement | null = null;
let currentGlobalCoverSrc: string | null = null;
let lastUpdateTime = 0;
const getUpdateThrottle = () => (settings.performanceMode ? 1500 : 500);

// Now Playing background caching
let nowPlayingBackgroundContainer: HTMLElement | null = null;
let nowPlayingBackgroundImage: HTMLImageElement | null = null;
let nowPlayingBlackBg: HTMLElement | null = null;
let nowPlayingGradientOverlay: HTMLElement | null = null;
let spinAnimationAdded = false;

// apply scaled pixel sizes to cover art
const applyScaledPixelSize = (img: HTMLImageElement | null): void => {
	if (!img) return;
	const scale = getScaledMultiplier();
	const apply = () => {
		const w = img.naturalWidth;
		const h = img.naturalHeight;
		if (w > 0 && h > 0) {
			const wPx = Math.round(w * scale);
			const hPx = Math.round(h * scale);
			const wStr = `${wPx}px`;
			const hStr = `${hPx}px`;
			if (img.style.width !== wStr) img.style.width = wStr;
			if (img.style.height !== hStr) img.style.height = hStr;
		}
	};
	if (img.complete && img.naturalWidth > 0) {
		apply();
	} else {
		img.addEventListener("load", apply, { once: true });
	}
};

// Update Cover Art background for Now Playing and Global
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

	const coverArtImageElement = document.querySelector(
		'[data-test="current-media-imagery"] img',
	) as HTMLImageElement;
	let coverArtImageSrc: string | null = null;

	if (coverArtImageElement) {
		coverArtImageSrc = coverArtImageElement.src;
		// Use higher resolution for better quality, but consider performance mode
		const targetRes = settings.performanceMode ? "640x640" : "1280x1280";
		coverArtImageSrc = coverArtImageSrc.replace(/\d+x\d+/, targetRes);
		if (coverArtImageElement.src !== coverArtImageSrc) {
			coverArtImageElement.src = coverArtImageSrc;
		}
	} else {
		const videoElement = document.querySelector(
			'[data-test="current-media-imagery"] video',
		) as HTMLVideoElement;
		if (videoElement) {
			coverArtImageSrc = videoElement.getAttribute("poster");
			if (coverArtImageSrc) {
				const targetRes = settings.performanceMode ? "640x640" : "1280x1280";
				coverArtImageSrc = coverArtImageSrc.replace(/\d+x\d+/, targetRes);
			}
		} else {
			cleanUpDynamicArt();
			return;
		}
	}

	// Update backgrounds when we have a valid cover art source
	if (coverArtImageSrc) {
		// Apply global spinning background if enabled
		if (settings.CoverEverywhere) {
			applyGlobalSpinningBackground(coverArtImageSrc);
		}

		// Apply spinning CoverArt background to the Now Playing container - OPTIMIZED
		const nowPlayingContainerElement = document.querySelector(
			'[class*="_nowPlayingContainer"]',
		) as HTMLElement;
		if (nowPlayingContainerElement) {
			// Create DOM structure if it doesn't exist (REUSE ELEMENTS)
			if (
				!nowPlayingBackgroundContainer ||
				!nowPlayingContainerElement.contains(nowPlayingBackgroundContainer)
			) {
				// Clean up any old elements first
				nowPlayingContainerElement
					.querySelectorAll(
						".now-playing-background-image, .now-playing-black-bg, .now-playing-gradient-overlay",
					)
					.forEach((el) => {
						el.remove();
					});

				// Create container
				nowPlayingBackgroundContainer = document.createElement("div");
				nowPlayingBackgroundContainer.className =
					"now-playing-background-container";
				nowPlayingBackgroundContainer.style.cssText = `
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 0;
                    pointer-events: none;
                    overflow: hidden;
                `;
				nowPlayingContainerElement.appendChild(nowPlayingBackgroundContainer);

				// Create black background layer
				nowPlayingBlackBg = document.createElement("div");
				nowPlayingBlackBg.className = "now-playing-black-bg";
				nowPlayingBlackBg.style.cssText = `
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    background: #000;
                    z-index: 0;
                `;
				nowPlayingBackgroundContainer.appendChild(nowPlayingBlackBg);

				// Create image element
				nowPlayingBackgroundImage = document.createElement("img");
				nowPlayingBackgroundImage.className = "now-playing-background-image";
				nowPlayingBackgroundImage.style.cssText = `
                    position: absolute;
                    left: 50%;
                    top: 50%;
                    transform: translate(-50%, -50%);
                    object-fit: cover;
                    z-index: 1;
                    will-change: transform;
                    transform-origin: center center;
                `;
				nowPlayingBackgroundContainer.appendChild(nowPlayingBackgroundImage);

				// Create gradient overlay
				nowPlayingGradientOverlay = document.createElement("div");
				nowPlayingGradientOverlay.className = "now-playing-gradient-overlay";
				nowPlayingGradientOverlay.style.cssText = `
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    background: radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, 0.3) 60%, rgba(0, 0, 0, 0.8) 90%);
                    z-index: 2;
                    pointer-events: none;
                `;
				nowPlayingBackgroundContainer.appendChild(nowPlayingGradientOverlay);
			}

			// Update image source efficiently
			if (
				nowPlayingBackgroundImage &&
				nowPlayingBackgroundImage.src !== coverArtImageSrc
			) {
				nowPlayingBackgroundImage.src = coverArtImageSrc;
			}

			// Apply pixel-based size using intrinsic dimensions
			applyScaledPixelSize(nowPlayingBackgroundImage);

			if (nowPlayingBackgroundImage) {
				const blur = settings.performanceMode
					? Math.min(settings.backgroundBlur, 20)
					: settings.backgroundBlur;
				const contrast = settings.performanceMode
					? Math.min(settings.backgroundContrast, 150)
					: settings.backgroundContrast;
				const radius = `${settings.backgroundRadius}%`;
				if (nowPlayingBackgroundImage.style.borderRadius !== radius)
					nowPlayingBackgroundImage.style.borderRadius = radius;
				const filt = `blur(${blur}px) brightness(${settings.backgroundBrightness / 100}) contrast(${contrast}%)`;
				if (nowPlayingBackgroundImage.style.filter !== filt)
					nowPlayingBackgroundImage.style.filter = filt;
				const anim = settings.spinningArt
					? `spin ${settings.spinSpeed}s linear infinite`
					: "none";
				const wc = settings.spinningArt ? "transform" : "auto";
				if (nowPlayingBackgroundImage.style.animation !== anim)
					nowPlayingBackgroundImage.style.animation = anim;
				if (nowPlayingBackgroundImage.style.willChange !== wc)
					nowPlayingBackgroundImage.style.willChange = wc;
			}

			// Add keyframe animation only once
			if (!spinAnimationAdded) {
				const styleSheet = document.createElement("style");
				styleSheet.id = "spinAnimation";
				styleSheet.textContent = `
                    @keyframes spin {
                        from { transform: translate(-50%, -50%) rotate(0deg); }
                        to { transform: translate(-50%, -50%) rotate(360deg); }
                    }
                `;
				document.head.appendChild(styleSheet);
				spinAnimationAdded = true;
			}
		}
	}
}

// Function to apply spinning background to the entire app (cover everywhere)
const applyGlobalSpinningBackground = (coverArtImageSrc: string): void => {
	const appContainer = document.querySelector(
		'[data-test="main"]',
	) as HTMLElement;

	if (!settings.CoverEverywhere) {
		cleanUpGlobalSpinningBackground();
		return;
	}

	// Only throttle image src updates; style updates below always run for responsiveness
	const now = Date.now();
	const shouldUpdateImageSrc =
		now - lastUpdateTime >= getUpdateThrottle() ||
		currentGlobalCoverSrc !== coverArtImageSrc;
	if (shouldUpdateImageSrc) {
		lastUpdateTime = now;
		currentGlobalCoverSrc = coverArtImageSrc;
	}

	// Add StyleTag if not present
	if (!globalSpinningBgStyleTag) {
		globalSpinningBgStyleTag = new StyleTag(
			"RadiantLyrics-global-spinning-bg",
			unloads,
			coverEverywhereCss,
		);
	}

	if (!appContainer) return;

	// Create container structure if it doesn't exist (REUSE DOM ELEMENTS)
	if (!globalBackgroundContainer) {
		globalBackgroundContainer = document.createElement("div");
		globalBackgroundContainer.className = "global-background-container";
		globalBackgroundContainer.style.cssText = `
            position: fixed;
            left: 0;
            top: 0;
            width: 100vw;
            height: 100vh;
            z-index: -3;
            pointer-events: none;
            overflow: hidden;
        `;
		appContainer.appendChild(globalBackgroundContainer);

		// Create black background layer
		globalBlackBg = document.createElement("div");
		globalBlackBg.className = "global-spinning-black-bg";
		globalBackgroundContainer.appendChild(globalBlackBg);

		// Create image element
		globalBackgroundImage = document.createElement("img");
		globalBackgroundImage.className = "global-spinning-image";
		globalBackgroundImage.style.cssText = `
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            object-fit: cover;
            z-index: -1;
            will-change: transform;
            transform-origin: center center;
        `;
		globalBackgroundContainer.appendChild(globalBackgroundImage);

		// Create gradient overlay
		globalGradientOverlay = document.createElement("div");
		globalGradientOverlay.className = "global-spinning-gradient-overlay";
		globalGradientOverlay.style.cssText = `
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, 0.3) 60%, rgba(0, 0, 0, 0.8) 90%);
            z-index: -1;
            pointer-events: none;
        `;
		globalBackgroundContainer.appendChild(globalGradientOverlay);
	}

	// Ensure gradient overlay exists even if container was pre-existing
	if (!globalGradientOverlay && globalBackgroundContainer) {
		globalGradientOverlay = document.createElement("div");
		globalGradientOverlay.className = "global-spinning-gradient-overlay";
		globalGradientOverlay.style.cssText = `
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle at center, transparent 0%, rgba(0, 0, 0, 0.3) 60%, rgba(0, 0, 0, 0.8) 90%);
            z-index: -1;
            pointer-events: none;
        `;
		globalBackgroundContainer.appendChild(globalGradientOverlay);
	}

	// Update image source efficiently (throttled)
	if (
		shouldUpdateImageSrc &&
		globalBackgroundImage &&
		globalBackgroundImage.src !== coverArtImageSrc
	) {
		globalBackgroundImage.src = coverArtImageSrc;
	}

	if (globalBackgroundImage) {
		applyScaledPixelSize(globalBackgroundImage);
		const blur = settings.performanceMode
			? Math.min(settings.backgroundBlur, 20)
			: settings.backgroundBlur;
		const contrast = settings.performanceMode
			? Math.min(settings.backgroundContrast, 150)
			: settings.backgroundContrast;
		const radius = `${settings.backgroundRadius}%`;
		globalBackgroundImage.style.filter = `blur(${blur}px) brightness(${settings.backgroundBrightness / 100}) contrast(${contrast}%)`;
		if (globalBackgroundImage.style.borderRadius !== radius)
			globalBackgroundImage.style.borderRadius = radius;
		if (settings.spinningArt) {
			globalBackgroundImage.style.animation = `spinGlobal ${settings.spinSpeed}s linear infinite`;
			globalBackgroundImage.style.willChange = "transform";
		} else {
			globalBackgroundImage.style.animation = "none";
			globalBackgroundImage.style.willChange = "auto";
		}
	}
};

// cleanup function
const cleanUpGlobalSpinningBackground = function (): void {
	if (globalBackgroundContainer && globalBackgroundContainer.parentNode) {
		globalBackgroundContainer.parentNode.removeChild(globalBackgroundContainer);
	}
	globalBackgroundContainer = null;
	globalBackgroundImage = null;
	globalBlackBg = null;
	globalGradientOverlay = null;
	currentGlobalCoverSrc = null;

	if (globalSpinningBgStyleTag) {
		globalSpinningBgStyleTag.remove();
		globalSpinningBgStyleTag = null;
	}
};

// Function to update global background when settings change
const updateRadiantLyricsGlobalBackground = function (): void {
	// Apply performance mode class to document body
	if (settings.performanceMode) {
		document.body.classList.add("performance-mode");
	} else {
		document.body.classList.remove("performance-mode");
	}

	if (settings.CoverEverywhere) {
		// Get current cover art and apply global background
		updateCoverArtBackground();
	} else {
		cleanUpGlobalSpinningBackground();
	}
};

// Function to update Now Playing background when settings change
const updateRadiantLyricsNowPlayingBackground = function (): void {
	const nowPlayingBackgroundImages = document.querySelectorAll(
		".now-playing-background-image",
	);
	nowPlayingBackgroundImages.forEach((img: Element) => {
		const imgElement = img as HTMLImageElement;

		// Default values when settings don't affect Now Playing
		const defaultBlur = 80;
		const defaultBrightness = 40;
		const defaultContrast = 120;
		const defaultSpinSpeed = 45;

		let blur: number, brightness: number, contrast: number, spinSpeed: number;

		if (settings.settingsAffectNowPlaying) {
			blur = settings.backgroundBlur;
			brightness = settings.backgroundBrightness;
			contrast = settings.backgroundContrast;
			spinSpeed = settings.spinSpeed;
		} else {
			blur = defaultBlur;
			brightness = defaultBrightness;
			contrast = defaultContrast;
			spinSpeed = defaultSpinSpeed;
		}

		// Apply pixel-based size using intrinsic dimensions and current scale
		applyScaledPixelSize(imgElement);
		const radius = `${settings.backgroundRadius}%`;
		if (imgElement.style.borderRadius !== radius)
			imgElement.style.borderRadius = radius;

		if (settings.performanceMode) {
			blur = Math.min(blur, 20);
			contrast = Math.min(contrast, 150);
		}
		if (settings.spinningArt) {
			imgElement.style.animation = `spin ${spinSpeed}s linear infinite`;
			imgElement.style.willChange = "transform";
		} else {
			imgElement.style.animation = "none";
			imgElement.style.willChange = "auto";
		}
		imgElement.style.filter = `blur(${blur}px) brightness(${brightness / 100}) contrast(${contrast}%)`;
	});
};

// Make these functions available globally so Settings can call them
(window as any).updateRadiantLyricsStyles = updateRadiantLyricsStyles;
(window as any).updateRadiantLyricsGlobalBackground =
	updateRadiantLyricsGlobalBackground;
(window as any).updateRadiantLyricsNowPlayingBackground =
	updateRadiantLyricsNowPlayingBackground;
(window as any).updateRadiantLyricsTextGlow = updateRadiantLyricsTextGlow;
(window as any).updateRadiantLyricsPlayerBarTint =
	updateRadiantLyricsPlayerBarTint;
(window as any).updateQualityProgressColor = applyQualityProgressColor;

const cleanUpDynamicArt = function (): void {
	// Clean up cached Now Playing elements
	if (
		nowPlayingBackgroundContainer &&
		nowPlayingBackgroundContainer.parentNode
	) {
		nowPlayingBackgroundContainer.parentNode.removeChild(
			nowPlayingBackgroundContainer,
		);
	}
	nowPlayingBackgroundContainer = null;
	nowPlayingBackgroundImage = null;
	nowPlayingBlackBg = null;
	nowPlayingGradientOverlay = null;

	// Clean up any remaining elements (fallback)
	const nowPlayingBackgroundImages = document.getElementsByClassName(
		"now-playing-background-image",
	);
	Array.from(nowPlayingBackgroundImages).forEach((element) => {
		element.remove();
	});

	// Clean up spinning background
	cleanUpGlobalSpinningBackground();
};

// I may or may not have forgotten what this does..
document.addEventListener("visibilitychange", () => {
	const isHiddenDoc = document.hidden;
	const images = document.querySelectorAll(
		".global-spinning-image, .now-playing-background-image",
	);
	images.forEach((img) => {
		const el = img as HTMLElement;
		if (isHiddenDoc) {
			// Pause animation but keep state
			if (el.style.animationPlayState !== "paused")
				el.style.animationPlayState = "paused";
			if (el.style.willChange !== "auto") el.style.willChange = "auto";
		} else {
			if (el.style.animationPlayState !== "running")
				el.style.animationPlayState = "running";
			if (
				el.classList.contains("global-spinning-image") ||
				el.classList.contains("now-playing-background-image")
			) {
				if (el.style.willChange !== "transform")
					el.style.willChange = "transform";
			}
		}
	});
});

// Init performance mode
if (settings.performanceMode) {
	document.body.classList.add("performance-mode");
}

// Init text glow
updateRadiantLyricsTextGlow();

// Init global background
updateCoverArtBackground(1);

// Cleanups
unloads.add(() => {
	cleanUpDynamicArt();

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
	}

	// Clean up HideUI button auto-fade timeout
	if (unhideButtonAutoFadeTimeout != null) {
		window.clearTimeout(unhideButtonAutoFadeTimeout);
		unhideButtonAutoFadeTimeout = null;
	}

	// Clean up HideUI button
	const hideButton = document.querySelector(".hide-ui-button");
	if (hideButton && hideButton.parentNode) {
		hideButton.parentNode.removeChild(hideButton);
	}

	const unhideButton = document.querySelector(".unhide-ui-button");
	if (unhideButton && unhideButton.parentNode) {
		unhideButton.parentNode.removeChild(unhideButton);
	}

	// Clean up sticky lyrics elements
	document
		.querySelectorAll(".sticky-lyrics-trigger, .sticky-lyrics-dropdown")
		.forEach((el) => {
			el.remove();
		});

	// Clean up spin animations
	const spinAnimationStyle = document.querySelector("#spinAnimation");
	if (spinAnimationStyle && spinAnimationStyle.parentNode) {
		spinAnimationStyle.parentNode.removeChild(spinAnimationStyle);
	}

	// Clean up spinning background
	cleanUpGlobalSpinningBackground();
});

// MARKER: Sticky Lyrics Feature

const STICKY_ICONS: Record<string, string> = {
	chevron:
		'<svg viewBox="0 0 24 24" width="10" height="10" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M4.29289 8.29289C4.68342 7.90237 5.31658 7.90237 5.70711 8.29289L12 14.5858L18.2929 8.29289C18.6834 7.90237 19.3166 7.90237 19.7071 8.29289C20.0976 8.68342 20.0976 9.31658 19.7071 9.70711L12.7071 16.7071C12.3166 17.0976 11.6834 17.0976 11.2929 16.7071L4.29289 9.70711C3.90237 9.31658 3.90237 8.68342 4.29289 8.29289Z" fill="currentColor"/></svg>',
	sparkle:
		'<svg viewBox="0 0 512 512" width="16" height="16"><path fill="currentColor" d="M208,512a24.84,24.84,0,0,1-23.34-16l-39.84-103.6a16.06,16.06,0,0,0-9.19-9.19L32,343.34a25,25,0,0,1,0-46.68l103.6-39.84a16.06,16.06,0,0,0,9.19-9.19L184.66,144a25,25,0,0,1,46.68,0l39.84,103.6a16.06,16.06,0,0,0,9.19,9.19l103,39.63A25.49,25.49,0,0,1,400,320.52a24.82,24.82,0,0,1-16,22.82l-103.6,39.84a16.06,16.06,0,0,0-9.19,9.19L231.34,496A24.84,24.84,0,0,1,208,512Zm66.85-254.84h0Z"/><path fill="currentColor" d="M88,176a14.67,14.67,0,0,1-13.69-9.4L57.45,122.76a7.28,7.28,0,0,0-4.21-4.21L9.4,101.69a14.67,14.67,0,0,1,0-27.38L53.24,57.45a7.31,7.31,0,0,0,4.21-4.21L74.16,9.79A15,15,0,0,1,86.23.11,14.67,14.67,0,0,1,101.69,9.4l16.86,43.84a7.31,7.31,0,0,0,4.21,4.21L166.6,74.31a14.67,14.67,0,0,1,0,27.38l-43.84,16.86a7.28,7.28,0,0,0-4.21,4.21L101.69,166.6A14.67,14.67,0,0,1,88,176Z"/><path fill="currentColor" d="M400,256a16,16,0,0,1-14.93-10.26l-22.84-59.37a8,8,0,0,0-4.6-4.6l-59.37-22.84a16,16,0,0,1,0-29.86l59.37-22.84a8,8,0,0,0,4.6-4.6L384.9,42.68a16.45,16.45,0,0,1,13.17-10.57,16,16,0,0,1,16.86,10.15l22.84,59.37a8,8,0,0,0,4.6,4.6l59.37,22.84a16,16,0,0,1,0,29.86l-59.37,22.84a8,8,0,0,0-4.6,4.6l-22.84,59.37A16,16,0,0,1,400,256Z"/></svg>',
};

const getStickyIcon = (): string =>
	STICKY_ICONS[settings.stickyLyricsIcon] ?? STICKY_ICONS.chevron;

const applyStickyIcon = (): void => {
	const trigger = document.querySelector(
		".sticky-lyrics-trigger",
	) as HTMLElement;
	if (!trigger) return;
	trigger.innerHTML = getStickyIcon();
	trigger.style.paddingLeft = "5px";
};

// Console: StickyLyrics.icon = "sparkle" or "chevron"
// I'm picky and prefer the Sparkle.. shhh
(window as any).StickyLyrics = {
	get icon() {
		return settings.stickyLyricsIcon;
	},
	set icon(value: string) {
		const key = value.toLowerCase();
		if (!STICKY_ICONS[key]) {
			console.log(
				`[Radiant Lyrics] Unknown icon "${value}". Available: ${Object.keys(STICKY_ICONS).join(", ")}`,
			);
			return;
		}
		settings.stickyLyricsIcon = key;
		applyStickyIcon();
		console.log(`[Radiant Lyrics] Sticky Lyrics icon set to "${key}"`);
	},
};

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

// Called from Settings (mirrors dropdown checkbox)
const updateStickyLyricsFeature = (): void => {
	const checkbox = document.querySelector(
		'input[data-setting="stickyLyrics"]',
	) as HTMLInputElement;
	if (checkbox) checkbox.checked = settings.stickyLyrics;
};
(window as any).updateStickyLyricsFeature = updateStickyLyricsFeature;

let stickyDropdownEl: HTMLElement | null = null;
let stickyDropdownOpen = false;

const positionDropdown = (): void => {
	if (!stickyDropdownEl) return;
	const toggle = document.querySelector('[data-test="toggle-lyrics"]') as HTMLElement;
	if (!toggle) return;
	const rect = toggle.getBoundingClientRect();
	stickyDropdownEl.style.top = `${rect.bottom}px`;
	stickyDropdownEl.style.left = `${rect.left}px`;
	stickyDropdownEl.style.width = `${rect.width}px`;
	stickyDropdownEl.style.display = "block";
};

const openStickyDropdown = (toggle: HTMLElement): void => {
	stickyDropdownOpen = true;
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

const closeStickyDropdown = (): void => {
	stickyDropdownOpen = false;
	document.body.classList.remove("rl-dropdown-open");
	if (stickyDropdownEl) stickyDropdownEl.style.display = "none";
};

const ensureStickyDropdown = (): HTMLElement => {
	if (stickyDropdownEl) return stickyDropdownEl;

	const dropdown = document.createElement("div");
	dropdown.className = "sticky-lyrics-dropdown";
	dropdown.style.display = "none";

	dropdown.innerHTML = `
		<div class="sticky-lyrics-dropdown-row">
			<span class="sticky-lyrics-label">Sticky Lyrics</span>
			<label class="sticky-lyrics-switch">
				<input type="checkbox" data-setting="stickyLyrics" ${settings.stickyLyrics ? "checked" : ""}>
				<span class="sticky-lyrics-slider"></span>
			</label>
		</div>
		<div class="sticky-lyrics-dropdown-row rl-style-row">
			<div class="rl-seg-control">
				<button type="button" class="rl-seg-btn${settings.lyricsStyle === 0 ? " rl-seg-active" : ""}" data-style="0">Line</button>
				<button type="button" class="rl-seg-btn${settings.lyricsStyle === 1 ? " rl-seg-active" : ""}" data-style="1">Word</button>
				<button type="button" class="rl-seg-btn${settings.lyricsStyle === 2 ? " rl-seg-active" : ""}" data-style="2">Syllable</button>
			</div>
		</div>
	`;

	const stickyCheckbox = dropdown.querySelector(
		'input[data-setting="stickyLyrics"]',
	) as HTMLInputElement;
	stickyCheckbox.addEventListener("change", () => {
		settings.stickyLyrics = stickyCheckbox.checked;
		(window as any).updateStickyLyricsSetting?.(stickyCheckbox.checked);
		if (settings.stickyLyrics) {
			handleStickyLyricsTrackChange();
		}
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
	stickyDropdownEl = dropdown;

	const outsideHandler = (e: MouseEvent): void => {
		const trigger = document.querySelector(".sticky-lyrics-trigger");
		if (
			(!trigger || !trigger.contains(e.target as Node)) &&
			!dropdown.contains(e.target as Node)
		) {
			closeStickyDropdown();
		}
	};
	document.addEventListener("click", outsideHandler);

	unloads.add(() => {
		document.removeEventListener("click", outsideHandler);
		document.body.classList.remove("rl-dropdown-open");
		dropdown.remove();
		stickyDropdownEl = null;
		stickyDropdownOpen = false;
	});

	return dropdown;
};

const createStickyLyricsDropdown = (): void => {
	const lyricsToggle = document.querySelector(
		'[data-test="toggle-lyrics"]',
	) as HTMLElement;
	if (!lyricsToggle) return;
	if (lyricsToggle.querySelector(".sticky-lyrics-trigger")) return;

	ensureStickyDropdown();

	const trigger = document.createElement("div");
	trigger.className = "sticky-lyrics-trigger";
	trigger.setAttribute("title", "Sticky Lyrics");
	trigger.innerHTML = getStickyIcon();

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
				safeTimeout(unloads, () => openStickyDropdown(lyricsToggle), 150);
				return;
			}
			if (stickyDropdownOpen) {
				closeStickyDropdown();
			} else {
				openStickyDropdown(lyricsToggle);
			}
		},
		true,
	);

	lyricsToggle.appendChild(trigger);

	if (stickyDropdownOpen) {
		positionDropdown();
	}
};

// Sticky Lyrics nav for injected lyrics tab
const tryActivateStickyLyricsTab = (): boolean => {
	if (!settings.stickyLyrics) return false;

	const lyricsToggle = document.querySelector(
		'[data-test="toggle-lyrics"]',
	) as HTMLElement;
	if (!lyricsToggle || lyricsToggle.getAttribute("aria-disabled") === "true") {
		tryActivateSimilarTracksTab();
		return false;
	}

	if (syntheticNativeLyrics) {
		notifyNativeLyricsStateChanged();
	}

	if (lyricsToggle.getAttribute("aria-pressed") === "true") return true;

	lyricsToggle.click();
	return true;
};

const tryActivateSimilarTracksTab = (): void => {
	const btn = document.querySelector(
		'[data-test="toggle-similar-tracks"]',
	) as HTMLElement;
	if (!btn) return;
	if (btn.getAttribute("aria-pressed") === "true") return;
	btn.click();
};

const syncNativeLyricsAvailability = (): void => {
	if (!syntheticNativeLyrics) return;
	notifyNativeLyricsStateChanged();
};

const handleStickyLyricsTrackChange = (): void => {
	if (!settings.stickyLyrics) return;
	tryActivateStickyLyricsTab();
};

// Track change sequencing (used by onTrackChange)
let isTrackChangeRunning = false;
let trackChangeRunSeq = 0;

// Observer: create dropdown when lyrics toggle appears & detect track changes
function setupStickyLyricsObserver(): void {
	// Create dropdown if lyrics toggle already exists
	const existing = document.querySelector('[data-test="toggle-lyrics"]');
	if (existing && !existing.querySelector(".sticky-lyrics-trigger")) {
		createStickyLyricsDropdown();
	}

	// Re-create dropdown whenever lyrics toggle reappears
	observe<HTMLElement>(unloads, '[data-test="toggle-lyrics"]', () => {
		const toggle = document.querySelector('[data-test="toggle-lyrics"]');
		syncNativeLyricsAvailability();
		if (toggle && !toggle.querySelector(".sticky-lyrics-trigger")) {
			createStickyLyricsDropdown();
			if (settings.stickyLyrics) {
				tryActivateStickyLyricsTab();
			}
		}
	});

	// When lyrics toggle becomes disabled → similar tracks; enabled → lyrics
	observe<HTMLElement>(unloads, '[data-test="toggle-lyrics"][aria-disabled="true"]', () => {
		if (settings.stickyLyrics) {
			tryActivateSimilarTracksTab();
		}
	});

	observe<HTMLElement>(unloads, '[data-test="toggle-lyrics"]:not([aria-disabled])', () => {
		if (settings.stickyLyrics) {
			tryActivateStickyLyricsTab();
		}
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

	// sticky lyrics track changes
	onGlobalTrackChange(() => {
		if (settings.stickyLyrics) {
			handleStickyLyricsTrackChange();
		}
	});
}

// track change system (used everywhere)
const trackChangeListeners: (() => void)[] = [];
const onGlobalTrackChange = (listener: () => void): void => {
	trackChangeListeners.push(listener);
};

// MARKER: Syllable Lyrics

interface WordTiming {
	text: string;
	time: number; // ms
	duration: number; // ms
	isBackground: boolean;
	romanized?: string;
}

interface WordLine {
	text: string;
	startTime: number; // s
	duration: number; // s
	endTime: number; // s
	syllabus: WordTiming[];
	element: {
		key: string;
		songPart?: string;
		songPartIndex?: number;
		singer: string;
	};
	translation: string | null;
	romanized?: string;
}

interface ApiLine {
	text: string;
	startTime: number;
	duration: number;
	endTime: number;
	syllabus?: WordTiming[];
	element?: {
		key: string;
		songPart?: string;
		songPartIndex?: number;
		singer?: string;
	};
	translation?: string | null;
	romanized?: string;
}

interface WordLyricsResponse {
	type: "Word";
	data: WordLine[];
	metadata: {
		source: string;
		title: string;
		language: string;
		totalDuration: string;
		agents?: Record<string, { type: string; name: string; alias: string }>;
		songParts?: Array<{ name: string; time: number; duration: number }>;
	};
	_cached?: boolean;
}

interface LineLyricsResponse {
	type: "Line";
	data: ApiLine[];
	metadata: {
		source: string;
		title: string;
		language: string;
		totalDuration: string;
		agents?: Record<string, { type: string; name: string; alias: string }>;
		songParts?: Array<{ name: string; time: number; duration: number }>;
	};
	_cached?: boolean;
}

type LyricsApiResponse = WordLyricsResponse | LineLyricsResponse;
type LyricsOverlayMode = "none" | "word" | "line-api" | "line-tidal";

interface TrackInfo {
	trackId: string;
	title: string;
	artist: string;
	isrc?: string;
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
let lyricsMode: LyricsOverlayMode = "none";
let tickLoopUnload: LunaUnload | null = null;
let isActive = false;
let savedTidalClasses: string[] | null = null;
let tidalFollowObserver: MutationObserver | null = null;
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

// Find the lyrics text container (wraps the individual lyrics-line spans).
// In the new player-market UI this element has no data-test; we locate it by
// walking up from the first lyrics-line span.
const findLyricsContainer = (): HTMLElement | null => {
	const line = document.querySelector('span[data-test="lyrics-line"]');
	if (line?.parentElement?.parentElement) {
		return line.parentElement.parentElement as HTMLElement;
	}
	return null;
};

// Check whether a tidal lyrics span is currently the active/highlighted line.
// Player-market UI uses a CSS class matching _current_*.
const isTidalSpanActive = (span: HTMLElement): boolean => {
	return Array.from(span.classList).some((c) => c.startsWith("_current_"));
};

const getReduxState = (preferOriginal = false): any => {
	if (preferOriginal && originalReduxGetState) {
		return originalReduxGetState();
	}
	return redux.store.getState() as any;
};

const getNativeTrackEntity = (trackId: string): any | null =>
	getReduxState(true)?.entities?.tracks?.entities?.[trackId] ?? null;

const trackHasNativeLyrics = (trackId: string): boolean => {
	const rel = getNativeTrackEntity(trackId)?.relationships?.lyrics?.data;
	return Array.isArray(rel) && rel.length > 0;
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

const installNativeLyricsOverlay = (): void => {
	if (nativeLyricsOverlayInstalled) return;
	const original = redux.store.getState.bind(redux.store);
	originalReduxGetState = original;
	(redux.store as any).getState = () => overlaySyntheticNativeLyricsState(original());
	nativeLyricsOverlayInstalled = true;
	unloads.add(() => {
		if (originalReduxGetState) {
			(redux.store as any).getState = originalReduxGetState;
		}
		nativeLyricsOverlayInstalled = false;
		originalReduxGetState = null;
		syntheticNativeLyrics = null;
		invalidateOverlayCache();
	});
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
		.map((line) => ("romanized" in line && line.romanized ? line.romanized : line.text))
		.filter((line) => line.trim().length > 0)
		.join("\n");

const buildSyntheticLrcText = (response: LyricsApiResponse): string =>
	response.data
		.map((line) => {
			const text =
				("romanized" in line && line.romanized ? line.romanized : line.text) ?? "";
			return `[${formatLrcTime(line.startTime)}]${text}`;
		})
		.join("\n");

const registerSyntheticNativeLyrics = (
	trackInfo: TrackInfo,
	response: LyricsApiResponse,
): boolean => {
	installNativeLyricsOverlay();
	const track = getNativeTrackEntity(trackInfo.trackId);
	if (!track) return false;

	syntheticNativeLyrics = {
		trackId: trackInfo.trackId,
		lyricsId: `radiant-lyrics-${trackInfo.trackId}`,
		text: buildSyntheticLyricsText(response),
		lrcText: buildSyntheticLrcText(response),
		providerName: `Radiant Lyrics (${response.metadata.source})`,
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
}

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

// playback time in ms (interpolated between currentTime updates)
let lastPlayerTime = 0;
let lastPlayerTimeAt = 0;
let wasPlaying = false;
const getPlaybackMs = (): number => {
	const playerTime = PlayState.currentTime;
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

// get title + artist from media item (Used everywhere now <3)
const getTrackInfo = async (): Promise<TrackInfo | null> => {
	const mi = await MediaItem.fromPlaybackContext();
	if (!mi?.tidalItem) return null;

	const baseTitle = mi.tidalItem.title ?? "";
	const version = mi.tidalItem.version; // REMIX Detection
	const title = version ? `${baseTitle} (${version})` : baseTitle;
	const artist =
		mi.tidalItem.artist?.name ?? mi.tidalItem.artists?.[0]?.name ?? ""; // REMIX Detection
	const isrc = mi.tidalItem.isrc ?? undefined;
	const trackId = String(mi.tidalItem.id ?? PlayState.playbackContext?.actualProductId ?? "");

	if (!baseTitle || !artist || !trackId) return null;
	return { trackId, title, artist, isrc };
};

// fetch syllables from the API (wiped on track change)
let cachedLyricsKey: string | null = null;
let cachedLyricsData: LyricsApiResponse | null = null;
let cachedTidalRomanizeKey: string | null = null;
let cachedTidalRomanizedLines: string[] | null = null;
const fetchLyrics = async (
	title: string,
	artist: string,
	isrc?: string,
): Promise<LyricsApiResponse | null> => {
	const cacheKey = `${title}\0${artist}\0${isrc ?? ""}\0${settings.romanizeLyrics ? "r" : ""}`;
	if (cachedLyricsKey === cacheKey) {
		sylLog(`[RL-Syllable] Cache hit for "${title}" by "${artist}"`);
		return cachedLyricsData;
	}

	let params = `?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
	if (isrc) params += `&isrc=${encodeURIComponent(isrc)}`;
	if (settings.romanizeLyrics) params += "&romanize=true";

	const platformParam = "&platform=" + encodeURIComponent("Radiant Lyrics");
	const primaryUrls = [
		`https://api.atomix.one/rl-api${params}${platformParam}`,
		`https://lyricsplus-api.atomix.one/lyrics${params}${platformParam}`,
	];
	const fallbackUrl = `https://rl-api.kineticsand.net/lyrics${params}`;

	// "ok" = got a response (data may still be null if type is unsupported)
	// "404" = lyrics not found, stop all attempts immediately
	// "500" = serverless timeout, skip remaining primaries and go to fallback
	// "err" = network/other error, try next host
	type FetchOutcome =
		| { status: "ok"; data: LyricsApiResponse | null }
		| { status: "404" }
		| { status: "500" }
		| { status: "err" };

	const rlApiHeaders: Record<string, string> = {
		"P-Access-Token-Id": "58hy4s86",
		"P-Access-Token": "xjehy2lfg5h5mjwotoxrcqugam",
	};

	const tryFetch = async (url: string): Promise<FetchOutcome> => {
		try {
			sylTrace(`RL API: Fetching lyrics: ${url}`);
			const res = await fetch(url, {
				headers: url.includes("api.atomix.one") ? rlApiHeaders : undefined,
			});
			if (!res.ok) {
				trace.log(`RL API: fetch failed: ${res.status} from ${url}`);
				if (res.status === 404) return { status: "404" };
				return res.status === 500 ? { status: "500" } : { status: "err" };
			}
			const data = (await res.json()) as LyricsApiResponse;
			if (!data?.data || !Array.isArray(data.data)) {
				trace.log("Lyrics API returned invalid payload");
				return { status: "ok", data: null };
			}
			if (data.type !== "Word" && data.type !== "Line") {
				trace.log("Lyrics not available in supported format");
				return { status: "ok", data: null };
			}
			return { status: "ok", data };
		} catch (err) {
			trace.log(`RL API: fetch error from ${url}: ${err}`);
			return { status: "err" };
		}
	};

	const finish = (data: LyricsApiResponse | null): LyricsApiResponse | null => {
		cachedLyricsKey = cacheKey;
		cachedLyricsData = data;
		return data;
	};

	// Try primary hosts; bail to fallback immediately on 500, stop entirely on 404
	for (const url of primaryUrls) {
		const outcome = await tryFetch(url);
		if (outcome.status === "ok") return finish(outcome.data);
		if (outcome.status === "404") {
			trace.log("RL API: 404 — no API lyrics exist for this track");
			return finish(null);
		}
		if (outcome.status === "500") {
			trace.log("RL API: 500 (Execution Timeout) — fallback");
			break;
		}
		// "err" → try next primary
	}

	// Fallback: kineticsand (no serverless timeout)
	const fallback = await tryFetch(fallbackUrl);
	if (fallback.status === "ok") return finish(fallback.data);
	if (fallback.status === "404") {
		trace.log("RL API: 404 from fallback — no API lyrics exist for this track");
		return finish(null);
	}
	if (fallback.status === "500") {
		trace.log("RL API: 500 from fallback — API IS ACTUALLY BORKED!");
		return finish(null);
	}

	trace.log("RL API: All Endpoints Failed");
	cachedLyricsKey = cacheKey;
	cachedLyricsData = null;
	return null;
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
			const text = line.romanized ?? line.text;

			return {
				text,
				startTime: startMs / 1000,
				duration: durationMs / 1000,
				endTime: endMs / 1000,
				syllabus: [
					{
						text: `${text} `,
						time: startMs,
						duration: Math.max(1, endMs - startMs),
						isBackground: false,
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

const romanizeLines = async (lineTexts: string[]): Promise<string[] | null> => {
	if (!settings.romanizeLyrics || lineTexts.length === 0) return null;

	const cacheKey = `${lineTexts.join("\n")}\0r`;
	if (cachedTidalRomanizeKey === cacheKey && cachedTidalRomanizedLines) {
		return cachedTidalRomanizedLines;
	}

	const payload = {
		type: "Line" as const,
		data: lineTexts.map((text, idx) => ({
			text,
			startTime: idx,
			duration: 0,
			endTime: idx,
		})),
	};

	const romanizePlatform = "?platform=" + encodeURIComponent("Radiant Lyrics");
	const urls = [
		`https://api.atomix.one/rl-api/romanize${romanizePlatform}`,
		`https://lyricsplus-api.atomix.one/romanize${romanizePlatform}`,
		"https://rl-api.kineticsand.net/romanize",
	];

	for (const url of urls) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 5000);
		try {
			const romanizeHeaders: Record<string, string> = { "content-type": "application/json" };
			if (url.includes("api.atomix.one")) {
				romanizeHeaders["P-Access-Token-Id"] = "58hy4s86";
				romanizeHeaders["P-Access-Token"] = "xjehy2lfg5h5mjwotoxrcqugam";
			}
			const res = await fetch(url, {
				method: "POST",
				headers: romanizeHeaders,
				body: JSON.stringify(payload),
				signal: controller.signal,
			});
			clearTimeout(timeout);
			if (!res.ok) {
				trace.log(`Romanize: request failed ${res.status} from ${url}`);
				continue;
			}

			const data = (await res.json()) as {
				type?: string;
				data?: Array<{ text?: string; romanized?: string }>;
			};
			if (!Array.isArray(data?.data)) continue;

			const romanized = lineTexts.map((original, idx) => {
				const item = data.data?.[idx];
				return item?.romanized ?? item?.text ?? original;
			});
			cachedTidalRomanizeKey = cacheKey;
			cachedTidalRomanizedLines = romanized;
			return romanized;
		} catch (err) {
			clearTimeout(timeout);
			if (err instanceof DOMException && err.name === "AbortError") {
				trace.log(`Romanize: request timed out from ${url}`);
			} else {
				trace.log(`Romanize: request error from ${url}: ${err}`);
			}
		}
	}

	return null;
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

// compute left/right singer sides for duet positioning
// Uses a pre-computed fixed mapping: first person = left, second person = right,
// 3rd+ persons / group / other = left. Same singer always gets the same side.
// (thx Opus 4.6 for this <3)
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
		): HTMLSpanElement => {
			const span = document.createElement("span");
			span.className = "rl-wbw-word";
			if (splitBg && bg) {
				span.textContent = text.replace(/[()]/g, "");
			} else {
				span.textContent = text;
			}
			forceStyle(span, WORD_SPAN_STYLE);
			if (bg) span.classList.add("rl-wbw-bg");
			span.addEventListener("click", () => {
				PlayState.seek(seekMs / 1000);
				if (!PlayState.playing) PlayState.play();
				resync();
			});
			return span;
		};

		const useRomanized = settings.romanizeLyrics;
		const sylDisplay = (s: WordTiming) =>
			useRomanized && s.romanized != null ? s.romanized : s.text;

		// Group syllables into words: trailing whitespace in syl.text marks a word boundary
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
			// Line mode: one span per container (main / bg) — no word splitting
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
				const groupIsBg = splitBg && syllabus[group[0]].isBackground;
				const targetContainer = groupIsBg ? bgContainer! : mainContainer;
				const targetWords = groupIsBg ? lineBgWords : lineWords;

				if (isSylMode) {
					const wordStartMs = syllabus[group[0]].time;
					const groupSpans: HTMLSpanElement[] = [];
					for (const si of group) {
						const syl = syllabus[si];
						const span = makeSpan(
							sylDisplay(syl).trimEnd(),
							wordStartMs,
							syl.isBackground,
						);
						span.addEventListener("mouseenter", () => {
							for (const s of groupSpans) s.classList.add("rl-wbw-word-hover");
						});
						span.addEventListener("mouseleave", () => {
							for (const s of groupSpans)
								s.classList.remove("rl-wbw-word-hover");
						});
						groupSpans.push(span);
						targetContainer.appendChild(span);
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
						.map((si) => sylDisplay(syllabus[si]).trimEnd())
						.join("");
					const first = syllabus[group[0]];
					const last = syllabus[group[group.length - 1]];
					const start = first.time;
					const end = last.time + last.duration;
					const bg = first.isBackground;
					const span = makeSpan(mergedText, start, bg);
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
	let textIdx = 0;
	for (const tidalSpan of tidalSpans) {
		const rawText = tidalSpan.textContent ?? "";
		const text =
			settings.romanizeLyrics && romanizedLines?.[textIdx]
				? romanizedLines[textIdx]
				: rawText;
		if (rawText.trim().length > 0) textIdx++;
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

	innerDiv.appendChild(wbwContainer);
	return { lines };
};

const stopTidalFollowLoop = (): void => {
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

// Re-apply active line + word state to freshly-built DOM elements after a
// rebuild (reapply / re-render observer) WITHOUT triggering CSS transitions.
// This prevents the padding-left "swipe-shift" animation from replaying when
// the container is reconstructed during scroll-unlock, resync, or React
// re-renders.
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

	// Restore word-level state on active lines so the tick loop doesn't flash
	const nowMs = getPlaybackMs();
	activeWordEls.clear();
	activeBgWordEls.clear();

	for (const lineIdx of activeLineIdxs) {
		if (lineIdx >= lines.length) continue;
		const currentLine = lines[lineIdx];

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

	// Force reflow so the suppressed transitions take effect, then restore them
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

const startTidalFollowLoop = (): void => {
	stopTidalFollowLoop();
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
	lines = [];
	activeWordEls.clear();
	activeBgWordEls.clear();
	activeLineIdxs.clear();
	primaryLineIdx = -1;
	clearLineSlideTimers();
	clearSyntheticNativeLyrics();
	restoreTidalLyrics();
};

// find scrollable parent — walk up but never past the now-playing boundary
// to avoid scrolling a shared ancestor that would shift the play queue
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
		if (
			style.overflowY === "auto" ||
			style.overflowY === "scroll" ||
			style.overflow === "auto" ||
			style.overflow === "scroll" ||
			parent.scrollHeight > parent.clientHeight + 1
		) {
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
const resync = (syncNativeButton = true): void => {
	scrollSynced = true;
	applyInactiveBlurState(primaryLineIdx, activeLineIdxs.size === 0, activeLineIdxs);
	scrollToActiveLine();
	const nativeSyncButton = syncButtonEl;
	unhookSyncButton();
	if (syncNativeButton && nativeSyncButton?.isConnected) {
		nativeSyncButton.click();
	}
	sylLog("[RL-Syllable] Scroll resynced");
};

// Hook user scroll
const hookUserScroll = (parent: HTMLElement): void => {
	unhookUserScroll();
	const onUserScroll = () => {
		if (!scrollSynced) return;
		scrollSynced = false;
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
const hookSyncButton = (): void => {
	unhookSyncButton();
	const btn = document.querySelector(
		'div[class*="_syncButton"] button',
	) as HTMLElement;
	if (!btn) return;
	syncButtonEl = btn;
	const handler = () => resync(false);
	btn.addEventListener("click", handler);
	syncButtonListener = () => btn.removeEventListener("click", handler);
};

const unhookSyncButton = (): void => {
	if (syncButtonListener) {
		syncButtonListener();
		syncButtonListener = null;
		syncButtonEl = null;
	}
};

// Tick Loop: determine active line and word
const startTickLoop = (): void => {
	clearTickLoop();

	sylLog("[RL-Syllable] Tick loop started");

	let lastLogTime = 0;
	let lastTickMs = 0;

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

// Called by track change or style toggle
const onTrackChange = async (): Promise<void> => {
	teardown();

	const runId = ++trackChangeRunSeq;
	isTrackChangeRunning = true;
	const token = ++trackChangeToken;
	try {
		const trackInfo = await getTrackInfo();
		if (token !== trackChangeToken) return;
		if (!trackInfo) {
			trace.log("could not get track info from playback state");
			return;
		}
		const nativeHasLyrics = trackHasNativeLyrics(trackInfo.trackId);

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
			const tidalTexts = getTidalLines();
			const romanized = settings.romanizeLyrics
				? await romanizeLines(tidalTexts)
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

		sylTrace(
			`RL API: loaded ${response.data.length} lines (source: ${response.metadata.source})`,
		);
		sylLog(
			`[RL-Syllable] Loaded "${trackInfo.title}" by "${trackInfo.artist}" — ${response.data.length} lines`,
		);

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
		} else {
			watchForRerender();
			if (!nativeHasLyrics || settings.stickyLyrics || currentTrackWantsLyricsPanel()) {
				safeTimeout(unloads, () => {
					if (token !== trackChangeToken) return;
					syncNativeLyricsAvailability();
					if (settings.stickyLyrics) {
						tryActivateStickyLyricsTab();
					}
				}, 0);
			}
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
		? await romanizeLines(tidalTexts)
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

const updateRomanizeLyricsFromSettings = (): void => {
	cachedLyricsKey = null;
	cachedLyricsData = null;
	cachedTidalRomanizeKey = null;
	cachedTidalRomanizedLines = null;
	toggle();
};
(window as any).updateRomanizeLyrics = updateRomanizeLyricsFromSettings;

// Update lyrics on track change (wipe cache for new song)
onGlobalTrackChange(() => {
	cachedLyricsKey = null;
	cachedLyricsData = null;
	cachedTidalRomanizeKey = null;
	cachedTidalRomanizedLines = null;
	onTrackChange();
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
	const existing = document.querySelector('[data-test="header"]');
	if (existing && !document.querySelector(".hide-ui-button"))
		createHideUIButton();
	observe<HTMLElement>(unloads, '[data-test="header"]', () => {
		if (!document.querySelector(".hide-ui-button")) createHideUIButton();
	});
}

function setupNowPlayingObserver(): void {
	const existing = document.querySelector('[class*="_nowPlayingContainer"]');
	if (existing && !document.querySelector(".unhide-ui-button"))
		createUnhideUIButton();
	observe<HTMLElement>(unloads, '[class*="_nowPlayingContainer"]', () => {
		if (!document.querySelector(".unhide-ui-button")) createUnhideUIButton();
	});
}

// Apply seeker color on track change
onGlobalTrackChange(() => {
	updateCoverArtBackground();
	if (settings.qualityProgressColor) applyQualityProgressColor();
});

// Init observers
setupHeaderObserver();
setupNowPlayingObserver();
setupStickyLyricsObserver();
setupTrackChangeListener();
