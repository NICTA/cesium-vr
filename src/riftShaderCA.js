define(function() {
  "use strict";
  return [
   "uniform vec2 Scale;",
   "uniform vec2 ScaleIn;",
   "uniform vec2 LensCenter;",
   "uniform vec4 HmdWarpParam;",
   'uniform vec4 ChromAbParam;',
   "uniform sampler2D u_texture;",
   "varying vec2 v_textureCoordinates;",
   "void main()",
   "{",
   "  vec2 uv = (v_textureCoordinates * 2.0) - 1.0;", // range from [0,1] to [-1,1]
   "  vec2 theta = (uv - LensCenter) * ScaleIn;", // Scales to [-1, 1]
   "  float rSq = theta.x * theta.x + theta.y * theta.y;",
   "  vec2 theta1 = theta * (HmdWarpParam.x + HmdWarpParam.y * rSq +",
   "                         HmdWarpParam.z * rSq * rSq +",
   "                         HmdWarpParam.w * rSq * rSq * rSq);",
   // Detect whether blue texture coordinates are out of range
   // since these will scaled out the furthest.
   "  vec2 thetaBlue = theta1 * (ChromAbParam.z + ChromAbParam.w * rSq);",
   "  vec2 tcBlue = LensCenter + Scale * thetaBlue;",
   "  tcBlue = (tcBlue + 1.0) / 2.0;", // range from [-1,1] to [0,1]
   "  if (any(bvec2(clamp(tcBlue, vec2(0.0,0.0), vec2(1.0,1.0))-tcBlue))) {",
   "    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);",
   "    return;",
   "  }",
    // Now do blue texture lookup.
   "  float blue = texture2D(u_texture, tcBlue).b;",
    // Do green lookup (no scaling)
   "  vec2 tcGreen = LensCenter + Scale * theta1;",
   "  tcGreen = (tcGreen + 1.0) / 2.0;", // range from [-1,1] to [0,1]
   "  float green = texture2D(u_texture, tcGreen).g;",
   // Do red scale and lookup.
   "  vec2 thetaRed = theta1 * (ChromAbParam.x + ChromAbParam.y * rSq);",
   "  vec2 tcRed = LensCenter + Scale * thetaRed;",
   "  tcRed = (tcRed + 1.0) / 2.0;", // range from [-1,1] to [0,1]
   "  float red = texture2D(u_texture, tcRed).r;",
   "  gl_FragColor = vec4(red, green, blue, 1.0);",
   "}"
 ].join("\n");
});
