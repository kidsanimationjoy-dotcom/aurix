# AURIX 3D Website Studio

## 1. Product goal

Let a user ask AURIX to create a polished website with real interactive 3D—not just a static image or decorative video background.

Examples:
- interactive 3D product showcase;
- immersive landing page;
- scroll-driven 3D storytelling;
- portfolio with animated environments;
- interactive educational model;
- browser-based 3D configurator;
- cinematic hero with a 3D object and camera transitions.

## 2. Correct role of each engine

| Tool | Role |
|---|---|
| OpenAI/Codex or selected coding agent | Plan, write, refactor, test and repair the site |
| Claude Code companion | Optional specialised coding workflow where authorised |
| Grok Build companion | Optional coding/research workflow |
| 21st.dev | Discover real UI components, draft variants where enabled, inspect themes and review interface |
| Higgsfield | Generate image/video/3D assets when the selected model supports the required output |
| Three.js | Actual browser-side 3D rendering |
| React Three Fiber | React renderer for Three.js |
| Drei | Optional helpers for camera, controls, loaders and scene composition |
| AURIX | Orchestrate assets, code, project state, testing and preview |

21st.dev is not a 3D rendering engine. Higgsfield-generated media is not automatically an optimised web-ready 3D scene. Assets must be validated and converted/optimised as needed.

## 3. User workflow

### Step 1: Brief
Capture site purpose and audience, pages/routes, brand and design direction, 3D subject and interactions, target devices, framework, performance target, reduced-motion and accessibility expectations.

### Step 2: Concept and storyboard
- generate two or three visual directions;
- map page sections and scroll narrative;
- sketch camera, lighting and interaction states;
- identify which elements need actual 3D and which should remain normal UI;
- let the user choose or approve a direction.

### Step 3: Asset pipeline
- search 21st.dev for UI components and examples;
- reuse the project's existing design system;
- generate missing visual assets through an authorised service;
- import GLB/GLTF or other supported 3D assets;
- validate file size, geometry, material count, textures and licensing;
- create mobile/low-power fallback assets where needed.

### Step 4: Implementation
Suggested baseline:
- React + TypeScript;
- Vite or the project's existing framework;
- Three.js;
- React Three Fiber;
- Drei where useful;
- a motion library for DOM/UI transitions;
- CSS/Tailwind using project design tokens.

Do not force a framework rewrite if the repository already has a sound stack.

### Step 5: Scene editor capabilities
- scene tree and object hierarchy;
- add/remove/duplicate objects;
- transform controls: position, rotation, scale;
- camera and orbit settings;
- lighting and environment controls;
- material and texture configuration;
- animation timeline/keyframes;
- scroll-triggered scene states;
- object interactions and hotspots;
- responsive camera presets;
- asset import/export;
- scene code/component view;
- preview and reset.

### Step 6: Quality checks
- desktop and mobile viewport tests;
- keyboard navigation and visible focus;
- reduced-motion mode;
- fallback when WebGL is unavailable;
- device pixel ratio and quality controls;
- frame-time/performance monitor;
- memory and asset-loading checks;
- accessible text alternatives for important 3D information;
- typecheck, build and automated tests;
- browser screenshots and interaction tests.

### Step 7: Delivery
- source code remains in the user's repository;
- include asset licences and source metadata;
- provide preview URL/local run instructions;
- describe which 3D assets are generated vs supplied;
- list tested browsers/devices and known limitations.

## 4. Performance requirements

- lazy-load 3D bundles and scene assets;
- avoid loading every scene at page startup;
- compress GLB/GLTF and textures;
- use texture resolution appropriate to visible size;
- dispose geometries, materials and textures when unused;
- use instancing for repeated objects;
- limit expensive realtime shadows and post-processing;
- offer low/medium/high quality settings;
- pause animation when tab is hidden or scene is offscreen where appropriate;
- show a static/2D fallback on unsupported devices.

## 5. Acceptance criteria

A 3D website is not complete merely because a canvas appears.

It must:
- build without errors;
- render the intended subject;
- respond to declared interactions;
- work at phone and desktop sizes;
- offer a reduced-motion or non-3D fallback;
- expose keyboard-accessible page controls;
- load with acceptable performance on target devices;
- keep source and asset licences recorded;
- pass requested preview checks.

## 6. First release scope

MVP:
- generate a 3D hero section from a prompt;
- import a GLB/GLTF asset;
- select camera, lighting and background presets;
- configure basic rotate/hover/scroll interactions;
- combine 3D with a normal responsive website layout;
- save preview and export React components;
- run typecheck/build and screenshot verification.

Later:
- full scene editor;
- keyframe timeline;
- multi-scene scroll narratives;
- procedural geometry;
- visual shader editor;
- physics/collision;
- collaborative editing;
- browser-based design review.

## 7. Source references

- Three.js: https://threejs.org/
- React Three Fiber: https://r3f.docs.pmnd.rs/
- 21st.dev: https://docs.21st.dev/mcp
- 21st agent skills: https://github.com/21st-dev/skill
- Higgsfield Skills: https://github.com/higgsfield-ai/skills
