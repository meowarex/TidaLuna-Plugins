# Luna Plugins Collection

A collection of [TidaLuna](https://github.com/Inrixia/TidaLuna) plugins that enhance and personalize the TIDAL Desktop experience. Build them yourself or grab them straight from the Plugin Store. Made with <3

## Plugins

### Radiant Lyrics
**Location:** `plugins/radiant-lyrics-luna/`

A radiant and beautiful lyrics view for TIDAL with dynamic visual effects.

**Features:**
- Dynamic cover art backgrounds with blur and rotation effects
- Complete overhaul of tidals UI
- Syllable level lyric highlighting
- Romanization of lyrics
- Fully customizable
- Glowing Animated Lyrics with clean scrolling

### Copy Lyrics
**Location:** `plugins/copy-lyrics-luna/`

Allows users to copy song lyrics by selecting them directly in the interface.

**Features:**
- Enables text selection on lyrics
- Automatic clipboard copying of selected lyrics
- Smart lyric span detection

### Element Hider
**Location:** `plugins/element-hider-luna/`

Allows users to hide/remove UI elements by right clicking on them.

**Features:**
- Remove/Hide ANY UI element
- Automagically saves hidden elements
- Allows for elements to be restored

### Audio Visualizer
**Location:** `plugins/audio-visualizer-luna/`

⚠️ **Work in Progress** - Audio visualization plugin that displays real-time audio frequency data.

**Features:**
- Real-time audio frequency visualization with bars
- Animated effect when no audio is detected
- Configurable options.. like allot of em
- Theme frienly (Wont clash with your themes style)

**Note:** This plugin is currently in development and may have stability issues.

## Installation

### Batteries Required
1. [TidaLuna](https://github.com/Inrixia/TidaLuna) - Plugin Framework for Tidal (what these plugins are for)
2. Tidal - Streaming Service (if you are here and dont use tidal.. then just enjoy the read <3)

### Installing from Plugin Store (in TidaLuna)
1. Open Tidal (with Luna installed)
2. Navigate to Luna Settings (Top right of Tidal)
3. Click "Plugin Store" Tab
4. Scroll Down and just click on the plugins to install them
5. Naviagte to the "Plugins" Tab
6. And now your done and you can adjust the settings to your liking <3

### Installing from URL
### (They are in the store by default now)
1. Open TidaLuna after Building & Serving
2. Navigate to Luna Settings (Top right of Tidal)
3. Click "Plugin Store" Tab
4. Paste in the "Install from URL" Bar `https://tidaluna-plugins.appwrite.network/store.json`

## Installation from Source

### Building All Plugins
```bash
# Git Clone the Repo
git clone https://github.com/meowarex/tidalluna-plugins

# Change Folder to the Repo
cd tidalluna-plugins

# Install dependencies
pnpm install

# Build & Serve all plugins
pnpm run watch
```

### Installing Plugins in TidalLuna
1. Open TidaLuna after Building & Serving
2. Navigate to Luna Settings (Top right of Tidal)
3. Click "Plugin Store" Tab
4. Click Install on the Plugins at the top Labeled with "[Dev]"
5. Enjoy <3

## Development

This project is made for:
- **[TidaLuna](https://github.com/Inrixia/TidaLuna)** - Modern plugin framework for Tidal | Inrixia

## GitHub Actions

- **Automated builds** on every push (to main)
- **Release automation** for distributing plugins
- **Artifact uploads** for easy plugin distribution

## Credits

Inrixia | [TidalLuna](https://github.com/Inrixia/TidaLuna) Plugin Framework (The successor Neptune)

## Licence

Licensed under **GPL-3.0** ([`LICENSE`](LICENSE)), subject to the Section 7 additional terms in
[`ADDITIONAL-TERMS.md`](ADDITIONAL-TERMS.md). In summary:

- **Copyleft:** you may use, modify, and redistribute this code, but any distributed version must
  remain open source under GPL-3.0 and state that it has been modified.
- **Attribution:** public projects using or derived from this code must credit it in their README
  and prominently within the application, linking to [radiant-lyrics.org](https://radiant-lyrics.org)
  or [this repository](https://github.com/meowarex/TidaLuna-Plugins).

> [!CAUTION]
> **Hosted services are not covered by this licence.** The `api.radiant-lyrics.org` and
> `api.atomix.one` endpoints, and any credentials contained in this code, are for use by the
> official plugins only. Third-party use is not permitted and is actively enforced. Forks must
> remove all references to these services. See [`ADDITIONAL-TERMS.md`](ADDITIONAL-TERMS.md).

Third-party components and their licences are listed in [`THIRD-PARTY.md`](THIRD-PARTY.md).
