import { ReactiveStore } from "@luna/core";
import {
	LunaSettings,
	LunaNumberSetting,
	LunaSwitchSetting,
	LunaSelectSetting,
	LunaSelectItem,
} from "@luna/ui";
import React from "react";
import {
	VISUALIZER_LABELS,
	type VisualizerType,
	ALL_SLOT_KEYS,
	ZONE_SLOTS,
	ZONE_LABELS,
	POSITION_LABELS,
	type ZoneId,
	type PositionId,
	type SlotKey,
	MINI_SUPPORTED,
} from "./visualizers/types";

export const settings = await ReactiveStore.getPluginStorage(
	"AudioVisualizer",
	{
		navLeft1: "none" as VisualizerType,
		navLeft2: "none" as VisualizerType,
		navLeft3: "none" as VisualizerType,
		navRight1: "spectrum-bars" as VisualizerType,
		navRight2: "none" as VisualizerType,
		navRight3: "none" as VisualizerType,
		npLeft1: "none" as VisualizerType,
		npLeft2: "none" as VisualizerType,
		npLeft3: "none" as VisualizerType,
		npRight1: "oscilloscope" as VisualizerType,
		npRight2: "none" as VisualizerType,
		npRight3: "none" as VisualizerType,
		pbLeft1: "none" as VisualizerType,
		pbLeft2: "none" as VisualizerType,
		pbLeft3: "none" as VisualizerType,
		pbRight1: "none" as VisualizerType,
		pbRight2: "none" as VisualizerType,
		pbRight3: "none" as VisualizerType,
		barColor: "#ff69b4",
		barCount: 64,
		fftSize: 2048,
		reactivity: 30,
		gain: 1.5,
		barRounding: true,
		lineThickness: 2.0,
		fillOpacity: 0.6,
		opacityFalloff: 0.5,
		lissajous: false,
		scrollingOscilloscope: false,
		miniSlots: [] as string[],
		customColors: [] as string[],
	},
);

const VIZ_TYPES: VisualizerType[] = [
	"none",
	"spectrum-bars",
	"spectrum-line",
	"oscilloscope",
	"vectorscope",
	"loudness-meter",
];

const getSlot = (key: SlotKey): VisualizerType =>
	(settings as unknown as Record<string, VisualizerType>)[key] ?? "none";

const setSlot = (key: SlotKey, value: VisualizerType): void => {
	(settings as unknown as Record<string, VisualizerType>)[key] = value;
};

