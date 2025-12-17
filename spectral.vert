varying vec3 vColor;
varying float vAlpha;
uniform float uTime;

void main() {
    vColor = color;
    
    // Pass opacity based on some logic, or just default
    vAlpha = 1.0;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
}
