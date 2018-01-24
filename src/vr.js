/**
 * @author: Sokwhan Huh
 * @date: January 22nd, 2018
 * 
 * Entry point of KLA Office Tour. Performs initialization of WebGL & WebVR
 * 
 * Original Source referenced from https://github.com/toji/webvr.info
 * 
 * Use of this source code is governed by a BSD-style license that can be found in the LICENSE file.
 */

(function () {
  "use strict";

  // Interface to the VR Device
  var vrDisplay = null;
  // Frame Data of type VRFrameData
  // populated from vrDisplay.getFrameData. We will use this frame to draw the scene.
  var frameData = null;
  // Pose matrix. Used to store the current orientation of the VR headset pose
  var poseMat = mat4.create();
  // Model View matrix. This represents the "World" we are in 
  var viewMat = mat4.create();
  // Reference to the "Enter VR" and "Exit VR" button on the DOM
  var vrPresentButton = null;

  // Projection Matrix for the panorama in non-VR view
  var projectionMat = mat4.create();

  // WebGL setup.
  var gl = null;
  var panorama = null;
  var webglCanvas = document.getElementById("webgl-canvas");

  // Performs initialization of WebGL & Panorama module
  function init() {
    var glAttribs = {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true
    };
    gl = webglCanvas.getContext("webgl", glAttribs);
    // Utilize depth buffer to perform depth testing. This improves performance as we don't draw
    // fragments that is behind other geometry or is too far
    gl.enable(gl.DEPTH_TEST);
    // Enable culling to improve performance. No need to draw triangles that we can't see
    gl.enable(gl.CULL_FACE);

    panorama = new Panorama(gl);
    panorama.setImage("media/textures/kla_office_1.jpg");

    onResize();
    window.requestAnimationFrame(onAnimationFrame);
  }

  // ================================
  // WebVR-specific code begins here.
  // ================================

  function onVRRequestPresent() {
    vrDisplay.requestPresent([{ source: webglCanvas }]).then(function () {
      VRSamplesUtil.removeButton(vrPresentButton);
      vrPresentButton = VRSamplesUtil.addButton("Exit VR", "E", "media/icons/cardboard64.png", onVRExitPresent);
    }, function (err) {
      var errMsg = "requestPresent failed.";
      if (err && err.message) {
        errMsg += "<br/>" + err.message
      }
      VRSamplesUtil.addError(errMsg, 2000);
    });
  }

  function onVRExitPresent() {
    if (!vrDisplay.isPresenting)
      return;
    vrDisplay.exitPresent().then(function () {
      VRSamplesUtil.removeButton(vrPresentButton);
      vrPresentButton = VRSamplesUtil.addButton("Enter VR", "E", "media/icons/cardboard64.png", onVRRequestPresent);
    }, function () {
      VRSamplesUtil.addError("exitPresent failed.", 2000);
    });
  }

  function onVRPresentChange() {
    onResize();
    VRSamplesUtil.removeButton(vrPresentButton);
    if (vrDisplay.isPresenting) {
      vrPresentButton = VRSamplesUtil.addButton("Exit VR", "E", "media/icons/cardboard64.png", onVRExitPresent);
    } else {
      vrPresentButton = VRSamplesUtil.addButton("Enter VR", "E", "media/icons/cardboard64.png", onVRRequestPresent);
    }
  }

  function onResize() {
    webglCanvas.width = webglCanvas.offsetWidth * window.devicePixelRatio;
    webglCanvas.height = webglCanvas.offsetHeight * window.devicePixelRatio;
  }

  function getPoseMatrix(out, pose) {
    // When rendering a panorama ignore the pose position. You want the
    // users head to stay centered at all times. This would be terrible
    // advice for any other type of VR scene, by the way!
    var orientation = pose.orientation;
    mat4.fromQuat(out, orientation);
    mat4.invert(out, out);
  }

  function onAnimationFrame(t) {
    // do not attempt to render if there is no available WebGL context
    if (!gl || !panorama) {
      return;
    }

    // Clear rendering context or previous frame's buffer will remain on screen
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (vrDisplay && vrDisplay.isPresenting) {
      vrDisplay.requestAnimationFrame(onAnimationFrame);

      vrDisplay.getFrameData(frameData);

      // Get the current orientation of the headset
      // This is equivalent of getting the view matrix for the "camera", but in VR
      getPoseMatrix(viewMat, frameData.pose);

      // We will project the world into two matrices - left & right to give a sense of depth (Basically this is the VR magic)
      gl.viewport(0, 0, webglCanvas.width * 0.5, webglCanvas.height);
      panorama.render(frameData.leftProjectionMatrix, viewMat);

      gl.viewport(webglCanvas.width * 0.5, 0, webglCanvas.width * 0.5, webglCanvas.height);
      panorama.render(frameData.rightProjectionMatrix, viewMat);

      // Submit the modified frame for drawing
      vrDisplay.submitFrame();
    } else {
      // Display the scene normally on window
      window.requestAnimationFrame(onAnimationFrame);
      gl.viewport(0, 0, webglCanvas.width, webglCanvas.height);
      mat4.perspective(projectionMat, Math.PI * 0.4, webglCanvas.width / webglCanvas.height, 0.1, 1024.0);
      panorama.render(projectionMat, mat4.create());
    }
  }

  // Program Entry
  if (navigator.getVRDisplays) {
    frameData = new VRFrameData();

    navigator.getVRDisplays().then(function (displays) {
      if (displays.length > 0) {
        // Just grab the last display. In production, we should cater for all of the attached VR displays though.
        vrDisplay = displays[displays.length - 1];
        // Defines the Z-depth on the viewing frustum
        // IE: Nearest / Furthest viewable boundary of the scene
        vrDisplay.depthNear = 0.1;
        vrDisplay.depthFar = 1024.0;

        init();
        vrPresentButton = VRSamplesUtil.addButton("Enter VR", "E", "media/icons/cardboard64.png", onVRRequestPresent);

        window.addEventListener('vrdisplaypresentchange', onVRPresentChange, false);
      } else {
        init();
        VRSamplesUtil.addInfo("WebVR supported, but no VRDisplays found.");
      }
    }, function () {
      VRSamplesUtil.addError("Error initializing WebVR!");
    });
  } else {
    init();
    VRSamplesUtil.addError("Your browser does not support WebVR.");
  }
})();