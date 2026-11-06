import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const serverOrigin = 'https://telefonie.tariq-itconsulting.de';
class ApiException implements Exception {
  final String message;
  final int status;
  ApiException(this.message, [this.status = 0]);
  @override String toString() => message;
}
class PhoneApi {
  final storage = const FlutterSecureStorage();
  final HttpClient client = HttpClient()..connectionTimeout = const Duration(seconds: 15);
  String? token;
  Future<void> restore() async { token = await storage.read(key: 'tariq_session'); }
  Future<void> forget() async { token = null; await storage.delete(key: 'tariq_session'); }
  Future<HttpClientRequest> request(String method, String route) async {
    final uri = Uri.parse('$serverOrigin$route');
    if (uri.origin != serverOrigin || !route.startsWith('/api/')) throw ApiException('Ungültiges Ziel.');
    final req = await client.openUrl(method, uri);
    req.followRedirects = false;
    req.headers.set('Origin', serverOrigin);
    req.headers.set(HttpHeaders.contentTypeHeader, 'application/json');
    if (token != null) req.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
    return req;
  }
  Future<Map<String,dynamic>> json(String route, {Map<String,dynamic>? body}) async {
    final req = await request(body == null ? 'GET' : 'POST', route);
    if (body != null) req.write(jsonEncode(body));
    final response = await req.close().timeout(const Duration(seconds: 110));
    final raw = await utf8.decoder.bind(response).join();
    Map<String,dynamic> data;
    try { final decoded=jsonDecode(raw);data=decoded==null?<String,dynamic>{}:decoded as Map<String,dynamic>; } catch (_) { throw ApiException('Serverantwort nicht lesbar.', response.statusCode); }
    if (response.statusCode < 200 || response.statusCode >= 300) throw ApiException(data['error']?.toString() ?? 'Anfrage fehlgeschlagen.', response.statusCode);
    return data;
  }
  Future<Map<String,dynamic>> login(String username, String password) async {
    final value = await json('/api/native/login', body: {'email':username.trim(),'password':password});
    if (value['token'] is! String || !RegExp(r'^[a-f0-9]{64}$').hasMatch(value['token'])) throw ApiException('App-Anmeldung nicht bestätigt.');
    token = value['token'];
    await storage.write(key: 'tariq_session', value: token);
    return json('/api/session');
  }
  Stream<Map<String,dynamic>> events(String ticket) async* {
    final req = await request('GET','/api/phone/events?token=${Uri.encodeComponent(ticket)}');
    req.headers.set(HttpHeaders.acceptHeader, 'text/event-stream');
    final response = await req.close().timeout(const Duration(seconds:15));
    if (response.statusCode != 200) throw ApiException('Telefonverbindung nicht bestätigt.', response.statusCode);
    String event = '', data = '';
    await for (final line in response.transform(utf8.decoder).transform(const LineSplitter())) {
      if (line.startsWith('event:')) event = line.substring(6).trim();
      if (line.startsWith('data:')) data += line.substring(5).trim();
      if (line.isEmpty) { if(event == 'state' && data.isNotEmpty) yield jsonDecode(data) as Map<String,dynamic>; event=''; data=''; }
    }
  }
  Future<WebSocket> media(String id) => WebSocket.connect('${serverOrigin.replaceFirst('https:', 'wss:')}/api/phone/media?call=${Uri.encodeComponent(id)}', protocols:['media'], headers:{HttpHeaders.authorizationHeader:'Bearer $token','Origin':serverOrigin});
  Future<void> logout() async { try { await json('/api/logout', body:{}); } finally { await forget(); } }
}
