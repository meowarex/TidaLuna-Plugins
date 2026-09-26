import { ReactiveStore } from "@luna/core";
import { LunaSettings, LunaSwitchSetting, LunaNumberSetting } from "@luna/ui";
import React from "react";

declare global {
	interface Window {
		updateRadiantLyricsStyles?: () => void;
		updateRadiantLyricsTextGlow?: () => void;
		updateRadiantLyricsPlayerBarTint?: () => void;
		updateRadiantLyricsBackdrop?: () => void;
		updateAnimatedArtwork?: (target?: unknown) => void;
		updateAnimatedArtworkRate?: () => void;
		updateQualityProgressColor?: () => void;
		updateIntegratedSeekBar?: () => void;
		updateLyricsStyle?: () => void;
		updateLyricsStyleSetting?: (value: number) => void;
		updateRomanizeLyrics?: () => void;
		updateRomanizeLyricsSetting?: (checked: boolean) => void;
		updateAiSyllables?: () => void;
		updateAiSyllablesSetting?: (checked: boolean) => void;
	}
}

export const settings = await ReactiveStore.getPluginStorage("RadiantLyrics", {
	lyricsGlowEnabled: true,
	textGlow: 20,
	lyricsStyle: 2,
	lyricsFontSize: 100,
	blurInactive: true,
	contextAwareLyrics: true,
	bubbledLyrics: true,
	romanizeLyrics: false,
	aiSyllables: false,
	syllableStyle: 0, // MARKER: Syllable animations SETTINGS (WIP coming soon)
	syllableLogging: false,
	// Playback clock calibration in ms (i assume Lunar will break playback one day since MPV is wierd so i added this for that)
	lyricsOffsetMs: 0,
	hideUIEnabled: true,
	playerBarVisible: false,
	qualityProgressColor: true,
	integratedSeekBar: false,
	floatingPlayerBar: true,
	playerBarRadius: 5,
	playerBarSpacing: 10,
	playerBarBlur: true,
	playerBarBlurAmount: 15,
	playerBarTintEnabled: true,
	playerBarTint: 5,
	playerBarTintColor: "#000000" as string,
	playerBarTintCustomColors: [] as string[],
	// Master switch
	backdropEnabled: true,
	animatedArtwork: true,
	animatedArtworkFps: 25,
	backdropStyle: 0,
	backdropPlaybackReactive: true,
	CoverEverywhere: true,
	performanceMode: false,
	// Backdrop is rendered entirely by kawarp (yay!)
	backdropOpacity: 75,
	backdropWarp: 100,
	backdropBlurPasses: 6,
	backdropSpeed: 175,
	backdropContrast: 125,
	backdropSaturation: 125,
	backdropDithering: 15,
	backdropScale: 100,
	// Readability on bright covers <3
	backdropDarken: 80,
});

