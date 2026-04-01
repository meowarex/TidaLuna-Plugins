import { ReactiveStore } from "@luna/core";
import { LunaSettings, LunaSwitchSetting } from "@luna/ui";
import React from "react";

declare global {
	interface Window {
		applyColoramaLyrics?: () => void;
	}
}

type SwitchChangeHandler = (
	event: React.ChangeEvent<HTMLInputElement> | null,
	checked: boolean,
) => void;

export const settings = await ReactiveStore.getPluginStorage("ColoramaLyrics", {
	enabled: true,
	singleColor: "#FFFFFF",
	singleAlpha: 100,
	customColors: [] as string[],
	excludeInactive: false,
});

export const Settings = () => {
	const [singleColor, setSingleColor] = React.useState(settings.singleColor);
	const [singleAlpha, setSingleAlpha] = React.useState<number>(
		settings.singleAlpha ?? 100,
	);
	const [customInput, setCustomInput] = React.useState(settings.singleColor);
	const [customColors, setCustomColors] = React.useState(settings.customColors);
	const [showPicker, setShowPicker] = React.useState(false);
	const [isAnimatingIn, setIsAnimatingIn] = React.useState(false);
	const [shouldRender, setShouldRender] = React.useState(false);
	const [excludeInactive, setExcludeInactive] = React.useState(
		settings.excludeInactive,
	);
	const AnySwitch = LunaSwitchSetting as unknown as React.ComponentType<{
		title: string;
		desc?: string;
		checked: boolean;
		onChange: SwitchChangeHandler;
	}>;

	const normalizeToRGB = (
		hex: string,
		fallback: string = "#FFFFFF",
	): string => {
		let v = hex.trim().toLowerCase();
		if (!v.startsWith("#")) v = `#${v}`;
		if (/^#([0-9a-f]{3,4})$/.test(v)) {
			const m = v.slice(1);
			const r = m[0];
			const g = m[1];
			const b = m[2];
			return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
		}
		if (/^#([0-9a-f]{8})$/.test(v)) {
			const rrggbb = v.slice(3);
			return `#${rrggbb}`.toUpperCase();
		}
		if (/^#([0-9a-f]{6})$/.test(v)) return v.toUpperCase();
		return fallback;
	};

	const colorPresets = [
		"#FFFFFF",
		"#FF0000",
		"#00FF00",
		"#0000FF",
		"#FFFF00",
		"#FF00FF",
		"#00FFFF",
		"#FF8800",
		"#8800FF",
		"#0088FF",
		"#88FF00",
		"#FF0088",
		"#00FF88",
		"#444444",
		"#888888",
		"#CCCCCC",
		"#1DB954",
		"#E22134",
		"#1976D2",
	];

	const openPicker = () => {
		setShowPicker(true);
		setShouldRender(true);
		setTimeout(() => setIsAnimatingIn(true), 10);
	};
	const closePicker = () => {
		setIsAnimatingIn(false);
		setTimeout(() => {
			setShowPicker(false);
			setShouldRender(false);
		}, 200);
	};

	const hexColorRegex = /^#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})$/i;

	const applyCustomInputColor = (raw: string, updateInput: boolean): void => {
		const trimmed = raw.trim();
		if (!hexColorRegex.test(trimmed)) return;
		const next = normalizeToRGB(trimmed);
		settings.singleColor = next;
		setSingleColor(next);
		if (updateInput) setCustomInput(next);
		requestApply();
	};

	const addCustomColor = () => {
		const trimmed = customInput.trim();
		if (
			hexColorRegex.test(trimmed) &&
			!colorPresets.includes(trimmed) &&
			!customColors.includes(normalizeToRGB(trimmed))
		) {
			const updated = [...customColors, normalizeToRGB(trimmed)];
			setCustomColors(updated);
			settings.customColors = updated;
		}
	};

	const allColors = [...colorPresets, ...customColors];

	const requestApply = () => {
		window.applyColoramaLyrics?.();
	};

	return (
		<LunaSettings>
			{/* Single color picker button */}
			<div
				style={{
					padding: "8px 0",
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
							marginBottom: 4,
						}}
					>
						Lyrics Color
					</div>
					<div style={{ opacity: 0.7, fontSize: 14 }}>Set lyrics color</div>
				</div>
				<div
					style={{
						display: "flex",
						gap: 8,
						alignItems: "center",
						position: "relative",
					}}
				>
					<button
						type="button"
						onClick={() => (showPicker ? closePicker() : openPicker())}
						style={{
							width: 32,
							height: 32,
							border: "1px solid rgba(255,255,255,0.15)",
							borderRadius: 6,
							cursor: "pointer",
							background: normalizeToRGB(singleColor),
						}}
					/>
				</div>
			</div>

			{/* Color picker modal */}
			{shouldRender && (
				<>
					<button
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
						type="button"
						aria-label="Close color picker"
						onClick={closePicker}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === "Escape") closePicker();
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
							borderRadius: 16,
							padding: 20,
							minWidth: 320,
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
								marginBottom: 12,
								color: "#fff",
								fontWeight: "bold",
								fontSize: 14,
							}}
						>
							Lyrics Color
						</div>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(7, 1fr)",
								gap: 8,
								marginBottom: 16,
							}}
						>
							{allColors.map((color) => (
								<button
									key={color}
									type="button"
									onClick={() => {
										const next = normalizeToRGB(color);
										settings.singleColor = next;
										setSingleColor(next);
										setCustomInput(next);
										requestApply();
									}}
									style={{
										width: 32,
										height: 32,
										borderRadius: 6,
										border: "1px solid rgba(255,255,255,0.2)",
										background: normalizeToRGB(color),
										cursor: "pointer",
									}}
								/>
							))}
						</div>
						<div style={{ marginBottom: 12 }}>
							<div
								style={{
									color: "rgba(255,255,255,0.7)",
									fontSize: 12,
									marginBottom: 6,
								}}
							>
								Custom Hex (#RRGGBB)
							</div>
							<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
								<input
									type="text"
									value={customInput}
									onChange={(e) => setCustomInput(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											applyCustomInputColor(customInput, true);
											addCustomColor();
										}
									}}
									placeholder="#RRGGBB"
									style={{
										flex: 1,
										padding: "8px 12px",
										borderRadius: 6,
										border: "1px solid rgba(255,255,255,0.2)",
										background: "rgba(255,255,255,0.1)",
										color: "#fff",
										fontSize: 14,
										fontFamily: "monospace",
										boxSizing: "border-box",
									}}
								/>
								<button
									onClick={() => {
										applyCustomInputColor(customInput, false);
										addCustomColor();
									}}
									style={{
										width: 32,
										height: 32,
										borderRadius: 6,
										border: "1px solid rgba(255,255,255,0.3)",
										background: "rgba(255,255,255,0.15)",
										color: "#fff",
										cursor: "pointer",
										fontSize: 16,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										transition: "all 0.2s ease",
									}}
									type="button"
								>
									+
								</button>
							</div>
						</div>
						<div style={{ marginBottom: 16 }}>
							<div
								style={{
									color: "rgba(255,255,255,0.8)",
									fontSize: 12,
									marginBottom: 6,
								}}
							>
								Alpha
							</div>
							<input
								type="range"
								min={5}
								max={100}
								step={1}
								value={singleAlpha}
								onChange={(e) => {
									const value = Number(e.target.value);
									settings.singleAlpha = value;
									setSingleAlpha(value);
									requestApply();
								}}
								style={{ width: "100%" }}
							/>
						</div>

						<button
							onClick={closePicker}
							style={{
								width: "100%",
								padding: 8,
								borderRadius: 6,
								border: "1px solid rgba(255,255,255,0.2)",
								background: "rgba(255,255,255,0.1)",
								color: "#fff",
								cursor: "pointer",
								fontSize: 12,
							}}
							type="button"
						>
							Done
						</button>
					</div>
				</>
			)}
			<AnySwitch
				title="Exclude Inactive"
				desc="Apply color only to the currently active lyric line"
				checked={excludeInactive}
				onChange={(_event: React.ChangeEvent<HTMLInputElement> | null, checked: boolean) => {
					settings.excludeInactive = checked;
					setExcludeInactive(checked);
					requestApply();
				}}
			/>
		</LunaSettings>
	);
};
