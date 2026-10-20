import * as THREE from 'three';

/* Sky dome, fog and the three-light rig. */

export function buildSky(ctx) {
  const { scene, S, extent, theme } = ctx;

const sunDir = new THREE.Vector3(...theme.sunDir).normalize();
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    top: { value: new THREE.Color(theme.skyTop) },
    mid: { value: new THREE.Color(theme.skyMid) },
    bottom: { value: new THREE.Color(theme.skyBottom) },
    sunDir: { value: sunDir.clone() },
    sunColor: { value: new THREE.Color(theme.sunColor) },
  },
  vertexShader: /* glsl */`
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
    uniform vec3 sunDir; uniform vec3 sunColor;
    varying vec3 vDir;
    void main() {
      vec3 d = normalize(vDir);
      float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
      vec3 c = mix(bottom, mid, smoothstep(0.44, 0.60, h));
      c = mix(c, top, smoothstep(0.56, 0.92, h));
      float s = max(dot(d, normalize(sunDir)), 0.0);
      c += sunColor * pow(s, 1400.0) * 2.0;
      c += sunColor * pow(s, 16.0) * 0.16;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
ctx.sunDir = sunDir;

const sky = new THREE.Mesh(new THREE.SphereGeometry(extent + 1000, 32, 20), skyMat);
S.add(sky);

scene.fog = new THREE.Fog(new THREE.Color(theme.fog), extent * 0.45 + 90, extent * 2.4 + 400);
}

export function buildLighting(ctx) {
  const { S, theme } = ctx;

const hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity);
S.add(hemi);

const sun = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 160;
sun.shadow.camera.left = -38;
sun.shadow.camera.right = 38;
sun.shadow.camera.top = 38;
sun.shadow.camera.bottom = -38;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
sun.shadow.camera.updateProjectionMatrix();
S.add(sun);
S.add(sun.target);

const fill = new THREE.DirectionalLight(0x8fb6e8, 0.35);
fill.position.set(40, 30, -50);
S.add(fill);

  ctx.sun = sun;
}
