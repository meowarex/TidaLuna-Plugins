import type { AudioData } from "../audio";
import type { Visualizer } from "./types";
import { createProgram, drawQuad, setUniform1f, setUniform1fv, setUniform2f, setUniform3f, hexToRGB } from "../webgl";
import { settings } from "../Settings";

const MAX_BARS = 128;

const FRAG = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_amplitudes[${MAX_BARS}];
uniform int u_bar_count;
uniform vec3 u_color;
uniform float u_gap;
uniform float u_gain;
uniform float u_rounding;

out vec4 fragColor;

void main() {
	vec2 uv = gl_FragCoord.xy / u_resolution;

	float cellFloat = uv.x * float(u_bar_count);
	int barIdx = clamp(int(cellFloat), 0, u_bar_count - 1);
	float cellPos = fract(cellFloat);

	float amp = clamp(u_amplitudes[barIdx] * u_gain, 0.0, 1.0);

	if (amp < 0.005) {
		fragColor = vec4(0.0);
		return;
	}

	// Bar shape with anti-aliased edges and configurable gap
	float barMask = smoothstep(0.0, u_gap, cellPos)
	              * smoothstep(0.0, u_gap, 1.0 - cellPos);

	// Hard cut at bottom, soft feather only at the top edge
	float feather = 1.5 / u_resolution.y;
	float heightMask = 1.0 - smoothstep(amp - feather, amp + feather, uv.y);

	float a = barMask * heightMask;

	// Rounded top corners in pixel space
	if (u_rounding > 0.5 && a > 0.0) {
		float cellPx = u_resolution.x / float(u_bar_count);
		float barPx = cellPx * (1.0 - 2.0 * u_gap);
		float fromLeft = (cellPos - u_gap) * cellPx;
		float fromRight = barPx - fromLeft;
		float fromTop = (amp - uv.y) * u_resolution.y;
		float r = clamp(barPx * 0.3, 1.0, 3.0);
		float edgeX = min(fromLeft, fromRight);
		if (edgeX < r && fromTop < r && fromTop >= 0.0) {
			float d = length(vec2(r - edgeX, r - fromTop)) - r;
			a *= 1.0 - smoothstep(-0.5, 0.5, d);
		}
	}

	fragColor = vec4(u_color * a, a);
}
`;

const amplitudes = new Float32Array(MAX_BARS);

export const createSpectrumBars = (): Visualizer => {
	let gl: WebGL2RenderingContext | null = null;
	let program: WebGLProgram | null = null;
	let w = 0, h = 0;

	return {
		name: "Spectrum (Bars)",
		id: "spectrum-bars",

		init(canvas, _color) {
			gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true })!;
			if (!gl) throw new Error("WebGL2 not available");
			program = createProgram(gl, FRAG);
			w = canvas.width;
			h = canvas.height;
			gl.viewport(0, 0, w, h);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		},

		render(data: AudioData, color: string) {
			if (!gl || !program) return;
			const barCount = Math.min(settings.barCount ?? 64, MAX_BARS);
			const gain = settings.gain ?? 1.5;

			// Use byteFrequency (0-255 normalized across full analyser range)
			const binStep = data.byteFrequency.length / barCount;
			for (let i = 0; i < barCount; i++) {
				let maxVal = 0;
				const start = Math.floor(i * binStep);
				const end = Math.floor((i + 1) * binStep);
				for (let j = start; j < end; j++) {
					if (data.byteFrequency[j] > maxVal) maxVal = data.byteFrequency[j];
				}
				amplitudes[i] = Math.min(1, (maxVal / 255) * gain);
			}
			for (let i = barCount; i < MAX_BARS; i++) amplitudes[i] = 0;

			gl.viewport(0, 0, w, h);
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.useProgram(program);

			setUniform2f(gl, program, "u_resolution", w, h);
			setUniform1fv(gl, program, "u_amplitudes", amplitudes);
			const loc = gl.getUniformLocation(program, "u_bar_count");
			gl.uniform1i(loc, barCount);
			const [r, g, b] = hexToRGB(color);
			setUniform3f(gl, program, "u_color", r, g, b);
			const cellPx = w / barCount;
			const gap = Math.min(0.15, 1.5 / cellPx);
			setUniform1f(gl, program, "u_gap", gap);
			setUniform1f(gl, program, "u_gain", 1.0);
			setUniform1f(gl, program, "u_rounding", settings.barRounding ? 1.0 : 0.0);

			drawQuad(gl, program);
		},

		resize(width, height) {
			w = width;
			h = height;
			if (gl) gl.viewport(0, 0, w, h);
		},

		dispose() {
			if (gl && program) gl.deleteProgram(program);
			program = null;
			gl = null;
		},
	};
};
