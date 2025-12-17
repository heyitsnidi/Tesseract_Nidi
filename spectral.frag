varying vec3 vColor;
varying float vAlpha;
uniform float uTime;

void main() {
    // Spectral / Chromatic Aberration Simulation
    // We can shift color based on position or time
    
    vec3 color = vColor;
    
    // Make it bright and additive
    // Add some "scintillation" or noise if needed
    
    float strength = 1.0;
    
    // White core, spectral edges
    // For now, let's trust the vertex color which we will set to spectral values
    
    gl_FragColor = vec4(color * strength, vAlpha);
}
