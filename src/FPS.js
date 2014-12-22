/* A simple FPS counter */
var FPS = (function() {
  "use strict";

  var movingAverageFactor = 0.05;

  var FPS = function() {
    this.prevMs = new Date().getTime();
    this.fps = 0;
    this.avgFps = 0;
  };

  FPS.prototype.update = function() {
    var ms = new Date().getTime();
    var dt = ms - this.prevMs;
    this.prevMs = ms;
    
    this.fps = 1000.0 / dt;
    this.avgFps = this.avgFps * (1.0 - movingAverageFactor) + this.fps * movingAverageFactor;
    return this.avgFps.toFixed(1);
  };

  return FPS;

})();
