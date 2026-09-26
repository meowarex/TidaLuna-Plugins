import { Tracer } from "@luna/core";

import { settings } from "./Settings";

const { trace } = Tracer("[Radiant Lyrics]");

const sylTrace = (...args: unknown[]) => {
	if (settings.syllableLogging) trace.log(...args);
};

export const RL_PLATFORM = "rl";

const RL_ACCESS_TOKEN_ID = "58hy4s86";
const RL_ACCESS_TOKEN = "xjehy2lfg5h5mjwotoxrcqugam";
// Yup that's right, plaintext token in a public Repo!!
// The API does not return sensitive data & won't be plain text like this in the future <3

let cachedPublicIP: string | undefined;

export async function ip(): Promise<string | undefined> {
	if (cachedPublicIP) return cachedPublicIP;
	try {
		const res = await fetch("https://api.ipify.org?format=text");
		if (res.ok) cachedPublicIP = (await res.text()).trim();
	} catch {}
	return cachedPublicIP;
}

export async function auth(): Promise<Record<string, string>> {
	const clientIP = await ip();
	return {
		"P-Access-Token-Id": RL_ACCESS_TOKEN_ID,
		"P-Access-Token": RL_ACCESS_TOKEN,
		"x-client-ip": clientIP ?? "null",
	};
}

// Platform param (just for DX logging)
const platformQs = `platform=${encodeURIComponent(RL_PLATFORM)}`;

