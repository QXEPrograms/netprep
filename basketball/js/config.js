// Shared dimensions and constants (meters). All systems read from here so the
// court, hoop and later gameplay agree on one coordinate system:
//   x = across the court (sideline to sideline), 0 = center
//   y = up
//   z = from the baseline (z = 0) toward half court (z = HALF_LENGTH)
window.ISO = window.ISO || {};

ISO.CONFIG = {
  court: {
    width: 15.24,          // sideline to sideline
    halfLength: 14.33,     // baseline to half-court line
    lineWidth: 0.05,
    keyWidth: 4.88,
    freeThrowDist: 5.79,   // baseline to free-throw line
    ftCircleRadius: 1.83,
    threeRadius: 7.24,
    threeCornerX: 6.71,
    restrictedRadius: 1.22,
    centerCircleRadius: 1.83,
    apron: 2.4,            // out-of-bounds floor shown around the court
  },
  hoop: {
    rimHeight: 3.05,
    rimRadius: 0.2286,     // inner radius (18" diameter)
    rimTube: 0.012,
    centerZ: 1.6,          // baseline to rim center
    boardZ: 1.22,          // baseline to backboard face
    boardWidth: 1.83,
    boardHeight: 1.07,
    boardBottom: 2.9,
    boardThickness: 0.03,
  },
  colors: {
    background: 0x0b0f1a,
    paint: '#1d3a5f',
    paintEdge: '#f2f4f7',
    lines: '#f7f8fa',
    accent: '#ff7a1a',
    apron: '#20314b',
    rim: 0xff5a14,
    padding: 0x1d3a5f,
  },
};
