# Fonts

Bundled (see `UIAppFonts` in `project.yml`; DECISIONS #5):

| File | Source | PostScript name |
|---|---|---|
| `InterVariable.ttf` | https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip (zip root) | `InterVariable` |
| `IBMPlexMono-Regular.ttf` | https://github.com/IBM/plex/releases/download/%40ibm/plex-mono%402.5.0/ibm-plex-mono.zip (`ibm-plex-mono/fonts/complete/ttf/`) | `IBMPlexMono` |
| `IBMPlexMono-Medium.ttf` | same zip | `IBMPlexMono-Medm` |
| `IBMPlexMono-SemiBold.ttf` | same zip | `IBMPlexMono-SmBld` |
| `IBMPlexMono-Bold.ttf` | same zip | `IBMPlexMono-Bold` |
| `IBMPlexMono-Italic.ttf` | same zip | `IBMPlexMono-Italic` |

Both are SIL Open Font License 1.1. The build does not fail if a file is missing (fonts are plain bundle resources); the DesignSystem's `TypographyTests` is what pins their presence.