// Query string & params
function query(
	title: string,
	artist: string,
	isrc: string | undefined,
	options?: { romanize?: boolean; flush?: boolean; synthesize?: boolean },
): string {
	let q = `?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
	if (isrc) q += `&isrc=${encodeURIComponent(isrc)}`;
	if (options?.romanize) q += "&romanize=true";
	if (options?.flush) q += "&flush=true";
	if (options?.synthesize) q += "&synthesize=true";
	q += `&${platformQs}`;
	return q;
}

// Response types

export interface WordTiming {
	text: string;
	time: number;
	duration: number;
	isBackground: boolean;
	romanized?: string;
	/** 0..1 model confidence for synthesized timings; unset for provider data */
	confidence?: number;
}

export interface WordLine {
	text: string;
	startTime: number;
	duration: number;
	endTime: number;
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

export interface ApiLine {
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

export interface WordLyricsResponse {
	type: "Word";
	data: WordLine[];
	metadata: {
		title: string;
		language: string;
		totalDuration: string;
		agents?: Record<string, { type: string; name: string; alias: string }>;
		songParts?: Array<{ name: string; time: number; duration: number }>;
	};
	_cached?: boolean;
	/** true when timings came from the hosted Radiant AI model (?synthesize=true) */
	_synthesized?: boolean;
	/** original line-level data, kept so AI timings can be toggled off without a refetch */
	lines?: ApiLine[];
}

export interface LineLyricsResponse {
	type: "Line";
	data: ApiLine[];
	metadata: {
		title: string;
		language: string;
		totalDuration: string;
		agents?: Record<string, { type: string; name: string; alias: string }>;
		songParts?: Array<{ name: string; time: number; duration: number }>;
	};
	_cached?: boolean;
}

export type LyricsApiResponse = WordLyricsResponse | LineLyricsResponse;

type FetchOutcome =
	| { status: "ok"; data: LyricsApiResponse | null }
	| { status: "404" }
	| { status: "500" }
	| { status: "err" };

// Lyrics lookup (network)
export async function fetchLyrics(
	title: string,
	artist: string,
	isrc: string | undefined,
	romanize: boolean,
	synthesize = false,
): Promise<LyricsApiResponse | null> {
	const params = query(title, artist, isrc, { romanize, synthesize });
	const atomixUrl = `https://api.atomix.one/rl-api${params}`;
	const fallbackUrl = `https://rl-api.kineticsand.net/lyrics${params}`;

	const rlApiHeaders = await auth();

	const tryFetch = async (url: string, useAtomixAuth: boolean): Promise<FetchOutcome> => {
		try {
			sylTrace(`RL API: Fetching lyrics: ${url}`);
			const res = await fetch(url, {
				headers: useAtomixAuth ? rlApiHeaders : undefined,
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

	const primary = await tryFetch(atomixUrl, true);
	if (primary.status === "ok") return primary.data;
	if (primary.status === "404") {
		trace.log("RL API: 404 — no API lyrics exist for this track");
		return null;
	}
	if (primary.status === "500") {
		trace.log("RL API: 500 (Execution Timeout) — fallback");
	}

	const fallback = await tryFetch(fallbackUrl, false);
	if (fallback.status === "ok") return fallback.data;
	if (fallback.status === "404") {
		trace.log("RL API: 404 from fallback — no API lyrics exist for this track");
		return null;
	}
	if (fallback.status === "500") {
		trace.log("RL API: 500 from fallback — API IS ACTUALLY BORKED!");
		return null;
	}

	trace.log("RL API: All Endpoints Failed");
	return null;
}

export interface AnimatedArtwork {
	url: string;
	url_tall: string;
}

function artworkSearchUrl(
	title: string,
	artist: string,
	album?: string,
): string {
	let q = `title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
	// Omit the album param entirely when absent (a literal "undefined" string makes the endpoint miss)
	if (album && album.trim() !== "") q += `&album=${encodeURIComponent(album.trim())}`;
	return `https://ama.trainswift.net/api/v1/artwork/search?${q}`;
}

// Cached including misses; most tracks have none and the answer never changes.
const animatedArtworkCache = new Map<string, AnimatedArtwork | null>();
const ARTWORK_CACHE_MAX = 200;

export async function fetchAnimatedArtwork(
	title: string,
	artist: string,
	album?: string,
	signal?: AbortSignal,
): Promise<AnimatedArtwork | null> {
	// Keyed by album, matching artworkKey() in index.ts.
	const cacheKey =
		album && album.trim() !== ""
			? `${artist}\u0000${album.trim()}`
			: `${artist}\u0000\u0000${title}`;
	if (animatedArtworkCache.has(cacheKey)) {
		return animatedArtworkCache.get(cacheKey) ?? null;
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10000);
	const onAbort = () => controller.abort();
	signal?.addEventListener("abort", onAbort, { once: true });
	if (signal?.aborted) controller.abort();
	const tryFetch = async (url: string): Promise<AnimatedArtwork | null> => {
		try {
			sylTrace(`AM Artwork: fetching ${url}`);
			const res = await fetch(url, { signal: controller.signal });
			if (!res.ok) {
				trace.log(`AM Artwork: fetch failed ${res.status} | ${url}`);
				return null;
			}
			const data = (await res.json()) as {
				url?: string;
				url_tall?: string;
				message?: string;
			};
			if (data.url && data.url_tall) {
				return { url: data.url, url_tall: data.url_tall };
			}
			trace.log(`AM Artwork: none found | ${url}`);
			return null;
		} catch (err) {
			if (err instanceof DOMException && err.name === "AbortError") {
				trace.log(`AM Artwork: request timed out | ${url}`);
			} else {
				trace.log(`AM Artwork: request error | ${url} | ${err}`);
			}
			return null;
		}
	};

	const remember = (result: AnimatedArtwork | null): AnimatedArtwork | null => {
		// A cancelled attempt says nothing about the track.
		if (controller.signal.aborted) return result;
		if (animatedArtworkCache.size >= ARTWORK_CACHE_MAX) {
			const oldest = animatedArtworkCache.keys().next().value;
			if (oldest !== undefined) animatedArtworkCache.delete(oldest);
		}
		animatedArtworkCache.set(cacheKey, result);
		return result;
	};

	try {
		// Exact album first; on a miss retry once without the album (server-side disambiguation is imperfect)
		const withAlbum = await tryFetch(
			artworkSearchUrl(title, artist, album),
		);
		if (withAlbum) return remember(withAlbum);
		if (album && album.trim() !== "") {
			const withoutAlbum = await tryFetch(
				artworkSearchUrl(title, artist),
			);
			if (withoutAlbum) return remember(withoutAlbum);
		}
		return remember(null);
	} finally {
		clearTimeout(timeout);
		signal?.removeEventListener("abort", onAbort);
	}
}

export async function flushLyrics(track: {
	title: string;
	artist: string;
	isrc?: string;
}): Promise<
	| { ok: true; data: LyricsApiResponse & { _flush?: string } }
	| { ok: false; status: number; notFound: boolean }
> {
	const q = query(track.title, track.artist, track.isrc, {
		flush: true,
	});
	const url = `https://api.atomix.one/rl-api${q}`;
	const headers = await auth();
	const res = await fetch(url, { headers });
	if (res.status === 404) {
		return { ok: false, status: 404, notFound: true };
	}
	if (!res.ok) {
		return { ok: false, status: res.status, notFound: false };
	}
	const data = (await res.json()) as LyricsApiResponse & { _flush?: string };
	return { ok: true, data };
}

// Romanize
export async function romanizeLyrics(
	lineTexts: string[],
): Promise<string[] | null> {
	if (lineTexts.length === 0) return null;

	const payload = {
		type: "Line" as const,
		data: lineTexts.map((text, idx) => ({
			text,
			startTime: idx,
			duration: 0,
			endTime: idx,
		})),
	};

	const romanizeQuery = `?${platformQs}`;
	const urls: { url: string; useAtomixAuth: boolean }[] = [
		{
			url: `https://api.atomix.one/rl-api/romanize${romanizeQuery}`,
			useAtomixAuth: true,
		},
		{
			url: `https://rl-api.kineticsand.net/romanize${romanizeQuery}`,
			useAtomixAuth: false,
		},
	];

	for (const { url, useAtomixAuth } of urls) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 5000);
		try {
			const romanizeHeaders: Record<string, string> = {
				"content-type": "application/json",
			};
			if (useAtomixAuth) {
				Object.assign(romanizeHeaders, await auth());
			}
			const res = await fetch(url, {
				method: "POST",
				headers: romanizeHeaders,
				body: JSON.stringify(payload),
				signal: controller.signal,
			});
			clearTimeout(timeout);
			if (!res.ok) {
				trace.log(`Romanize: request failed ${res.status} | ${url}`);
				continue;
			}

			const data = (await res.json()) as {
				type?: string;
				data?: Array<{ text?: string; romanized?: string }>;
			};
			if (!Array.isArray(data?.data)) continue;

			return lineTexts.map((original, idx) => {
				const item = data.data?.[idx];
				return item?.romanized ?? item?.text ?? original;
			});
		} catch (err) {
			clearTimeout(timeout);
			if (err instanceof DOMException && err.name === "AbortError") {
				trace.log(`Romanize: request timed out | ${url}`);
			} else {
				trace.log(`Romanize: request error | ${url} | ${err}`);
			}
		}
	}

	return null;
}
