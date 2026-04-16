# MU Online BMD Viewer

A modern, web-based 3D model viewer for `.bmd` files, the format used in the game MU Online. This application is built with TypeScript, Three.js, and Vite, providing a smooth and interactive experience for inspecting game models and their animations.

## Features

### Core Viewers

- **BMD Model Viewer**: Load and inspect `.bmd` 3D models with drag-and-drop support.
- **Character Viewer**: Preview character models with customizable equipment, animations, and appearance settings.
- **Terrain/World Viewer**: Load and explore MU Online world terrain with object placement and bookmarks.

### Data Browsers

- **Skills Browser**: Parse and explore `skills.bmd` files with skill statistics, search, and type filtering (Attack, Buff, De-Buff, Friendly).
- **Items Browser**: Parse and explore `items.bmd` files with equipment stats, search, and item kind filtering (Weapons, Armor, Potions, Jewels).
- **ATT Inspector**: Inspect terrain attribute data (`.att` files) with visualization and lookup.
- **OZJ Browser**: Browse OZJ files for animation and model references.

### 3D Model Features

- **Texture Support**: Apply various texture formats, including `.jpg`, `.png`, `.tga`, `.ozj`, and `.ozt`.
- **Animation Playback**: View all embedded animations with adjustable playback speed.
- **External Animations**: Load bone animations from a different `.bmd` file.
- **GLB Export**: Export models and their animations to the standard `.glb` format for use in other 3D software like Blender or Unity.
- **Texture Export**: Export all applied textures to `.png` format.
- **Interactive Controls**:
  - Orbit, pan, and zoom the camera.
  - Toggle wireframe and skeleton visibility.
  - Adjust model scale and scene brightness.
  - Auto-rotate the model.
  - Lock the animation on a specific frame.
- **Diagnostics Panel**: View real-time information about the loaded model, including mesh, bone, and animation counts, as well as FPS.

### Additional Features

- **Presentation Mode**: Hide UI for clean model viewing/screenshots.
- **Bookmarks**: Save and restore camera positions in terrain viewer.
- **Character Presets**: Save and manage character equipment configurations.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [npm](https://www.npmjs.com/)

### Installation

1.  Clone the repository or download the source code.
2.  Open a terminal in the project directory.
3.  Install the required dependencies:

    ```bash
    npm install
    ```

### Running the Development Server

To run the application locally with hot-reloading, use the following command:

```bash
npm run dev
```

This will start a development server, and you can view the application in your browser at the provided URL (usually `http://localhost:5173`).

### Building for Production

To create an optimized build for deployment, run:

```bash
npm run build
```

The production-ready files will be generated in the `dist` directory.

## How to Use

### Navigation

The application uses a tabbed interface with multiple viewers:

- **Model**: View `.bmd` 3D models with textures and animations.
- **Character**: Preview character models with customizable appearance and equipment.
- **World**: Explore terrain with interactive camera and object selection.
- **ATT Inspector**: Analyze terrain attributes and height maps.
- **OZJ Browser**: Browse OZJ animation references.
- **Item Browser**: Search and inspect item definitions from `items.bmd`.
- **Skill Browser**: Search and inspect skill definitions from `skills.bmd`.

### Model Viewer Workflow

1.  **Load a Model**: Drag and drop a `.bmd` file onto the designated area on the left panel, or click to open the file selector.
2.  **Apply Textures**: Once the model is loaded, the viewer will show which textures are required. Drag and drop the corresponding texture files onto the texture area.
3.  **Control Animations**: Use the buttons to play different animations and the slider to control the speed.
4.  **Export**: Use the export buttons to save the model as a `.glb` file or to save the textures as `.png` files.

### Data Browser Workflow

1. **Load Files**: Drag and drop `items.bmd`, `skills.bmd`, or `.att` files into the respective browser tabs.
2. **Search**: Use the search bar to find specific items, skills, or terrain features by name.
3. **Filter**: Use type/kind filters to narrow down results (e.g., weapons vs. armor in Items, or attack vs. buff skills in Skills).
4. **View Details**: Click on any row in the table to view detailed information in the panel below.

### Bookmarks & Presets

- **Terrain Bookmarks**: Save camera positions in the World viewer for quick navigation.
- **Character Presets**: Create and save character equipment configurations for quick loading.