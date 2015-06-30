function Promise() {
  var value = null;
  var callChain = [];
  var status = 'unresolved';
  var lastResult = null;
  function callThenChain() {
    lastResult = value;
    status = 'then';
    callChain.forEach(function (callback) {
      lastResult = callback(lastResult);
    });
    status = 'finished';
  }
  this.reset = function () {
    value = null;
    callChain = [];
    status = 'unresolved';
  };
  this.getStatus = function() { return status; };
  this.getValue = function() { return value; };
  this.resolve = function( toValue ) {
    if (status != 'unresolved')
      throw "Trying to resolve again a resolved promise.";
    value = toValue;
    status = 'resolved';
    callThenChain();
  };
  this.then = function( callback ) {
    if (status == 'finished') 
      callback(lastResult);
    else
      callChain.push(callback);
  };
}


var WebRTCHandler = new (function () { 
  'use strict';
  
  var iceState = 'disconnected';
  var iceCandidatePromise = new Promise();
  var cfg = {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]},
    con = { 'optional': [ {'DtlsSrtpKeyAgreement': true}] };

  var webrtcCon = new RTCPeerConnection(cfg, con);
  
  webrtcCon.onconnection = function () {
    console.log( "got connection" );
    if (self.onConnection) self.onConnection();
  };
  
  webrtcCon.onicecandidate = function (e) {
    if (e.candidate == null) {
        iceCandidatePromise.resolve(webrtcCon.localDescription);
    }
  };
  
  webrtcCon.onsignalingstatechange = function (state) {
      console.info('signaling state change:', state);
  };
  
  webrtcCon.oniceconnectionstatechange = function (state) {
      console.info('ice connection state change:', state);
      iceState = state.target.iceConnectionState;
  };

  webrtcCon.onicegatheringstatechange = function (state) {
      console.info('ice gathering state change:', state);
  };
  
  function handleCandidate(iceCandidate) {
      webrtcCon.addIceCandidate(iceCandidate);
  }

  var self = this;

  this.onReceive = function() {};
  
  this.create_joinAnswer = function(answer) {
    var answerDesc = new RTCSessionDescription(answer);
    webrtcCon.setRemoteDescription(answerDesc);
    console.log("Setting remote desc");
  };
  
  var dataChannel;
  function setupDataChannel() {
      try {
          dataChannel = webrtcCon.createDataChannel('test', {reliable:true});
          console.log("Created datachannel");
          dataChannel.onopen = function (e) {
              console.log('data channel connect');
              if (self.onConnection) self.onConnection();
          }
          dataChannel.onmessage = function (e) {
              if (e.data.charCodeAt(0) == 2) {
                // The first message we get from Firefox (but not Chrome)
                // is literal ASCII 2 and I don't understand why -- if we
                // leave it in, JSON.parse() will barf.
                return;
              }
              var data = JSON.parse(e.data);
              if (data.type === 'file') {
                  console.log("Attempting to receive file. TODO");
              }
              else {
                  self.onReceive(data);
              }
          };
      } catch (e) { console.warn("No data channel", e); }
  }
  
  this.create = function (success, error) {
    setupDataChannel();
    webrtcCon.createOffer(
      function (desc) {
          webrtcCon.setLocalDescription(desc, 
                                        success? success.bind(self, desc) : function() {},
                                        error? error.bind(self, desc) : function() {} );
      }, 
      function () {
        if (error) 
          error.bind(self)(null);
      });
    var createPromise = new Promise();
    iceCandidatePromise.reset();
    iceCandidatePromise.then(function (data) { createPromise.resolve(data); });
    return createPromise;
  };
  
  this.getLocalDescription = function() {
    return webrtcCon.localDescription;
  }
  
  this.join = function (desc, success, error) {
      var offerDesc = new RTCSessionDescription(desc);
      webrtcCon.setRemoteDescription(offerDesc);
      webrtcCon.createAnswer(function (answerDesc) {
          webrtcCon.setLocalDescription(answerDesc);
          if (success)
            success.bind(self)(answerDesc);
      }, 
      function (e) { 
          if (error)
            error.bind(self)(e);
      });
      
    var joinPromise = new Promise();
    iceCandidatePromise.reset();
    iceCandidatePromise.then(function (data) { joinPromise.resolve(data); });
    return joinPromise;
  };
  
  webrtcCon.ondatachannel = function (e) {
    dataChannel = e.channel || e; // Chrome sends event, FF sends raw channel
    console.log("Received datachannel", arguments);
    dataChannel.onopen = function (e) {
        console.log('data channel connect');
        if (self.onConnection) self.onConnection();
    }
    dataChannel.onmessage = function (e) {
        var data = JSON.parse(e.data);
        if (data.type === 'file') {
            console.log("Attempting to receive a file. TODO.");
        }
        else {
            self.onReceive(data);
        }
    };
    
  };
   
  this.send = function (message) {
      return dataChannel.send(message);
  };
  
  this.close = function () {
    webrtcCon.close();
  };

  this.getState = function () { return iceState; };
  
})();

