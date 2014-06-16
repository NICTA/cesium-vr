var CanvasCopy = (function() {
  "use strict";

  function createShaderProgram(gl) {
    var vertexShaderSrc = [ "attribute vec2 a_position;",
                            "varying vec2 v_texCoord;",
                            "void main() {",
                            "  v_texCoord = a_position;",
                            "  gl_Position = vec4(a_position, 0, 1);",
                            "}" ].join("\n");
    var vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexShaderSrc);
    gl.compileShader(vertexShader);

    var fragmentShaderSrc = ["precision mediump float;",
                             "uniform sampler2D u_image;",
                             "varying vec2 v_texCoord;",
                             "void main() {",
                             "  vec2 uv = vec2((v_texCoord.x+1.0)*0.5, 1.0-(v_texCoord.y+1.0)*0.5);",
                             "  gl_FragColor = texture2D(u_image, uv);",
                             "}"].join("\n");
    var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderSrc);
    gl.compileShader(fragmentShader);

    var shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      alert("Could not initialise shaders");
    }
    return shaderProgram;
  }

  var CanvasCopy = function(canvas, useWebGL) {
    this.useWebGL = Cesium.defaultValue(useWebGL, true);
    if (this.useWebGL) {
      this.gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!this.gl) {
        alert("error initializing webgl!");
      }
      this.shaderProgram = createShaderProgram(this.gl);
    } else {
      this.context2d = canvas.getContext('2d');
    }
  };

  CanvasCopy.prototype.copy = function(srcCanvas) {
    if (this.useWebGL) {
      var gl = this.gl;
      gl.viewport(0, 0, srcCanvas.width, srcCanvas.height);
      gl.useProgram(this.shaderProgram);

      var texture = gl.createTexture();

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);

      var positionLocation = gl.getAttribLocation(this.shaderProgram, "a_position");

      var buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([ -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0 ]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } else {
      this.context2d.drawImage(srcCanvas, 0, 0);
    }

  };

  return CanvasCopy;

})();