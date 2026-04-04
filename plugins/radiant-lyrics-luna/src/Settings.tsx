import { ReactiveStore } from "@luna/core";
import { LunaSettings, LunaSwitchSetting, LunaNumberSetting } from "@luna/ui";
import React from "react";

declare global {
	interface Window {
		updateRadiantLyricsStyles?: () => void;
		updateRadiantLyricsTextGlow?: () => void;
		updateStickyLyricsFeature?: () => void;
		updateStickyLyricsSetting?: (checked: boolean) => void;
		updateRadiantLyricsPlayerBarTint?: () => void;
		updateRadiantLyricsGlobalBackground?: () => void;
		updateRadiantLyricsNowPlayingBackground?: () => void;
		updateQualityProgressColor?: () => void;
		updateIntegratedSeekBar?: () => void;
		updateLyricsStyle?: () => void;
		updateLyricsStyleSetting?: (value: number) => void;
		updateRomanizeLyrics?: () => void;
		updateRomanizeLyricsSetting?: (checked: boolean) => void;
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
	stickyLyrics: false,
	syllableStyle: 0, // MARKER: Syllable animations SETTINGS (WIP coming soon)
	syllableLogging: false,
	hideUIEnabled: true,
	playerBarVisible: false,
	qualityProgressColor: true,
	integratedSeekBar: true,
	floatingPlayerBar: true,
	playerBarRadius: 5,
	playerBarSpacing: 10,
	playerBarBlur: true,
	playerBarBlurAmount: 15,
	playerBarTintEnabled: true,
	playerBarTint: 5,
	playerBarTintColor: "#000000" as string,
	playerBarTintCustomColors: [] as string[],
	CoverEverywhere: true,
	performanceMode: false,
	spinningArt: true,
	backgroundScale: 15,
	backgroundRadius: 25,
	backgroundContrast: 120,
	backgroundBlur: 80,
	backgroundBrightness: 40,
	spinSpeed: 45,
	settingsAffectNowPlaying: true,
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
	const [performanceMode, setPerformanceMode] = React.useState(
		settings.performanceMode,
	);
	const [spinningArt, setspinningArt] = React.useState(settings.spinningArt);
	const [backgroundContrast, setBackgroundContrast] = React.useState(
		settings.backgroundContrast,
	);
	const [backgroundBlur, setBackgroundBlur] = React.useState(
		settings.backgroundBlur,
	);
	const [backgroundBrightness, setBackgroundBrightness] = React.useState(
		settings.backgroundBrightness,
	);
	const [spinSpeed, setSpinSpeed] = React.useState(settings.spinSpeed);
	const [settingsAffectNowPlaying, setSettingsAffectNowPlaying] =
		React.useState(settings.settingsAffectNowPlaying);
	const [backgroundScale, setBackgroundScale] = React.useState(
		settings.backgroundScale,
	);
	const [backgroundRadius, setBackgroundRadius] = React.useState(
		settings.backgroundRadius,
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
	const [stickyLyrics, setStickyLyrics] = React.useState(settings.stickyLyrics);
	React.useEffect(() => {
		window.updateStickyLyricsSetting = (checked: boolean) =>
			setStickyLyrics(checked);
		return () => {
			window.updateStickyLyricsSetting = undefined;
		};
	}, []);
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
				title="Romanize Lyrics | Beta"
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
				title="Sticky Lyrics"
				desc="auto-switches to Play Queue when lyrics aren't available (mirrored in lyrics dropdown)"
				checked={stickyLyrics}
				onChange={(_: unknown, checked: boolean) => {
					settings.stickyLyrics = checked;
					setStickyLyrics(checked);
					if (window.updateStickyLyricsFeature) {
						window.updateStickyLyricsFeature();
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
				title="Cover Everywhere"
				desc="Apply the spinning Cover Art background to the entire app, not just the Now Playing view, Heavily Inspired by Cover-Theme by @Inrixia"
				checked={CoverEverywhere}
				onChange={(_: unknown, checked: boolean) => {
					console.log(
						"Spinning Cover Everywhere:",
						checked ? "enabled" : "disabled",
					);
					settings.CoverEverywhere = checked;
					setCoverEverywhere(checked);
					// Update styles immediately when setting changes
					if (window.updateRadiantLyricsGlobalBackground) {
						window.updateRadiantLyricsGlobalBackground();
					}
				}}
			/>
			{CoverEverywhere && (
				<AnySwitch
					title="Performance Mode | Experimental"
					desc="Performance mode: Reduces blur effects & uses smaller image sizes, to optimize GPU usage"
					checked={performanceMode}
					onChange={(_: unknown, checked: boolean) => {
						console.log("Performance Mode:", checked ? "enabled" : "disabled");
						settings.performanceMode = checked;
						setPerformanceMode(checked);
						// Update background animations immediately when setting changes
						if (window.updateRadiantLyricsGlobalBackground) {
							window.updateRadiantLyricsGlobalBackground();
						}
						if (window.updateRadiantLyricsNowPlayingBackground) {
							window.updateRadiantLyricsNowPlayingBackground();
						}
					}}
				/>
			)}
			{CoverEverywhere && (
				<AnySwitch
					title="Background Cover Spin" // Cheers @Max/n0201 for the idea <3
					desc="Enable the spinning cover art background animation"
					checked={spinningArt}
					onChange={(_: unknown, checked: boolean) => {
						console.log(
							"Background Cover Spin:",
							checked ? "enabled" : "disabled",
						);
						settings.spinningArt = checked;
						setspinningArt(checked);
						if (window.updateRadiantLyricsGlobalBackground) {
							window.updateRadiantLyricsGlobalBackground();
						}
						if (
							settings.settingsAffectNowPlaying &&
							window.updateRadiantLyricsNowPlayingBackground
						) {
							window.updateRadiantLyricsNowPlayingBackground();
						}
					}}
				/>
			)}
			{CoverEverywhere && (
				<LunaNumberSetting
					title="Background Scale"
					desc="Adjust the scale of the background cover (1=10% - 50=500%, default: 15)"
					min={1}
					max={50}
					step={1}
					value={backgroundScale}
					onNumber={(value: number) => {
						settings.backgroundScale = value;
						setBackgroundScale(value);
						if (window.updateRadiantLyricsGlobalBackground) {
							window.updateRadiantLyricsGlobalBackground();
						}
						if (
							settings.settingsAffectNowPlaying &&
							window.updateRadiantLyricsNowPlayingBackground
						) {
							window.updateRadiantLyricsNowPlayingBackground();
						}
					}}
				/>
			)}
			{CoverEverywhere && (
				<LunaNumberSetting
					title="Background Radius"
					desc="Adjust the cover art corner radius (0-100%, default: 25)"
					min={0}
					max={100}
					step={1}
					value={backgroundRadius}
					onNumber={(value: number) => {
						settings.backgroundRadius = value;
						setBackgroundRadius(value);
						if (window.updateRadiantLyricsGlobalBackground) {
							window.updateRadiantLyricsGlobalBackground();
						}
						if (
							settings.settingsAffectNowPlaying &&
							window.updateRadiantLyricsNowPlayingBackground
						) {
							window.updateRadiantLyricsNowPlayingBackground();
						}
					}}
				/>
			)}
			{CoverEverywhere && (
				<LunaNumberSetting
					title="Background Contrast"
					desc="Adjust the contrast of the spinning background (0-200, default: 120)"
					min={0}
					max={200}
					step={1}
					value={backgroundContrast}
					onNumber={(value: number) => {
						settings.backgroundContrast = value;
						setBackgroundContrast(value);
						if (window.updateRadiantLyricsGlobalBackground) {
							window.updateRadiantLyricsGlobalBackground();
						}
						if (
							settings.settingsAffectNowPlaying &&
							window.updateRadiantLyricsNowPlayingBackground
						) {
							window.updateRadiantLyricsNowPlayingBackground();
						}
					}}
				/>
			)}
			{CoverEverywhere && (
				<LunaNumberSetting
					title="Background Blur"
					desc="Adjust the blur amount of the spinning background (0-200, default: 80)"
					min={0}
					max={200}
					step={1}
					value={backgroundBlur}
					onNumber={(value: number) => {
						console.log("Background Blur:", value);
						settings.backgroundBlur = value;
						setBackgroundBlur(value);
						if (window.updateRadiantLyricsGlobalBackground) {
							window.updateRadiantLyricsGlobalBackground();
						}
						if (
							settings.settingsAffectNowPlaying &&
							window.updateRadiantLyricsNowPlayingBackground
						) {
							window.updateRadiantLyricsNowPlayingBackground();
						}
					}}
				/>
			)}
			{CoverEverywhere && (
				<LunaNumberSetting
					title="Background Brightness"
					desc="Adjust the brightness of the spinning background (0-100, default: 40)"
					min={0}
					max={100}
					step={1}
					value={backgroundBrightness}
					onNumber={(value: number) => {
						console.log("Background Brightness:", value);
						settings.backgroundBrightness = value;
						setBackgroundBrightness(value);
						if (window.updateRadiantLyricsGlobalBackground) {
							window.updateRadiantLyricsGlobalBackground();
						}
						if (
							settings.settingsAffectNowPlaying &&
							window.updateRadiantLyricsNowPlayingBackground
						) {
							window.updateRadiantLyricsNowPlayingBackground();
						}
					}}
				/>
			)}
			{CoverEverywhere && spinningArt && (
				<LunaNumberSetting
					title="Spin Speed"
					desc="Adjust the rotation speed in seconds (10-120, default: 45) - Lower values = Faster rotation"
					min={10}
					max={120}
					step={1}
					value={spinSpeed}
					onNumber={(value: number) => {
						console.log("Spin Speed:", value);
						settings.spinSpeed = value;
						setSpinSpeed(value);
						if (window.updateRadiantLyricsGlobalBackground) {
							window.updateRadiantLyricsGlobalBackground();
						}
						if (
							settings.settingsAffectNowPlaying &&
							window.updateRadiantLyricsNowPlayingBackground
						) {
							window.updateRadiantLyricsNowPlayingBackground();
						}
					}}
				/>
			)}
			{CoverEverywhere && (
				<AnySwitch
					title="Settings Affect Now Playing"
					desc="Apply background settings to Now Playing view"
					checked={settingsAffectNowPlaying}
					onChange={(_: unknown, checked: boolean) => {
						console.log(
							"Settings Affect Now Playing:",
							checked ? "enabled" : "disabled",
						);
						settings.settingsAffectNowPlaying = checked;
						setSettingsAffectNowPlaying(checked);
						// Update Now Playing background immediately when setting changes
						if (window.updateRadiantLyricsNowPlayingBackground) {
							window.updateRadiantLyricsNowPlayingBackground();
						}
					}}
				/>
			)}
		</LunaSettings>
	);
};
