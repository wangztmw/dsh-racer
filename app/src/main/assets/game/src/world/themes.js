/* Sky / lighting / vegetation palette per circuit. */

export const THEMES = {
  day: {
    skyTop: '#2f6fbf', skyMid: '#a8cbe8', skyBottom: '#ffd9b0',
    sunColor: '#fff3d6', sunIntensity: 3.4, sunDir: [-0.52, 0.44, 0.73],
    grass: '#415c33', fog: '#c3d7ea',
    hemiSky: 0xcfe2ff, hemiGround: 0x4a5a3e, hemiIntensity: 0.42,
    foliageHue: 0.285, foliageSat: 0.34, foliageLight: 0.2,
  },
  dusk: {
    skyTop: '#1f3557', skyMid: '#c2795c', skyBottom: '#ffc794',
    sunColor: '#ffcf9a', sunIntensity: 2.7, sunDir: [-0.74, 0.2, 0.64],
    grass: '#4c5a3c', fog: '#d9ab8c',
    hemiSky: 0xffd6bb, hemiGround: 0x39392c, hemiIntensity: 0.5,
    foliageHue: 0.24, foliageSat: 0.28, foliageLight: 0.16,
  },
  desert: {
    skyTop: '#4b86c2', skyMid: '#d6e2e6', skyBottom: '#f4e2c2',
    sunColor: '#fff8e6', sunIntensity: 4.0, sunDir: [-0.3, 0.62, 0.72],
    grass: '#b09a68', fog: '#e9dcc2',
    hemiSky: 0xffedcf, hemiGround: 0x8d7c56, hemiIntensity: 0.6,
    foliageHue: 0.19, foliageSat: 0.22, foliageLight: 0.26,
  },
};