export const Settings = () => {
	const [barColor, setBarColor] = React.useState(settings.barColor);
	const [barCount, setBarCount] = React.useState(settings.barCount);
	const [fftSize, setFftSize] = React.useState(settings.fftSize);
	const [reactivity, setReactivity] = React.useState(settings.reactivity);
	const [gain, setGain] = React.useState(settings.gain);
	const [barRounding, setBarRounding] = React.useState(settings.barRounding);
	const [lineThickness, setLineThickness] = React.useState(settings.lineThickness);
	const [fillOpacity, setFillOpacity] = React.useState(settings.fillOpacity);
	const [lissajous, setLissajous] = React.useState(settings.lissajous);
	const [scrollingOscilloscope, setScrollingOscilloscope] = React.useState(settings.scrollingOscilloscope);


	const [showColorPicker, setShowColorPicker] = React.useState(false);
	const [isColorAnimIn, setIsColorAnimIn] = React.useState(false);
	const [shouldRenderColor, setShouldRenderColor] = React.useState(false);
	const [customInput, setCustomInput] = React.useState(settings.barColor);
	const [customColors, setCustomColors] = React.useState(settings.customColors);
	const [hoveredColorIndex, setHoveredColorIndex] = React.useState<number | null>(null);

	const [showSlotConfig, setShowSlotConfig] = React.useState(false);
	const [isSlotAnimIn, setIsSlotAnimIn] = React.useState(false);
	const [shouldRenderSlot, setShouldRenderSlot] = React.useState(false);
	const [activeZone, setActiveZone] = React.useState<ZoneId>("nowPlaying");
	const [slots, setSlots] = React.useState<Record<SlotKey, VisualizerType>>(() => {
		const vals = {} as Record<SlotKey, VisualizerType>;
		for (const key of ALL_SLOT_KEYS) vals[key] = getSlot(key);
		return vals;
	});
	const [miniSlots, setMiniSlots] = React.useState<Set<string>>(new Set(settings.miniSlots));

	const closeColorPicker = () => {
		setIsColorAnimIn(false);
		setTimeout(() => { setShowColorPicker(false); setShouldRenderColor(false); }, 200);
	};
	const openColorPicker = () => {
		setShowColorPicker(true);
		setShouldRenderColor(true);
		setTimeout(() => setIsColorAnimIn(true), 10);
	};
	const closeSlotConfig = () => {
		setIsSlotAnimIn(false);
		setTimeout(() => { setShowSlotConfig(false); setShouldRenderSlot(false); }, 200);
	};
	const openSlotConfig = () => {
		setShowSlotConfig(true);
		setShouldRenderSlot(true);
		setTimeout(() => setIsSlotAnimIn(true), 10);
	};

	React.useEffect(() => {
		if (showColorPicker) {
			setShouldRenderColor(true);
			setTimeout(() => setIsColorAnimIn(true), 10);
		}
	}, [showColorPicker]);

	React.useEffect(() => {
		if (showSlotConfig) {
			setShouldRenderSlot(true);
			setTimeout(() => setIsSlotAnimIn(true), 10);
		}
	}, [showSlotConfig]);

	const colorPresets = [
		"#ff69b4", "#ff1493", "#e91e8a", "#c71585",
		"#ff006e", "#ff4da6", "#ff85c8", "#ffb3d9",
		"#ffffff", "#ff0000", "#00ff00", "#0000ff",
		"#ffff00", "#ff00ff", "#00ffff", "#ff8800",
		"#8800ff", "#0088ff", "#1db954", "#444444",
	];

	const updateColor = (color: string) => {
		setBarColor(color);
		setCustomInput(color);
		settings.barColor = color;
	};

	const addCustomColor = () => {
		if (customInput) {
			const trimmed = customInput.trim().toLowerCase();
			const hexRe = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i;
			if (hexRe.test(trimmed) && !colorPresets.includes(trimmed) && !customColors.includes(trimmed)) {
				const nc = [...customColors, trimmed];
				setCustomColors(nc);
				settings.customColors = nc;
			}
		}
	};

	const removeCustomColor = (c: string) => {
		const nc = customColors.filter(x => x !== c);
		setCustomColors(nc);
		settings.customColors = nc;
		if (barColor === c) updateColor("#ff69b4");
	};

	const allColors = [...colorPresets, ...customColors];

	const updateSlot = (key: SlotKey, value: VisualizerType) => {
		setSlots(prev => ({ ...prev, [key]: value }));
		setSlot(key, value);
		if (!MINI_SUPPORTED.has(value)) {
			setMiniSlots(prev => {
				const next = new Set(prev);
				if (next.delete(key)) settings.miniSlots = [...next];
				return next;
			});
		}
	};

	const toggleMini = (key: SlotKey) => {
		setMiniSlots(prev => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			settings.miniSlots = [...next];
			return next;
		});
	};

	type BaseSwitchProps = React.ComponentProps<typeof LunaSwitchSetting>;
	type AnySwitchProps = Omit<BaseSwitchProps, "onChange"> & {
		onChange: (_: unknown, checked: boolean) => void;
		checked: boolean;
	};
	const AnySwitch = LunaSwitchSetting as unknown as React.ComponentType<AnySwitchProps>;

	const hasBars = ALL_SLOT_KEYS.some(key => slots[key] === "spectrum-bars");

	const zones: ZoneId[] = ["nowPlaying", "topNav", "playerBar"];
	const zonePositions = (zone: ZoneId) =>
		Object.keys(ZONE_SLOTS[zone]) as PositionId[];

	const backdropStyle = (animIn: boolean): React.CSSProperties => ({
		position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
		background: "rgba(0,0,0,0.6)", zIndex: 1000,
		opacity: animIn ? 1 : 0, transition: "opacity 0.2s ease",
		border: "none", padding: 0, cursor: "default", width: "100%",
	});

	const panelBaseStyle = (animIn: boolean): React.CSSProperties => ({
		position: "fixed", top: "50%", left: "50%",
		background: "rgba(20,20,20,0.98)",
		backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
		border: "1px solid rgba(255,255,255,0.15)", borderRadius: "16px",
		padding: "20px", maxHeight: "90vh", overflowY: "auto",
		zIndex: 1001, boxShadow: "0 20px 40px rgba(0,0,0,0.7)",
		opacity: animIn ? 1 : 0,
		transform: animIn ? "translate(-50%, -50%) scale(1)" : "translate(-50%, -50%) scale(0.9)",
		transition: "all 0.2s ease",
	});

	const selectStyle: React.CSSProperties = {
		width: "100%",
		padding: "6px 8px",
		borderRadius: "6px",
		border: "1px solid rgba(255,255,255,0.2)",
		background: "rgba(255,255,255,0.08)",
		color: "#fff",
		fontSize: "12px",
		cursor: "pointer",
		outline: "none",
	};

	const optionStyle: React.CSSProperties = {
		background: "#1a1a1a",
		color: "#fff",
	};

	return (
		<LunaSettings>
			{/* Color & Layout */}
			<div style={{
				display: "flex", justifyContent: "space-between", alignItems: "center",
				padding: "10px 0",
			}}>
				<div>
					<div style={{ fontWeight: 600, fontSize: "14px", color: "#fff" }}>Color & Layout</div>
					<div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginTop: "2px" }}>
						Visualizer color and slot placement
					</div>
				</div>
				<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
					<button
						type="button"
						onClick={() => showColorPicker ? closeColorPicker() : openColorPicker()}
						style={{
							width: "28px", height: "28px",
							border: "1px solid rgba(255,255,255,0.15)",
							borderRadius: "6px", cursor: "pointer", background: barColor,
							overflow: "hidden", position: "relative",
						}}
					>
						<div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.1)", backdropFilter: "blur(2px)" }} />
					</button>
					<button
						type="button"
						onClick={() => showSlotConfig ? closeSlotConfig() : openSlotConfig()}
						style={{
							padding: "6px 12px", borderRadius: "6px",
							border: "1px solid rgba(255,255,255,0.2)",
							background: "rgba(255,255,255,0.1)",
							color: "#fff", cursor: "pointer", fontSize: "12px",
							fontWeight: 500, transition: "all 0.2s ease",
							whiteSpace: "nowrap",
						}}
						onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.2)"; }}
						onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
					>Configure Slots</button>
				</div>
			</div>

			{/* Color picker modal */}
			{shouldRenderColor && (
				<>
					<button type="button" aria-label="Close color picker" onClick={closeColorPicker} style={backdropStyle(isColorAnimIn)} />
					<div style={{ ...panelBaseStyle(isColorAnimIn), minWidth: "320px", maxWidth: "90vw" }}>
						<div style={{ marginBottom: "12px", color: "#fff", fontWeight: "bold", fontSize: "14px" }}>Choose Color</div>

						<div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "8px", marginBottom: "16px" }}>
							{allColors.map((color, index) => {
								const isCustom = customColors.includes(color);
								const isHovered = hoveredColorIndex === index;
								return (
									// biome-ignore lint/a11y/noStaticElementInteractions: cosmetic hover tracking on wrapper containing interactive buttons
									<div
										key={color}
										style={{ position: "relative", width: "32px", height: "32px", cursor: "pointer" }}
										onMouseEnter={() => setHoveredColorIndex(index)}
										onMouseLeave={() => setHoveredColorIndex(null)}
									>
										<button
											type="button"
											onClick={() => { updateColor(color); closeColorPicker(); }}
											style={{
												width: "100%", height: "100%", borderRadius: "6px",
												border: barColor === color ? "2px solid #fff" : "1px solid rgba(255,255,255,0.2)",
												background: color, cursor: "pointer", transition: "all 0.2s ease",
											}}
										/>
										{isCustom && (
											<button
												type="button"
												onClick={(e) => { e.stopPropagation(); removeCustomColor(color); }}
												style={{
													position: "absolute", top: "-4px", right: "-4px",
													width: "16px", height: "16px", borderRadius: "50%",
													border: "1px solid rgba(255,255,255,0.8)", background: "rgba(0,0,0,0.8)",
													color: "#fff", cursor: "pointer", fontSize: "10px",
													display: "flex", alignItems: "center", justifyContent: "center",
													opacity: isHovered ? 1 : 0, transition: "opacity 0.2s ease", zIndex: 10,
												}}
											>x</button>
										)}
									</div>
								);
							})}
						</div>

						<div style={{ marginBottom: "12px" }}>
							<div style={{ color: "rgba(255,255,255,0.7)", fontSize: "12px", marginBottom: "6px" }}>Add Custom Color</div>
							<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
								<input
									type="text"
									value={customInput}
									onChange={(e) => setCustomInput(e.target.value)}
									onKeyDown={(e) => { if (e.key === "Enter") { updateColor(customInput); addCustomColor(); } }}
									placeholder="#ff69b4"
									style={{
										flex: 1, padding: "8px 12px", borderRadius: "6px",
										border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)",
										color: "#fff", fontSize: "14px", fontFamily: "monospace", boxSizing: "border-box",
									}}
								/>
								<button
									type="button"
									onClick={() => { updateColor(customInput); addCustomColor(); }}
									style={{
										width: "32px", height: "32px", borderRadius: "6px",
										border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.15)",
										color: "#fff", cursor: "pointer", fontSize: "16px",
										display: "flex", alignItems: "center", justifyContent: "center",
										transition: "all 0.2s ease",
									}}
									onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.25)"; }}
									onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; }}
								>+</button>
							</div>
						</div>

						<button
							type="button"
							onClick={closeColorPicker}
							style={{
								width: "100%", padding: "8px", borderRadius: "6px",
								border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)",
								color: "#fff", cursor: "pointer", fontSize: "12px",
							}}
						>Done</button>
					</div>
				</>
			)}

			{/* Slot configuration modal */}
			{shouldRenderSlot && (
				<>
					<button type="button" aria-label="Close slot config" onClick={closeSlotConfig} style={backdropStyle(isSlotAnimIn)} />
					<div style={{ ...panelBaseStyle(isSlotAnimIn), minWidth: "520px", maxWidth: "90vw", width: "600px" }}>
						<div style={{ marginBottom: "16px", color: "#fff", fontWeight: "bold", fontSize: "14px" }}>
							Configure Visualizer Slots
						</div>

						{/* Segment control */}
						<div style={{
							display: "flex", background: "rgba(255,255,255,0.08)",
							borderRadius: "10px", padding: "2px", gap: "2px", marginBottom: "20px",
						}}>
							{zones.map(zone => (
								<button
									key={zone}
									type="button"
									onClick={() => setActiveZone(zone)}
									style={{
										flex: 1, border: "none",
										background: activeZone === zone ? "rgba(255,255,255,0.15)" : "transparent",
										color: activeZone === zone ? "#fff" : "rgba(255,255,255,0.4)",
										fontSize: "12px", fontWeight: 600,
										padding: "7px 0", borderRadius: "8px",
										cursor: "pointer", transition: "all 0.2s ease",
										...(activeZone === zone ? { boxShadow: "0 1px 3px rgba(0,0,0,0.3)" } : {}),
									}}
								>{ZONE_LABELS[zone]}</button>
							))}
						</div>

						{/* Slot grid */}
						<div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
							{zonePositions(activeZone).map(pos => {
								const slotKeys = ZONE_SLOTS[activeZone][pos];
								if (!slotKeys) return null;
								return (
									<div key={pos} style={{ flex: 1, minWidth: 0 }}>
										<div style={{
											color: "rgba(255,255,255,0.6)", fontSize: "11px",
											fontWeight: 600, textTransform: "uppercase",
											letterSpacing: "0.5px", marginBottom: "8px",
											textAlign: "center",
										}}>{POSITION_LABELS[pos]}</div>
										<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
											{slotKeys.map((key, i) => (
												<div key={key} style={{ display: "flex", gap: "4px", alignItems: "center" }}>
													<select
														value={slots[key]}
														onChange={(e) => updateSlot(key, e.target.value as VisualizerType)}
														style={{ ...selectStyle, flex: 1 }}
														title={`Slot ${i + 1}`}
													>
														{VIZ_TYPES.map(t => (
															<option key={t} value={t} style={optionStyle}>{VISUALIZER_LABELS[t]}</option>
														))}
													</select>
													{MINI_SUPPORTED.has(slots[key]) && (
														<button
															type="button"
															title="Mini"
															onClick={() => toggleMini(key)}
															style={{
																width: "28px", height: "28px", flexShrink: 0,
																borderRadius: "6px", border: "1px solid rgba(255,255,255,0.2)",
																background: miniSlots.has(key) ? "rgba(255,105,180,0.4)" : "rgba(255,255,255,0.08)",
																color: miniSlots.has(key) ? "#fff" : "rgba(255,255,255,0.4)",
																cursor: "pointer", fontSize: "9px", fontWeight: 700,
																display: "flex", alignItems: "center", justifyContent: "center",
																transition: "all 0.2s ease",
															}}
														>M</button>
													)}
												</div>
											))}
										</div>
									</div>
								);
							})}
						</div>

						<button
							type="button"
							onClick={closeSlotConfig}
							style={{
								width: "100%", padding: "8px", borderRadius: "6px",
								border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)",
								color: "#fff", cursor: "pointer", fontSize: "12px", marginTop: "20px",
							}}
						>Done</button>
					</div>
				</>
			)}

			<LunaNumberSetting
				title="Reactivity"
				desc="How quickly visualizers respond to audio (5-100)"
				min={5}
				max={100}
				step={5}
				value={reactivity}
				onNumber={(v: number) => { setReactivity(v); settings.reactivity = v; }}
			/>

			<LunaNumberSetting
				title="Gain"
				desc="Amplitude boost for spectrum visualizers (0.5-3.0)"
				min={0.5}
				max={3.0}
				step={0.5}
				value={gain}
				onNumber={(v: number) => { setGain(v); settings.gain = v; }}
			/>

			<LunaSelectSetting
				title="FFT Size"
				desc="Frequency resolution (higher = more detail, more CPU)"
				value={fftSize}
			onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
				const v = Number(e.target.value);
				setFftSize(v);
				settings.fftSize = v;
			}}
			>
				{[256, 512, 1024, 2048, 4096, 8192, 16384].map(s => (
					<LunaSelectItem key={s} value={s}>{s}</LunaSelectItem>
				))}
			</LunaSelectSetting>

			<LunaNumberSetting
				title="Bar Count"
				desc="Number of frequency bars (Spectrum Bars)"
				min={8}
				max={128}
				step={1}
				value={barCount}
				onNumber={(v: number) => { setBarCount(v); settings.barCount = v; }}
			/>

			{hasBars && (
				<AnySwitch
					title="Bar Rounding"
					desc="Round the top corners of spectrum bars"
					checked={barRounding}
					onChange={(_: unknown, checked: boolean) => {
						setBarRounding(checked);
						settings.barRounding = checked;
					}}
				/>
			)}

			<LunaNumberSetting
				title="Line Thickness"
				desc="Stroke width for line-based visualizers (0.5-5)"
				min={0.5}
				max={5}
				step={0.5}
				value={lineThickness}
				onNumber={(v: number) => { setLineThickness(v); settings.lineThickness = v; }}
			/>

			<LunaNumberSetting
				title="Fill Opacity"
				desc="Fill below the Spectrum Line curve (0-1)"
				min={0}
				max={1}
				step={0.05}
				value={fillOpacity}
				onNumber={(v: number) => { setFillOpacity(v); settings.fillOpacity = v; }}
			/>

			<AnySwitch
				title="Scrolling Oscilloscope"
				desc="Waveform scrolls right-to-left like a chart recorder"
				checked={scrollingOscilloscope}
				onChange={(_: unknown, checked: boolean) => {
					setScrollingOscilloscope(checked);
					settings.scrollingOscilloscope = checked;
				}}
			/>

			<AnySwitch
				title="Lissajous Mode"
				desc="Rotate the Vectorscope 45° for Lissajous display"
				checked={lissajous}
				onChange={(_: unknown, checked: boolean) => {
					setLissajous(checked);
					settings.lissajous = checked;
				}}
			/>
		</LunaSettings>
	);
};
