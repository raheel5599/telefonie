import 'dart:convert';
import 'package:crypto/crypto.dart';

/// An independent WebRTC SIP account. Never sent to the TARIQ API.
class SipProfile {
  const SipProfile({required this.label, required this.domain, required this.user,
    required this.authUser, required this.password, required this.webSocketUrl,
    this.stun = '', this.turn = '', this.turnUser = '', this.turnPassword = ''});
  final String label, domain, user, authUser, password, webSocketUrl;
  final String stun, turn, turnUser, turnPassword;
  String get uri => 'sip:$user@$domain';
  String get historyKey => 'sip_history_${sha256.convert(utf8.encode('$webSocketUrl|$uri|$authUser'))}';
  static SipProfile parse(Map<String, dynamic> v) {
    String clean(String k) => (v[k] as String? ?? '').trim();
    final domain = clean('domain'), user = clean('user'), auth = clean('authUser');
    final password = v['password'] as String? ?? '';
    final url = Uri.tryParse(clean('webSocketUrl'));
    if (domain.isEmpty || domain.length > 253 ||
        !RegExp(r'^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$').hasMatch(domain)) {
      throw const FormatException('SIP-Domain ohne https://, Pfad oder Benutzername eingeben.');
    }
    final port = domain.contains(':') ? int.tryParse(domain.split(':').last) : null;
    if (port != null && (port < 1 || port > 65535)) throw const FormatException('Ungültiger SIP-Port.');
    if (!RegExp(r'^[A-Za-z0-9_.+!-]{1,128}$').hasMatch(user)) {
      throw const FormatException('SIP-Benutzername ohne @Domain eingeben.');
    }
    if (password.isEmpty || password.length > 512 || RegExp(r'[\r\n\x00]').hasMatch(password)) {
      throw const FormatException('Bitte ein gültiges SIP-Passwort eingeben.');
    }
    if (auth.length > 128 || RegExp(r'[\r\n\x00]').hasMatch(auth)) {
      throw const FormatException('Ungültiger Authentifizierungsname.');
    }
    if (url == null || url.scheme != 'wss' || url.host.isEmpty ||
        url.userInfo.isNotEmpty || url.hasFragment || url.hasQuery || (url.hasPort && (url.port < 1 || url.port > 65535))) {
      throw const FormatException('Die vollständige WSS-Adresse der Telefonanlage eingeben, z. B. wss://sip.firma.de/ws.');
    }
    for (final key in ['stun', 'turn']) {
      final value = clean(key);
      if (value.isEmpty) continue;
      final ice = Uri.tryParse(value);
      final schemes = key == 'stun' ? ['stun', 'stuns'] : ['turn', 'turns'];
      if (ice == null || !schemes.contains(ice.scheme) || ice.path.isEmpty ||
          RegExp(r'[\s\r\n@]').hasMatch(value) || value.length > 512) {
        throw FormatException('Ungültige ${key.toUpperCase()}-Adresse.');
      }
    }
    final label = clean('label');
    if (label.length > 80 || RegExp(r'[\r\n\x00]').hasMatch(label)) throw const FormatException('Ungültiger Anzeigename.');
    return SipProfile(label: label.isEmpty ? user : label, domain: domain, user: user,
      authUser: auth.isEmpty ? user : auth, password: password, webSocketUrl: url.toString(),
      stun: clean('stun'), turn: clean('turn'), turnUser: clean('turnUser'),
      turnPassword: v['turnPassword'] as String? ?? '');
  }
  Map<String, dynamic> toJson() => {'label':label, 'domain':domain, 'user':user,
    'authUser':authUser, 'password':password, 'webSocketUrl':webSocketUrl,
    'stun':stun, 'turn':turn, 'turnUser':turnUser, 'turnPassword':turnPassword};
  String target(String input) {
    final number = input.trim().replaceAll(RegExp(r'[ ()-]'), '');
    if (!RegExp(r'^\+?[0-9*#]{1,40}$').hasMatch(number)) {
      throw const FormatException('Bitte eine Rufnummer oder Nebenstelle eingeben.');
    }
    // Encode # so it cannot become a URI fragment. No arbitrary SIP headers.
    return 'sip:${Uri.encodeComponent(number).replaceAll('%2B', '+')}@$domain';
  }
}
