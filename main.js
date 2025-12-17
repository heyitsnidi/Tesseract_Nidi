import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Error handling to prevent blank screen
try {
    // Basic Setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 10; 

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // Warp Shader Definition
    const WarpShader = {
        uniforms: {
            'tDiffuse': { value: null },
            'uMouse': { value: new THREE.Vector2(0.5, 0.5) },
            'uStrength': { value: 0.0 },
            'uTime': { value: 0.0 },
            'uHover': { value: 0.0 },
            'uFalloff': { value: 4.0 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform vec2 uMouse;
            uniform float uStrength;
            uniform float uTime;
            uniform float uFalloff;

            varying vec2 vUv;
            
            // Simple random noise
            float rand(vec2 n) { 
                return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
            }

            // Custom Palette: Ruby, Gold, Blue, Copper
            vec3 palette(float t) {
                t = fract(t);
                
                vec3 ruby = vec3(0.85, 0.1, 0.35); 
                vec3 gold = vec3(1.0, 0.85, 0.2);
                vec3 copper = vec3(0.8, 0.5, 0.3);
                vec3 blue = vec3(0.1, 0.2, 0.9);
                
                // 4 Segments: Ruby->Gold->Copper->Blue->Ruby
                float segment = t * 4.0;
                
                if (segment < 1.0) return mix(ruby, gold, smoothstep(0.0, 1.0, segment));
                if (segment < 2.0) return mix(gold, copper, smoothstep(0.0, 1.0, segment - 1.0));
                if (segment < 3.0) return mix(copper, blue, smoothstep(0.0, 1.0, segment - 2.0));
                return mix(blue, ruby, smoothstep(0.0, 1.0, segment - 3.0));
            }

            void main() {
                vec2 p = vUv;
                vec2 center = uMouse;
                
                float dist = distance(p, center);
                dist = max(dist, 0.001);
                
                vec2 dir = p - center;
                
                // Gravity / Warp
                // Falloff controlled by hand distance (uFalloff)
                float force = uStrength / (dist * dist * uFalloff + 0.2);
                
                // --- WAVE BANDS (REACTIVE) ---
                // "Different lines and waves based on movements"
                // Movement (uStrength) compresses waves -> More lines
                float moveFactor = 1.0 + uStrength * 5.0; 
                
                float wave = sin(dist * 20.0 * moveFactor - uTime * 2.0); 
                wave += sin(dist * 15.0 * moveFactor + uTime * 1.4) * 0.7;
                wave += sin(uTime * 0.5 + dist * 5.0) * 0.3; 
                
                // --- NOISE TEXTURE ---
                float noise = rand(p + uTime * 0.1) * 0.2; 
                
                vec2 warp = dir * (force + wave * 0.1) * 0.5; 
                vec2 uvFinal = p - warp;

                // --- METALLIC SURFACE PRISM ---
                // Reduced aberration to prevent ghosting
                float aberr = force * 0.002 + wave * 0.001; 
                
                // Textures
                vec4 sLeft = texture2D(tDiffuse, uvFinal - vec2(aberr, 0.0));
                vec4 sCenter = texture2D(tDiffuse, uvFinal);
                vec4 sRight = texture2D(tDiffuse, uvFinal + vec2(aberr, 0.0));
                
                // --- DYNAMIC METALLIC PALETTE (RUBY / GOLD / COPPER / BLUE) ---
                // Custom mixed palette for specific brand colors.
                // We use 'wave' and 'dist' to drive the spectrum
                
                // Sample palette at slightly different offsets for richness
                // Multiply by 0.6 to keep it "Dark Metallic" not "Neon"
                // Higher freq inputs for more bands
                // add uStrength to inputs for "More Colors" (Shift/Glitch on move)
                // "Smoothly" -> Reduced multiplier significantly (was 3.0)
                float shift = uStrength * 0.5; 
                vec3 c1 = palette(wave * 0.4 + dist * 1.0 + shift) * 0.3;  
                vec3 c2 = palette(wave * 0.4 + dist * 1.0 + 0.05 + shift) * 0.3;
                vec3 c3 = palette(wave * 0.4 + dist * 1.0 + 0.1 + shift) * 0.3;
                
                // Band Brightness (Soft clamping)
                float bandBright = 0.4 + wave * 0.2; 
                
                vec3 layer1 = sLeft.rgb * c1 * bandBright;
                vec3 layer2 = sCenter.rgb * c2 * bandBright;
                vec3 layer3 = sRight.rgb * c3 * bandBright;
                
                // Mix Layers
                // Mix Layers
                vec3 finalColor = (layer1 + layer2 + layer3) * 0.55; // significantly brighter for better visibility
                
                // FILLER TEXTURE (Background)
                float sceneAlpha = sCenter.a;
                
                // Generate a background metallic texture
                // "Blackness" / High Contrast Logic
                float liquidNoise = noise + wave * 0.5;
                float contrast = smoothstep(0.4, 0.8, liquidNoise + 0.5); // Wide dark valleys
                
                // DYNAMIC BACKGROUND GRADIENT
                // Calculate dominant color over time (slow shift)
                vec3 dominantColor = palette(uTime * 0.05) * 0.1; // Dark glow
                
                // Mix dominant color into the metallic background base
                // Use distance to create a radial falloff for the gradient
                vec3 bgGradient = dominantColor * smoothstep(1.5, 0.0, dist);
                
                // Combine: Dark Metallic Base + Colored Gradient Glow
                vec3 bgMetal = (c2 * 0.1 + bgGradient) * contrast; 
                
                // Mix Background and Foreground
                finalColor = mix(bgMetal, finalColor, sceneAlpha); 
                
                // Add "Blackness" to the whole image (Contrast pass)
                finalColor *= (0.1 + 0.9 * contrast); 
                
                // Global grain
                finalColor += vec3(noise * 0.01); 

                // Vignette - intense
                finalColor *= (1.0 - dist * 1.2); 

                gl_FragColor = vec4(finalColor, 1.0); 
            }
        `
    };

    // Post-Processing
    const renderScene = new RenderPass(scene, camera);

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.4, 0.85);
    bloomPass.threshold = 0.0;
    bloomPass.strength = 0.12; // Slight glow
    bloomPass.radius = 0.1; // Sharp glow

    const warpPass = new ShaderPass(WarpShader);

    const composer = new EffectComposer(renderer);
    // OPTIMIZATION: Clamp to 2.0 to prevent massive FPS drop on 4k/Retina screens
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0)); 
    composer.addPass(renderScene);
    composer.addPass(bloomPass);     // Bloom first
    composer.addPass(warpPass);      // Then Warp the bloomed image

    // SPHERE SHADER for "Voxel/Dot" Look (Matches reference image style)
    const SphereShader = {
        uniforms: {
            pixelRatio: { value: window.devicePixelRatio }
        },
        vertexShader: `
            attribute float size;
            attribute vec3 customColor;
            varying vec3 vColor;
            uniform float pixelRatio;
            void main() {
                vColor = customColor;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = size * pixelRatio * (300.0 / -mvPosition.z); // Scale size by depth
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            void main() {
                vec2 coord = gl_PointCoord - vec2(0.5);
                float dist = length(coord);
                if (dist > 0.5) discard;

                // GLASSY SOFT ORB SHADING
                // Soft diffuse gradient from center
                float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
                
                // Subtle specular for glass feel, but softer
                vec2 highlight = coord - vec2(-0.1, -0.1);
                float spec = 0.0;
                if (length(highlight) < 0.15) {
                    spec = 0.8 * (1.0 - length(highlight)/0.15); // Softer specular 
                }

                // Add slight transparency to the core for glass effect
                gl_FragColor = vec4(vColor + vec3(spec), alpha * 0.8); 
            }
        `
    };


    // Tesseract Geometry Helper
    class P4Vector {
        constructor(x, y, z, w) {
            this.x = x;
            this.y = y;
            this.z = z;
            this.w = w;
        }
    }

    function matmul(matrix, v) {
        let result = new P4Vector(0, 0, 0, 0);
        result.x = matrix[0][0] * v.x + matrix[0][1] * v.y + matrix[0][2] * v.z + matrix[0][3] * v.w;
        result.y = matrix[1][0] * v.x + matrix[1][1] * v.y + matrix[1][2] * v.z + matrix[1][3] * v.w;
        result.z = matrix[2][0] * v.x + matrix[2][1] * v.y + matrix[2][2] * v.z + matrix[2][3] * v.w;
        result.w = matrix[3][0] * v.x + matrix[3][1] * v.y + matrix[3][2] * v.z + matrix[3][3] * v.w;
        return result;
    }

    const points = [];
    const edges = [];

    // Generate 16 vertices
    for (let i = 0; i < 16; i++) {
        let x = (i & 1) ? 1 : -1;
        let y = (i & 2) ? 1 : -1;
        let z = (i & 4) ? 1 : -1;
        let w = (i & 8) ? 1 : -1;
        points.push(new P4Vector(x, y, z, w));
    }

    // Generate edges
    for (let i = 0; i < 16; i++) {
        for (let j = i + 1; j < 16; j++) {
            let diff = 0;
            if (points[i].x !== points[j].x) diff++;
            if (points[i].y !== points[j].y) diff++;
            if (points[i].z !== points[j].z) diff++;
            if (points[i].w !== points[j].w) diff++;
            if (diff === 1) {
                edges.push([i, j]);
            }
        }
    }

    // THREE TESSERACTS - Red, Green, Blue
    const TRAIL_LENGTH = 60; // Reduced for cleaner glassy look
    
    // Tesseract configurations: [color, offsetX, offsetY, offsetZ]
    const tesseractConfigs = [
        { color: new THREE.Color(0xe0f7fa), offset: new THREE.Vector3(0, 0, 0), name: 'Unified' } // Neutral Start
    ];

    const tesseracts = []; 

    tesseractConfigs.forEach(config => {
        const trails = [];
        
        for(let t = 0; t < TRAIL_LENGTH; t++) {
            // POINTS GEOMETRY
            const geometry = new THREE.BufferGeometry();
            
            // 16 vertices per tesseract state
            const positions = new Float32Array(16 * 3);
            const colors = new Float32Array(16 * 3);
            const sizes = new Float32Array(16);

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('customColor', new THREE.BufferAttribute(colors, 3));
            geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

            const material = new THREE.ShaderMaterial({
                uniforms: {
                    pixelRatio: { value: window.devicePixelRatio }
                },
                vertexShader: SphereShader.vertexShader,
                fragmentShader: SphereShader.fragmentShader,
                transparent: true,
                depthWrite: false, // Allow accumulation
                blending: THREE.AdditiveBlending
            });

    // Error Trap
    window.onerror = function(msg, url, line, col, error) {
        document.body.innerHTML += `<div style="color:red; background:black; padding:10px; z-index:9999; position:absolute; top:0;">${msg} (Line ${line})</div>`;
    };

    // ... (Imports maintained by tool context, inserted logic follows)

            const pointsMesh = new THREE.Points(geometry, material);
            // Re-enable points as "Joints" (Tiny size)
            // scene.add(pointsMesh);  
            
            // WIREFRAME FOR ALL TRAILS
            // Simplified BufferGeometry for robustness
            const lineGeo = new THREE.BufferGeometry();
            const linePosAttr = new THREE.BufferAttribute(new Float32Array(32 * 2 * 3), 3);
            // linePosAttr.setUsage(THREE.DynamicDrawUsage); // Removed for compatibility safety
            lineGeo.setAttribute('position', linePosAttr);
            
            const lineMat = new THREE.LineBasicMaterial({
                color: config.color,
                transparent: true, 
                opacity: 0.8, // Almost opaque for clear visibility
                linewidth: 6, // THICKER LINES (Note: WebGL limited support, but we try)
                depthWrite: false, 
                blending: THREE.AdditiveBlending // Glowier blending
            });
            const lineMesh = new THREE.LineSegments(lineGeo, lineMat);
            scene.add(lineMesh);

            trails.push({ 
                mesh: pointsMesh, 
                lineMesh: lineMesh, 
                positions: positions, 
                colors: colors, 
                sizes: sizes 
            });
        }
        
        if (!edges || edges.length === 0) {
            console.error("CRITICAL: Edges not defined!");
            document.body.innerHTML += "<div style='color:red'>Edges Fail</div>";
        }
        console.log("Initialized Tesseract with Edges:", edges.length);
        
        // ... (History Pre-fill) ...
        // ...
        
        
        // PRE-FILL HISTORY
        
        // PRE-FILL HISTORY
        const initialHistory = [];
        for(let h=0; h<TRAIL_LENGTH; h++) {
            initialHistory.push({
                axw: h * 0.01, ayw: h * 0.01, azw: h * 0.01,
                timestamp: Date.now() - h * 16,
                intensity: 1.0
            });
        }

        tesseracts.push({
            color: config.color,
            offset: config.offset,
            name: config.name,
            trails: trails,
            history: initialHistory 
        });
    });

    // Tesseract Geometry
    // (Moved P4Vector / points / edges / matmul upwards)

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    });

    // Control State
    let angleXW = 0;
    let angleYW = 0;
    let angleZW = 0;

    window.tesseractRotation = {
        xw: 0.0,
        yw: 0.0,
        zw: 0.0,
        offXW: 0,
        offYW: 0,
        offZW: 0
    };

    // Physics State for Warp
    let currentWarpStrength = 0;
    let targetWarpStrength = 0;

    // Glide & Depth Control State
    window.leftHandTarget = { x: 0, y: 0, z: 0 };
    window.tesseractBasePos = { x: 0, y: 0, z: 0 };


    // --- MUDRA DETECTION HELPERS ---
    function dist(p1, p2) {
        return Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2 + (p1.z - p2.z)**2);
    }

    // Check if finger is extended (Tip further from wrist than PIP)
    function isExtended(landmarks, fingerTipIdx, fingerPipIdx) {
        return dist(landmarks[fingerTipIdx], landmarks[0]) > dist(landmarks[fingerPipIdx], landmarks[0]);
    }

    // DEBUG UI SETUP
    const debugContainer = document.getElementById('debug-container');
    let mudraLabel = document.getElementById('mudra-label');
    if (!mudraLabel && debugContainer) {
        mudraLabel = document.createElement('div');
        mudraLabel.id = 'mudra-label';
        mudraLabel.style.color = 'lime';
        mudraLabel.style.marginTop = '10px';
        mudraLabel.style.fontSize = '16px';
        mudraLabel.style.fontWeight = 'bold';
        mudraLabel.innerText = 'Mudra: NEUTRAL';
        debugContainer.appendChild(mudraLabel);
    }

    // MUDRA STATE
    const MUDRA_STATE = {
        current: 'NEUTRAL',
        color: new THREE.Color(0.5, 0.5, 0.5), // Neutral Grey/White
        speedMult: 1.0,
        warpMode: 0.0, // 0=None, 1=Pulse, 2=Flow, 3=Wave
        lastChange: 0
    };

    const TARGETS = {
        'NEUTRAL': {
            color: new THREE.Color(0xe0f7fa), // Soft Icy White
            speed: 1.0,
            warp: 0.0
        },
        'PRANA': { // THE UNIFIED STATE (All Elements)
            color: new THREE.Color(0xffffff), // White (Prism splits this into Gold/Silver/Copper)
            speed: 4.0, 
            warp: 3.0 // Maximum warp to show bands/prism
        }
    };

    // Current interpolated values for simulation
    const simState = {
        color: TARGETS.NEUTRAL.color.clone(),
        speed: 1.0,
        warp: 0.0
    };

    function detectMudra(landmarks) {
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const middleTip = landmarks[12];
        const ringTip = landmarks[16];
        const pinkyTip = landmarks[20];
        const wrist = landmarks[0];

        const thumbPip = landmarks[2];
        const ringPip = landmarks[14];
        
        const scale = dist(wrist, landmarks[9]); 
        const touchThresh = 0.5 * scale; 
        const foldThresh = 1.2 * scale; 
        const isFolded = (tipIdx) => dist(landmarks[tipIdx], wrist) < foldThresh;

        // 1. PRANA (Life/Awaken)
        // Rule: Ring+Pinky touch Thumb. Index+Middle Straight.
        if (dist(thumbTip, ringTip) < touchThresh && dist(thumbTip, pinkyTip) < touchThresh) {
            if (isExtended(landmarks, 8, 6) && isExtended(landmarks, 12, 10)) {
                if (!isExtended(landmarks, 16, 14, true) && !isExtended(landmarks, 20, 18, true)) {
                     return 'PRANA';
                }
            }
        }
        
        // FIST (Screenshot) - REMOVED
        
        return 'NEUTRAL';
    }



    // --- DYNAMIC GENERATIVE LAYER ---
    const MAX_PARTICLES = 20000; 
    const genGeometry = new THREE.BufferGeometry();
    const genPositions = new Float32Array(MAX_PARTICLES * 3);
    const genColors = new Float32Array(MAX_PARTICLES * 3);
    const genSizes = new Float32Array(MAX_PARTICLES);
    const genBirth = new Float32Array(MAX_PARTICLES); // Birth Time
    const genType = new Float32Array(MAX_PARTICLES);  // 0:Prana, 1:Surya, 2:Chandra
    
    // Initialize off-screen
    for(let i=0; i<MAX_PARTICLES*3; i++) genPositions[i] = 99999;
    
    genGeometry.setAttribute('position', new THREE.BufferAttribute(genPositions, 3));
    genGeometry.setAttribute('color', new THREE.BufferAttribute(genColors, 3));
    genGeometry.setAttribute('size', new THREE.BufferAttribute(genSizes, 1));
    genGeometry.setAttribute('aBirthTime', new THREE.BufferAttribute(genBirth, 1));
    genGeometry.setAttribute('aType', new THREE.BufferAttribute(genType, 1));

    const genMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            pixelRatio: { value: window.devicePixelRatio }
        },
        vertexShader: `
            attribute float size;
            attribute float aBirthTime;
            attribute float aType;
            varying vec3 vColor;
            uniform float pixelRatio;
            uniform float time;

            // Simple Pseudo-Random
            float rand(vec2 co){
                return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
            }

            void main() {
                vColor = color;
                vec3 pos = position;
                
                float age = time - aBirthTime;
                
                if (age > 0.0) {
                    // MODE 1: PRANA -> PURE CREATION (Growth)
                    if (aType < 0.5) {
                        float growth = pow(age, 2.0); 
                        vec3 dir = vec3(
                            rand(pos.xy + aType) - 0.5,
                            rand(pos.yz + aType) - 0.5,
                            rand(pos.zx + aType) - 0.5
                        );
                        dir = normalize(dir);
                        pos += dir * growth * 6.0; 
                    }
                    // MODE 2: SURYA -> PURE PROGRESS (Forward)
                    else if (aType < 1.5) {
                        float dist = age * 12.0; 
                        pos.y += dist; 
                    }
                    // MODE 3: CHANDRA -> PURE OSCILLATION (Loop)
                    else {
                        float phase = age * 4.0;
                        pos.x += sin(phase) * 1.0; 
                        pos.z += cos(phase) * 0.5;
                    }
                }

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_PointSize = size * pixelRatio * (50.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            void main() {
                vec2 coord = gl_PointCoord - vec2(0.5);
                float dist = length(coord);
                if(dist > 0.5) discard;
                float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
                gl_FragColor = vec4(vColor, alpha * 0.8);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    const genPoints = new THREE.Points(genGeometry, genMaterial);
    scene.add(genPoints);

    let genIndex = 0; 
    let startTime = Date.now() * 0.001; // Sync for shader time

    function addStroke(type, handPosition) {
        // Debug Log
        console.log(`addStroke called with: ${type}`); 

        const count = 6; 
        const nowSec = (Date.now() * 0.001) - startTime; 

        // Map Hand to World
        const hx = handPosition.x * 16 - 8;
        const hy = -(handPosition.y * 12 - 6);
        const hz = 0;

        let typeId = 0.0;
        if (type === 'SURYA') typeId = 1.0;
        if (type === 'CHANDRA') typeId = 2.0;

        for(let i=0; i<count; i++) {
            let x=hx, y=hy, z=hz;
            let size = 1.0;
            let r=1, g=1, b=1;

        if (type === 'PRANA') {
            // PRANA: THE UNIFIED FORCE (Combines all elements)
            // Randomly select between Copper (Life), Gold (Sun), Silver (Moon)
            const seed = Math.random();
            
            if (seed < 0.33) {
                // COPPER / LIFE (Original Prana)
                x += (Math.random()-0.5)*0.2; 
                y += (Math.random()-0.5)*0.2; 
                z += (Math.random()-0.5)*0.2;
                r=0.972; g=0.733; b=0.815; size=2.5; // Soft Rose/Copper
            } else if (seed < 0.66) {
                // GOLD / SURYA
                x += (Math.random()-0.5)*2.5; // Pillar spread
                y += (Math.random()-0.5)*0.1; 
                r=1.0; g=0.878; b=0.509; size=1.5; // Soft Gold
            } else {
                // SILVER / CHANDRA
                x += (Math.random()-0.5)*0.1;
                y += (Math.random()-0.5)*3.0; // Vertical spread
                r=0.564; g=0.792; b=0.976; size=1.8; // Soft Silver/Blue
            }
        }


            genPositions[genIndex*3] = x;
            genPositions[genIndex*3+1] = y;
            genPositions[genIndex*3+2] = z;
            
            genColors[genIndex*3] = r; genColors[genIndex*3+1] = g; genColors[genIndex*3+2] = b;
            genSizes[genIndex] = size;
            
            genBirth[genIndex] = nowSec;
            genType[genIndex] = typeId;

            genIndex = (genIndex + 1) % MAX_PARTICLES;
        }
        
        genGeometry.attributes.position.needsUpdate = true;
        genGeometry.attributes.color.needsUpdate = true;
        genGeometry.attributes.size.needsUpdate = true;
        genGeometry.attributes.aBirthTime.needsUpdate = true;
        genGeometry.attributes.aType.needsUpdate = true;
    }


    function animate() {
        requestAnimationFrame(animate);

        try {
            const now = Date.now();
            const nowSec = now * 0.001; 
            
            warpPass.uniforms['uTime'].value = nowSec;
            
             if (genMaterial.uniforms) {
                 genMaterial.uniforms.time.value = nowSec - startTime;
            }

            if (genMaterial.uniforms) {
                 genMaterial.uniforms.time.value = nowSec - startTime;
            }

            // --- GLIDE & DEPTH LOGIC ---
            // Lerp Base Position towards Target
            // X/Y = Smooth (0.1), Z = HEAVY/SLOW (0.02)
            const lerpSpeedXY = 0.1;
            const lerpSpeedZ = 0.02; // Very slow/heavy depth movement
            
            window.tesseractBasePos.x += (window.leftHandTarget.x - window.tesseractBasePos.x) * lerpSpeedXY;
            window.tesseractBasePos.y += (window.leftHandTarget.y - window.tesseractBasePos.y) * lerpSpeedXY;
            window.tesseractBasePos.z += (window.leftHandTarget.z - window.tesseractBasePos.z) * lerpSpeedZ;

            // Update Tesseracts with Glide
            tesseracts.forEach((t, i) => {
                // If only 1 tesseract, keep it centered. Otherwise use legacy spread.
                const initialOffsetX = (tesseracts.length > 1) ? (i - 1) * 3.0 : 0.0;
                
                t.offset.x = window.tesseractBasePos.x + initialOffsetX;
                t.offset.y = window.tesseractBasePos.y;
                t.offset.z = window.tesseractBasePos.z;
            });

            // Smoothly interpolate warp strength
            // VERY SLOW smoothing to stabilize glitches (0.05)
            currentWarpStrength += (targetWarpStrength - currentWarpStrength) * 0.05;
            
            // Smoothly interpolate Falloff (Distance)
            const targetFalloff = window.targetWarpFalloff || 4.0;
            window.currentWarpFalloff = window.currentWarpFalloff || 4.0;
            window.currentWarpFalloff += (targetFalloff - window.currentWarpFalloff) * 0.05;
            
            // Smoothly interpolate Mouse Position for Shader
            // This prevents "shaky hand" jitter
            const targetMouse = window.targetWarpMouse || { x: 0.5, y: 0.5 };
            const currentMouse = warpPass.uniforms['uMouse'].value;
            
            currentMouse.x += (targetMouse.x - currentMouse.x) * 0.1;
            currentMouse.y += (targetMouse.y - currentMouse.y) * 0.1;
            
            // Update Uniforms
            warpPass.uniforms['uStrength'].value = currentWarpStrength; 
            warpPass.uniforms['uFalloff'].value = window.currentWarpFalloff;
            
            // MIX IN MUDRA WARP INFLUENCE
            // If we have a mudra state, we might override or add to the mouse interactions
            // For now, let's let Mudra dictate the "Base" vibe and Mouse can still add ripples?
            // Actually prompt says "Primary gesture controls". Let's prioritize Mudra.
            
            // Lerp Sim State
            const target = TARGETS[MUDRA_STATE.current] || TARGETS.NEUTRAL;
            
            // DYNAMIC BLOOM & FLUIDITY
            let targetBloom = 0.2; // Base (Matches initial)
            if (MUDRA_STATE.current !== 'NEUTRAL') {
                targetBloom = 0.6; // Slight Boost on Mudra (was 1.2)
                // Also boost Warp for fluidity
                targetWarpStrength += 0.5; 
            }
            bloomPass.strength += (targetBloom - bloomPass.strength) * 0.1;

            simState.color.lerp(target.color, 0.05);
            simState.speed += (target.speed - simState.speed) * 0.05;
            simState.warp += (target.warp - simState.warp) * 0.1; 

            warpPass.uniforms['uStrength'].value = currentWarpStrength; // Speed adds distortion

            // Tesseract Logic 
            // Auto-rotation due to Mudra (Vitality/Time moving)
            // Even if hand is still, Prana/Surya should move time.
            
            let autoRotX = 0;
            let autoRotY = 0;
            let autoRotZ = 0;

            // IMPORTANT: Ensure MUDRA_STATE is defined before access
            const currentMudra = (typeof MUDRA_STATE !== 'undefined') ? MUDRA_STATE.current : 'NEUTRAL';
            
            // Apply Mudra behvaiors
            // Apply Mudra behaviors
            if (currentMudra === 'PRANA') {
                // Vitality: Jittery, fast random/waking movement
                autoRotX = (Math.random() - 0.5) * 0.05 * simState.speed;
                autoRotY = (Math.random() - 0.5) * 0.05 * simState.speed;
            } else {
                // NEUTRAL: Drift
                autoRotX = 0.001 * simState.speed;
                autoRotY = 0.001 * simState.speed;
            }


            const rot = window.tesseractRotation;
            // Combine Mouse Interaction + Auto Mudra Interaction
            // Mouse gives immediate control (xw, yw from drag)
            // Mudra gives continuous flow
            
            // Input-based rotation (from hand movement)
            const inputSpeed = Math.sqrt(rot.xw**2 + rot.yw**2 + rot.zw**2);
            
            // REMOVED IDLE FADE - Tesseract must be stable and visible.
            // But we can still stop auto-rotation if idle? 
            // "Tesseract should not animate or change by default" -> Static.
            // So we only rotate if there is input? Or very slow idle?
            // "must always stay readable"
            
            angleXW += rot.xw;
            angleYW += rot.yw;
            angleZW += rot.zw;
            
            // Add a tiny idle rotation just to show it's 3D? Or strictly static?
            // User said "should not animate... by default".
            // So we rely purely on `rot` (hand input).

            const axw = angleXW + rot.offXW;
            const ayw = angleYW + rot.offYW;
            const azw = angleZW + rot.offZW;

            const intensity = 1.0; // Stable intensity

            // Tesseract Fading Logic - DISABLED (Always Visible)
            let targetOpacity = 1.0; 
            
            // We keep the opacity high.
            // "Tesseract that remains clearly visible and stable at all times"
            
            window.globalTesseractOpacity = window.globalTesseractOpacity || 1.0;
            window.globalTesseractOpacity += (targetOpacity - window.globalTesseractOpacity) * 0.1;

            // UPDATE ALL THREE TESSERACTS ... (logic continues)
            // ...

// ... (Updating onResults below) ...


            tesseracts.forEach(tesseract => {
                 // Standard History Update
                 tesseract.history.unshift({ 
                    axw, ayw, azw, 
                    timestamp: now, 
                    intensity: intensity,
                    // Bake Position into History for World-Space Trails
                    offsetX: tesseract.offset.x,
                    offsetY: tesseract.offset.y,
                    offsetZ: tesseract.offset.z
                });
                if (tesseract.history.length > TRAIL_LENGTH) tesseract.history.pop();

                // Render Trails (POINTS)
                for (let t = 0; t < tesseract.trails.length; t++) {
                    const trailObj = tesseract.trails[t];
                    
                    if (t >= tesseract.history.length) {
                        trailObj.mesh.visible = false;
                        continue;
                    }
                    trailObj.mesh.visible = true;

                    const state = tesseract.history[t];
                    const age = (now - state.timestamp) / 1000.0;
                    
                    // Adjusted fade rate for longer trails
                    let opacity = state.intensity * Math.exp(-age * 0.8);
                    opacity *= window.globalTesseractOpacity;

                    if(opacity < 0.01) {
                        trailObj.mesh.visible = false;
                        continue; 
                    }
                    trailObj.mesh.visible = true;

                    const rotXW = [
                        [Math.cos(state.axw), 0, 0, -Math.sin(state.axw)],
                        [0, 1, 0, 0],
                        [0, 0, 1, 0],
                        [Math.sin(state.axw), 0, 0, Math.cos(state.axw)]
                    ];
                    const rotYW = [
                        [1, 0, 0, 0],
                        [0, Math.cos(state.ayw), 0, -Math.sin(state.ayw)],
                        [0, 0, 1, 0],
                        [0, Math.sin(state.ayw), 0, Math.cos(state.ayw)]
                    ];
                    const rotZW = [
                        [1, 0, 0, 0],
                        [0, 1, 0, 0],
                        [0, 0, Math.cos(state.azw), -Math.sin(state.azw)],
                        [0, 0, Math.sin(state.azw), Math.cos(state.azw)]
                    ];

                    const projected3D = [];
                    for (let p of points) {
                        let rotated = p;
                        rotated = matmul(rotXW, rotated);
                        rotated = matmul(rotYW, rotated);
                        rotated = matmul(rotZW, rotated);

                        let distance = 3; 
                        let w = 1 / (distance - rotated.w);

                        let p3 = new THREE.Vector3(
                            rotated.x * w,
                            rotated.y * w,
                            rotated.z * w
                        );
                        p3.multiplyScalar(4.0); // BIGGER (User Request)

                        if (window.globalTesseractOpacity < 0.3) { 
                             p3.z *= (1.0 + (1.0-window.globalTesseractOpacity)*5.0); 
                        }

                        // Use BAKED history position, not current
                        p3.x += state.offsetX;
                        p3.y += state.offsetY;
                        p3.z += state.offsetZ;
                        
                        projected3D.push(p3);
                    }


                    const posAttribute = trailObj.mesh.geometry.attributes.position;
                    const colAttribute = trailObj.mesh.geometry.attributes.customColor;
                    const sizeAttribute = trailObj.mesh.geometry.attributes.size;
                    
                    for (let i = 0; i < 16; i++) {
                        let p = projected3D[i];
                        posAttribute.setXYZ(i, p.x, p.y, p.z);
                        
                        // Color styling
                        // FORCE SILVER TRAILS as requested
                        // Ignoring simState.color for trails specifically
                        const baseColor = new THREE.Color(0xC0C0C0); // SILVER
                        let brightness = 1.0; 
                        
                        // HEAD (Structure) vs TRAIL
                        if (t === 0) {
                            brightness = 1.5; // Slightly reduced brightness for silver
                        }
                        
                        // Fade tail
                        const displayOpacity = opacity * brightness;
                        
                        colAttribute.setXYZ(i, 
                            baseColor.r * displayOpacity, 
                            baseColor.g * displayOpacity, 
                            baseColor.b * displayOpacity
                        );
                        
                        // POINTS as JOINTS (Thicker)
                        let pSize = 1.0 * (1.0 + 2.0 * (opacity / 1.0)); 
                        if (t === 0) {
                            pSize = 8.0; // Highlight current state
                        }
                        
                        sizeAttribute.setX(i, pSize);
                    }
                    
                    posAttribute.needsUpdate = true;
                    colAttribute.needsUpdate = true;
                    sizeAttribute.needsUpdate = true;

                    // UPDATE WIREFRAME (ALL TRAILS)
                    if (trailObj.lineMesh) {
                        trailObj.lineMesh.material.color.setHex(0xC0C0C0); // SILVER

                        const linePosAttr = trailObj.lineMesh.geometry.attributes.position;
                        let vIndex = 0;
                        for(let e = 0; e < edges.length; e++) {
                            const idx1 = edges[e][0];
                            const idx2 = edges[e][1];
                            
                            const p1 = projected3D[idx1];
                            const p2 = projected3D[idx2];
                            
                            linePosAttr.setXYZ(vIndex++, p1.x, p1.y, p1.z);
                            linePosAttr.setXYZ(vIndex++, p2.x, p2.y, p2.z);
                        }
                        linePosAttr.needsUpdate = true;
                        
                        // Sync opacity with points
                        // Head is brighter/thicker?
                        // Boost visibility as requested ("remain clearly")
                        let lineOp = opacity * 1.5; // Increased from 0.6
                        if (t === 0) lineOp = opacity * 2.0; // BRIGHT head
                        
                        trailObj.lineMesh.material.opacity = Math.min(1.0, lineOp);
                        trailObj.lineMesh.visible = (lineOp > 0.01);
                    }

                }
            });

            composer.render();
        
        } catch(e) {
            console.error("Animation Loop Crash:", e);
        }
    }

    animate();
    console.log("Animation started");

    // MediaPipe Setup
    const videoElement = document.getElementsByClassName('input_video')[0];
    const canvasElement = document.getElementsByClassName('output_canvas')[0];
    const canvasCtx = canvasElement.getContext('2d');
    let lastHandPos = null;

    function onResults(results) {
        // debug canvas draw ...
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        if(results.image) canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
        if (results.multiHandLandmarks) {
            for (const landmarks of results.multiHandLandmarks) {
                if(window.drawConnectors) drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
                if(window.drawLandmarks) drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 1, radius: 2 });
            }
        }
        canvasCtx.restore();

        if (results.multiHandLandmarks && results.multiHandedness) {
            
            // Reset frame interactions
            let rightMudra = 'NEUTRAL';
            let leftAction = 'NONE';
            let frameWarpStrength = 0;
            let frameRot = { xw: 0, yw: 0, zw: 0 };

            // Reset targets logic
            let leftHandFound = false;

            for (let i = 0; i < results.multiHandLandmarks.length; i++) {
                const landmarks = results.multiHandLandmarks[i];
                const handedness = results.multiHandedness[i]; 
                const label = handedness.label; // "Left" or "Right"
                const indexTip = landmarks[8];
                
                // DETECT MUDRA (Per Hand)
                const detected = detectMudra(landmarks);
                
                // --- RIGHT HAND: ARTIST ---
                if (label === 'Right') {
                    rightMudra = detected;
                   
                    if (rightMudra !== 'NEUTRAL') {
                        addStroke(rightMudra, indexTip); 
                        
                        // Warp Logic - Target Update (Smooth in Animate)
                        window.targetWarpMouse.x = indexTip.x;
                        window.targetWarpMouse.y = 1.0 - indexTip.y;
                        
                        // Smooth out strength jitter
                        frameWarpStrength = 0.5;

                        // Calculate Hand Scale / Distance
                        // Distance between Wrist(0) and MiddleFingerMCP(9) is a stable metric
                        const handScale = dist(landmarks[0], landmarks[9]); 
                        
                        // Map Scale to Falloff
                        // User Request: "Make the warp effect bigger"
                        // We keep the logic (Far=Big, Near=Small) but EXPAND the max size.
                        // Lower Falloff = Bigger Effect.
                        // Previous Min Falloff = 1.5. New Min Falloff = 0.6 (Huge).
                        
                        // Scale 0.05 (Far) -> 1.0 (Very Big)
                        // Scale 0.25 (Near) -> 5.0 (Small)
                        let targetF = handScale * 20.0; 
                        
                        // Clamp: 0.6 (Huge/90%) to 5.0 (Small/20%)
                        targetF = Math.max(0.6, Math.min(5.0, targetF)); 
                        
                        window.targetWarpFalloff = targetF;

                        // Map Scale to Z-Depth (Glide Forward/Backward)
                        // Scale 0.05 (Far) -> Z = -8.0 (Deep background)
                        // Scale 0.25 (Near) -> Z = 3.0 (Close foreground)
                        const targetZ = -8.0 + (handScale * 55.0); 
                        window.leftHandTarget.z = Math.max(-10.0, Math.min(5.0, targetZ));

                        // Rotation Logic
                        const currentX = indexTip.x;
                        const currentY = indexTip.y;
                        if (lastHandPos) {
                            const deltaX = (currentX - lastHandPos.x) * 5;
                            const deltaY = (currentY - lastHandPos.y) * 5;
                            frameRot.xw = deltaX;
                            frameRot.yw = deltaY;
                            frameRot.zw = deltaX; 
                            // Clamp warp boost to avoid huge spikes
                            const movementBoost = Math.min(1.0, Math.sqrt(deltaX**2 + deltaY**2)*2.0);
                            frameWarpStrength = 0.5 + movementBoost;
                        } else {
                             frameWarpStrength = 0.2;
                        }
                        lastHandPos = { x: currentX, y: currentY };
                    } else {
                        lastHandPos = null;
                    }
                }

                // --- LEFT HAND: UTILITY ---
                // "Glide" -> Now "Follow" (X/Y) but Fixed Z (Background)
                if (label === 'Left') {
                    leftHandFound = true;
                    // GLIDE/FOLLOW
                    leftAction = 'TRAIL';
                    
                    // Map Hand (0..1) to World (-8..8, -6..6)
                        const targetX = indexTip.x * 16 - 8;
                        const targetY = -(indexTip.y * 12 - 6);
                        
                        // Z-Depth Mapping (Hand Scale)
                        const handScale = dist(landmarks[0], landmarks[12]);
                        const nominalScale = 0.25; 
                        const targetZ = (handScale - nominalScale) * 10.0; 

                        // Update Target (for Lerp in animate)
                        window.leftHandTarget.y = targetY;
                        window.leftHandTarget.z = targetZ;
                }
            }

            // If Left Hand is gone, Return to Center
            if (!leftHandFound) {
                window.leftHandTarget.x = 0;
                window.leftHandTarget.y = 0;
                window.leftHandTarget.z = 0;
            }
            
            // Update Globals
            const now = Date.now();

            // MUDRA LOCK LOGIC (3 Seconds)
            if (MUDRA_STATE.lockedUntil && now < MUDRA_STATE.lockedUntil) {
                // LOCKED
                rightMudra = MUDRA_STATE.current; 
            } else {
                // UNLOCKED
                if (rightMudra !== 'NEUTRAL' && rightMudra !== MUDRA_STATE.current) {
                    console.log(`🔒 Locking ${rightMudra} for 3s`);
                    MUDRA_STATE.current = rightMudra;
                    MUDRA_STATE.lockedUntil = now + 3000;
                } else if (rightMudra === 'NEUTRAL' && MUDRA_STATE.current !== 'NEUTRAL') {
                    if (rightMudra !== MUDRA_STATE.current) {
                         MUDRA_STATE.current = rightMudra; 
                    }
                }
            }
            
            // Smoothly update target warp strength (prevent instant drops)
             // Use a small lerp for the target itself if we wanted, but here we just set it.
             // The smoothing happens in animate().
            targetWarpStrength = frameWarpStrength;
            
            // Rotation is instant input, but maybe smooth it too?
            // For now, keep rotation responsive.
            window.tesseractRotation.xw = frameRot.xw;
            window.tesseractRotation.yw = frameRot.yw;
            window.tesseractRotation.zw = frameRot.zw;
            
            const lockStatus = (MUDRA_STATE.lockedUntil && now < MUDRA_STATE.lockedUntil) ? " 🔒" : "";
            if(mudraLabel) mudraLabel.innerText = `R: ${MUDRA_STATE.current}${lockStatus} | L: ${leftAction}`;

        } else {
            // No Hands - Reset immediately? Or respect lock?
            // If hand disappears, maybe we should stop? 
            // Let's respect lock for consistency.
             const now = Date.now();
             
             // RESET LOGIC: "Return to original position"
             // Zero out the target position for the tesseract (it will lerp back)
             window.leftHandTarget.x = 0;
             window.leftHandTarget.y = 0;
             window.leftHandTarget.z = 0;
             
             // Reset Warp Target to Center
             if (window.targetWarpMouse) {
                 window.targetWarpMouse.x = 0.5;
                 window.targetWarpMouse.y = 0.5;
             }

             if (MUDRA_STATE.lockedUntil && now < MUDRA_STATE.lockedUntil) {
                 // Keep state
             } else {
                if (MUDRA_STATE.current !== 'NEUTRAL') MUDRA_STATE.current = 'NEUTRAL';
             }

            targetWarpStrength = 0;
            lastHandPos = null;
            // Damping rotation reset
            window.tesseractRotation.xw = 0;
            window.tesseractRotation.yw = 0;
            window.tesseractRotation.zw = 0;
        }
    }

    // --- SCREENSHOT & RECORDING LOGIC REMOVED ---
    
    // Globals for Warp Smoothing
    window.targetWarpMouse = new THREE.Vector2(0.5, 0.5);
    window.targetWarpFalloff = 4.0; // Default: Focused/Small (Distance)
    window.currentWarpFalloff = 4.0;


    if (typeof Hands !== 'undefined') {
        const hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });
        hands.setOptions({
            maxNumHands: 2, 
            modelComplexity: 0, 
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        hands.onResults(onResults);

        const cameraUtils = new Camera(videoElement, {
            onFrame: async () => {
                await hands.send({ image: videoElement });
            },
            width: 640,
            height: 480
        });
        cameraUtils.start();
        console.log("MediaPipe initialized");
    } else {
        console.warn("MediaPipe Hands not loaded.");
    }

} catch(err) {
    console.error("Main initialization error:", err);
    document.body.innerHTML = `<div style="color:red; padding:20px;">Error: ${err.message}</div>`;
}
