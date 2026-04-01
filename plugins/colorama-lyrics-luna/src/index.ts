import { LunaUnload, Tracer } from "@luna/core";
import { StyleTag } from "@luna/lib";
import { settings, Settings } from "./Settings";

import styles from "file://styles.css?minify";

export const { trace } = Tracer("[Colorama Lyrics]");
export { Settings };

export const unloads = new Set<LunaUnload>();

new StyleTag("ColoramaLyrics", unloads, styles);

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
	let v = hex.trim();
	if (!v.startsWith("#")) v = `#${v}`;
	if (/^#([0-9a-fA-F]{3})$/.test(v)) {
		const r = parseInt(v[1] + v[1], 16);
		const g = parseInt(v[2] + v[2], 16);
		const b = parseInt(v[3] + v[3], 16);
		return { r, g, b };
	}
	if (/^#([0-9a-fA-F]{6})$/.test(v)) {
		const r = parseInt(v.slice(1, 3), 16);
		const g = parseInt(v.slice(3, 5), 16);
		const b = parseInt(v.slice(5, 7), 16);
		return { r, g, b };
	}
	if (/^#([0-9a-fA-F]{8})$/.test(v)) {
		const r = parseInt(v.slice(3, 5), 16);
		const g = parseInt(v.slice(5, 7), 16);
		const b = parseInt(v.slice(7, 9), 16);
		return { r, g, b };
	}
	return null;
}

function rgbaFromHexAndAlpha(
	hex: string,
	alphaPercent: number | undefined,
): string {
	const rgb = hexToRgb(hex);
	const a = Math.max(0.05, Math.min(100, alphaPercent ?? 100)) / 100;
	if (!rgb) return `rgba(255,255,255,${a})`;
	return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

function applySingleColor(color: string) {
	const alpha = (settings as any).singleAlpha ?? 100;
	const rgba = rgbaFromHexAndAlpha(color, alpha);
	document.documentElement.style.setProperty("--cl-lyrics-color", rgba);
	document.documentElement.style.setProperty("--cl-glow1", rgba);
	document.documentElement.style.setProperty("--cl-glow2", rgba);
	document.body.classList.add("colorama-single");
}

function applyColoramaLyrics(): void {
	if (!settings.enabled) {
		document.body.classList.remove("colorama-single");
		return;
	}

	if (settings.excludeInactive) {
		document.body.classList.add("colorama-only-active");
	} else {
		document.body.classList.remove("colorama-only-active");
	}

	applySingleColor(settings.singleColor);
}

(window as any).applyColoramaLyrics = applyColoramaLyrics;

setTimeout(() => applyColoramaLyrics(), 200);

function hookRadiantUpdates(): void {
	const w = window as any;
	const wrap = (name: string) => {
		const fn = w[name];
		if (typeof fn === "function" && !fn.__coloramaPatched) {
			const orig = fn.bind(w);
			const patched = (...args: unknown[]) => {
				const result = orig(...args);
				try {
					applyColoramaLyrics();
				} catch {}
				return result;
			};
			(patched as any).__coloramaPatched = true;
			w[name] = patched;
		}
	};
	wrap("updateRadiantLyricsStyles");
	wrap("updateRadiantLyricsNowPlayingBackground");
	wrap("updateRadiantLyricsGlobalBackground");
	wrap("updateRadiantLyricsTextGlow");
}

setTimeout(() => hookRadiantUpdates(), 0);
