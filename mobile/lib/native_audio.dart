import 'dart:async';
import 'dart:typed_data';
import 'package:flutter/services.dart';

class NativeAudio {
  static const methods = MethodChannel('de.tariq.telefonie/audio');
  static const events = EventChannel('de.tariq.telefonie/pcm');
  Stream<Uint8List> get capture => events.receiveBroadcastStream().map((data)=>data as Uint8List);
  Future<void> prepare() => methods.invokeMethod('prepare');
  Future<void> start() => methods.invokeMethod('start');
  Future<void> ring(bool value) => methods.invokeMethod('ring',value);
  Future<void> stop() => methods.invokeMethod('stop');
  Future<void> mute(bool value) => methods.invokeMethod('mute',value);
  Future<void> speaker(bool value) => methods.invokeMethod('speaker',value);
  Future<void> play(Uint8List data) => methods.invokeMethod('play',data);
}
