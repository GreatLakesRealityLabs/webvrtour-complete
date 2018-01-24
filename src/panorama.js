/**
 * @author: Sokwhan Huh
 * @date: January 22nd, 2018
 * 
 * Panorama renderer using WebGL
 * 
 * Original Source referenced from https://github.com/toji/webvr.info
 * 
 * Use of this source code is governed by a BSD-style license that can be found in the LICENSE file.
 */

window.Panorama = (function () {
  "use strict";

  var projectionMat = mat4.create();
  var viewMat = mat4.create();

  // Define Vertex Shader & Fragment Shader code to be ran on GPU side
  var panoVS = [
    "uniform mat4 projectionMat;",
    "uniform mat4 modelViewMat;",
    "attribute vec3 position;",
    "attribute vec2 texCoord;",
    "varying vec2 vTexCoord;",

    "void main() {",
    "  vTexCoord = texCoord;",
    "  gl_Position = projectionMat * modelViewMat * vec4( position, 1.0 );",
    "}",
  ].join("\n");

  var panoFS = [
    "precision mediump float;",
    "uniform sampler2D diffuse;",
    "varying vec2 vTexCoord;",

    "void main() {",
    "  gl_FragColor = texture2D(diffuse, vTexCoord);",
    "}",
  ].join("\n");

  var Panorama = function (gl) {
    this.gl = gl;

    this.texture = gl.createTexture();

    this.glProgram = new WGLUProgram(gl);
    this.glProgram.attachShaderSource(panoVS, gl.VERTEX_SHADER);
    this.glProgram.attachShaderSource(panoFS, gl.FRAGMENT_SHADER);
    this.glProgram.bindAttribLocation({
      position: 0,
      texCoord: 1
    });
    this.glProgram.link();

    var panoVerts = [];
    var panoIndices = [];

    var radius = 2; // 2 meter radius sphere
    var latSegments = 40;
    var lonSegments = 40;

    // Create the vertices
    // We're basically trying to create a simple spherical projection (to give that panorama feeling)
    // Then we apply a texture (3d image) to complete the panorama view
    for (var i=0; i <= latSegments; ++i) {
      var theta = i * Math.PI / latSegments;
      var sinTheta = Math.sin(theta);
      var cosTheta = Math.cos(theta);

      for (var j=0; j <= lonSegments; ++j) {
        var phi = j * 2 * Math.PI / lonSegments;
        var sinPhi = Math.sin(phi);
        var cosPhi = Math.cos(phi);

        var x = sinPhi * sinTheta;
        var y = cosTheta;
        var z = -cosPhi * sinTheta;
        var u = (j / lonSegments);
        var v = (i / latSegments);

        panoVerts.push(x * radius, y * radius, z * radius, u, v);
      }
    }

    // Create the indices, so we don't have to duplicate vertex data
    for (var i = 0; i < latSegments; ++i) {
      var offset0 = i * (lonSegments+1);
      var offset1 = (i+1) * (lonSegments+1);
      for (var j = 0; j < lonSegments; ++j) {
        var index0 = offset0+j;
        var index1 = offset1+j;
        panoIndices.push(
          index0, index1, index0+1,
          index1, index1+1, index0+1
        );
      }
    }

    this.vertBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(panoVerts), gl.STATIC_DRAW);

    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(panoIndices), gl.STATIC_DRAW);

    this.indexCount = panoIndices.length;

    this.imgElement = null;
  };

  Panorama.prototype.setImage = function (url) {
    var gl = this.gl;
    var self = this;

    return new Promise(function(resolve, reject) {
      var img = new Image();
      img.addEventListener('load', function() {
        self.imgElement = img;

        gl.bindTexture(gl.TEXTURE_2D, self.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        resolve(self.imgElement);
      });
      img.addEventListener('error', function(ev) {
        console.error(ev.message);
        reject(ev.message);
      }, false);
      img.crossOrigin = 'anonymous';
      img.src = url;
    });
  };

// Renders the scene given a projection matrix & modelView Matrix
// Notice we've squashed model & view matrix together
// This is because we never have to care about applying model transformation in panorama view,
// since the user can never move around in the scene, meaning we never have to apply scaling / rotation / translation to the model.
Panorama.prototype.render = function (projectionMat, modelViewMat) {
    var gl = this.gl;
    var glProgram = this.glProgram;

    if (!this.imgElement)
      return;

    glProgram.use();

    // Send the projection & modelView transformation matrices to the vertex shader (To GPU)
    gl.uniformMatrix4fv(glProgram.uniform.projectionMat, false, projectionMat);
    gl.uniformMatrix4fv(glProgram.uniform.modelViewMat, false, modelViewMat);

    // Ensure we bind the buffers before sending it over, so that WebGL can internally prepare the global shader variables
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

    // Enable Position / Texture attributes so they can be used
    gl.enableVertexAttribArray(glProgram.attrib.position);
    gl.enableVertexAttribArray(glProgram.attrib.texCoord);
    
    // Define the memory layout of the vertex buffer object, so WebGL knows where to fetch them
    gl.vertexAttribPointer(glProgram.attrib.position, 3, gl.FLOAT, false, 20, 0);
    gl.vertexAttribPointer(glProgram.attrib.texCoord, 2, gl.FLOAT, false, 20, 12);

    // Apply texture (the 3d jpeg image)
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.glProgram.uniform.diffuse, 0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    // Render the scene
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
  };

  return Panorama;
})();
