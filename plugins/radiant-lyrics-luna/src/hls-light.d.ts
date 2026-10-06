// hls.js ships types for its main entry only. The light build is the same public
// API with alt-audio, subtitles and EME stripped, so point it at those types.
declare module "hls.js/light" {
	export * from "hls.js";
	export { default } from "hls.js";
}
