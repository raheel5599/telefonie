import 'package:flutter/material.dart';
import 'sip_controller.dart';

class SipAccountPage extends StatefulWidget {
  const SipAccountPage({super.key,required this.phone,required this.onSaved,this.onBack});
  final SipPhoneController phone;
  final VoidCallback onSaved;
  final VoidCallback? onBack;
  @override State<SipAccountPage> createState()=>_SipAccountPageState();
}
class _SipAccountPageState extends State<SipAccountPage> {
  final form=GlobalKey<FormState>();
  final fields=<String,TextEditingController>{};
  bool saving=false;String error='';
  @override void initState(){
    super.initState();
    final values=widget.phone.profile?.toJson()??<String,dynamic>{};
    for(final key in ['label','domain','user','authUser','password','webSocketUrl','stun','turn','turnUser','turnPassword']) {
      fields[key]=TextEditingController(text:values[key]?.toString()??'');
    }
  }
  @override void dispose(){for(final c in fields.values)c.dispose();super.dispose();}
  Widget field(String key,String label,{bool secret=false,String? hint,bool required=false})=>Padding(
    padding:const EdgeInsets.only(bottom:16),child:TextFormField(controller:fields[key],obscureText:secret,
      autocorrect:false,enableSuggestions:false,keyboardType:secret?TextInputType.visiblePassword:TextInputType.text,
      decoration:InputDecoration(labelText:label,hintText:hint),
      validator:required?((v)=>v==null||v.trim().isEmpty?'Bitte ausfüllen.':null):null));
  Future<void> save() async {
    if(form.currentState?.validate()!=true)return;
    setState((){saving=true;error='';});
    try {
      await widget.phone.saveProfile(fields.map((k,v)=>MapEntry(k,v.text)));
      if(mounted)widget.onSaved();
    }on FormatException catch(e){if(mounted)setState(()=>error=e.message);}
    catch(_){if(mounted)setState(()=>error='Der SIP-Zugang konnte nicht gespeichert werden.');}
    finally{if(mounted)setState(()=>saving=false);}
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Eigenes SIP-Konto'),leading:widget.onBack==null?null:IconButton(tooltip:'TARIQ-Zugang',onPressed:saving?null:widget.onBack,icon:const Icon(Icons.arrow_back))),
    body:SafeArea(child:Center(child:ConstrainedBox(constraints:const BoxConstraints(maxWidth:540),child:SingleChildScrollView(
      padding:const EdgeInsets.all(24),child:Form(key:form,child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
        const Icon(Icons.phone_in_talk_outlined,size:44,color:Color(0xFFE7BD64)),const SizedBox(height:18),
        const Text('Deine Telefonanlage',style:TextStyle(fontSize:27,fontWeight:FontWeight.bold)),const SizedBox(height:12),
        const Text('Die Zugangsdaten erhältst du vom Anbieter oder Administrator deiner Anlage. Unterstützt wird SIP über WSS mit WebRTC-Audio (DTLS/SRTP).',style:TextStyle(color:Colors.white60,height:1.5)),
        const SizedBox(height:12),const Text('Klassische UDP-/TCP-SIP-Konten und eine direkte Telekom-Anmeldung werden in dieser Version nicht unterstützt.',style:TextStyle(color:Color(0xFFE7BD64),fontSize:12,height:1.5)),
        const SizedBox(height:24),field('label','Anzeigename',hint:'Empfang'),
        field('domain','SIP-Domain / Registrar',hint:'sip.firma.de',required:true),
        field('user','SIP-Benutzername / Nebenstelle',hint:'100',required:true),
        field('authUser','Authentifizierungsname (optional)',hint:'Leer lassen, wenn gleich dem Benutzernamen'),
        field('password','SIP-Passwort',secret:true,required:true),
        field('webSocketUrl','WebSocket-Server (WSS)',hint:'wss://sip.firma.de/ws',required:true),
        ExpansionTile(title:const Text('Netzwerk · STUN / TURN'),subtitle:const Text('Optional · Angaben deiner Anlage'),children:[
          field('stun','STUN-Server',hint:'stun:stun.firma.de:3478'),
          field('turn','TURN-Server',hint:'turns:turn.firma.de:5349'),
          field('turnUser','TURN-Benutzername'),field('turnPassword','TURN-Passwort',secret:true),
        ]),const SizedBox(height:16),
        if(error.isNotEmpty)Padding(padding:const EdgeInsets.only(bottom:16),child:Text(error,style:const TextStyle(color:Colors.redAccent))),
        FilledButton.icon(onPressed:saving?null:save,icon:const Icon(Icons.lock_outline),label:Text(saving?'Speichern …':'Speichern & Telefon öffnen')),
        const SizedBox(height:18),const Text('Zugangsdaten und lokaler Anrufverlauf werden geschützt auf diesem Gerät gespeichert. Sie werden nicht an die TARIQ-Verwaltung übertragen. Nach dem Speichern mit „Online gehen“ verbinden. Hintergrund-Klingeln ist noch nicht verfügbar.',style:TextStyle(fontSize:11,color:Colors.white54,height:1.6)),
      ])))))));
}