export const Settings = () => {
	const [hideUIEnabled, setHideUIEnabled] = React.useState(
		settings.hideUIEnabled,
	);
	const [playerBarVisible, setPlayerBarVisible] = React.useState(
		settings.playerBarVisible,
	);
	const [lyricsGlowEnabled, setLyricsGlowEnabled] = React.useState(
		settings.lyricsGlowEnabled,
	);
	const [textGlow, setTextGlow] = React.useState(settings.textGlow);
	const [CoverEverywhere, setCoverEverywhere] = React.useState(
		settings.CoverEverywhere,
	);
	const [backdropEnabled, setBackdropEnabled] = React.useState(
		settings.backdropEnabled,
	);
	const [animatedArtwork, setAnimatedArtwork] = React.useState(
		settings.animatedArtwork,
	);
	const [animatedArtworkFps, setAnimatedArtworkFps] = React.useState(
		settings.animatedArtworkFps,
	);
	const [backdropStyle, setBackdropStyle] = React.useState(
		settings.backdropStyle,
	);
	const [backdropPlaybackReactive, setBackdropPlaybackReactive] =
		React.useState(settings.backdropPlaybackReactive);
	const [performanceMode, setPerformanceMode] = React.useState(
		settings.performanceMode,
	);
	const [backdropOpacity, setBackdropOpacity] = React.useState(
		settings.backdropOpacity,
	);
	const [backdropWarp, setBackdropWarp] = React.useState(settings.backdropWarp);
	const [backdropBlurPasses, setBackdropBlurPasses] = React.useState(
		settings.backdropBlurPasses,
	);
	const [backdropSpeed, setBackdropSpeed] = React.useState(
		settings.backdropSpeed,
	);
	const [backdropContrast, setBackdropContrast] = React.useState(
		settings.backdropContrast,
	);
	const [backdropSaturation, setBackdropSaturation] = React.useState(
		settings.backdropSaturation,
	);
	const [backdropDithering, setBackdropDithering] = React.useState(
		settings.backdropDithering,
	);
	const [backdropScale, setBackdropScale] = React.useState(
		settings.backdropScale,
	);
	const [backdropDarken, setBackdropDarken] = React.useState(
		settings.backdropDarken,
	);
	const [floatingPlayerBar, setFloatingPlayerBar] = React.useState(
		settings.floatingPlayerBar,
	);
	const [playerBarTintEnabled, setPlayerBarTintEnabled] = React.useState(
		settings.playerBarTintEnabled,
	);
	const [playerBarTint, setPlayerBarTint] = React.useState(
		settings.playerBarTint,
	);
	const [playerBarTintColor, setPlayerBarTintColor] = React.useState(
		settings.playerBarTintColor,
	);
	const [playerBarBlur, setPlayerBarBlur] = React.useState(
		settings.playerBarBlur,
	);
	const [playerBarBlurAmount, setPlayerBarBlurAmount] = React.useState(
		settings.playerBarBlurAmount,
	);
	const [playerBarRadius, setPlayerBarRadius] = React.useState(
		settings.playerBarRadius,
	);
	const [playerBarSpacing, setPlayerBarSpacing] = React.useState(
		settings.playerBarSpacing,
	);
	const [showTintColorPicker, setShowTintColorPicker] = React.useState(false);
	const [isTintAnimatingIn, setIsTintAnimatingIn] = React.useState(false);
	const [shouldRenderTintPicker, setShouldRenderTintPicker] =
		React.useState(false);
	const [tintCustomInput, setTintCustomInput] = React.useState(
		settings.playerBarTintColor,
	);
	const [tintCustomColors, setTintCustomColors] = React.useState(
		settings.playerBarTintCustomColors,
	);
	const [tintHoveredColorIndex, setTintHoveredColorIndex] = React.useState<
		number | null
	>(null);
	const [lyricsStyle, setLyricsStyle] = React.useState(settings.lyricsStyle);
	React.useEffect(() => {
		window.updateLyricsStyleSetting = (value: number) => setLyricsStyle(value);
		return () => {
			window.updateLyricsStyleSetting = undefined;
		};
	}, []);
	const [lyricsFontSize, setLyricsFontSize] = React.useState(
		settings.lyricsFontSize,
	);
	const [contextAwareLyrics, setContextAwareLyrics] = React.useState(
		settings.contextAwareLyrics,
	);
	const [blurInactive, setBlurInactive] = React.useState(settings.blurInactive);
	const [bubbledLyrics, setBubbledLyrics] = React.useState(
		settings.bubbledLyrics,
	);
	const [qualityProgressColor, setQualityProgressColor] = React.useState(
		settings.qualityProgressColor,
	);
	const [integratedSeekBar, setIntegratedSeekBar] = React.useState(
		settings.integratedSeekBar,
	);
	const [romanizeLyrics, setRomanizeLyrics] = React.useState(
		settings.romanizeLyrics,
	);
	React.useEffect(() => {
		window.updateRomanizeLyricsSetting = (checked: boolean) =>
			setRomanizeLyrics(checked);
		return () => {
			window.updateRomanizeLyricsSetting = undefined;
		};
	}, []);
	const [aiSyllables, setAiSyllables] = React.useState(
		settings.aiSyllables,
	);
	React.useEffect(() => {
		window.updateAiSyllablesSetting = (checked: boolean) =>
			setAiSyllables(checked);
		return () => {
			window.updateAiSyllablesSetting = undefined;
		};
	}, []);

	const refreshBackdrop = () => {
		window.updateRadiantLyricsBackdrop?.();
	};

	// Derive props and override onChange to accept a broader first param type
	type BaseSwitchProps = React.ComponentProps<typeof LunaSwitchSetting>;
	type AnySwitchProps = Omit<BaseSwitchProps, "onChange"> & {
		onChange: (_: unknown, checked: boolean) => void;
		checked: boolean;
	};
	const AnySwitch =
		LunaSwitchSetting as unknown as React.ComponentType<AnySwitchProps>;

	return (
		<LunaSettings>
			<AnySwitch
				title="Lyrics Glow Effect"
				desc="Enable glowing effect on lyrics"
				checked={lyricsGlowEnabled}
				onChange={(_: unknown, checked: boolean) => {
					settings.lyricsGlowEnabled = checked;
					setLyricsGlowEnabled(checked);
					// Update styles immediately when setting changes
					if (window.updateRadiantLyricsStyles) {
						window.updateRadiantLyricsStyles();
					}
				}}
			/>
			{lyricsGlowEnabled && (
				<LunaNumberSetting
					title="Text Glow"
					desc="Adjust the glow size of lyrics (0-100, default: 20)"
					min={0}
					max={100}
					step={1}
					value={textGlow}
					onNumber={(value: number) => {
						settings.textGlow = value;
						setTextGlow(value);
						// Update variables immediately when setting changes
						if (window.updateRadiantLyricsTextGlow) {
							window.updateRadiantLyricsTextGlow();
						}
					}}
				/>
			)}
			<LunaNumberSetting
				title="Lyrics Style"
				desc="0 = Line (default), 1 = Word, 2 = Syllable (mirrored in lyrics dropdown)"
				min={0}
				max={2}
				step={1}
				value={lyricsStyle}
				onNumber={(value: number) => {
					settings.lyricsStyle = value;
					setLyricsStyle(value);
					if (window.updateLyricsStyle) {
						window.updateLyricsStyle();
					}
				}}
			/>
			<LunaNumberSetting
				title="Lyrics Font Size"
				desc="Scale the lyrics font size (50-200%, default: 100)"
				min={50}
				max={200}
				step={5}
				value={lyricsFontSize}
				onNumber={(value: number) => {
					settings.lyricsFontSize = value;
					setLyricsFontSize(value);
					if (window.updateRadiantLyricsTextGlow) {
						window.updateRadiantLyricsTextGlow();
					}
				}}
			/>
			<AnySwitch
				title="Blur Inactive"
				desc="Blurs inactive lyric lines, scaling with distance from the active line"
				checked={blurInactive}
				onChange={(_: unknown, checked: boolean) => {
					settings.blurInactive = checked;
					setBlurInactive(checked);
					if (window.updateLyricsStyle) {
						window.updateLyricsStyle();
					}
				}}
			/>
			<AnySwitch
				title="Context Aware Lyrics"
				desc="Enables background vocal display & duet singer positioning"
				checked={contextAwareLyrics}
				onChange={(_: unknown, checked: boolean) => {
					settings.contextAwareLyrics = checked;
					setContextAwareLyrics(checked);
					if (window.updateLyricsStyle) {
						window.updateLyricsStyle();
					}
				}}
			/>
			<AnySwitch
				title="Bubbled Lyrics"
				desc="Smooth bounce animation on line/word transitions"
				checked={bubbledLyrics}
				onChange={(_: unknown, checked: boolean) => {
					settings.bubbledLyrics = checked;
					setBubbledLyrics(checked);
					if (window.updateLyricsStyle) {
						window.updateLyricsStyle();
					}
				}}
      />
      			<AnySwitch
				title="Romanize Lyrics"
				desc="Display romanized (latin) text for non-latin lyrics (e.g. Korean, Japanese, Chinese)"
				checked={romanizeLyrics}
				onChange={(_: unknown, checked: boolean) => {
					settings.romanizeLyrics = checked;
					setRomanizeLyrics(checked);
					if (window.updateRomanizeLyrics) {
						window.updateRomanizeLyrics();
					}
				}}
			/>
			<AnySwitch
				title="WIP | AI Generated Syllables"
				desc="Radiant AI generates word & syllable timings from the Line timings"
				checked={aiSyllables}
				onChange={(_: unknown, checked: boolean) => {
					settings.aiSyllables = checked;
					setAiSyllables(checked);
					if (window.updateAiSyllables) {
						window.updateAiSyllables();
					}
				}}
			/>
			<AnySwitch
				title="Hide UI Feature"
				desc="Enable hide/unhide UI functionality with toggle buttons"
				checked={hideUIEnabled}
				onChange={(_: unknown, checked: boolean) => {
					settings.hideUIEnabled = checked;
					setHideUIEnabled(checked);
				}}
			/>
			{hideUIEnabled && (
				<AnySwitch
					title="Player Bar Visibility in Hide UI Mode"
					desc="Keep player bar visible when UI is hidden"
					checked={playerBarVisible}
					onChange={(_: unknown, checked: boolean) => {
						console.log(
							"Player Bar Visibility:",
							checked ? "visible" : "hidden",
						);
						settings.playerBarVisible = checked;
						setPlayerBarVisible(checked);
						// Update styles immediately when setting changes
						if (window.updateRadiantLyricsStyles) {
							window.updateRadiantLyricsStyles();
						}
					}}
				/>
			)}
			<AnySwitch
				title="Quality Matched Seeker Color"
				desc="Color the progress/seeker bar based on streaming quality"
				checked={qualityProgressColor}
				onChange={(_: unknown, checked: boolean) => {
					settings.qualityProgressColor = checked;
					setQualityProgressColor(checked);
					if (window.updateQualityProgressColor) {
						window.updateQualityProgressColor();
					}
				}}
			/>
			<AnySwitch
				title="Integrated Seek Bar"
				desc="Move the seekbar to the top border of the player bar"
				checked={integratedSeekBar}
				onChange={(_: unknown, checked: boolean) => {
					settings.integratedSeekBar = checked;
					setIntegratedSeekBar(checked);
					if (window.updateIntegratedSeekBar) {
						window.updateIntegratedSeekBar();
					}
				}}
			/>
			<AnySwitch
				title="Floating Player Bar"
				desc="When disabled, the player bar becomes a square edge-to-edge bar"
				checked={floatingPlayerBar}
				onChange={(_: unknown, checked: boolean) => {
					settings.floatingPlayerBar = checked;
					setFloatingPlayerBar(checked);
					if (window.updateRadiantLyricsStyles) {
						window.updateRadiantLyricsStyles();
					}
				}}
			/>
			{floatingPlayerBar && (
				<>
					<LunaNumberSetting
						title="Floating Bar Corner Radius"
						desc="Adjust the corner rounding of the player bar (0-50, default: 5)"
						min={0}
						max={50}
						step={1}
						value={playerBarRadius}
						onNumber={(value: number) => {
							settings.playerBarRadius = value;
							setPlayerBarRadius(value);
							window.updateRadiantLyricsPlayerBarTint?.();
						}}
					/>
					<LunaNumberSetting
						title="Floating Bar Spacing"
						desc="Adjust the spacing of the player bar from the edges (0-50, default: 10)"
						min={0}
						max={50}
						step={1}
						value={playerBarSpacing}
						onNumber={(value: number) => {
							settings.playerBarSpacing = value;
							setPlayerBarSpacing(value);
							window.updateRadiantLyricsPlayerBarTint?.();
						}}
					/>
				</>
			)}
			<AnySwitch
				title="Player Bar Blur"
				desc="Enable backdrop blur effect on the player bar"
				checked={playerBarBlur}
				onChange={(_: unknown, checked: boolean) => {
					settings.playerBarBlur = checked;
					setPlayerBarBlur(checked);
					window.updateRadiantLyricsPlayerBarTint?.();
				}}
			/>
			{playerBarBlur && (
				<LunaNumberSetting
					title="Player Bar Blur Amount"
					desc="Adjust the backdrop blur intensity (0-100, default: 15)"
					min={0}
					max={100}
					step={1}
					value={playerBarBlurAmount}
					onNumber={(value: number) => {
						settings.playerBarBlurAmount = value;
						setPlayerBarBlurAmount(value);
						window.updateRadiantLyricsPlayerBarTint?.();
					}}
				/>
			)}
			{(() => {
				const closeTintColorPicker = () => {
					setIsTintAnimatingIn(false);
					setTimeout(() => {
						setShowTintColorPicker(false);
						setShouldRenderTintPicker(false);
					}, 200);
				};

				const openTintColorPicker = () => {
					setShowTintColorPicker(true);
					setShouldRenderTintPicker(true);
					setTimeout(() => setIsTintAnimatingIn(true), 10);
				};

				const updateTintColor = (color: string) => {
					setPlayerBarTintColor(color);
					setTintCustomInput(color);
					settings.playerBarTintColor = color;
					window.updateRadiantLyricsPlayerBarTint?.();
				};

				const addTintCustomColor = () => {
					if (tintCustomInput) {
						const trimmedInput = tintCustomInput.trim().toLowerCase();
						const hexColorRegex = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i;
						if (
							hexColorRegex.test(trimmedInput) &&
							!tintColorPresets.includes(trimmedInput) &&
							!tintCustomColors.includes(trimmedInput)
						) {
							const newCustomColors = [...tintCustomColors, trimmedInput];
							setTintCustomColors(newCustomColors);
							settings.playerBarTintCustomColors = newCustomColors;
						}
					}
				};

				const removeTintCustomColor = (colorToRemove: string) => {
					const newCustomColors = tintCustomColors.filter(
						(color) => color !== colorToRemove,
					);
					setTintCustomColors(newCustomColors);
					settings.playerBarTintCustomColors = newCustomColors;
					if (playerBarTintColor === colorToRemove) {
						updateTintColor("#000000");
					}
				};

				const tintColorPresets = [
					"#000000",
					"#111111",
					"#222222",
					"#333333",
					"#444444",
					"#555555",
					"#666666",
					"#888888",
					"#aaaaaa",
					"#cccccc",
					"#ffffff",
					"#0d1117",
					"#1a1a2e",
					"#16213e",
					"#0f3460",
					"#1b1b2f",
					"#162447",
					"#1f4068",
					"#e94560",
				];

				const allTintColors = [...tintColorPresets, ...tintCustomColors];

				return (
					<div style={{ position: "relative" }}>
						<LunaNumberSetting
							title="Player Bar Tint"
							desc="Tint color & opacity (0-10, default: 5)"
							min={0}
							max={10}
							step={1}
							value={playerBarTint}
							onNumber={(value: number) => {
								settings.playerBarTint = value;
								setPlayerBarTint(value);
								window.updateRadiantLyricsPlayerBarTint?.();
							}}
						/>
						{/* Color swatch — positioned just left of the value box */}
						<button
							type="button"
							onClick={() =>
								showTintColorPicker
									? closeTintColorPicker()
									: openTintColorPicker()
							}
							style={{
								width: "28px",
								height: "28px",
								border: "1px solid rgba(255,255,255,0.15)",
								borderRadius: "6px",
								cursor: "pointer",
								background: playerBarTintColor,
								position: "absolute",
								right: "135px",
								top: "50%",
								transform: "translateY(-50%)",
								overflow: "hidden",
								zIndex: 1,
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

						{/* Color Picker Modal */}
						{shouldRenderTintPicker && (
							<>
								<button
									type="button"
									aria-label="Close color picker"
									onClick={closeTintColorPicker}
									style={{
										position: "fixed",
										top: 0,
										left: 0,
										right: 0,
										bottom: 0,
										background: "rgba(0,0,0,0.6)",
										zIndex: 1000,
										opacity: isTintAnimatingIn ? 1 : 0,
										transition: "opacity 0.2s ease",
										border: "none",
										padding: 0,
										cursor: "default",
										width: "100%",
									}}
								/>
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
										opacity: isTintAnimatingIn ? 1 : 0,
										transform: isTintAnimatingIn
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
									Choose Tint Color
								</div>

								{/* Enable/Disable tint toggle */}
								<div
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										marginBottom: "14px",
										padding: "8px 10px",
										borderRadius: "8px",
										background: "rgba(255,255,255,0.06)",
									}}
								>
									<span
										style={{
											color: "rgba(255,255,255,0.8)",
											fontSize: "12px",
											fontWeight: 600,
										}}
									>
										Enable Player Bar Tint
									</span>
									<label
										style={{
											position: "relative",
											display: "inline-block",
											width: "36px",
											height: "20px",
											flexShrink: 0,
										}}
									>
										<input
											type="checkbox"
											checked={playerBarTintEnabled}
											onChange={(e) => {
												const checked = e.target.checked;
												settings.playerBarTintEnabled = checked;
												setPlayerBarTintEnabled(checked);
												window.updateRadiantLyricsPlayerBarTint?.();
											}}
											style={{
												opacity: 0,
												width: 0,
												height: 0,
												position: "absolute",
											}}
										/>
										<span
											style={{
												position: "absolute",
												cursor: "pointer",
												top: 0,
												left: 0,
												right: 0,
												bottom: 0,
												backgroundColor: playerBarTintEnabled
													? "rgba(255,255,255,0.8)"
													: "rgba(255,255,255,0.15)",
												transition: "0.25s",
												borderRadius: "20px",
											}}
										>
											<span
												style={{
													position: "absolute",
													content: '""',
													height: "16px",
													width: "16px",
													left: playerBarTintEnabled ? "18px" : "2px",
													bottom: "2px",
													backgroundColor: playerBarTintEnabled
														? "rgb(20,20,20)"
														: "rgba(255,255,255,0.5)",
													transition: "0.25s",
													borderRadius: "50%",
												}}
											/>
										</span>
									</label>
								</div>

								<div
									style={{
										display: "grid",
										gridTemplateColumns: "repeat(7, 1fr)",
										gap: "8px",
										marginBottom: "16px",
										opacity: playerBarTintEnabled ? 1 : 0.3,
										pointerEvents: playerBarTintEnabled ? "auto" : "none",
										filter: playerBarTintEnabled ? "none" : "grayscale(1)",
										transition: "all 0.25s ease",
									}}
								>
										{allTintColors.map((color, index) => {
											const isCustomColor = tintCustomColors.includes(color);
											const isHovered = tintHoveredColorIndex === index;
											return (
												// biome-ignore lint/a11y/noStaticElementInteractions: cosmetic hover tracking on wrapper containing interactive buttons
												<div
													key={color}
													style={{
														position: "relative",
														width: "32px",
														height: "32px",
														cursor: "pointer",
													}}
													onMouseEnter={() => setTintHoveredColorIndex(index)}
													onMouseLeave={() => setTintHoveredColorIndex(null)}
												>
													<button
														type="button"
														onClick={() => {
															updateTintColor(color);
															closeTintColorPicker();
														}}
														style={{
															width: "100%",
															height: "100%",
															borderRadius: "6px",
															border:
																playerBarTintColor === color
																	? "2px solid #fff"
																	: "1px solid rgba(255,255,255,0.2)",
															background: color,
															cursor: "pointer",
															transition: "all 0.2s ease",
														}}
													/>
													{isCustomColor && (
														<button
															type="button"
															onClick={(e) => {
																e.stopPropagation();
																removeTintCustomColor(color);
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
														>
															×
														</button>
													)}
												</div>
											);
										})}
									</div>

								<div
									style={{
										marginBottom: "12px",
										opacity: playerBarTintEnabled ? 1 : 0.3,
										pointerEvents: playerBarTintEnabled ? "auto" : "none",
										filter: playerBarTintEnabled ? "none" : "grayscale(1)",
										transition: "all 0.25s ease",
									}}
								>
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
												value={tintCustomInput}
												onChange={(e) => setTintCustomInput(e.target.value)}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														updateTintColor(tintCustomInput);
														addTintCustomColor();
													}
												}}
												placeholder="#000000"
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
												type="button"
												onClick={() => {
													updateTintColor(tintCustomInput);
													addTintCustomColor();
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

									<button
										type="button"
										onClick={closeTintColorPicker}
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
				);
			})()}
			<AnySwitch
				title="Custom Backdrop"
				desc="Render the cover-art shader backdrop, off = Tidals cover spin"
				checked={backdropEnabled}
				onChange={(_: unknown, checked: boolean) => {
					settings.backdropEnabled = checked;
					setBackdropEnabled(checked);
					refreshBackdrop();
				}}
			/>
			<AnySwitch
				title="Cover Everywhere"
				desc="Apply the cover art backdrop to the entire app, not just the Now Playing view, Heavily Inspired by Cover-Theme by @Inrixia"
				checked={CoverEverywhere}
				onChange={(_: unknown, checked: boolean) => {
					settings.CoverEverywhere = checked;
					setCoverEverywhere(checked);
					refreshBackdrop();
				}}
			/>
			<AnySwitch
				title="Animated Artwork"
				desc="Show Apple Music animated artwork over the artwork tile in the Now Playing view"
				checked={animatedArtwork}
				onChange={(_: unknown, checked: boolean) => {
					settings.animatedArtwork = checked;
					setAnimatedArtwork(checked);
					window.updateAnimatedArtwork?.();
				}}
			/>
			{animatedArtwork && (
				<LunaNumberSetting
					title="Animated Artwork Frame Rate"
					desc="Frames per second for the animated artwork. Lower is cheaper but choppier; 25 is native speed."
					min={1}
					max={25}
					step={1}
					value={animatedArtworkFps}
					onNumber={(value: number) => {
						settings.animatedArtworkFps = value;
						setAnimatedArtworkFps(value);
						window.updateAnimatedArtworkRate?.();
					}}
				/>
			)}
			{backdropEnabled && (
				<>
					<LunaNumberSetting
						title="Backdrop Style" // This feature is the result of a bug caused by my ADHD <3
						desc="Kawarp | Aurora"
						min={0}
						max={1}
						step={1}
						value={backdropStyle}
						onNumber={(value: number) => {
							settings.backdropStyle = value;
							setBackdropStyle(value);
							refreshBackdrop();
						}}
					/>
					<AnySwitch
						title="Playback Reactive"
						desc="Cover shader reacts to playback state by freezing/resuming"
						checked={backdropPlaybackReactive}
						onChange={(_: unknown, checked: boolean) => {
							settings.backdropPlaybackReactive = checked;
							setBackdropPlaybackReactive(checked);
							refreshBackdrop();
						}}
					/>
					<AnySwitch
						title="Performance Mode | Experimental"
						desc="Caps the shader at 4 blur passes, disables dithering and renders at 1x pixel ratio to cut GPU load"
						checked={performanceMode}
						onChange={(_: unknown, checked: boolean) => {
							settings.performanceMode = checked;
							setPerformanceMode(checked);
							refreshBackdrop();
						}}
					/>
					<LunaNumberSetting
						title="Backdrop Opacity"
						desc="How strongly the backdrop shows through (0-100% default = 75)"
						min={0}
						max={100}
						step={1}
						value={backdropOpacity}
						onNumber={(value: number) => {
							settings.backdropOpacity = value;
							setBackdropOpacity(value);
							refreshBackdrop();
						}}
					/>
					<LunaNumberSetting
						title="Warp Intensity"
						desc="Strength of the fluidity effect (0-100% default = 100)"
						min={0}
						max={100}
						step={1}
						value={backdropWarp}
						onNumber={(value: number) => {
							settings.backdropWarp = value;
							setBackdropWarp(value);
							refreshBackdrop();
						}}
					/>
					<LunaNumberSetting
						title="Blur Passes"
						desc="Kawase blur passes, higher is softer but costs more GPU (1-40 default = 5)"
						min={1}
						max={40}
						step={1}
						value={backdropBlurPasses}
						onNumber={(value: number) => {
							settings.backdropBlurPasses = value;
							setBackdropBlurPasses(value);
							refreshBackdrop();
						}}
					/>
					<LunaNumberSetting
						title="Animation Speed"
						desc="How fast the backdrop flows (0-500% default = 175)"
						min={0}
						max={500}
						step={5}
						value={backdropSpeed}
						onNumber={(value: number) => {
							settings.backdropSpeed = value;
							setBackdropSpeed(value);
							refreshBackdrop();
						}}
					/>
					<LunaNumberSetting
						title="Contrast"
						desc="Contrast of the backdrop (0-300%, 100 = stock default = 125)"
						min={0}
						max={300}
						step={5}
						value={backdropContrast}
						onNumber={(value: number) => {
							settings.backdropContrast = value;
							setBackdropContrast(value);
							refreshBackdrop();
						}}
					/>
					<LunaNumberSetting
						title="Auto Darken Bright Covers"
						desc="Prevents bright covers from making text unreadable (0-100% 0 = Off default = 80)"
						min={0}
						max={100}
						step={1}
						value={backdropDarken}
						onNumber={(value: number) => {
							settings.backdropDarken = value;
							setBackdropDarken(value);
							refreshBackdrop();
						}}
					/>
					<LunaNumberSetting
						title="Saturation"
						desc="Colour intensity of the backdrop (0-400% default = 125)"
						min={0}
						max={400}
						step={5}
						value={backdropSaturation}
						onNumber={(value: number) => {
							settings.backdropSaturation = value;
							setBackdropSaturation(value);
							refreshBackdrop();
						}}
					/>
					<LunaNumberSetting
						title="Backdrop Scale"
						desc="Zoom level of the effect (10-400% default = 100)"
						min={10}
						max={400}
						step={5}
						value={backdropScale}
						onNumber={(value: number) => {
							settings.backdropScale = value;
							setBackdropScale(value);
							refreshBackdrop();
						}}
					/>
					<LunaNumberSetting
						title="Dithering"
						desc="Breaks up color banding in smooth gradients (0-100 default = 15)"
						min={0}
						max={100}
						step={1}
						value={backdropDithering}
						onNumber={(value: number) => {
							settings.backdropDithering = value;
							setBackdropDithering(value);
							refreshBackdrop();
						}}
					/>

				</>
			)}
		</LunaSettings>
	);
};
