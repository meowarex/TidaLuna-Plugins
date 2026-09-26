// MARKER: Animated Artwork (Apple Music live artwork in the lyrics view)
//   Renders the API HLS stream over TIDAL's static artwork tile.
//   Orchestration (track change, visibility, settings) lives in index.ts.

import { Tracer } from "@luna/core";
// Light build: no alt-audio/subtitles/EME needed here. Types in hls-light.d.ts.
import Hls from "hls.js/light";

import { fetchAnimatedArtwork } from "./api";
import { settings } from "./Settings";

const { trace } = Tracer("[Radiant Lyrics]");

export const ART_TILE_SELECTOR = '[data-test="now-playing-artwork"]';
/** Elements that cannot render child nodes, so the video must go beside them. */
const REPLACED_TAGS = new Set(["IMG", "PICTURE", "VIDEO", "CANVAS", "SVG"]);
// Keeps ABR off Apple's 2160x2160 rung (91MB a loop). Bandwidth only, not CPU.
const ART_MAX_DPR = 1;
const ART_NATIVE_FPS = 25;

export class AnimatedArtworkLayer {
	private video: HTMLVideoElement | null = null;
	private hls: Hls | null = null;
	private tile: HTMLElement | null = null;
	/** The tile, or its parent when the tile is a replaced element. */
	private mount: HTMLElement | null = null;
	private resizeObs: ResizeObserver | null = null;
	private resizeRaf = 0;
	private artwork: { url: string; url_tall: string } | null = null;
	/** See artworkKey() in index.ts. */
	private artworkKey: string | null = null;
	private liveSrc: string | null = null;
	private loadToken = 0;
	private nowPlayingVisible = true;
	/** True when the mount's inline position is ours to revert. */
	private mountPositioned = false;
	private fetchAbort: AbortController | null = null;
	private nativeFps = ART_NATIVE_FPS;

	// CPU tracks presented fps and nothing else, so this is the only perf knob.
	private applyRate(): void {
		if (!this.video) return;
		const target = Number(settings.animatedArtworkFps) || ART_NATIVE_FPS;
		const rate = Math.min(1, Math.max(0.05, target / this.nativeFps));
		if (this.video.playbackRate !== rate) this.video.playbackRate = rate;
	}

	private releaseMount(): void {
		if (this.mount && this.mountPositioned) this.mount.style.removeProperty("position");
		this.mountPositioned = false;
		this.mount = null;
	}

	/** True while a matching artwork tile is alive. */
	private tileAlive(): boolean {
		if (this.tile?.isConnected) return true;
		const tile = document.querySelector<HTMLElement>(ART_TILE_SELECTOR);
		if (!tile) return false;
		this.host(tile);
		return true;
	}

	private host(tile: HTMLElement): void {
		this.tile = tile;
		// The tile is an <img>; a replaced element silently drops children, so
		// host the video in the parent and lay it over the tile.
		const replaced = REPLACED_TAGS.has(tile.tagName);
		const mount = replaced ? tile.parentElement : tile;
		if (mount !== this.mount) this.releaseMount();
		this.mount = mount;
		if (this.mount && getComputedStyle(this.mount).position === "static") {
			this.mountPositioned = true;
			this.mount.style.position = "relative";
		}
		this.watchSizing();
	}

	/** Lay the video over the tile when it is not a direct child of it. */
	private syncGeometry(): void {
		const { video, tile, mount } = this;
		if (!video || !tile || !mount) return;
		if (mount === tile) return;
		video.style.left = `${tile.offsetLeft}px`;
		video.style.top = `${tile.offsetTop}px`;
		video.style.width = `${tile.offsetWidth}px`;
		video.style.height = `${tile.offsetHeight}px`;
		video.style.right = "auto";
		video.style.bottom = "auto";
		video.style.borderRadius = getComputedStyle(tile).borderRadius;
	}

	private watchSizing(): void {
		if (!this.tile) return;
		// host() can re-run against a fresh tile.
		this.resizeObs?.disconnect();
		this.resizeObs ??= new ResizeObserver(() => {
			if (!this.artwork || !this.video) return;
			// Deferred: syncGeometry writes styles and would retrigger us.
			if (this.resizeRaf !== 0) return;
			this.resizeRaf = requestAnimationFrame(() => {
				this.resizeRaf = 0;
				// Only rebuild the stream if the aspect actually flipped.
				if (this.pickSrc() !== this.liveSrc) this.mountVideo(false);
				this.syncGeometry();
			});
		});
		this.resizeObs.observe(this.tile);
	}

	/**
	 * Mount the artwork for `key`, leaving any playing video alone until a
	 * replacement resolves. False means no tile was on screen, so retry later.
	 */
	async load(
		key: string,
		title: string,
		artist: string,
		album: string | undefined,
	): Promise<boolean> {
		// Already showing this album's artwork — keep playing, touch nothing.
		if (key === this.artworkKey && this.artwork && this.video?.isConnected) {
			this.ensurePlaying();
			return true;
		}
		const token = ++this.loadToken;
		this.fetchAbort?.abort();
		this.fetchAbort = new AbortController();
		const signal = this.fetchAbort.signal;

		if (!settings.animatedArtwork) return true;
		// Only check a tile exists; host after the fetch so the old video keeps playing.
		if (!document.querySelector<HTMLElement>(ART_TILE_SELECTOR)) return false;

		const artwork = await fetchAnimatedArtwork(title, artist, album, signal);
		if (token !== this.loadToken) return true;
		if (!this.tileAlive()) return false;

		if (!artwork) {
			trace.log(`AM Artwork: no animated art for "${title}"`);
			this.detach(false);
			// After detach(), which clears the key too.
			this.artworkKey = key;
			return true;
		}
		// Same stream already on screen: adopt the key, leave the video be.
		const unchanged =
			this.artwork?.url === artwork.url &&
			this.artwork?.url_tall === artwork.url_tall &&
			this.video?.isConnected === true;
		this.artwork = artwork;
		this.artworkKey = key;
		if (unchanged) {
			this.ensurePlaying();
			return true;
		}
		this.mountVideo(false);
		return true;
	}

