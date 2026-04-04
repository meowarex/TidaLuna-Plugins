import type { AudioData } from "../audio";

export interface Visualizer {
	readonly name: string;
	readonly id: VisualizerType;
	init(canvas: HTMLCanvasElement, color: string): void;
	render(data: AudioData, color: string): void;
	resize(width: number, height: number): void;
	dispose(): void;
}

export type VisualizerType =
	| "spectrum-line"
	| "spectrum-bars"
	| "oscilloscope"
	| "vectorscope"
	| "loudness-meter"
	| "none";

export interface VisualizerDimensions {
	width: number;
	height: number;
}

export const VISUALIZER_DIMENSIONS: Record<VisualizerType, VisualizerDimensions> = {
	"spectrum-line": { width: 200, height: 40 },
	"spectrum-bars": { width: 200, height: 40 },
	oscilloscope: { width: 200, height: 40 },
	vectorscope: { width: 100, height: 40 },
	"loudness-meter": { width: 160, height: 40 },
	none: { width: 0, height: 0 },
};

export const VISUALIZER_LABELS: Record<VisualizerType, string> = {
	"spectrum-line": "Spectrum (Line)",
	"spectrum-bars": "Spectrum (Bars)",
	oscilloscope: "Oscilloscope",
	vectorscope: "Vectorscope",
	"loudness-meter": "Loudness (LUFS)",
	none: "None",
};

export type ZoneId = "topNav" | "nowPlaying" | "playerBar";
export type PositionId = "left" | "right";

export const ALL_SLOT_KEYS = [
	"navLeft1", "navLeft2", "navLeft3",
	"navRight1", "navRight2", "navRight3",
	"npLeft1", "npLeft2", "npLeft3",
	"npRight1", "npRight2", "npRight3",
	"pbLeft1", "pbLeft2", "pbLeft3",
	"pbRight1", "pbRight2", "pbRight3",
] as const;

export type SlotKey = (typeof ALL_SLOT_KEYS)[number];

export const ZONE_SLOTS: Record<ZoneId, Record<PositionId, readonly SlotKey[]>> = {
	topNav: {
		left: ["navLeft1", "navLeft2", "navLeft3"],
		right: ["navRight1", "navRight2", "navRight3"],
	},
	nowPlaying: {
		left: ["npLeft1", "npLeft2", "npLeft3"],
		right: ["npRight1", "npRight2", "npRight3"],
	},
	playerBar: {
		left: ["pbLeft1", "pbLeft2", "pbLeft3"],
		right: ["pbRight1", "pbRight2", "pbRight3"],
	},
};

export const ZONE_LABELS: Record<ZoneId, string> = {
	nowPlaying: "Now Playing View",
	topNav: "Top Nav",
	playerBar: "Player Bar",
};

export const POSITION_LABELS: Record<PositionId, string> = {
	left: "Left",
	right: "Right",
};

export const MINI_SUPPORTED = new Set<VisualizerType>(["oscilloscope", "vectorscope"]);

export const MINI_DIMENSIONS: Partial<Record<VisualizerType, VisualizerDimensions>> = {
	oscilloscope: { width: 80, height: 60 },
	vectorscope: { width: 72, height: 40 },
};
