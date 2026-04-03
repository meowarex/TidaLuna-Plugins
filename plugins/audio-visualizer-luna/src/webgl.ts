const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
void main() {
	gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const compileShader = (gl: WebGL2RenderingContext, type: number, source: string): WebGLShader => {
	const shader = gl.createShader(type)!;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const info = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw new Error(`Shader compile error: ${info}`);
	}
	return shader;
};

export const createProgram = (gl: WebGL2RenderingContext, fragSource: string): WebGLProgram => {
	const vert = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
	const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);
	const program = gl.createProgram()!;
	gl.attachShader(program, vert);
	gl.attachShader(program, frag);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const info = gl.getProgramInfoLog(program);
		gl.deleteProgram(program);
		throw new Error(`Program link error: ${info}`);
	}
	gl.deleteShader(vert);
	gl.deleteShader(frag);
	return program;
};

interface QuadResources {
	vao: WebGLVertexArrayObject;
	vbo: WebGLBuffer;
}
const quadMap = new WeakMap<WebGL2RenderingContext, QuadResources>();

const ensureQuad = (gl: WebGL2RenderingContext, program: WebGLProgram): QuadResources => {
	let res = quadMap.get(gl);
	if (res) return res;
	const verts = new Float32Array([-1, -1, 3, -1, -1, 3]);
	const vao = gl.createVertexArray()!;
	const vbo = gl.createBuffer()!;
	gl.bindVertexArray(vao);
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
	gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
	const loc = gl.getAttribLocation(program, "a_position");
	gl.enableVertexAttribArray(loc);
	gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
	gl.bindVertexArray(null);
	res = { vao, vbo };
	quadMap.set(gl, res);
	return res;
};

export const drawQuad = (gl: WebGL2RenderingContext, program: WebGLProgram): void => {
	const res = ensureQuad(gl, program);
	gl.useProgram(program);
	gl.bindVertexArray(res.vao);
	gl.drawArrays(gl.TRIANGLES, 0, 3);
	gl.bindVertexArray(null);
};

export interface PingPongBuffers {
	fbos: [WebGLFramebuffer, WebGLFramebuffer];
	textures: [WebGLTexture, WebGLTexture];
	current: 0 | 1;
}

const createFBOTexture = (gl: WebGL2RenderingContext, w: number, h: number): { fbo: WebGLFramebuffer; texture: WebGLTexture } => {
	const tex = gl.createTexture()!;
	gl.bindTexture(gl.TEXTURE_2D, tex);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	const fbo = gl.createFramebuffer()!;
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.bindTexture(gl.TEXTURE_2D, null);

	return { fbo, texture: tex };
};

export const createPingPong = (gl: WebGL2RenderingContext, w: number, h: number): PingPongBuffers => {
	const a = createFBOTexture(gl, w, h);
	const b = createFBOTexture(gl, w, h);
	return {
		fbos: [a.fbo, b.fbo],
		textures: [a.texture, b.texture],
		current: 0,
	};
};

export const resizePingPong = (gl: WebGL2RenderingContext, pp: PingPongBuffers, w: number, h: number): void => {
	for (const tex of pp.textures) {
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
	}
	gl.bindTexture(gl.TEXTURE_2D, null);
};

export const setUniform1f = (gl: WebGL2RenderingContext, program: WebGLProgram, name: string, v: number): void => {
	gl.uniform1f(gl.getUniformLocation(program, name), v);
};

export const setUniform2f = (gl: WebGL2RenderingContext, program: WebGLProgram, name: string, x: number, y: number): void => {
	gl.uniform2f(gl.getUniformLocation(program, name), x, y);
};

export const setUniform3f = (gl: WebGL2RenderingContext, program: WebGLProgram, name: string, x: number, y: number, z: number): void => {
	gl.uniform3f(gl.getUniformLocation(program, name), x, y, z);
};

export const setUniform1fv = (gl: WebGL2RenderingContext, program: WebGLProgram, name: string, v: Float32Array): void => {
	gl.uniform1fv(gl.getUniformLocation(program, name), v);
};

export const setUniform1i = (gl: WebGL2RenderingContext, program: WebGLProgram, name: string, v: number): void => {
	gl.uniform1i(gl.getUniformLocation(program, name), v);
};

export const disposeQuad = (gl: WebGL2RenderingContext): void => {
	const res = quadMap.get(gl);
	if (res) {
		gl.deleteVertexArray(res.vao);
		gl.deleteBuffer(res.vbo);
		quadMap.delete(gl);
	}
};

export const disposePingPong = (gl: WebGL2RenderingContext, pp: PingPongBuffers): void => {
	for (const fbo of pp.fbos) gl.deleteFramebuffer(fbo);
	for (const tex of pp.textures) gl.deleteTexture(tex);
};

export const hexToRGB = (hex: string): [number, number, number] => {
	const c = hex.replace("#", "");
	const r = parseInt(c.substring(0, 2), 16) / 255;
	const g = parseInt(c.substring(2, 4), 16) / 255;
	const b = parseInt(c.substring(4, 6), 16) / 255;
	return [r, g, b];
};
