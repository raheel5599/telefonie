import AVFoundation
import AudioToolbox

final class TariqAudioPlugin: NSObject, FlutterPlugin, FlutterStreamHandler {
  private var sink: FlutterEventSink?
  private var engine: AVAudioEngine?
  private var player: AVAudioPlayerNode?
  private var converter: AVAudioConverter?
  private var muted=false
  private var ringTimer: Timer?
  private var queued=0
  private let outputFormat=AVAudioFormat(standardFormatWithSampleRate:16000,channels:1)!
  static func register(with registrar: FlutterPluginRegistrar){
    let instance=TariqAudioPlugin()
    registrar.addMethodCallDelegate(instance,channel:FlutterMethodChannel(name:"de.tariq.telefonie/audio",binaryMessenger:registrar.messenger()))
    FlutterEventChannel(name:"de.tariq.telefonie/pcm",binaryMessenger:registrar.messenger()).setStreamHandler(instance)
  }
  func onListen(withArguments arguments: Any?,eventSink events:@escaping FlutterEventSink)->FlutterError?{sink=events;return nil}
  func onCancel(withArguments arguments:Any?)->FlutterError?{sink=nil;return nil}
  func handle(_ call:FlutterMethodCall,result:@escaping FlutterResult){
    do{
      switch call.method{
      case "prepare":AVAudioSession.sharedInstance().requestRecordPermission{allowed in DispatchQueue.main.async{result(allowed ? nil:FlutterError(code:"permission",message:"Bitte Mikrofonzugriff erlauben.",details:nil))}}
      case "start":try start();result(nil)
      case "stop":stop();result(nil)
      case "mute":muted=call.arguments as? Bool ?? false;result(nil)
      case "speaker":try AVAudioSession.sharedInstance().overrideOutputAudioPort(call.arguments as? Bool == true ? .speaker:.none);result(nil)
      case "ring":if call.arguments as? Bool == true{if ringTimer==nil{AudioServicesPlayAlertSound(1005);ringTimer=Timer.scheduledTimer(withTimeInterval:3,repeats:true){_ in AudioServicesPlayAlertSound(1005)}}}else{ringTimer?.invalidate();ringTimer=nil};result(nil)
      case "play":if let value=call.arguments as? FlutterStandardTypedData{play(value.data)};result(nil)
      default:result(FlutterMethodNotImplemented)
      }
    }catch{result(FlutterError(code:"audio",message:"Audio konnte nicht gestartet werden: \(error.localizedDescription)",details:nil))}
  }
  private func start()throws{
    if engine != nil{return}
    let session=AVAudioSession.sharedInstance()
    try session.setCategory(.playAndRecord,mode:.voiceChat,options:[.allowBluetooth])
    try session.setPreferredSampleRate(48000)
    try session.setPreferredIOBufferDuration(0.02)
    try session.setActive(true)
    let engine=AVAudioEngine(),player=AVAudioPlayerNode()
    try engine.inputNode.setVoiceProcessingEnabled(true)
    let input=engine.inputNode.outputFormat(forBus:0)
    guard input.sampleRate>0,let converter=AVAudioConverter(from:input,to:outputFormat)else{throw NSError(domain:"TariqAudio",code:1)}
    self.converter=converter;self.engine=engine;self.player=player;muted=false
    engine.attach(player);engine.connect(player,to:engine.mainMixerNode,format:outputFormat)
    engine.inputNode.installTap(onBus:0,bufferSize:960,format:input){[weak self]buffer,_ in
      guard let self=self,!self.muted else{return}
      let capacity=AVAudioFrameCount(ceil(Double(buffer.frameLength)*16000/input.sampleRate))+8
      guard let output=AVAudioPCMBuffer(pcmFormat:self.outputFormat,frameCapacity:capacity)else{return}
      var supplied=false;var error:NSError?
      converter.convert(to:output,error:&error){_,status in if supplied{status.pointee = .noDataNow;return nil};supplied=true;status.pointee = .haveData;return buffer}
      guard error==nil,let floats=output.floatChannelData?[0],output.frameLength>0 else{return}
      var data=Data(capacity:Int(output.frameLength)*2)
      for i in 0..<Int(output.frameLength){var value=Int16(max(-32767,min(32767,Int(floats[i]*32767)))).littleEndian;withUnsafeBytes(of:&value){data.append(contentsOf:$0)}}
      DispatchQueue.main.async{[weak self] in if self?.engine != nil{self?.sink?(FlutterStandardTypedData(bytes:data))}}
    }
    do{try engine.start();player.play()}catch{stop();throw error}
  }
  private func play(_ data:Data){
    guard data.count>1,data.count<=32768,queued<12,let player=player,let buffer=AVAudioPCMBuffer(pcmFormat:outputFormat,frameCapacity:AVAudioFrameCount(data.count/2)),let samples=buffer.floatChannelData?[0]else{return}
    buffer.frameLength=buffer.frameCapacity
    data.withUnsafeBytes{raw in let bytes=raw.bindMemory(to:UInt8.self);for i in 0..<Int(buffer.frameLength){let value=Int16(bitPattern:UInt16(bytes[i*2])|UInt16(bytes[i*2+1])<<8);samples[i]=Float(value)/32768}}
    queued+=1;player.scheduleBuffer(buffer){[weak self] in DispatchQueue.main.async{self?.queued=max(0,(self?.queued ?? 1)-1)}}
  }
  private func stop(){ringTimer?.invalidate();ringTimer=nil;if let e=engine{e.inputNode.removeTap(onBus:0);e.stop()};player?.stop();engine=nil;player=nil;converter=nil;queued=0;try? AVAudioSession.sharedInstance().setActive(false,options:.notifyOthersOnDeactivation)}
}
