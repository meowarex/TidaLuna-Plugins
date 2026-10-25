import { Tracer } from "@luna/core";

import { settings } from "./Settings";

const { trace } = Tracer("[Radiant Lyrics]");

const sylTrace = (...args: unknown[]) => {
	if (settings.syllableLogging) trace.log(...args);
};

export const RL_PLATFORM = "rl";

// Filled in at build (.env or CI secrets)
declare const __RL_ACCESS_TOKEN_ID__: string;
declare const __RL_ACCESS_TOKEN__: string;
const RL_ACCESS_TOKEN_ID = __RL_ACCESS_TOKEN_ID__;
const RL_ACCESS_TOKEN = __RL_ACCESS_TOKEN__;

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
	options?: { romanize?: boolean; flush?: boolean },
): string {
	let q = `?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
	if (isrc) q += `&isrc=${encodeURIComponent(isrc)}`;
	if (options?.romanize) q += "&romanize=true";
	if (options?.flush) q += "&flush=true";
	q += `&ai-preference=${settings.allowAI}`;
	if (settings.translateLyrics) {
		q += `&translate=true&language=${encodeURIComponent(settings.translateLanguage)}`;
	}
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

// Translated word, timed to its source syllable (not in order)
export interface TranslationWord {
	text: string;
	time: number;
	duration: number;
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
	translationTiming?: "aligned" | "estimated";
	translationSyllabus?: TranslationWord[];
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
	// Came from an AI record (missing = false)
	_synthesized?: boolean;
	// Align = retimed, Generate = transcribed, Synthesize = old guessed timings
	_synthesisType?: "Align" | "Generate" | "Synthesize";
	_model?: string;
	_modelVersion?: string;
	_confidence?: number;
	_synthesisId?: string;
	// Original provider lines (none if Generate had none)
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

// Flags the API adds for romanize / translate
interface LyricsTextFlags {
	_romanized?: boolean;
	// false if translation failed, lyrics still come back
	_translated?: boolean;
	_translationLanguage?: string;
	// only when _translated is false
	_translationError?: string;
}

export type LyricsApiResponse = (WordLyricsResponse | LineLyricsResponse) &
	LyricsTextFlags;

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
): Promise<LyricsApiResponse | null> {
	const params = query(title, artist, isrc, { romanize });
	const apiUrl = `https://api.radiant-lyrics.org/rl-api${params}`;
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

	const primary = await tryFetch(apiUrl, true);
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

export interface ArtworkLookup {
	artwork: AnimatedArtwork | null;
	// Album key if album matched, else title key
	key: string;
}

// Key for this exact track only
export const artworkTitleKey = (artist: string, title: string): string =>
	`${artist}\u0000\u0000${title}`;


function artworkSearchUrl(
	title: string,
	artist: string,
	album?: string,
	isrc?: string,
): string {
	const q = new URLSearchParams();
	// The endpoint resolves the album from the track title when no album is known;
	// sending the title as `album` would send it down the album search instead.
	q.set("title", title);
	q.set("artist", artist);
	const albumName = album?.trim();
	if (albumName) q.set("album", albumName);
	if (isrc) q.set("isrc", isrc);
	return `https://animated-cover.appwrite.network?${q}`;
}

// Cache hits and misses, album key only for album matches
const animatedArtworkCache = new Map<string, AnimatedArtwork | null>();
const ARTWORK_CACHE_MAX = 200;

export async function fetchAnimatedArtwork(
	title: string,
	artist: string,
	album?: string,
	isrc?: string,
	signal?: AbortSignal,
): Promise<ArtworkLookup> {
	const albumName = album?.trim() || "";
	const albumPresent = albumName !== "";
	// Album key, or title key without an album
	const cacheKey = albumPresent
		? `${artist}\u0000${albumName}`
		: artworkTitleKey(artist, title);
	if (animatedArtworkCache.has(cacheKey)) {
		return { artwork: animatedArtworkCache.get(cacheKey) ?? null, key: cacheKey };
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10000);
	const onAbort = () => controller.abort();
	signal?.addEventListener("abort", onAbort, { once: true });
	if (signal?.aborted) controller.abort();
	const tryFetch = async (url: string): Promise<AnimatedArtwork | null> => {
		try {
			sylTrace(`Animated Artwork: fetching ${url}`);
			const res = await fetch(url, {
				signal: controller.signal,
			});
			if (!res.ok) {
				trace.log(`Animated Artwork: fetch failed ${res.status} | ${url}`);
				return null;
			}
			const data = (await res.json()) as {
				album?: string;
				artist?: string;
				artwork?: string;
				isrc?: string;
				animatedCover?: {
					square?: string;
					tall?: string;
					previewFrame?: string;
				};
			};
			// square/tall are optional upstream, so either one alone is usable art
			const square = data.animatedCover?.square;
			const tall = data.animatedCover?.tall;
			if (square) return { url: square, url_tall: tall ?? square };
			if (tall) return { url: tall, url_tall: tall };
			trace.log(`Animated Artwork: none found | ${url}`);
			return null;
		} catch (err) {
			if (err instanceof DOMException && err.name === "AbortError") {
				trace.log(`Animated Artwork: request timed out | ${url}`);
			} else {
				trace.log(`Animated Artwork: request error | ${url} | ${err}`);
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
		// One request: a 404 means this track has no animated art, so retrying with the
		// title alone would just repeat the lookup and fail the same way.
		const artwork = await tryFetch(
			artworkSearchUrl(title, artist, album, isrc),
		);
		return { artwork: remember(artwork), key: cacheKey };
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
	const url = `https://api.radiant-lyrics.org/rl-api${q}`;
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

// MARKER: Sylla (AI retiming + generation)

export interface AlignLineSummary {
	index: number;
	text: string;
	begin: number;
	end: number;
	confidence: number;
	sung: boolean;
	kept_input?: boolean;
	shift_ms?: number;
}

export interface AlignResponse {
	// "aligned" when it worked, otherwise why it failed
	verdict?: string;
	message?: string;
	tidal_id: string;
	isrc: string;
	title: string;
	artist: string;
	// 0..1 alignment confidence
	confidence: number;
	lyrics: WordLyricsResponse;
	ttml: string;
	lines: AlignLineSummary[];
	removed_lines?: Array<{ index: number; text: string; reason: string }>;
	stats: Record<string, unknown>;
	model: string;
	// sylla-gen only
	lyrics_source?: string;
	transcript?: { language: string; text: string; confidence: number; lines: number };
}

// 409 from sylla-align: already Sylla lyrics, nothing queued
export interface SyllaAlreadyAligned {
	job?: string;
	jobType?: string;
	confidence?: number;
}

type SyllaResult =
	| { ok: true; data: AlignResponse }
	| {
			ok: false;
			status: number;
			detail: string;
			verdict?: string;
			alreadyAligned?: SyllaAlreadyAligned;
		};

// Place in the Sylla queue
export interface SyllaQueue {
	position: number;
	size: number;
}

export interface SyllaJobOptions {
	// Called in line (null of job running)
	onQueue?: (queue: SyllaQueue | null) => void;
	signal?: AbortSignal;
}

// Queue fields Sylla puts on job replies
interface SyllaQueueFields {
	queued?: boolean;
	queue_position?: number;
	queue_size?: number;
}

// One line of a stream=true reply
interface SyllaStreamEvent extends SyllaQueueFields {
	event?: "queue" | "done";
	id?: string;
	status?: number;
	body?: unknown;
}

// No line for this long = dead
const SYLLA_IDLE_TIMEOUT_MS = 240000;
const SYLLA_JOB_TIMEOUT_MS = 600000;

const queueOf = (fields: SyllaQueueFields | null | undefined): SyllaQueue | null =>
	fields?.queued && typeof fields.queue_position === "number" && fields.queue_position > 0
		? { position: fields.queue_position, size: fields.queue_size ?? fields.queue_position }
		: null;

// Query flags for sylla-align / sylla-gen
const syllaQs = (): string =>
	`?romanize=${settings.romanizeLyrics}&translate=${settings.translateLyrics}&language=${encodeURIComponent(settings.translateLanguage)}&ai-preference=${settings.allowAI}`;

// Retime lyrics
export function alignLyrics(
	track: { trackId: string; title: string; artist: string; isrc?: string },
	lyrics: LyricsApiResponse,
	options?: SyllaJobOptions,
): Promise<SyllaResult> {
	return runSylla("sylla-align", "Sylla Align", {
		tidal_id: track.trackId,
		// Just the rl-api shape, not our own flags
		lyrics: { type: lyrics.type, data: lyrics.data, metadata: lyrics.metadata },
		isrc: track.isrc ?? "",
		title: track.title,
		artist: track.artist,
	}, options);
}

// Make lyrics (takes longer..)
export function generateLyrics(
	track: {
		trackId: string;
		title: string;
		artist: string;
		isrc?: string;
	},
	options?: SyllaJobOptions,
): Promise<SyllaResult> {
	return runSylla("sylla-gen", "Sylla Gen", {
		tidal_id: track.trackId,
		isrc: track.isrc ?? "",
		title: track.title,
		artist: track.artist,
	}, options);
}

// ndjson body one line at a time
async function* readLines(res: Response, onChunk: () => void): AsyncGenerator<string> {
	if (!res.body) return;
	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buf = "";
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			onChunk();
			buf += decoder.decode(value, { stream: true });
			let nl = buf.indexOf("\n");
			while (nl >= 0) {
				const line = buf.slice(0, nl).trim();
				buf = buf.slice(nl + 1);
				if (line) yield line;
				nl = buf.indexOf("\n");
			}
		}
		buf += decoder.decode();
		if (buf.trim()) yield buf.trim();
	} finally {
		reader.releaseLock();
	}
}

// stream=true queue lines while it waits (then a done line with the usual reply)
async function runSylla(
	endpoint: string,
	label: string,
	body: unknown,
	{ onQueue, signal }: SyllaJobOptions = {},
): Promise<SyllaResult> {
	const controller = new AbortController();
	let idle: ReturnType<typeof setTimeout> | undefined;
	const alive = () => {
		clearTimeout(idle);
		idle = setTimeout(() => controller.abort(), SYLLA_IDLE_TIMEOUT_MS);
	};
	const total = setTimeout(() => controller.abort(), SYLLA_JOB_TIMEOUT_MS);
	const onAbort = () => controller.abort();
	signal?.addEventListener("abort", onAbort, { once: true });
	alive();
	try {
		const res = await fetch(`https://api.radiant-lyrics.org/${endpoint}${syllaQs()}&stream=true`, {
			method: "POST",
			headers: { "content-type": "application/json", ...(await auth()) },
			body: JSON.stringify(body),
			signal: controller.signal,
		});
		// Refusals before a job exists are plain JSON
		if (!(res.headers.get("content-type") ?? "").includes("ndjson")) {
			const reply = await res.json().catch(() => null);
			if (!res.ok) return syllaError(res.status, reply, label);
			return syllaResult(reply as AlignResponse, label, res.status);
		}
		for await (const line of readLines(res, alive)) {
			let event: SyllaStreamEvent;
			try {
				event = JSON.parse(line) as SyllaStreamEvent;
			} catch {
				continue;
			}
			if (event.event === "queue") {
				sylTrace(`${label}: job ${event.id} queue`, queueOf(event));
				onQueue?.(queueOf(event));
			} else if (event.event === "done") {
				const status = event.status ?? 200;
				if (status >= 200 && status < 300) {
					return syllaResult(event.body as AlignResponse, label, status);
				}
				return syllaError(status, event.body, label);
			}
		}
		trace.log(`${label}: stream ended without a result`);
		return { ok: false, status: res.status, detail: "stream ended early" };
	} catch (err) {
		if (signal?.aborted) return { ok: false, status: 0, detail: "cancelled" };
		const timedOut = err instanceof DOMException && err.name === "AbortError";
		trace.log(`${label}: request ${timedOut ? "timed out" : `error | ${err}`}`);
		return { ok: false, status: 0, detail: timedOut ? "timed out" : String(err) };
	} finally {
		clearTimeout(idle);
		clearTimeout(total);
		signal?.removeEventListener("abort", onAbort);
		onQueue?.(null);
	}
}

function syllaError(status: number, reply: unknown, label: string): SyllaResult {
	// 422 from sylla-gen has verdict + message
	let detail = "";
	let verdict: string | undefined;
	const body = reply as
		| { detail?: unknown; message?: unknown; verdict?: unknown }
		| null
		| undefined;
	if (typeof body?.message === "string") detail = body.message;
	else if (typeof body?.detail === "string") detail = body.detail;
	if (typeof body?.verdict === "string") verdict = body.verdict;
	// Already Sylla lyrics (not a fail)
	const d = body?.detail as
		| ({ error?: unknown; message?: unknown } & SyllaAlreadyAligned)
		| undefined;
	if (status === 409 && d?.error === "already_aligned") {
		sylTrace(`${label}: already aligned (${d.job}, conf ${d.confidence})`);
		return {
			ok: false,
			status: 409,
			detail: typeof d.message === "string" ? d.message : "already aligned",
			verdict: "already_aligned",
			alreadyAligned: { job: d.job, jobType: d.jobType, confidence: d.confidence },
		};
	}
	trace.log(
		`${label}: request failed ${status}${verdict ? ` (${verdict})` : ""}${detail ? ` | ${detail}` : ""}`,
	);
	return { ok: false, status, detail: detail || verdict || "", verdict };
}

function syllaResult(data: AlignResponse, label: string, status: number): SyllaResult {
	// Different version of the song (nothing changed so skip)
	if (data?.verdict === "lyrics_do_not_match_audio") {
		trace.log(`${label}: lyrics do not match the audio`);
		return {
			ok: false,
			status,
			detail: data.message || "lyrics don't match this version of the song",
			verdict: data.verdict,
		};
	}
	if (data?.lyrics?.type !== "Word" || !Array.isArray(data.lyrics.data)) {
		trace.log(`${label}: response had no usable lyrics`);
		return { ok: false, status, detail: "invalid response" };
	}
	sylTrace(
		`${label}: ${data.model} verdict=${data.verdict} conf=${data.confidence}`,
		data.stats,
	);
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

	const data = await postRomanize(payload, 5000);
	if (!data) return null;
	return lineTexts.map((original, idx) => {
		const item = data[idx];
		return item?.romanized ?? item?.text ?? original;
	});
}

type RomanizedItem = {
	text?: string;
	romanized?: string;
	syllabus?: Array<{ text?: string; romanized?: string }>;
};

async function postRomanize(
	payload: unknown,
	timeoutMs: number,
): Promise<RomanizedItem[] | null> {
	const romanizeQuery = `?${platformQs}`;
	const urls: { url: string; useAtomixAuth: boolean }[] = [
		{
			url: `https://api.radiant-lyrics.org/rl-api/romanize${romanizeQuery}`,
			useAtomixAuth: true,
		},
		{
			url: `https://rl-api.kineticsand.net/romanize${romanizeQuery}`,
			useAtomixAuth: false,
		},
	];

	for (const { url, useAtomixAuth } of urls) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
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

			const data = (await res.json()) as { type?: string; data?: RomanizedItem[] };
			if (!Array.isArray(data?.data)) continue;
			return data.data;
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
