package de.tariqitconsulting.tariq_telefonie

import android.Manifest
import android.content.pm.PackageManager
import android.media.*
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.os.Handler
import android.os.Looper
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.LinkedBlockingDeque
import java.util.concurrent.atomic.AtomicBoolean

class MainActivity: FlutterActivity(), EventChannel.StreamHandler {
  private val main = Handler(Looper.getMainLooper())
  private var sink: EventChannel.EventSink? = null
  private var recorder: AudioRecord? = null
  private var player: AudioTrack? = null
  private var aec: AcousticEchoCanceler? = null
  private var noise: NoiseSuppressor? = null
  private var ring: Ringtone? = null
  private val running = AtomicBoolean(false)
  @Volatile private var muted = false
  private val playback = LinkedBlockingDeque<ByteArray>(12)
  private var pending: MethodChannel.Result? = null
  private lateinit var manager: AudioManager
  override fun configureFlutterEngine(engine: FlutterEngine) {
    super.configureFlutterEngine(engine)
    manager = getSystemService(AUDIO_SERVICE) as AudioManager
    EventChannel(engine.dartExecutor.binaryMessenger,"de.tariq.telefonie/pcm").setStreamHandler(this)
    MethodChannel(engine.dartExecutor.binaryMessenger,"de.tariq.telefonie/audio").setMethodCallHandler { call,result ->
      try {
        when(call.method) {
          "prepare" -> { if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)result.success(null) else {if(pending!=null){result.error("busy","Mikrofonfreigabe läuft.",null)}else{pending=result;requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO),471)}} }
          "start" -> { startAudio(); result.success(null) }
          "stop" -> { stopAudio(); result.success(null) }
          "mute" -> { muted=call.arguments==true;result.success(null) }
          "speaker" -> { manager.isSpeakerphoneOn=call.arguments==true;result.success(null) }
          "ring" -> { if(call.arguments==true){if(ring==null){ring=RingtoneManager.getRingtone(this,RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE));ring?.play()}}else{ring?.stop();ring=null};result.success(null) }
          "play" -> { val bytes=call.arguments as? ByteArray;if(bytes!=null && bytes.size<=32768 && running.get()){if(!playback.offer(bytes)){playback.poll();playback.offer(bytes)}};result.success(null) }
          else -> result.notImplemented()
        }
      }catch(e:Exception){result.error("audio","Audio konnte nicht gestartet werden: ${e.message}",null)}
    }
  }
  override fun onRequestPermissionsResult(code:Int,permissions:Array<out String>,results:IntArray){super.onRequestPermissionsResult(code,permissions,results);if(code==471){if(results.isNotEmpty()&&results[0]==PackageManager.PERMISSION_GRANTED)pending?.success(null)else pending?.error("permission","Bitte Mikrofonzugriff erlauben.",null);pending=null}}
  override fun onListen(arguments:Any?,events:EventChannel.EventSink?){sink=events}
  override fun onCancel(arguments:Any?){sink=null}
  private fun startAudio(){
    if(running.get())return
    if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)throw SecurityException("Mikrofonzugriff fehlt")
    manager.mode=AudioManager.MODE_IN_COMMUNICATION
    val size=maxOf(AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT),2560)
    val input=AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION,16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,size)
    if(input.state!=AudioRecord.STATE_INITIALIZED){input.release();throw IllegalStateException("Mikrofon nicht verfügbar")}
    val output=AudioTrack.Builder().setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()).setAudioFormat(AudioFormat.Builder().setSampleRate(16000).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build()).setBufferSizeInBytes(maxOf(AudioTrack.getMinBufferSize(16000,AudioFormat.CHANNEL_OUT_MONO,AudioFormat.ENCODING_PCM_16BIT),2560)).setTransferMode(AudioTrack.MODE_STREAM).build()
    recorder=input;player=output
    if(AcousticEchoCanceler.isAvailable())aec=AcousticEchoCanceler.create(input.audioSessionId)?.apply{enabled=true}
    if(NoiseSuppressor.isAvailable())noise=NoiseSuppressor.create(input.audioSessionId)?.apply{enabled=true}
    running.set(true);muted=false;input.startRecording();output.play()
    Thread({val buffer=ByteArray(640);while(running.get()){val n=input.read(buffer,0,buffer.size);if(n>0&&!muted){val data=buffer.copyOf(n);main.post{if(running.get())sink?.success(data)}}else if(n<0)break}},"TariqCapture").apply{isDaemon=true;start()}
    Thread({while(running.get()){try{val bytes=playback.take();if(running.get())output.write(bytes,0,bytes.size)}catch(_:InterruptedException){break}catch(_:Exception){break}}},"TariqPlayback").apply{isDaemon=true;start()}
  }
  private fun stopAudio(){
    running.set(false);playback.clear();playback.offer(ByteArray(0))
    try{recorder?.stop()}catch(_:Exception){};recorder?.release();recorder=null
    try{player?.stop()}catch(_:Exception){};player?.release();player=null
    aec?.release();aec=null;noise?.release();noise=null
    ring?.stop();ring=null
    if(::manager.isInitialized)manager.mode=AudioManager.MODE_NORMAL
  }
  override fun onDestroy(){stopAudio();super.onDestroy()}
}
