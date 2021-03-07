AFRAME.registerComponent('networked-video-source', {
  schema: {
    positional: { default: true },
    distanceModel: {
      default: "inverse",
      oneOf: ["linear", "inverse", "exponential"]
    },
    maxDistance: { default: 10000 },
    refDistance: { default: 1 },
    rolloffFactor: { default: 1 }
  },

  init: function () {
    console.warn("using networked-video-source")
    this.listener = null;
    this.stream = null;

    this._setMediaStream = this._setMediaStream.bind(this);

    NAF.utils.getNetworkedEntity(this.el).then((networkedEl) => {
      const ownerId = this.ownerId = networkedEl.components.networked.data.owner;
      this.data.ownerId = ownerId;
      console.log("setting up media for", ownerId)

      if (ownerId) {
        NAF.connection.adapter.getMediaStream(ownerId)
          .then(this._setMediaStream)
          .catch((e) => NAF.log.error(`Error getting media stream for ${ownerId}`, e));
      }
      else {
        console.warn("no ownerId, networked audio won't setMediaStream. (this is expected for our local networked entity--we don't stream self to self).")
        // Correctly configured local entity, in theory could do something here for enabling debug audio loopback--playing own audio to self without network connection
      }
    });

    vrgc.networkedVideoSource = this
  },

  update() {
    this._setPannerProperties();
  },

  _setMediaStream: async function(newStream) {
    console.warn("GOT STREAM for",this.ownerId, newStream)
    console.error("Will set stream to #"+(this.ownerId + "-video-source"));

    const streamId = this.ownerId + "-video-source";

    this.userVideoStream = document.createElement('video');
    this.userVideoStream.setAttribute('id', streamId);
    this.userVideoStream.setAttribute('playsinline', "");
    this.userVideoStream.setAttribute('autoplay', "");

    console.error("experimental attempt to mute audio")
    this.userVideoStream.setAttribute('muted', ""); // experimental, attempt to prevent audio playing both form here as well as positionally
    
    this.userVideoStream.srcObject = newStream;

    this.userVideoStream.onloadedmetadata = () => {
      this.userVideoStream.play();
      // used to be document.querySelector, but we need it more specific!
      console.warn("setting tv src play video", this.el.querySelector('.avatar-tv-plane'), "#"+streamId, this.userVideoStream)
      this.el.querySelector('.avatar-tv-plane').setAttribute('src', "#" + streamId);
    };

    document.body.appendChild(this.userVideoStream);

    if(!this.sound) {
      this.setupSound();
    }

    if(newStream === this.stream) { return }

    if(this.stream) {
      this.sound.disconnect();
    }

    if(newStream) {
      // Chrome seems to require a MediaStream be attached to an AudioElement before AudioNodes work correctly
      // We don't want to do this in other browsers, particularly in Safari, which actually plays the audio despite
      // setting the volume to 0.
      if (/chrome/i.test(navigator.userAgent)) {
        this.audioEl = new Audio();
        this.audioEl.setAttribute("autoplay", "autoplay");
        this.audioEl.setAttribute("playsinline", "playsinline");
        this.audioEl.srcObject = newStream;
        this.audioEl.volume = 0; // we don't actually want to hear audio from this element
      }

      // attempt to make mono output (distance only spatial sound)
      // https://developer.mozilla.org/en-US/docs/Web/API/AudioNode/channelInterpretation

      // var AudioContext = window.AudioContext || window.webkitAudioContext; // skipped

      var audioCtx = this.sound.context; // changed

      this.oscillator = audioCtx.createOscillator();
      this.gainNode = audioCtx.createGain();

      this.oscillator.connect(this.gainNode);
      this.gainNode.connect(audioCtx.destination);

      this.oscillator.channelInterpretation = 'speakers'; // changed

      // The down-mixing to mono is equivalent to the down-mixing for an AudioNode with channelCount = 1, channelCountMode = "explicit", and channelInterpretation = "speakers".
      // https://www.w3.org/TR/webaudio/

      // this.oscillator.channelCountMode = 'explicit'; // added
      // this.oscillator.channelCount = 1; // added

      // this code doesn't seem to do anything, and based on this documentation:
      // https://developer.mozilla.org/en-US/docs/Web/API/PannerNode
      // I'm pretty sure that this is "impossible" with three.js's implementation--
      // according to 
      // https://threejs.org/docs/#api/en/audio/PositionalAudio.panner
      // they use a panner node, which as per the previous doc, is always stereo output
      // by design. So we'd need to not use a pannernode, which as far as I know isn't an 
      // option and seems to be an axiomatix characteristic of thressjs positional audio


      // output.M = 0.5 * (input.L + input.R)
      // this.sound.context
      // end added in mono-output code block

      this.soundSource = this.sound.context.createMediaStreamSource(newStream);
      this.sound.setNodeSource(this.soundSource);
      this.el.emit('sound-source-set', { soundSource: this.soundSource });
    }
    this.stream = newStream;
  },

  _setPannerProperties() {
    if (this.sound) {
      this.sound.setMaxDistance( 8 )
      this.sound.setRolloffFactor(3)
      this.sound.setDistanceModel('exponential')
      this.sound.setRefDistance( 2 );
      // this.sound.setMaxDistance( 25 )
      // this.sound.setRolloffFactor( 5 )
      // this.sound.setDistanceModel('exponential')
      // this.sound.setRefDistance( 8 );
    }
  },

  remove: function() {
    if (!this.sound) return;

    this.el.removeObject3D(this.attrName);
    if (this.stream) {
      this.sound.disconnect();
    }
  },

  setupSound: function() {
    var el = this.el;
    var sceneEl = el.sceneEl;

    if (this.sound) {
      el.removeObject3D(this.attrName);
    }

    if (!sceneEl.audioListener) {
      sceneEl.audioListener = new THREE.AudioListener();
    }
    this.listener = sceneEl.audioListener;

    this.sound = this.data.positional
      ? new THREE.PositionalAudio(this.listener)
      : new THREE.Audio(this.listener);

    // attempt at using networked audio as source instead?
    // console.warn("LOAD AUDIO VISUALIZER AS COMPONENT")
    // this.el.setAttribute('audio-visualizer', {audio: this.sound, clientId: this.data.ownerId})

    el.setObject3D(this.attrName, this.sound);
    this._setPannerProperties();
    this.sound.play()
  }
});
