import { ReactiveStore } from "@luna/core";
import {
	LunaSettings,
	LunaNumberSetting,
	LunaSwitchSetting,
} from "@luna/ui";
import React from "react";

export const settings = await ReactiveStore.getPluginStorage(
	"AudioVisualizer",
	{
		barCount: 32,
		barColor: "#ffffff",
		barRounding: true,
		customColors: [] as string[],
	},
);

export const Settings = () => {
	const [barCount, setBarCount] = React.useState(settings.barCount);
	const [barColor, setBarColor] = React.useState(settings.barColor);
	const [barRounding, setBarRounding] = React.useState(settings.barRounding);
	const [showColorPicker, setShowColorPicker] = React.useState(false);
	const [isAnimatingIn, setIsAnimatingIn] = React.useState(false);
	const [shouldRender, setShouldRender] = React.useState(false);
	const [customInput, setCustomInput] = React.useState(settings.barColor);
	const [customColors, setCustomColors] = React.useState(settings.customColors);
	const [hoveredColorIndex, setHoveredColorIndex] = React.useState<
		number | null
	>(null);

	const closeColorPicker = () => {
		setIsAnimatingIn(false);
		setTimeout(() => {
			setShowColorPicker(false);
			setShouldRender(false);
		}, 200); // Wait for animation to complete because i need to
	};

	const openColorPicker = () => {
		setShowColorPicker(true);
		setShouldRender(true);
		setTimeout(() => setIsAnimatingIn(true), 10);
	};

	React.useEffect(() => {
		if (showColorPicker) {
			setShouldRender(true);
			setTimeout(() => setIsAnimatingIn(true), 10);
		}
	}, [showColorPicker]);

	// Common color presets for cool points :D
	const colorPresets = [
		"#ffffff",
		"#ff0000",
		"#00ff00",
		"#0000ff",
		"#ffff00",
		"#ff00ff",
		"#00ffff",
		"#ff8800",
		"#8800ff",
		"#0088ff",
		"#88ff00",
		"#ff0088",
		"#00ff88",
		"#444444",
		"#888888",
		"#cccccc",
		"#1db954",
		"#e22134",
		"#1976d2",
	];

	const updateColor = (color: string) => {
		setBarColor(color);
		setCustomInput(color);
		settings.barColor = color;
	};

	const addCustomColor = () => {
		if (customInput) {
			// Trim whitespace and convert to lowercase
			const trimmedInput = customInput.trim().toLowerCase();

			// Validate hex color format
			const hexColorRegex = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i;

			if (
				hexColorRegex.test(trimmedInput) &&
				!colorPresets.includes(trimmedInput) &&
				!customColors.includes(trimmedInput)
			) {
				const newCustomColors = [...customColors, trimmedInput];
				setCustomColors(newCustomColors);
				settings.customColors = newCustomColors;
			}
		}
	};

	const removeCustomColor = (colorToRemove: string) => {
		const newCustomColors = customColors.filter(
			(color) => color !== colorToRemove,
		);
		setCustomColors(newCustomColors);
		settings.customColors = newCustomColors;

		// If the removed color was the selected color (reset to white)
		if (barColor === colorToRemove) {
			updateColor("#ffffff");
		}
	};

	const allColors = [...colorPresets, ...customColors];

	return (
		<LunaSettings>
			<LunaSwitchSetting
				title="Bar Roundness"
				desc="Enable rounded corners on visualizer bars"
				checked={barRounding}
				onChange={(_, checked) => {
					setBarRounding(checked);
					settings.barRounding = checked;
				}}
			/>

			<LunaNumberSetting
				title="Bar Count"
				desc="Number of frequency bars to display"
				min={8}
				max={64}
				step={1}
				value={barCount}
				onNumber={(value: number) => {
					setBarCount(value);
					settings.barCount = value;
				}}
			/>

			{/* YUP YOUR EYES WORK... we do be using React code in the settings..*/}
			{/* I'm not sure if this is a good idea, but it works & looks amazing */}
			{/* Sorry @Inrixia <3 */}

			<div
				style={{
					padding: "16px 0",
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
				}}
			>
				<div>
					<div
						style={{
							fontWeight: "normal",
							fontSize: "1.075rem",
							marginBottom: "4px",
						}}
					>
						Bar Color
					</div>
					<div style={{ opacity: 0.7, fontSize: "14px" }}>
						Color of the visualizer bars
					</div>
				</div>
				<div
					style={{
						display: "flex",
						gap: "8px",
						alignItems: "center",
						position: "relative",
					}}
				>
					<button
						onClick={() =>
							showColorPicker ? closeColorPicker() : openColorPicker()
						}
						style={{
							width: "32px",
							height: "32px",
							border: "1px solid rgba(255,255,255,0.15)",
							borderRadius: "6px",
							cursor: "pointer",
							background: barColor,
							backdropFilter: "blur(10px)",
							WebkitBackdropFilter: "blur(10px)",
							position: "relative",
							overflow: "hidden",
						}}
					>
						<div
							style={{
								position: "absolute",
								inset: 0,
								background: "rgba(0,0,0,0.1)",
								backdropFilter: "blur(2px)",
							}}
						/>
					</button>

					{/* Custom Color Picker Modal */}
					{shouldRender && (
						<>
							{/* Backdrop */}
							<div
								style={{
									position: "fixed",
									top: 0,
									left: 0,
									right: 0,
									bottom: 0,
									background: "rgba(0,0,0,0.6)",
									zIndex: 1000,
									opacity: isAnimatingIn ? 1 : 0,
									transition: "opacity 0.2s ease",
								}}
								onClick={closeColorPicker}
							/>

							{/* Color Picker Panel */}
							<div
								style={{
									position: "fixed",
									top: "50%",
									left: "50%",
									background: "rgba(20,20,20,0.98)",
									backdropFilter: "blur(20px)",
									WebkitBackdropFilter: "blur(20px)",
									border: "1px solid rgba(255,255,255,0.15)",
									borderRadius: "16px",
									padding: "20px",
									minWidth: "320px",
									maxWidth: "90vw",
									maxHeight: "90vh",
									zIndex: 1001,
									boxShadow: "0 20px 40px rgba(0,0,0,0.7)",
									opacity: isAnimatingIn ? 1 : 0,
									transform: isAnimatingIn
										? "translate(-50%, -50%) scale(1)"
										: "translate(-50%, -50%) scale(0.9)",
									transition: "all 0.2s ease",
								}}
							>
								<div
									style={{
										marginBottom: "12px",
										color: "#fff",
										fontWeight: "bold",
										fontSize: "14px",
									}}
								>
									Choose Color
								</div>

								{/* Color Grid */}
								<div
									style={{
										display: "grid",
										gridTemplateColumns: "repeat(7, 1fr)",
										gap: "8px",
										marginBottom: "16px",
									}}
								>
									{allColors.map((color, index) => {
										const isCustomColor = customColors.includes(color);
										const isHovered = hoveredColorIndex === index;
										return (
											<div
												key={index}
												style={{
													position: "relative",
													width: "32px",
													height: "32px",
													cursor: "pointer",
												}}
												className="color-item"
												onMouseEnter={() => setHoveredColorIndex(index)}
												onMouseLeave={() => setHoveredColorIndex(null)}
											>
												<button
													onClick={() => {
														updateColor(color);
														closeColorPicker();
													}}
													style={{
														width: "100%",
														height: "100%",
														borderRadius: "6px",
														border:
															barColor === color
																? "2px solid #fff"
																: "1px solid rgba(255,255,255,0.2)",
														background: color,
														cursor: "pointer",
														transition: "all 0.2s ease",
													}}
												/>
												{isCustomColor && (
													<button
														onClick={(e) => {
															e.stopPropagation();
															removeCustomColor(color);
														}}
														style={{
															position: "absolute",
															top: "-4px",
															right: "-4px",
															width: "16px",
															height: "16px",
															borderRadius: "50%",
															border: "1px solid rgba(255,255,255,0.8)",
															background: "rgba(0,0,0,0.8)",
															color: "#fff",
															cursor: "pointer",
															fontSize: "10px",
															display: "flex",
															alignItems: "center",
															justifyContent: "center",
															opacity: isHovered ? 1 : 0,
															transition: "opacity 0.2s ease",
															zIndex: 10,
														}}
														className="remove-button"
													>
														×
													</button>
												)}
											</div>
										);
									})}
								</div>

								{/* Custom Hex Input */}
								<div style={{ marginBottom: "12px" }}>
									<div
										style={{
											color: "rgba(255,255,255,0.7)",
											fontSize: "12px",
											marginBottom: "6px",
										}}
									>
										Add Custom Color
									</div>
									<div
										style={{
											display: "flex",
											gap: "8px",
											alignItems: "center",
										}}
									>
										<input
											type="text"
											value={customInput}
											onChange={(e) => setCustomInput(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													updateColor(customInput);
													addCustomColor();
												}
											}}
											placeholder="#ffffff"
											style={{
												flex: 1,
												padding: "8px 12px",
												borderRadius: "6px",
												border: "1px solid rgba(255,255,255,0.2)",
												background: "rgba(255,255,255,0.1)",
												color: "#fff",
												fontSize: "14px",
												fontFamily: "monospace",
												boxSizing: "border-box",
											}}
										/>
										<button
											onClick={() => {
												updateColor(customInput);
												addCustomColor();
											}}
											style={{
												width: "32px",
												height: "32px",
												borderRadius: "6px",
												border: "1px solid rgba(255,255,255,0.3)",
												background: "rgba(255,255,255,0.15)",
												color: "#fff",
												cursor: "pointer",
												fontSize: "16px",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												transition: "all 0.2s ease",
											}}
											onMouseEnter={(e) => {
												e.currentTarget.style.background =
													"rgba(255,255,255,0.25)";
											}}
											onMouseLeave={(e) => {
												e.currentTarget.style.background =
													"rgba(255,255,255,0.15)";
											}}
										>
											+
										</button>
									</div>
								</div>

								{/* Close Button (Done) - Also runs when color chosen*/}
								<button
									onClick={closeColorPicker}
									style={{
										width: "100%",
										padding: "8px",
										borderRadius: "6px",
										border: "1px solid rgba(255,255,255,0.2)",
										background: "rgba(255,255,255,0.1)",
										color: "#fff",
										cursor: "pointer",
										fontSize: "12px",
									}}
								>
									Done
								</button>
							</div>
						</>
					)}
				</div>
			</div>
		</LunaSettings>
	);
};