	/** Re-bind to the artwork tile after the Now Playing view (re)mounted. */
	reattach(): void {
		if (!this.artwork || !settings.animatedArtwork) return;
		const tile = document.querySelector<HTMLElement>(ART_TILE_SELECTOR);
		if (!tile) return;
		if (tile === this.tile && this.video?.isConnected) {
			this.ensurePlaying();
			return;
		}
		this.host(tile);
		this.mountVideo(true);
	}

	/** (Re)mount the video into the tile, honouring the current aspect + settings. */
	mountVideo(force: boolean): void {
		if (!this.tileAlive() || !this.artwork || !settings.animatedArtwork) {
			this.detach(false);
			return;
		}
		const src = this.pickSrc();
		if (!this.tile || !this.mount) {
			this.detach(false);
			return;
		}
		if (src === this.liveSrc && this.video && !force) {
			this.ensurePlaying();
			return;
		}
		this.video?.remove();
		this.hls?.destroy();
		this.hls = null;
		this.video = null;
		this.liveSrc = src;

		const video = document.createElement("video");
		video.className = "rl-animated-art";
		video.muted = true;
		video.autoplay = true;
		video.loop = true;
		video.playsInline = true;
		video.crossOrigin = "anonymous";
		video.tabIndex = -1;
		video.setAttribute("aria-hidden", "true");
		video.addEventListener(
			"error",
			() => {
				const err = video.error;
				this.fail(
					err ? `media error ${err.code}: ${err.message}` : "media error",
				);
			},
			{ once: true },
		);
		this.mount.appendChild(video);
		this.video = video;
		this.syncGeometry();

		// MSE first: Chromium says "maybe" to canPlayType for HLS then fails to
		// demux the playlist, so native is only a fallback for engines without MSE.
		if (typeof Hls === "function" && Hls.isSupported()) {
			const hls = new Hls({
				autoStartLoad: true,
				capLevelToPlayerSize: true,
				// H.264 ladder; the artwork has no use for 10-bit HEVC.
				videoPreference: { videoCodec: "avc1", allowedVideoRanges: ["SDR"] },
				maxDevicePixelRatio: ART_MAX_DPR,
			});
			this.hls = hls;
			hls.loadSource(src);
			hls.attachMedia(video);
			hls.on(Hls.Events.LEVEL_SWITCHED, () => {
				const fps = hls.levels[hls.currentLevel]?.frameRate;
				if (fps && fps > 0) this.nativeFps = fps;
				this.applyRate();
			});
			hls.on(Hls.Events.ERROR, (_evt, data) => {
				if (!data.fatal) return;
				this.fail(
					`hls ${data.type}/${data.details}${data.reason ? ` (${data.reason})` : ""}${data.error ? ` (${data.error.message})` : ""}`,
				);
			});
		} else if (video.canPlayType("application/vnd.apple.mpegurl")) {
			video.src = src;
		} else {
			trace.log("AM Artwork: HLS unsupported on this client");
			this.detach(false);
			return;
		}
		video.classList.add("rl-animated-art-visible");
		this.applyRate();
		this.ensurePlaying();
	}

	private pickSrc(): string {
		if (!this.artwork || !this.tile) return "";
		const rect = this.tile.getBoundingClientRect();
		if (rect.width && rect.height && rect.height > rect.width) {
			return this.artwork.url_tall;
		}
		return this.artwork.url;
	}

	private fail = (reason: string): void => {
		trace.log(`AM Artwork: ${reason} — hiding video (src: ${this.liveSrc})`);
		this.detach(false);
	};

	ensurePlaying(): void {
		if (
			this.artwork &&
			this.video &&
			settings.animatedArtwork &&
			this.nowPlayingVisible &&
			!document.hidden &&
			this.tile?.isConnected
		) {
			void this.video.play().catch(() => {});
		} else {
			this.video?.pause();
		}
	}

	setNowPlayingVisible(visible: boolean): void {
		// Called from the 200ms tick, so bail unless it actually flipped.
		if (visible === this.nowPlayingVisible) return;
		this.nowPlayingVisible = visible;
		// Must resume explicitly; nothing else restarts a paused video.
		this.ensurePlaying();
	}

	refresh(): void {
		if (!this.liveSrc) return;
		if (settings.animatedArtwork) {
			this.applyRate();
			if (this.video) this.ensurePlaying();
			else this.mountVideo(true);
		} else {
			this.detach(true);
		}
	}

	private detach(keepData: boolean): void {
		if (this.video?.parentNode) this.video.remove();
		this.video = null;
		this.hls?.destroy();
		this.hls = null;
		this.liveSrc = keepData ? this.liveSrc : null;
		if (!keepData) {
			this.artwork = null;
			this.artworkKey = null;
		}
	}

	dispose(): void {
		this.loadToken++;
		this.fetchAbort?.abort();
		this.fetchAbort = null;
		this.resizeObs?.disconnect();
		this.resizeObs = null;
		if (this.resizeRaf !== 0) cancelAnimationFrame(this.resizeRaf);
		this.resizeRaf = 0;
		this.detach(false);
		this.releaseMount();
		this.tile = null;
	}
}