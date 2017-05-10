import setupDataBase from './firebase'
import Tuna from 'tunajs'
import toBuffer from 'typedarray-to-buffer'

/* global firebase AudioContext MediaRecorder URL FileReader Blob */

let mediaRecorder

let isRecording = false
let interval
let audioQueue = []

const startRecording = (app) => {
  if (isRecording && app.state.inSim) {
    console.log('trying to record while already recording or when outside sim')
  } else {
    mediaRecorder.start()
    console.log('starting to record!')
    interval = setInterval(() => {
      clearInterval(interval)
      if(isRecording){
        console.log('STOPPED RECORDING BECUASE INTERVAL EXSPIRED!')
        mediaRecorder.stop()
        isRecording = false
      }
    }, 5000)
    isRecording = true
  }
}

const stopRecording = (app) => {
  if (isRecording && app.state.inSim) {
    if(interval){
      clearInterval(interval)
      console.log('INTERVAL CLEARED')
    }
    console.log('STOPPED RECORDING BECAUSE SPACEBAR LIFTED')
    mediaRecorder.stop()
    isRecording = false
  } else {
    console.log('trying to stop recording while not recording or outside sim')
  }
}

const setupFileReader = (isNavigator, navigatorMessages, driverMessages) => {
  const fileReader = new FileReader()
  fileReader.onloadend = () => {
    if (isNavigator) {
      navigatorMessages.push(fileReader.result)
    } else {
      driverMessages.push(fileReader.result)
    }
  }
  return fileReader
}

const setUpRecording = isNavigator => {
  navigator.getUserMedia = (navigator.getUserMedia ||
  navigator.webkitGetUserMedia ||
  navigator.mozGetUserMedia ||
  navigator.msGetUserMedia)

  const audio = document.querySelector('#messageAudioNode')
  const NASABeep = document.querySelector('#NASABeepAudioNode')
  const driverMessagesDB = setupDataBase('Driver_Messages/')
  const navigatorMessagesDB = setupDataBase('Navigator_Messages/')
  const fileReader = setupFileReader(isNavigator, navigatorMessagesDB, driverMessagesDB)
  audio.onpause = () =>{
    console.log('ON PAUSE LISTENER WAS INVOKED')
    if(audioQueue.length > 0){
      playAudio(audioQueue.shift())
    }
  }

  const listenForNewMessageAndPlay = (databaseReference) => {
    databaseReference.on('child_added', snapshot => {
      var newMessage = snapshot.val()
      var typedArray = new Uint8Array(newMessage.length)
      for (var i=0; i < newMessage.length; i++) {
        typedArray[i] = newMessage.charCodeAt(i)
      }

      if(audioQueue.length === 0 && audio.paused){
        playAudio(typedArray)
      } else {
        audioQueue.push(typedArray)
      }
    })
  }

  function toArrayBuffer(buf) {
    var ab = new ArrayBuffer(buf.length)
    var view = new Uint8Array(ab)
    for (var i = 0; i < buf.length; ++i) {
        view[i] = buf[i]
    }
    return ab
  }

  const playAudio = (dataArr) => {
    // var arrBuff = new Blob([dataArr])
    var audioBuff = toBuffer(dataArr)
    var audioArrBuff = toArrayBuffer(audioBuff)
    var context = new AudioContext()
    var source = context.createBufferSource()
    // audio.src = URL.createObjectURL(new Blob([dataArr]), {type: 'audio/webm'})

    source.onended = () => {
      NASABeep.play()
      context.close()
    }

    var tuna = new Tuna(context)

    // Filters out high and low freqs
    var filter = new tuna.Filter({
      frequency: 440, //20 to 22050
      Q: 80, //0.001 to 100
      gain: 0, //-40 to 40 (in decibels)
      filterType: "bandpass", //lowpass, highpass, bandpass, lowshelf, highshelf, peaking, notch, allpass
      bypass: 0
    })

    // Distorts audio
    var overdrive = new tuna.Overdrive({
      outputGain: 0.1,         //0 to 1+
      drive: 1,              //0 to 1
      curveAmount: 0.65,          //0 to 1
      algorithmIndex: 2,       //0 to 5, selects one of our drive algorithms
      bypass: 0
    })

    filter.connect(overdrive)
    source.connect(overdrive).connect(context.destination)

    context.decodeAudioData(audioArrBuff)
      .then(decodedAudio => {
        source.buffer = decodedAudio
        console.log('playing decoded audio', decodedAudio)
        source.start()
      })
  }

  const gotMedia = stream => {
    mediaRecorder = new MediaRecorder(stream, {mimeType: 'audio/webm'})
    mediaRecorder.onstart = () => {
      // TODO: play sound indicator about starting to record
      console.log("RECORDER STARTED")
    }

    mediaRecorder.onstop = () => {
      // TODO: play sound indicator about stopping to record
      console.log("RECORDER STOPPED")
    }

    window.onbeforeunload = () => {
      if(isNavigator){
        navigatorMessagesDB.set({})
        driverMessagesDB.set({})
      } else {
        navigatorMessagesDB.set({})
        driverMessagesDB.set({})
      }
    }

    mediaRecorder.addEventListener('dataavailable', onRecordingReady)

  }

  const convertAudioToBinary = (event) => {
    var audioData = event.data
    fileReader.readAsBinaryString(audioData)
  }

  const onRecordingReady = (e) => {
    convertAudioToBinary(e)
  }

  if (isNavigator) {
    listenForNewMessageAndPlay(driverMessagesDB)
  } else {
    listenForNewMessageAndPlay(navigatorMessagesDB)
  }
  navigator.getUserMedia({ audio: true }, gotMedia, err => { console.error(err) })
}

export {setUpRecording, mediaRecorder, startRecording, stopRecording}
