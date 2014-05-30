define([ 'Cesium' ], function(Cesium) {
  "use strict";

  var RiftIO = function(callback) {
    this.state = undefined;
    this.hmdInfo = undefined;

    var that = this;
    vr.load(function(error) {

      if (error) {
        alert('VR error:\n' + error.toString());
      }

      that.state = new vr.State();
      pollState(that.state);

      if (that.state.hmd.present) {
        that.hmdInfo = vr.getHmdInfo();
      } else {
        alert("No head-mounted display present.\nUsing default parameters");
        that.hmdInfo = {
          "deviceName" : "Oculus Rift DK1",
          "deviceManufacturer" : "Oculus VR",
          "deviceVersion" : 0,
          "desktopX" : 0,
          "desktopY" : 0,
          "resolutionHorz" : 1280,
          "resolutionVert" : 800,
          "screenSizeHorz" : 0.14976,
          "screenSizeVert" : 0.0936,
          "screenCenterVert" : 0.0468,
          "eyeToScreenDistance" : 0.041,
          "lensSeparationDistance" : 0.0635,
          "interpupillaryDistance" : 0.064,
          "distortionK" : {
            "0" : 1,
            "1" : 0.2199999988079071,
            "2" : 0.23999999463558197,
            "3" : 0
          },
          "chromaAbCorrection" : {
            "0" : 0.9959999918937683,
            "1" : -0.004000000189989805,
            "2" : 1.0140000581741333,
            "3" : 0
          }
        };
      }
      if (typeof (callback) !== 'undefined') {
        callback(that.hmdInfo);
      }
    });
  };

  function pollState(state) {
    if (!vr.pollState(state)) {
      alert("vr.js plugin not found/error polling");
    }
  }

  function toQuat(r) {
    if (r[0] === 0 && r[1] === 0 && r[2] === 0 && r[3] === 0) {
      return Cesium.Quaternion.IDENTITY;
    }
    return new Cesium.Quaternion(r[0], r[1], r[2], r[3]);
  }

  RiftIO.prototype.getRotation = function() {
    pollState(this.state);
    return toQuat(this.state.hmd.rotation);
  };

  RiftIO.getUniforms = function(hmd, eye) {
    var scale = 2.0;
    var scale2 = 1 / 1.6;
    var aspect = hmd.resolutionHorz / (2 * hmd.resolutionVert);
    var r = -1.0 - (4 * (hmd.screenSizeHorz / 4 - hmd.lensSeparationDistance / 2) / hmd.screenSizeHorz);
    var distScale = (hmd.distortionK[0] + hmd.distortionK[1] * Math.pow(r, 2) + hmd.distortionK[2] * Math.pow(r, 4) + hmd.distortionK[3] * Math.pow(r, 6));
    var lensCenterOffset = 4 * (.25 * hmd.screenSizeHorz - .5 * hmd.lensSeparationDistance) / hmd.screenSizeHorz;
    var uniforms = {
      LensCenter : function() {
        return {
          x : 0.0 + (eye === 'left' ? lensCenterOffset : -lensCenterOffset),
          y : 0.0
        };
      },
      ScreenCenter : function() {
        return {
          x : 0.5,
          y : 0.5
        };
      },
      Scale : function() {
        return {
          x : 1.0 / distScale,
          y : 1.0 * aspect / distScale
        }
      },
      ScaleIn : function() {
        return {
          x : 1.0,
          y : 1.0 / aspect
        }
      },
      HmdWarpParam : function() {
        return {
          x : hmd.distortionK[0],
          y : hmd.distortionK[1],
          z : hmd.distortionK[2],
          w : hmd.distortionK[3]
        }
      },
      ChromAbParam : function() {
        return {
          x : hmd.chromaAbCorrection[0],
          y : hmd.chromaAbCorrection[1],
          z : hmd.chromaAbCorrection[2],
          w : hmd.chromaAbCorrection[3]
        }
      }
    };

    return uniforms;
  }
  
  RiftIO.getShader = function() {
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
  }

  return RiftIO;
});