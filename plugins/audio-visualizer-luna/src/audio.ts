const log = (message: string) => console.log(`[Audio Visualizer] ${message}`);

let audioContext: AudioContext | null = null;
let monoAnalyser: AnalyserNode | null = null;
let leftAnalyser: AnalyserNode | null = null;
let rightAnalyser: AnalyserNode | null = null;
let splitter: ChannelSplitterNode | null = null;
let audioSource: MediaStreamAudioSourceNode | null = null;
let trackedVideo: HTMLVideoElement | null = null;
let connected = false;

let monoByteFreq: Uint8Array | null = null;
let monoByteTime: Uint8Array | null = null;
let monoFloatFreq: Float32Array | null = null;
let monoFloatTime: Float32Array | null = null;
let leftFloatTime: Float32Array | null = null;
let rightFloatTime: Float32Array | null = null;

export interface AudioData {
	byteFrequency: Uint8Array;
	byteTimeDomain: Uint8Array;
	floatFrequency: Float32Array;
	floatTimeDomain: Float32Array;
	leftTimeDomain: Float32Array;
	rightTimeDomain: Float32Array;
	sampleRate: number;
	fftSize: number;
	binCount: number;
}

export const setFFTSize = (size: number): void => {
	if (monoAnalyser) monoAnalyser.fftSize = size;
	if (leftAnalyser) leftAnalyser.fftSize = size;
	if (rightAnalyser) rightAnalyser.fftSize = size;
	allocateBuffers();
};

export const setSmoothing = (value: number): void => {
	if (monoAnalyser) monoAnalyser.smoothingTimeConstant = value;
	if (leftAnalyser) leftAnalyser.smoothingTimeConstant = value;
	if (rightAnalyser) rightAnalyser.smoothingTimeConstant = value;
};

const allocateBuffers = (): void => {
	if (!monoAnalyser) return;
	const bc = monoAnalyser.frequencyBinCount;
	monoByteFreq = new Uint8Array(bc);
	monoByteTime = new Uint8Array(bc);
	monoFloatFreq = new Float32Array(bc);
	monoFloatTime = new Float32Array(monoAnalyser.fftSize);

	if (leftAnalyser && rightAnalyser) {
		leftFloatTime = new Float32Array(leftAnalyser.fftSize);
		rightFloatTime = new Float32Array(rightAnalyser.fftSize);
	}
};

const createAnalyser = (ctx: AudioContext, fftSize: number, smoothing: number): AnalyserNode => {
	const a = ctx.createAnalyser();
	a.fftSize = fftSize;
	a.smoothingTimeConstant = smoothing;
	a.minDecibels = -100;
	a.maxDecibels = -10;
	return a;
};

const ensureContext = (fftSize: number, smoothing: number): boolean => {
	try {
		if (!audioContext || audioContext.state === "closed") {
			audioContext = new AudioContext();
		}

		if (!monoAnalyser) {
			monoAnalyser = createAnalyser(audioContext, fftSize, smoothing);
			leftAnalyser = createAnalyser(audioContext, fftSize, smoothing);
			rightAnalyser = createAnalyser(audioContext, fftSize, smoothing);
			splitter = audioContext.createChannelSplitter(2);
			splitter.connect(leftAnalyser, 0);
			splitter.connect(rightAnalyser, 1);
			allocateBuffers();
		}

		if (audioContext.state === "suspended") {
			audioContext.resume().catch(() => {});
		}

		return true;
	} catch (err) {
		log(`Failed to create audio context: ${err}`);
		return false;
	}
};

const disconnectSource = (): void => {
	if (audioSource) {
		try { audioSource.disconnect(); } catch {}
		audioSource = null;
	}
	connected = false;
};

const captureFromVideo = (video: HTMLVideoElement): boolean => {
	const capture = (video as unknown as { captureStream?: () => MediaStream }).captureStream;
	if (typeof capture !== "function") {
		log("captureStream() not available on video element");
		return false;
	}

	try {
		disconnectSource();

		const stream = capture.call(video);
		const tracks = stream.getAudioTracks();
		if (tracks.length === 0) {
			log("No audio tracks in captured stream");
			return false;
		}

		audioSource = audioContext!.createMediaStreamSource(stream);
		audioSource.connect(monoAnalyser!);
		audioSource.connect(splitter!);

		trackedVideo = video;
		connected = true;
		log("Audio connected via captureStream()");
		return true;
	} catch (err) {
		log(`captureStream() failed: ${err}`);
		return false;
	}
};

export const connect = (fftSize = 2048, smoothing = 0.8): boolean => {
	if (!ensureContext(fftSize, smoothing)) return false;

	const video = document.getElementById("video-one") as HTMLVideoElement | null;
	if (!video) {
		log("video-one element not found");
		return false;
	}

	return captureFromVideo(video);
};

export const reconnect = (fftSize = 2048, smoothing = 0.8): boolean => {
	disconnectSource();
	trackedVideo = null;
	return connect(fftSize, smoothing);
};

export const isConnected = (): boolean => connected;

export const videoChanged = (): boolean => {
	const video = document.getElementById("video-one") as HTMLVideoElement | null;
	if (!video) return false;
	return video !== trackedVideo;
};

export const sample = (): AudioData | null => {
	const ctx = audioContext;
	if (!ctx || !monoAnalyser || !monoByteFreq || !monoByteTime || !monoFloatFreq || !monoFloatTime || !leftFloatTime || !rightFloatTime || !leftAnalyser || !rightAnalyser) return null;

	if (ctx.state === "suspended") {
		ctx.resume().catch(() => {});
	}

	monoAnalyser.getByteFrequencyData(monoByteFreq);
	monoAnalyser.getByteTimeDomainData(monoByteTime);
	monoAnalyser.getFloatFrequencyData(monoFloatFreq);
	monoAnalyser.getFloatTimeDomainData(monoFloatTime);
	leftAnalyser.getFloatTimeDomainData(leftFloatTime);
	rightAnalyser.getFloatTimeDomainData(rightFloatTime);

	return {
		byteFrequency: monoByteFreq,
		byteTimeDomain: monoByteTime,
		floatFrequency: monoFloatFreq,
		floatTimeDomain: monoFloatTime,
		leftTimeDomain: leftFloatTime,
		rightTimeDomain: rightFloatTime,
		sampleRate: ctx.sampleRate,
		fftSize: monoAnalyser.fftSize,
		binCount: monoAnalyser.frequencyBinCount,
	};
};

export const hasSignal = (data: AudioData): boolean => {
	const avg = data.byteFrequency.reduce((s, v) => s + v, 0) / data.byteFrequency.length;
	return avg > 5;
};

export const dispose = (): void => {
	disconnectSource();
	if (audioContext && audioContext.state !== "closed") {
		audioContext.close().catch(() => {});
	}
	audioContext = null;
	monoAnalyser = null;
	leftAnalyser = null;
	rightAnalyser = null;
	splitter = null;
	trackedVideo = null;
	monoByteFreq = null;
	monoByteTime = null;
	monoFloatFreq = null;
	monoFloatTime = null;
	leftFloatTime = null;
	rightFloatTime = null;
};
