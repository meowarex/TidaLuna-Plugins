import type { AudioData } from "../audio";
import type { Visualizer } from "./types";
import { createProgram, drawQuad, setUniform1f, setUniform1fv, setUniform2f, setUniform3f, hexToRGB } from "../webgl";
import { settings } from "../Settings";

const BIN_COUNT = 256;

const FRAG = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_amplitudes[${BIN_COUNT}];
uniform vec3 u_color;
uniform float u_fill_opacity;
uniform float u_line_thickness;
uniform float u_opacity_falloff;

out vec4 fragColor;

float interpolate(float a, float b, float t) {
	return (1.0 - t) * a + t * b;
}

void main() {
	vec2 uv = gl_FragCoord.xy / u_resolution;
	int idx = int(uv.x * float(${BIN_COUNT}));
	int idxL = int((uv.x - 1.0 / u_resolution.x) * float(${BIN_COUNT}));
	int idxR = int((uv.x + 1.0 / u_resolution.x) * float(${BIN_COUNT}));
	idx = clamp(idx, 0, ${BIN_COUNT - 1});
	idxL = clamp(idxL, 0, ${BIN_COUNT - 1});
	idxR = clamp(idxR, 0, ${BIN_COUNT - 1});

	float amplitude = u_amplitudes[idx];
	float left = u_amplitudes[idxL];
	float right = u_amplitudes[idxR];
	float lowest = min(left, right);
	float dist = (amplitude - uv.y) * u_resolution.y;

	float a = 0.0;
	a += float(abs(dist) <= u_resolution.x * 0.005 * u_line_thickness || (uv.y >= lowest && uv.y <= amplitude)) * clamp(sign(dist), 0.0, 1.0);
	a += clamp(sign(amplitude - uv.y), 0.0, 1.0) * interpolate(1.0, u_fill_opacity, pow(1.0 - uv.y, 1.0 - u_opacity_falloff));
	a = clamp(a, 0.0, 1.0);
	fragColor = vec4(u_color * a, a);
}
`;

const amplitudes = new Float32Array(BIN_COUNT);

export const createSpectrumLine = (): Visualizer => {
	let gl: WebGL2RenderingContext | null = null;
	let program: WebGLProgram | null = null;
	let w = 0, h = 0;

	return {
		name: "Spectrum (Line)",
		id: "spectrum-line",

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
			const gain = settings.gain ?? 1.5;
			const binStep = data.byteFrequency.length / BIN_COUNT;
			for (let i = 0; i < BIN_COUNT; i++) {
				amplitudes[i] = Math.min(1, (data.byteFrequency[Math.floor(i * binStep)] / 255) * gain);
			}

			gl.viewport(0, 0, w, h);
			gl.clearColor(0, 0, 0, 0);
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.useProgram(program);

			setUniform2f(gl, program, "u_resolution", w, h);
			setUniform1fv(gl, program, "u_amplitudes", amplitudes);
			const [r, g, b] = hexToRGB(color);
			setUniform3f(gl, program, "u_color", r, g, b);
			setUniform1f(gl, program, "u_fill_opacity", settings.fillOpacity ?? 0.3);
			setUniform1f(gl, program, "u_line_thickness", settings.lineThickness ?? 1.5);
			setUniform1f(gl, program, "u_opacity_falloff", settings.opacityFalloff ?? 0.5);

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
