uniform sampler2D tDiffuse;
uniform vec2 uMouse;
uniform float uStrength;
uniform float uTime;
uniform float uHover;

varying vec2 vUv;

void main() {
    vec2 p = vUv;
    vec2 center = uMouse;
    
    // Aspect ratio correction (assume square or passing resolution would be better, but simple is ok for now)
    // vec2 distVec = p - center;
    
    // Gravitational Lensing / Warp
    // Simple black hole style distortion
    // Displace UVs towards the center based on mass (strength)
    
    float dist = distance(p, center);
    
    // Avoid division by zero
    dist = max(dist, 0.001);
    
    // Calculate warp amount
    // Fast swipe (High Strength) -> Sharp fold / wormhole
    // Slow swipe / Hover -> Gentle curve
    
    // Space Warp Formula: u = u + (center - u) * Strength / dist^2
    // We smooth it out to avoid infinite distortion at singularities
    
    vec2 dir = p - center;
    float force = uStrength / (dist * dist + 0.01); // Softened inverse square
    
    // Ripple effect for slow movement
    // Ripples propagate from center
    float ripple = 0.0;
    if (uStrength < 0.5 && uStrength > 0.01) {
       ripple = sin(dist * 50.0 - uTime * 5.0) * 0.005 * uStrength;
    }
    
    // Apply Distortion
    vec2 uvDisplaced = p - dir * force * 0.5; // Pull towards center (Gravity)
    // Or push? "Bends and distorts". Gravity pulls.
    
    // Add ripples
    uvDisplaced += ripple;

    // Chromatic Aberration at the event horizon (High stress areas)
    // Shift RGB channels slightly differently
    float shift = force * 0.02;
    
    vec4 color;
    color.r = texture2D(tDiffuse, uvDisplaced + vec2(shift, 0.0)).r;
    color.g = texture2D(tDiffuse, uvDisplaced).g;
    color.b = texture2D(tDiffuse, uvDisplaced - vec2(shift, 0.0)).b;
    color.a = 1.0;
    
    gl_FragColor = color;
}
